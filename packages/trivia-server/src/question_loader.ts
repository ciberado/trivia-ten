import { promises as fs } from "node:fs";
import path from "node:path";

import type { Processor } from "unified";
import type { Content, Heading, ListItem, Root } from "mdast";

import type { RawQuestion } from "./types";
import { logger } from "./logger";

const QUESTIONS_DIR = path.join(__dirname, "..", "questions");

interface LoadedQuiz {
  title: string;
  questions: RawQuestion[];
}

export async function load_quiz(category: string): Promise<LoadedQuiz> {
  const markdownPath = path.join(QUESTIONS_DIR, `${category}.md`);
  const jsonPath = path.join(QUESTIONS_DIR, `${category}.json`);

  if (await file_exists(markdownPath)) {
    return parse_markdown_quiz(markdownPath);
  }

  if (await file_exists(jsonPath)) {
    return parse_json_quiz(jsonPath);
  }

  logger.error("Quiz bank missing", { category, markdownPath, jsonPath });
  throw new Error("quiz_bank_missing");
}

async function parse_json_quiz(filePath: string): Promise<LoadedQuiz> {
  const data = await fs.readFile(filePath, "utf-8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch (error) {
    logger.error("Invalid JSON quiz bank", { filePath, error });
    throw new Error("quiz_bank_invalid_json");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("results" in parsed) ||
    !Array.isArray((parsed as { results: unknown }).results)
  ) {
    logger.error("JSON quiz bank missing results array", { filePath });
    throw new Error("quiz_bank_missing_results");
  }

  const slugFallback = format_category_slug(path.basename(filePath, path.extname(filePath)));
  const results = (parsed as { results: unknown[] }).results.map((entry, index) =>
    normalise_raw_question(entry, index, filePath, slugFallback)
  );

  const title =
    typeof (parsed as { title?: unknown }).title === "string"
      ? ((parsed as { title?: string }).title ?? "")
      : "";

  return {
    title: title || guess_title_from_questions(results, filePath, slugFallback),
    questions: results,
  };
}

async function parse_markdown_quiz(filePath: string): Promise<LoadedQuiz> {
  const data = await fs.readFile(filePath, "utf-8");
  const processor = await get_remark_processor();
  const slugFallback = format_category_slug(path.basename(filePath, path.extname(filePath)));

  let tree: Root;

  try {
    tree = processor.parse(data) as Root;
  } catch (error) {
    logger.error("Failed to parse markdown quiz bank", { filePath, error });
    throw new Error("quiz_bank_invalid_markdown");
  }

  let title = "";
  const questions: RawQuestion[] = [];

  const { children } = tree;
  let index = 0;

  while (index < children.length) {
    const node = children[index];

    if (is_heading(node, 1)) {
      title = extract_text(node).trim();
      index += 1;
      continue;
    }

    if (is_heading(node, 2)) {
      const questionNodes: Content[] = [];
      index += 1;

      while (index < children.length) {
        const current = children[index];
        if (is_heading(current, 1) || is_heading(current, 2)) {
          break;
        }
        questionNodes.push(current);
        index += 1;
      }

      const question = build_markdown_question(questionNodes, questions.length, {
        title,
        filePath,
      });
      questions.push(question);
      continue;
    }

    index += 1;
  }

  if (questions.length === 0) {
    logger.error("Markdown quiz parsed without questions", { filePath });
    throw new Error("quiz_bank_empty");
  }

  return {
    title: title || guess_title_from_questions(questions, filePath, slugFallback),
    questions,
  };
}

