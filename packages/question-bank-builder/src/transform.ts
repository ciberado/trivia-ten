import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdownBank, serializeMarkdownBank } from "./markdown";
import { normaliseAiSampleBank, serializeAiSampleBank } from "./ai_samples";
import type { QuestionBank, RawQuestion, QuestionBankFormat } from "./types";
import { inferTitleFromQuestions } from "./utils";
import { logger } from "./logger";

export type SupportedFormat = QuestionBankFormat;

function detectFormat(filePath: string): SupportedFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return "markdown";
  }
  if (ext === ".json") {
    return "json";
  }
  return undefined;
}

export async function loadQuestionBank(filePath: string, format?: SupportedFormat): Promise<QuestionBank> {
  const resolvedFormat = format ?? detectFormat(filePath);
  logger.debug("Loading question bank", { filePath, requestedFormat: format, resolvedFormat });
  if (!resolvedFormat) {
    throw new Error(`Unsupported question bank format for ${filePath}`);
  }
  if (resolvedFormat === "markdown") {
    const bank = await parseMarkdownBank(filePath);
    logger.debug("Loaded markdown question bank", { filePath, questionCount: bank.questions.length });
    return bank;
  }
  const data = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(data) as unknown;

  if ((resolvedFormat ?? "json") === "ai-json") {
    const bank = normaliseAiSampleBank(parsed, filePath);
    logger.debug("Loaded AI sample question bank", { filePath, questionCount: bank.questions.length });
    return bank;
  }

  if (Array.isArray(parsed)) {
    const bank = normaliseAiSampleBank(parsed, filePath);
    logger.debug("Loaded AI sample array question bank", { filePath, questionCount: bank.questions.length });
    return bank;
  }

  const bank = normaliseQuestionBank(parsed, filePath);
  logger.debug("Loaded JSON question bank", { filePath, questionCount: bank.questions.length });
  return bank;
}

export async function saveQuestionBank(
  data: QuestionBank,
  filePath: string,
  format?: SupportedFormat
): Promise<void> {
  const resolvedFormat = format ?? detectFormat(filePath) ?? "json";
  logger.debug("Saving question bank", {
    filePath,
    requestedFormat: format,
    resolvedFormat,
    questionCount: data.questions.length,
  });
  if (resolvedFormat === "markdown") {
    const markdown = serializeMarkdownBank(data);
    await fs.writeFile(filePath, markdown, "utf-8");
    return;
  }
  if (resolvedFormat === "ai-json") {
    const payload = serializeAiSampleBank(data);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return;
  }
  const payload = {
    title: data.title,
    response_code: 0,
    results: data.questions.map(({ discussion, correct_explanation, incorrect_explanations, ...question }) => question),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function transformQuestionBank(
  inputPath: string,
  outputPath: string,
  options?: { inputFormat?: SupportedFormat; outputFormat?: SupportedFormat }
): Promise<QuestionBank> {
  logger.debug("Starting transform", { inputPath, outputPath, options });
  const bank = await loadQuestionBank(inputPath, options?.inputFormat);
  await saveQuestionBank(bank, outputPath, options?.outputFormat);
  logger.debug("Transform completed", {
    inputPath,
    outputPath,
    questionCount: bank.questions.length,
    outputFormat: options?.outputFormat ?? detectFormat(outputPath) ?? "json",
  });
  return bank;
}

function normaliseQuestionBank(data: unknown, filePath: string): QuestionBank {
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid question bank structure in ${filePath}`);
  }

  const candidate = data as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title : "";

  const questionsSource =
    Array.isArray(candidate.results) && candidate.results.length > 0
      ? (candidate.results as unknown[])
      : Array.isArray(candidate.questions)
      ? (candidate.questions as unknown[])
      : undefined;

  if (!questionsSource) {
    throw new Error(`Question bank in ${filePath} is missing a results/questions array`);
  }

  const questions = questionsSource.map((entry, index) => normaliseRawQuestion(entry, index, filePath));

  const resolvedTitle = title || inferTitleFromQuestions(questions, filePath);
  logger.debug("Normalised JSON question bank", {
    filePath,
    questionCount: questions.length,
    resolvedTitle,
  });

  return {
    title: resolvedTitle,
    questions,
  };
}

function normaliseRawQuestion(entry: unknown, index: number, filePath: string): RawQuestion {
  if (!entry || typeof entry !== "object") {
    throw buildStructureError(filePath, index);
  }

  const candidate = entry as Record<string, unknown>;

  const question = readString(candidate.question);
  const correct_answer = readString(candidate.correct_answer);
  const incorrect_answers = readStringArray(candidate.incorrect_answers);
  const topics = readStringArray(candidate.topics);
  const services = readStringArray(candidate.services);
  const discussion = readStringArray(candidate.discussion);
  const correct_explanation = readString(candidate.correct_explanation);
  const incorrect_explanations = readStringArray(candidate.incorrect_explanations);

  if (!question || !correct_answer || !incorrect_answers || incorrect_answers.length === 0) {
    throw buildStructureError(filePath, index);
  }

  let metadata = readStringRecord(candidate.metadata);

  let extractedCorrectExplanation = correct_explanation;
  let extractedIncorrectExplanations = incorrect_explanations;

  if (metadata) {
    if (!extractedCorrectExplanation && metadata.correct_explanation) {
      extractedCorrectExplanation = metadata.correct_explanation;
      delete metadata.correct_explanation;
    }
    if (!extractedIncorrectExplanations && metadata.incorrect_explanations) {
      const parsed = metadata.incorrect_explanations
        .split("\n\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (parsed.length > 0) {
        extractedIncorrectExplanations = parsed;
      }
      delete metadata.incorrect_explanations;
    }
    if (Object.keys(metadata).length === 0) {
      metadata = undefined;
    }
  }

  return {
    category: readString(candidate.category) ?? "",
    type: readString(candidate.type) ?? "multiple",
    difficulty: readString(candidate.difficulty) ?? "medium",
    question,
    correct_answer,
    incorrect_answers,
    topics: topics ?? undefined,
    services: services ?? undefined,
    metadata: metadata ?? undefined,
    discussion: discussion ?? undefined,
    correct_explanation: extractedCorrectExplanation ?? undefined,
    incorrect_explanations: extractedIncorrectExplanations ?? undefined,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return result.length > 0 ? result : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const result: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (typeof entry === "string" && entry.trim()) {
      result[key] = entry;
    }
  });
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildStructureError(filePath: string, index: number): Error {
  return new Error(`Question at index ${index} in ${filePath} is missing required fields`);
}
