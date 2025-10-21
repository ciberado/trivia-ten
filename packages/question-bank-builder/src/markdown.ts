import fs from "node:fs/promises";
import path from "node:path";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import type { Options as RemarkStringifyOptions } from "remark-stringify";
import type { Content, Root, Heading } from "mdast";

import type { QuestionBank, RawQuestion } from "./types";
import { formatCategorySlug, inferTitleFromQuestions } from "./utils";
import { logger } from "./logger";

const stringifyOptions: RemarkStringifyOptions = {
  bullet: "*",
  fences: true,
  listItemIndent: "one",
};

const processor = unified().use(remarkParse).use(remarkStringify, stringifyOptions);

export async function parseMarkdownBank(filePath: string): Promise<QuestionBank> {
  const data = await fs.readFile(filePath, "utf-8");
  const tree = processor.parse(data) as Root;
  let title = "";
  const questions: RawQuestion[] = [];
  const { children } = tree;
  const fallbackCategory = formatCategorySlug(path.basename(filePath, path.extname(filePath)));

  let index = 0;

  while (index < children.length) {
    const node = children[index];

    if (isHeading(node, 1)) {
      title = extractText(node).trim();
      index += 1;
      continue;
    }

    if (isHeading(node, 2)) {
      const questionNodes: Content[] = [];
      index += 1;

      while (index < children.length) {
        const current = children[index];
        if (isHeading(current, 1) || isHeading(current, 2)) {
          break;
        }
        questionNodes.push(current);
        index += 1;
      }

      const question = buildQuestionFromNodes(questionNodes, title || fallbackCategory);
      questions.push(question);
      continue;
    }

    index += 1;
  }

  if (questions.length === 0) {
    throw new Error(`Markdown question bank at ${filePath} did not contain any questions`);
  }

  const resolvedTitle = title || inferTitleFromQuestions(questions, filePath);
  const normalisedQuestions = questions.map((question) => ({
    ...question,
    category: question.category || resolvedTitle,
  }));

  logger.debug("Parsed markdown question bank", {
    filePath,
    questionCount: normalisedQuestions.length,
    title: resolvedTitle,
  });

  return { title: resolvedTitle, questions: normalisedQuestions };
}

function buildQuestionFromNodes(nodes: Content[], fallbackCategory: string): RawQuestion {
  let prompt = "";
  let category = "";
  let difficulty = "medium";
  let type = "multiple";
  const correct: string[] = [];
  const incorrect: string[] = [];
  const metadata: Record<string, string> = {};
  const discussionEntries: string[] = [];
  let correctExplanation = "";
  let incorrectExplanationSegments: string[] = [];

  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (!prompt && node.type === "paragraph") {
      prompt = extractText(node).trim();
      index += 1;
      continue;
    }

    if (isHeading(node, 3)) {
      const headingText = extractText(node).trim().toLowerCase();
      index += 1;
      const section: Content[] = [];

      while (index < nodes.length) {
        const current = nodes[index];
        if (isHeading(current, 3)) {
          break;
        }
        section.push(current);
        index += 1;
      }

      if (headingText.startsWith("correct")) {
        const { values, explanation } = parseAnswerSection(section);
        correct.push(...values);
        if (explanation && explanation.length > 0) {
          correctExplanation = explanation.join("\n\n");
        }
      } else if (headingText.startsWith("incorrect")) {
        const { values, explanation } = parseAnswerSection(section);
        incorrect.push(...values);
        if (explanation && explanation.length > 0) {
          incorrectExplanationSegments = explanation;
        }
      } else if (headingText === "discussion") {
        const values = extractListValues(section);
        if (values.length > 0) {
          discussionEntries.push(...values);
        } else {
          const text = section
            .map((entry) => extractText(entry))
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
          discussionEntries.push(...text);
        }
      } else if (headingText === "metadata") {
        const metadataEntries = extractListValues(section);
        metadataEntries.forEach((entry) => {
          const [rawKey, ...rawValueParts] = entry.split(":");
          const key = rawKey?.trim().toLowerCase().replace(/\s+/g, "_");
          const value = rawValueParts.join(":").trim();
          if (!key || !value) {
            return;
          }
          if (key === "category") {
            category = value;
          } else if (key === "difficulty") {
            difficulty = value;
          } else if (key === "type") {
            type = value;
          } else {
            metadata[key] = value;
          }
        });
      }

      continue;
    }

    index += 1;
  }

  if (!prompt) {
    throw new Error("Markdown question missing prompt");
  }

  if (correct.length === 0 || incorrect.length === 0) {
    throw new Error("Markdown question missing answers");
  }

  const result: RawQuestion = {
    question: prompt,
    correct_answer: correct[0],
    incorrect_answers: incorrect,
    category: category || fallbackCategory,
    difficulty,
    type,
  };

  if (discussionEntries.length > 0) {
    result.discussion = discussionEntries;
  }
  if (correctExplanation) {
    result.correct_explanation = correctExplanation;
  }
  if (incorrectExplanationSegments.length > 0) {
    result.incorrect_explanations = incorrectExplanationSegments;
  }

  const extraMetadata = Object.entries(metadata).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!value) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

  if (Object.keys(extraMetadata).length > 0) {
    result.metadata = extraMetadata;
  }

  return result;
}

