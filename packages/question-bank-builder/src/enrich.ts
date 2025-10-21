import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import type { QuestionBank, RawQuestion, EnrichmentConfig } from "./types";
import { inferTitleFromQuestions } from "./utils";
import { logger } from "./logger";

interface EnrichmentPreset {
  instruction: string;
  metadataKeys: string[];
}

interface EnrichmentAgent {
  run(prompt: string): Promise<string>;
}

const ENRICHMENT_PRESETS: Record<string, EnrichmentPreset> = {
  "difficulty-balancer": {
    instruction:
      "Review each trivia question and ensure difficulty labels align with AWS certification associate level expectations. Adjust the prompt for clarity while keeping the original intent, and supply a short rationale metadata field explaining the difficulty assignment.",
    metadataKeys: ["rationale", "target_audience", "topic"],
  },
  "explain-like-i5": {
    instruction:
      "Rewrite the question prompt so that it can be understood by someone with very little AWS background. Provide a hint metadata field with a concise clue and a summary metadata field with one-sentence explanation of the answer.",
    metadataKeys: ["hint", "summary"],
  },
};

const DEFAULT_INSTRUCTION =
  "Improve the question prompt for clarity, ensure one correct answer and three incorrect answers remain aligned with AWS trivia, and produce thorough explanations for the correct choice plus succinct one-paragraph rebuttals for each incorrect option.";

const agentCache = new Map<string, Promise<EnrichmentAgent>>();

export async function enrichQuestionBank(
  bank: QuestionBank,
  config: EnrichmentConfig,
  profile?: string
): Promise<QuestionBank> {
  logger.info("Enrichment run starting", {
    questionCount: bank.questions.length,
    profile,
  });
  const preset = profile ? ENRICHMENT_PRESETS[profile] : undefined;
  const instruction = config.instruction ?? preset?.instruction ?? DEFAULT_INSTRUCTION;
  const requestedMetadataKeys =
    config.metadataKeys ?? preset?.metadataKeys ?? ["hint", "rationale"];
  const baseMetadataKeys: string[] = [];
  const metadataKeys = Array.from(
    new Set([...baseMetadataKeys, ...requestedMetadataKeys])
  );

  const concurrency = parseEnvInt(process.env.ENRICH_CONCURRENCY, 3);
  const maxRetries = parseEnvInt(process.env.ENRICH_MAX_RETRIES, 3);
  const retryBaseDelayMs = parseEnvInt(process.env.ENRICH_RETRY_BASE_MS, 500);

  logger.debug("Enrichment settings", {
    concurrency,
    maxRetries,
    retryBaseDelayMs,
  });

  const agent = await createEnrichmentAgent(config);

  const enrichedQuestions = await runEnrichmentQueue({
    questions: bank.questions,
    agent,
    instruction,
    metadataKeys,
    concurrency,
    maxRetries,
    retryBaseDelayMs,
  });

  logger.info("Enrichment run complete", { enrichedCount: enrichedQuestions.length });

  return {
    title: bank.title || inferTitleFromQuestions(enrichedQuestions),
    questions: enrichedQuestions,
  };
}

async function createEnrichmentAgent(config: EnrichmentConfig): Promise<EnrichmentAgent> {
  const cacheKey = `${config.awsRegion}:${config.bedrockModelId}`;
  if (!agentCache.has(cacheKey)) {
    logger.debug("Creating new enrichment agent", { cacheKey });
    agentCache.set(cacheKey, buildReactAgent(config));
  }
  logger.debug("Using cached enrichment agent", { cacheKey });
  return agentCache.get(cacheKey)!;
}