function build_markdown_question(
  nodes: Content[],
  questionIndex: number,
  context: { title: string; filePath: string }
): RawQuestion {
  let questionText = "";
  let correctAnswers: string[] = [];
  let incorrectAnswers: string[] = [];
  const metadata: Record<string, string> = {};

  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!questionText && node.type === "paragraph") {
      questionText = extract_text(node).trim();
      index += 1;
      continue;
    }

    if (is_heading(node, 3)) {
      const headingTitle = extract_text(node).trim().toLowerCase();
      index += 1;
      const sectionNodes: Content[] = [];

      while (index < nodes.length) {
        const current = nodes[index];
        if (is_heading(current, 3)) {
          break;
        }
        sectionNodes.push(current);
        index += 1;
      }

      if (headingTitle.startsWith("correct")) {
        correctAnswers = extract_list_values(sectionNodes);
      } else if (headingTitle.startsWith("incorrect")) {
        incorrectAnswers = extract_list_values(sectionNodes);
      } else if (headingTitle === "metadata") {
        const entries = extract_list_values(sectionNodes);
        entries.forEach((entry) => {
          const [rawKey, ...rawValueParts] = entry.split(":");
          if (!rawKey || rawValueParts.length === 0) {
            return;
          }
          const key = rawKey.trim().toLowerCase();
          const value = rawValueParts.join(":").trim();
          if (key) {
            metadata[key] = value;
          }
        });
      }

      continue;
    }

    index += 1;
  }

  if (!questionText) {
    logger.error("Markdown question missing prompt", {
      filePath: context.filePath,
      questionIndex,
    });
    throw new Error("quiz_bank_invalid_question");
  }

  if (correctAnswers.length === 0) {
    logger.error("Markdown question missing correct answers", {
      filePath: context.filePath,
      questionIndex,
    });
    throw new Error("quiz_bank_invalid_question");
  }

  if (correctAnswers.length > 1) {
    logger.warn("Markdown question contains multiple correct answers entries", {
      filePath: context.filePath,
      questionIndex,
      count: correctAnswers.length,
    });
  }

  if (incorrectAnswers.length === 0) {
    logger.error("Markdown question missing incorrect answers", {
      filePath: context.filePath,
      questionIndex,
    });
    throw new Error("quiz_bank_invalid_question");
  }

  const difficulty = metadata.difficulty ?? "medium";
  const category = metadata.category ?? context.title;
  const type = metadata.type ?? "multiple";

  return {
    category,
    question: questionText,
    correct_answer: correctAnswers[0],
    incorrect_answers: incorrectAnswers,
    difficulty,
    type,
  };
}

function extract_list_values(nodes: Content[]): string[] {
  const values: string[] = [];

  nodes.forEach((node) => {
    if (node.type === "list") {
      node.children.forEach((item) => {
        if (item.type === "listItem") {
          const text = extract_text(item).trim();
          if (text) {
            values.push(text);
          }
        }
      });
    }
  });

  return values;
}

function normalise_raw_question(
  entry: unknown,
  index: number,
  filePath: string,
  fallbackCategory: string
): RawQuestion {
  if (!entry || typeof entry !== "object") {
    throw build_structure_error("quiz_bank_invalid_question", filePath, index);
  }

  const candidate = entry as Record<string, unknown>;
  const category = read_string(candidate.category) ?? fallbackCategory;
  const type = read_string(candidate.type) ?? "multiple";
  const difficulty = read_string(candidate.difficulty) ?? "medium";
  const question = read_string(candidate.question);
  const correct_answer = read_string(candidate.correct_answer);
  const incorrect_answers = read_string_array(candidate.incorrect_answers);

  if (
    !category ||
    !question ||
    !correct_answer ||
    !incorrect_answers ||
    incorrect_answers.length === 0
  ) {
    throw build_structure_error("quiz_bank_invalid_question", filePath, index);
  }

  return {
    category,
    type,
    difficulty,
    question,
    correct_answer,
    incorrect_answers,
  };
}

function read_string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function read_string_array(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.filter((entry): entry is string => typeof entry === "string");
  return result.length > 0 ? result : undefined;
}

function build_structure_error(
  code: string,
  filePath: string,
  index: number
): Error {
  logger.error("Quiz question failed validation", {
    filePath,
    index,
  });
  return new Error(code);
}

function guess_title_from_questions(
  questions: RawQuestion[],
  filePath: string,
  fallback?: string
): string {
  if (questions.length === 0) {
    logger.warn("Attempted to infer title from empty questions array", {
      filePath,
    });
    return "";
  }

  const category = questions[0]?.category;
  if (typeof category === "string" && category) {
    return category;
  }

  return fallback ?? "";
}

async function file_exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function is_heading(node: Content, depth: number): node is Heading {
  return node.type === "heading" && node.depth === depth;
}

function extract_text(node: Content | ListItem): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => extract_text(child as unknown as Content | ListItem))
      .join("");
  }

  return "";
}

let cachedProcessor: Processor<Root> | undefined;

async function get_remark_processor(): Promise<Processor<Root>> {
  if (!cachedProcessor) {
    const unifiedModule = await import("unified");
    const remarkParseModule = await import("remark-parse");
    cachedProcessor = unifiedModule.unified().use(
      remarkParseModule.default || remarkParseModule
    ) as Processor<Root>;
  }
  return cachedProcessor;
}

function format_category_slug(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) {
    return slug;
  }
  return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
}