function extractListValues(nodes: Content[]): string[] {
  const values: string[] = [];
  nodes.forEach((node) => {
    if (node.type !== "list") {
      return;
    }
    node.children.forEach((item) => {
      if (item.type !== "listItem") {
        return;
      }
      const text = extractText(item).trim();
      if (text) {
        values.push(text);
      }
    });
  });
  return values;
}

function parseAnswerSection(section: Content[]): { values: string[]; explanation?: string[] } {
  let explanation: string[] | undefined;
  let explanationStart = section.length;

  for (let i = 0; i < section.length; i += 1) {
    const node = section[i];
    if (isHeading(node, 4) && extractText(node).trim().toLowerCase() === "explanation") {
      explanationStart = i;
      const explanationNodes: Content[] = [];
      i += 1;
      while (i < section.length) {
        const current = section[i];
        if (isHeading(current, 4)) {
          break;
        }
        explanationNodes.push(current);
        i += 1;
      }
      const rendered = renderMarkdown(explanationNodes).trim();
      if (rendered) {
        explanation = rendered
          .split(/\n{2,}/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      }
      break;
    }
  }

  const listNodes = section.slice(0, explanationStart);
  const values = extractListValues(listNodes.length > 0 ? listNodes : section);

  return { values, explanation };
}

export function serializeMarkdownBank(bank: QuestionBank): string {
  logger.debug("Serialising markdown question bank", {
    title: bank.title,
    questionCount: bank.questions.length,
  });
  const lines: string[] = [];
  lines.push(`# ${bank.title || "Untitled Quiz"}`, "");

  bank.questions.forEach((question, index) => {
    const questionNumber = index + 1;
    lines.push(`## Question ${questionNumber}`, "");
    lines.push(question.question, "");

    lines.push("### Correct answers", "");
    question.correct_answer.split(/\r?\n/).forEach((answer) => {
      lines.push(`* ${answer}`);
    });

    if (question.correct_explanation) {
      lines.push("", "#### Explanation", "");
      lines.push(question.correct_explanation.trim(), "");
    }

    lines.push("", "### Incorrect answers", "");
    question.incorrect_answers.forEach((answer) => {
      lines.push(`* ${answer}`);
    });

    if (question.incorrect_explanations && question.incorrect_explanations.length > 0) {
      lines.push("", "#### Explanation", "");
      question.incorrect_explanations.forEach((entry) => {
        lines.push(entry.trim(), "");
      });
    }

    lines.push("", "### Metadata", "");
    lines.push(`* Category: ${question.category}`);
    lines.push(`* Difficulty: ${question.difficulty}`);
    lines.push(`* Type: ${question.type}`);

    const metadataEntries = Object.entries(question.metadata ?? {}).filter(
      ([key]) => !["category", "difficulty", "type"].includes(key.toLowerCase())
    );

    metadataEntries.forEach(([key, value]) => {
      lines.push(`* ${formatMetadataKey(key)}: ${value}`);
    });

    if (question.discussion && question.discussion.length > 0) {
      lines.push("", "### Discussion", "");
      question.discussion.forEach((entry) => {
        lines.push(`* ${entry}`);
      });
    }

    lines.push("");
  });

  return lines.join("\n");
}

function formatMetadataKey(key: string): string {
  return key
    .split(/[\s-_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isHeading(node: Content, depth: number): node is Heading {
  return node.type === "heading" && node.depth === depth;
}

function extractText(node: Content): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => extractText(child as Content)).join("");
  }
  return "";
}

function renderMarkdown(nodes: Content[]): string {
  if (nodes.length === 0) {
    return "";
  }
  const root: Root = {
    type: "root",
    children: nodes,
  };
  return String(processor.stringify(root));
}