async function buildReactAgent(config: EnrichmentConfig): Promise<EnrichmentAgent> {
  const langgraphPrebuilt = await import("@langchain/langgraph/prebuilt");
  const aws = await import("@langchain/aws");
  const { createReactAgent } = langgraphPrebuilt as unknown as {
    createReactAgent: (config: { llm: unknown; tools?: unknown[]; stateModifier?: (state: Record<string, unknown>) => Record<string, unknown> }) => {
      invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  };

  const { ChatBedrockConverse } = aws as unknown as {
    ChatBedrockConverse: new (args: { model: string; region: string }) => {
      invoke: (input: unknown, options?: Record<string, unknown>) => Promise<unknown>;
    };
  };

  const model = new ChatBedrockConverse({
    model: config.bedrockModelId,
    region: config.awsRegion,
  });

  const agent = createReactAgent({
    llm: model,
    tools: [],
  });

  return {
    async run(prompt: string): Promise<string> {
      logger.debug("Invoking enrichment agent", { promptPreview: prompt.slice(0, 120) });
      const result = await agent.invoke({
        messages: [new HumanMessage(prompt)],
      });

      return extractAgentOutput(result);
    },
  };
}

async function runEnrichmentQueue(params: {
  questions: RawQuestion[];
  agent: EnrichmentAgent;
  instruction: string;
  metadataKeys: string[];
  concurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}): Promise<RawQuestion[]> {
  const {
    questions,
    agent,
    instruction,
    metadataKeys,
    concurrency,
    maxRetries,
    retryBaseDelayMs,
  } = params;

  const results: RawQuestion[] = new Array(questions.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, (_, workerId) =>
    (async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= questions.length) {
          break;
        }

        const question = questions[currentIndex];
        logger.debug("Worker processing question", { workerId, index: currentIndex });

        try {
          const enriched = await enrichWithRetry({
            agent,
            instruction,
            metadataKeys,
            question,
            index: currentIndex,
            maxRetries,
            retryBaseDelayMs,
            workerId,
          });
          results[currentIndex] = enriched;
        } catch (error) {
          logger.error("Failed to enrich question after retries", {
            index: currentIndex,
            workerId,
            error,
          });
          throw error;
        }
      }
    })()
  );

  await Promise.all(workers);
  return results;
}

async function enrichWithRetry(params: {
  agent: EnrichmentAgent;
  instruction: string;
  metadataKeys: string[];
  question: RawQuestion;
  index: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  workerId: number;
}): Promise<RawQuestion> {
  const {
    agent,
    instruction,
    metadataKeys,
    question,
    index,
    maxRetries,
    retryBaseDelayMs,
    workerId,
  } = params;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      logger.debug("Enrich attempt", { workerId, index, attempt });
      const prompt = buildPrompt(question, instruction, metadataKeys);
      const response = await agent.run(prompt);
      return mergeQuestion(question, parseModelResponse(response, question));
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) {
        break;
      }

      const delayMs = calculateBackoffDelay(retryBaseDelayMs, attempt);
      logger.warn("Enrichment attempt failed; retrying", {
        workerId,
        index,
        attempt,
        delayMs,
        error,
      });
      await delay(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Enrichment failed with unknown error");
}

