#!/usr/bin/env node

import "./env";

import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { enrichQuestionBank } from "./enrich";
import { transformQuestionBank, saveQuestionBank } from "./transform";
import type { BuilderOptions, EnrichmentConfig, QuestionBankFormat } from "./types";
import { logger, setLogLevel } from "./logger";

async function run(): Promise<void> {
  const args = await yargs(hideBin(process.argv))
    .scriptName("question-bank-builder")
    .usage("$0 --input <file> [options]")
    .option("input", {
      alias: "i",
      type: "string",
      description: "Path to the source question bank",
      demandOption: true,
    })
    .option("output", {
      alias: "o",
      type: "string",
      description: "Destination path for the transformed question bank",
    })
    .option("input-format", {
      type: "string",
      choices: ["markdown", "json", "ai-json", "auto"] as const,
      default: "auto",
      description: "Format of the source question bank",
    })
    .option("output-format", {
      type: "string",
      choices: ["markdown", "json", "ai-json"] as const,
      description: "Format for the output question bank",
    })
    .option("enrich", {
      type: "boolean",
      default: false,
      description: "Enrich questions using Amazon Bedrock through LangGraph",
    })
    .option("enrichment-profile", {
      type: "string",
      description: "Named enrichment profile to apply (maps to instruction presets)",
    })
    .option("bedrock-model-id", {
      type: "string",
      description: "Amazon Bedrock model identifier (e.g. anthropic.claude-3-haiku-20240307-v1:0)",
    })
    .option("aws-region", {
      type: "string",
      description: "AWS region for the Bedrock runtime",
    })
    .option("instruction", {
      type: "string",
      description: "Custom instruction prompt for enrichment",
    })
    .option("metadata-keys", {
      type: "string",
      description: "Comma separated list of metadata keys to ask the model to populate",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Enable verbose logging",
    })
    .help()
    .parse();

  const options: BuilderOptions = {
    inputPath: path.resolve(process.cwd(), args.input),
    outputPath: args.output ? path.resolve(process.cwd(), args.output) : undefined,
    inputFormat: args["input-format"] as BuilderOptions["inputFormat"],
    outputFormat: args["output-format"] as BuilderOptions["outputFormat"],
    enrich: args.enrich,
    enrichmentProfile: args["enrichment-profile"],
  };

  if (args.verbose) {
    setLogLevel("debug");
    logger.debug("Verbose logging enabled");
  }

  logger.info("question-bank-builder started", {
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    inputFormat: options.inputFormat,
    outputFormat: options.outputFormat,
    enrich: options.enrich,
    enrichmentProfile: options.enrichmentProfile,
  });

  const explicitInputFormat = options.inputFormat === "auto" ? undefined : options.inputFormat;
  const detectedInputFormat = explicitInputFormat ?? guessFormatFromPath(options.inputPath);

  if (!detectedInputFormat) {
    throw new Error(`Unable to determine input format for ${options.inputPath}. Add --input-format json|markdown.`);
  }

  const outputFormat = options.outputFormat;
  const targetFormat: QuestionBankFormat =
    outputFormat ?? (detectedInputFormat === "markdown" ? "json" : "markdown");

  const targetPath = options.outputPath ?? deriveOutputPath(options.inputPath, targetFormat);

  logger.debug("Transforming question bank", {
    inputPath: options.inputPath,
    detectedInputFormat,
    targetPath,
    targetFormat,
  });

  const bank = await transformQuestionBank(options.inputPath, targetPath, {
    inputFormat: explicitInputFormat ?? detectedInputFormat,
    outputFormat,
  });

  if (options.enrich) {
    logger.info("Enrichment enabled; preparing Bedrock configuration");
    const config: EnrichmentConfig = {
      bedrockModelId: args["bedrock-model-id"] ?? process.env.BEDROCK_MODEL_ID ?? "",
      awsRegion: args["aws-region"] ?? process.env.AWS_REGION ?? "",
      instruction: args.instruction,
      metadataKeys: args["metadata-keys"] ? args["metadata-keys"].split(",").map((entry) => entry.trim()) : undefined,
    };

    if (!config.bedrockModelId || !config.awsRegion) {
      throw new Error("Bedrock enrichment requires both --bedrock-model-id and --aws-region (or environment vars).");
    }

    logger.debug("Running enrichment", {
      bedrockModelId: config.bedrockModelId,
      awsRegion: config.awsRegion,
      enrichmentProfile: options.enrichmentProfile,
      questionCount: bank.questions.length,
    });

    const enriched = await enrichQuestionBank(bank, config, options.enrichmentProfile);
    await saveQuestionBank(enriched, targetPath, outputFormat);
    logger.info("Enrichment completed", { questionCount: enriched.questions.length });
  }

  logger.info("Question bank written", { targetPath, outputFormat: targetFormat });
}

function deriveOutputPath(inputPath: string, desiredFormat: QuestionBankFormat): string {
  const ext = desiredFormat === "markdown" ? ".md" : ".json";
  return inputPath.replace(/\.[^.]+$/, ext);
}

function guessFormatFromPath(filePath: string): QuestionBankFormat | undefined {
  const lowered = filePath.toLowerCase();
  if (lowered.endsWith(".md") || lowered.endsWith(".markdown")) {
    return "markdown";
  }
  if (lowered.endsWith(".json")) {
    return "json";
  }
  return undefined;
}

run().catch((error) => {
  if (error instanceof Error) {
    logger.error(error.message, { stack: error.stack });
  } else {
    logger.error("Unexpected error", { error });
  }
  process.exitCode = 1;
});
