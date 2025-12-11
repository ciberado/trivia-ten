import path from "node:path";

import type { QuestionBank, RawQuestion } from "./types";
import { formatCategorySlug, inferTitleFromQuestions } from "./utils";
import { logger } from "./logger";

interface AiSampleEntry {
  code?: string;
  question?: unknown;
  incorrect?: unknown;
  correct?: unknown;
  discussion?: unknown;
  category?: unknown;
  difficulty?: unknown;
  type?: unknown;
  topics?: unknown;
  services?: unknown;
  correct_explanation?: unknown;
  incorrect_explanations?: unknown;
}

export function normaliseAiSampleBank(payload: unknown, filePath: string): QuestionBank {
  if (!Array.isArray(payload)) {
    throw new Error(`AI sample bank at ${filePath} must be an array of question objects`);
  }

  const fallbackCategory = formatCategorySlug(path.basename(filePath, path.extname(filePath)));

  const questions: RawQuestion[] = [];
  let skippedCount = 0;

  payload.forEach((entry, index) => {
    try {
      const question = normaliseAiSampleEntry(entry as AiSampleEntry, index, fallbackCategory, filePath);
      questions.push(question);
    } catch (error) {
      skippedCount++;
      logger.warn("Skipping malformed question", {
        filePath,
        index,
        error: error instanceof Error ? error.message : String(error),
        questionPreview: typeof entry === 'object' && entry && 'code' in entry 
          ? (entry as any).code 
          : `Question at index ${index}`
      });
    }
  });

  if (questions.length === 0) {
    throw new Error(`No valid questions found in AI sample bank at ${filePath}`);
  }

  const title = inferTitleFromQuestions(questions, filePath);

  logger.info("Normalised AI sample bank", {
    filePath,
    totalQuestions: payload.length,
    validQuestions: questions.length,
    skippedQuestions: skippedCount,
    title,
  });

  return {
    title,
    questions,
  };
}

export function serializeAiSampleBank(bank: QuestionBank): unknown[] {
  logger.debug("Serialising AI sample bank", {
    title: bank.title,
    questionCount: bank.questions.length,
  });
  return bank.questions.map((question, index) => {
    const discussion = question.discussion;

    const metadataCopy = question.metadata ? { ...question.metadata } : undefined;
    if (metadataCopy) {
      delete metadataCopy.correct_variants;
      delete metadataCopy.code;
      delete metadataCopy.correct_explanation;
      delete metadataCopy.incorrect_explanations;
    }

    const entry: Record<string, unknown> = {
      code: question.metadata?.code ?? `Question ${index + 1}`,
      question: question.question,
      incorrect: question.incorrect_answers,
      correct: [question.correct_answer, ...(question.metadata?.correct_variants?.split("||") ?? [])].filter(
        (entry): entry is string => Boolean(entry && entry.trim())
      ),
    };

    if (discussion && discussion.length > 0) {
      entry.discussion = discussion;
    }
    if (question.correct_explanation) {
      entry.correct_explanation = question.correct_explanation;
    }
    if (question.incorrect_explanations && question.incorrect_explanations.length > 0) {
      entry.incorrect_explanations = question.incorrect_explanations;
    }
    if (question.category) {
      entry.category = question.category;
    }
    if (question.difficulty) {
      entry.difficulty = question.difficulty;
    }
    if (question.type) {
      entry.type = question.type;
    }
    if (question.topics && question.topics.length > 0) {
      entry.topics = question.topics;
    }
    if (question.services && question.services.length > 0) {
      entry.services = question.services;
    }
    if (question.metadata?.code) {
      entry.code = question.metadata.code;
    }
    if (metadataCopy && Object.keys(metadataCopy).length > 0) {
      entry.metadata = metadataCopy;
    }

    return entry;
  });
}

function normaliseAiSampleEntry(
  entry: AiSampleEntry,
  index: number,
  fallbackCategory: string,
  filePath: string
): RawQuestion {
  const question = readString(entry.question);
  const correct = readStringArray(entry.correct);
  const incorrect = readStringArray(entry.incorrect);
  const discussion = readStringArray(entry.discussion);
  const topics = readStringArray(entry.topics);
  const services = readStringArray(entry.services);
  const correctExplanation = readString(entry.correct_explanation);
  const incorrectExplanations = readStringArray(entry.incorrect_explanations);

  if (!question || !correct || correct.length === 0 || !incorrect || incorrect.length === 0) {
    const missing = [];
    if (!question) missing.push("question");
    if (!correct || correct.length === 0) missing.push("correct answers");
    if (!incorrect || incorrect.length === 0) missing.push("incorrect answers");
    
    throw new Error(`AI sample question at index ${index} in ${filePath} is missing required fields: ${missing.join(", ")}`);
  }

  const metadata: Record<string, string> = {};

  const remainingCorrect = correct.slice(1);
  if (remainingCorrect.length > 0) {
    metadata.correct_variants = remainingCorrect.join("||");
  }

  if (entry.code && typeof entry.code === "string" && entry.code.trim()) {
    metadata.code = entry.code.trim();
  }

  const baseQuestion: RawQuestion = {
    category: readString(entry.category) ?? fallbackCategory,
    type: readString(entry.type) ?? "multiple",
    difficulty: readString(entry.difficulty) ?? "medium",
    question,
    correct_answer: correct[0],
    incorrect_answers: incorrect,
  };

  if (discussion && discussion.length > 0) {
    baseQuestion.discussion = discussion;
  }

  if (topics && topics.length > 0) {
    baseQuestion.topics = topics;
  }

  if (services && services.length > 0) {
    baseQuestion.services = services;
  }

  if (correctExplanation) {
    baseQuestion.correct_explanation = correctExplanation;
  }
  if (incorrectExplanations && incorrectExplanations.length > 0) {
    baseQuestion.incorrect_explanations = incorrectExplanations;
  }

  if (Object.keys(metadata).length > 0) {
    baseQuestion.metadata = metadata;
  }

  logger.debug("Normalised AI sample question", {
    filePath,
    index,
    category: baseQuestion.category,
    hasDiscussion: Boolean(baseQuestion.discussion?.length),
    metadataKeys: baseQuestion.metadata ? Object.keys(baseQuestion.metadata) : [],
  });

  return baseQuestion;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const filtered = value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return undefined;
}