function calculateBackoffDelay(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return exponential + jitter;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function buildPrompt(question: RawQuestion, instruction: string, metadataKeys: string[]): string {
  const discussion = question.discussion?.join("\n\n");

  const basePrompt = [
    "You are enhancing trivia questions about AWS services.",
    "Keep the original question text and answer choices exactly as provided; focus on improving supporting explanations and metadata.",
    "Return a JSON object with the following fields:",
    "{",
    '  "question": "...",',
    '  "correct_answer": "...",',
    '  "incorrect_answers": ["..."],',
    '  "category": "...",',
    '  "difficulty": "...",',
    '  "type": "...",',
    '  "correct_explanation": "...",',
    '  "incorrect_explanations": ["..."],',
    '  "discussion": ["..."],',
    '  "metadata": { "key": "value" }',
    "}",
    "Only output valid JSON without additional commentary.",
    "",
    'Set "correct_explanation" to a single, well-developed paragraph that teaches why the correct answer is accurate.',
    'Set "incorrect_explanations" to an array of concise paragraphs (formatted "<answer>: explanation") that clarify why each distractor is wrong.',
    "Include a discussion array only when you have meaningful additional context, and populate metadata keys solely if instructed.",
    "Keep all statements grounded in AWS best practices and draw from the discussion excerpts when they reinforce the reasoning.",
  ];

  const metadataInstruction =
    metadataKeys.length > 0
      ? `Populate the metadata object with the keys: ${metadataKeys
          .map((key) => `"${key}"`)
          .join(", ")}. Leave a key out if you cannot determine a meaningful value.`
      : "If no additional metadata keys are provided, you may leave the metadata object empty.";

  const discussionSection = discussion
    ? `\nDiscussion excerpts (for additional context—verify claims before using):\n${discussion}\n`
    : "";

  const prompt = `${basePrompt.join("\n")}\n${metadataInstruction}\n${discussionSection}\nOriginal question payload:\n${JSON.stringify(
    question,
    null,
    2
  )}\n\nAdditional instruction:\n${instruction}`;

  return prompt;
}

function extractAgentOutput(result: unknown): string {
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result;
  }

  const candidate = result as Record<string, unknown>;

  if (typeof candidate.output === "string" && candidate.output.trim()) {
    return candidate.output;
  }

  if (Array.isArray(candidate.messages) && candidate.messages.length > 0) {
    const lastMessage = candidate.messages[candidate.messages.length - 1] as BaseMessage;
    const content = stringifyMessageContent(lastMessage);
    if (content.trim()) {
      return content;
    }
  }

  if (typeof candidate.response === "string" && candidate.response.trim()) {
    return candidate.response;
  }

  return JSON.stringify(result);
}

function stringifyMessageContent(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object" && "text" in entry) {
          const maybeText = (entry as { text?: unknown }).text;
          if (typeof maybeText === "string") {
            return maybeText;
          }
        }
        if (entry && typeof entry === "object" && "type" in entry && "text" in entry) {
          const maybeText = (entry as { text?: unknown }).text;
          if (typeof maybeText === "string") {
            return maybeText;
          }
        }
        return "";
      })
      .filter((text): text is string => text.length > 0)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in (content as { text?: unknown })) {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === "string") {
      return maybeText;
    }
  }
  return "";
}

