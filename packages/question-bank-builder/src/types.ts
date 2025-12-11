export interface RawQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  topics?: string[];
  services?: string[];
  metadata?: Record<string, string>;
  discussion?: string[];
  correct_explanation?: string;
  incorrect_explanations?: string[];
}

export interface QuestionBank {
  title: string;
  questions: RawQuestion[];
}

export type QuestionBankFormat = "markdown" | "json" | "ai-json";

export interface BuilderOptions {
  inputPath: string;
  outputPath?: string;
  inputFormat?: QuestionBankFormat | "auto";
  outputFormat?: QuestionBankFormat;
  enrich?: boolean;
  enrichmentProfile?: string;
}

export interface EnrichmentConfig {
  bedrockModelId: string;
  awsRegion: string;
  instruction?: string;
  metadataKeys?: string[];
  extractTopics?: boolean;
  extractServices?: boolean;
  examGuide?: string;
  concurrency?: number;
  limit?: number;
}
