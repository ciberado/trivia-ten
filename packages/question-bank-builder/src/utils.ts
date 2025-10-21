import path from "node:path";

import type { RawQuestion } from "./types";

export function formatCategorySlug(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) {
    return slug;
  }
  return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function inferTitleFromQuestions(questions: RawQuestion[], filePath?: string): string {
  const firstCategory = questions[0]?.category;
  if (typeof firstCategory === "string" && firstCategory.trim()) {
    return formatCategorySlug(firstCategory);
  }

  if (filePath) {
    const base = path.basename(filePath, path.extname(filePath));
    return formatCategorySlug(base);
  }

  return "Untitled Quiz";
}