function parseModelResponse(response: string, fallback: RawQuestion): Partial<RawQuestion> {
  const jsonPayload = extractJsonBlock(response);
  if (!jsonPayload) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
    const updates: Partial<RawQuestion> = {};

    if (typeof parsed.question === "string" && parsed.question.trim()) {
      updates.question = parsed.question.trim();
    }
    if (typeof parsed.correct_answer === "string" && parsed.correct_answer.trim()) {
      updates.correct_answer = parsed.correct_answer.trim();
    }
    if (Array.isArray(parsed.incorrect_answers)) {
      const filtered = parsed.incorrect_answers.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      );
      if (filtered.length > 0) {
        updates.incorrect_answers = filtered;
      }
    }
    if (typeof parsed.category === "string" && parsed.category.trim()) {
      updates.category = parsed.category.trim();
    }
    if (typeof parsed.difficulty === "string" && parsed.difficulty.trim()) {
      updates.difficulty = parsed.difficulty.trim();
    }
    if (typeof parsed.type === "string" && parsed.type.trim()) {
      updates.type = parsed.type.trim();
    }

    if (typeof (parsed as { correct_explanation?: unknown }).correct_explanation === "string") {
      const value = ((parsed as { correct_explanation?: string }).correct_explanation ?? "").trim();
      if (value) {
        updates.correct_explanation = value;
      }
    }

    const rawIncorrectExplanations = (parsed as { incorrect_explanations?: unknown }).incorrect_explanations;
    if (Array.isArray(rawIncorrectExplanations)) {
      const entries = rawIncorrectExplanations
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim());
      if (entries.length > 0) {
        updates.incorrect_explanations = entries;
      }
    } else if (typeof rawIncorrectExplanations === "string") {
      const entries = rawIncorrectExplanations
        .split(/\n{2,}/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (entries.length > 0) {
        updates.incorrect_explanations = entries;
      }
    }

    if (parsed.metadata && typeof parsed.metadata === "object") {
      const metadataEntries = Object.entries(parsed.metadata as Record<string, unknown>).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          if (key.toLowerCase() === "discussion") {
            return acc;
          }
          if (key.toLowerCase() === "correct_explanation" && typeof value === "string" && value.trim()) {
            if (!updates.correct_explanation) {
              updates.correct_explanation = value.trim();
            }
            return acc;
          }
          if (key.toLowerCase() === "incorrect_explanations") {
            if (!updates.incorrect_explanations) {
              if (typeof value === "string") {
                const entries = value
                  .split(/\n{2,}/)
                  .map((entry) => entry.trim())
                  .filter((entry) => entry.length > 0);
                if (entries.length > 0) {
                  updates.incorrect_explanations = entries;
                }
              } else if (Array.isArray(value)) {
                const entries = value
                  .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
                  .map((entry) => entry.trim());
                if (entries.length > 0) {
                  updates.incorrect_explanations = entries;
                }
              }
            }
            return acc;
          }
          if (typeof value === "string" && value.trim().length > 0) {
            acc[key] = value.trim();
          } else if (Array.isArray(value)) {
            const joined = value
              .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
              .map((entry) => entry.trim())
              .join("\n\n");
            if (joined) {
              acc[key] = joined;
            }
          } else if (value && typeof value === "object") {
            const serialised = JSON.stringify(value);
            if (serialised.trim() && serialised !== "{}") {
              acc[key] = serialised;
            }
          }
          return acc;
        },
        {}
      );
      if (Object.keys(metadataEntries).length > 0) {
        updates.metadata = {
          ...(fallback.metadata ?? {}),
          ...metadataEntries,
        };
      }
    }

    if (Array.isArray((parsed as { discussion?: unknown }).discussion)) {
      const entries = ((parsed as { discussion?: unknown }).discussion as unknown[])
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim());
      if (entries.length > 0) {
        updates.discussion = entries;
      }
    } else if (typeof (parsed as { discussion?: unknown }).discussion === "string") {
      const value = ((parsed as { discussion?: string }).discussion ?? "").trim();
      if (value) {
        updates.discussion = value.split(/\n{2,}/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      }
    }

    return updates;
  } catch {
    return {};
  }
}

function extractJsonBlock(payload: string): string | undefined {
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  return payload.slice(start, end + 1);
}

function mergeQuestion(question: RawQuestion, updates?: Partial<RawQuestion>): RawQuestion {
  if (!updates || Object.keys(updates).length === 0) {
    return question;
  }

  const mergedIncorrect = updates.incorrect_answers && updates.incorrect_answers.length > 0 ? updates.incorrect_answers : question.incorrect_answers;

  const merged: RawQuestion = {
    category: updates.category ?? question.category,
    type: updates.type ?? question.type,
    difficulty: updates.difficulty ?? question.difficulty,
    question: updates.question ?? question.question,
    correct_answer: updates.correct_answer ?? question.correct_answer,
    incorrect_answers: mergedIncorrect,
    discussion: updates.discussion ?? question.discussion,
    correct_explanation: updates.correct_explanation ?? question.correct_explanation,
    incorrect_explanations: updates.incorrect_explanations ?? question.incorrect_explanations,
    metadata: {
      ...(question.metadata ?? {}),
      ...(updates.metadata ?? {}),
    },
  };

  if (merged.metadata && Object.keys(merged.metadata).length === 0) {
    delete merged.metadata;
  }

  if (!merged.discussion || merged.discussion.length === 0) {
    delete merged.discussion;
  }

  if (!merged.correct_explanation) {
    delete merged.correct_explanation;
  }

  if (!merged.incorrect_explanations || merged.incorrect_explanations.length === 0) {
    delete merged.incorrect_explanations;
  }

  return merged;
}
