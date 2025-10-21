# Question Bank Builder

The question bank builder is a workspace-local CLI that converts Trivia Ten question sets between Markdown and JSON formats and can optionally enrich them with Amazon Bedrock via LangGraph.

## Usage

```bash
npm run build --workspace=question-bank-builder
# Markdown → JSON
npx question-bank-builder --input packages/trivia-server/questions/aws-basic-networking.md --output-format json
# AI sample JSON → Markdown
npx question-bank-builder --input packages/question-bank-builder/samples/ai.json --input-format ai-json --output samples/ai.md
```

### Options

- `--input` (`-i`): source question bank path (Markdown or JSON).
- `--output` (`-o`): destination file; defaults to the source path with the opposite extension.
- `--input-format`: force a format (`markdown`, `json`, `ai-json`, or `auto`).
- `--output-format`: choose output format (`markdown`, `json`, or `ai-json`).
- `--enrich`: enable Amazon Bedrock enrichment through LangGraph.
- `--enrichment-profile`: apply a preset (`difficulty-balancer`, `explain-like-i5`).
- `--bedrock-model-id`: Bedrock model identifier, e.g. `anthropic.claude-3-haiku-20240307-v1:0`.
- `--aws-region`: AWS region for Bedrock, e.g. `us-east-1`.
- `--instruction`: custom one-off enrichment prompt.
- `--metadata-keys`: comma-separated metadata keys to request from the model.
- `--verbose` (`-v`): switch logging to `debug` level for rich trace output.

### Enrichment Concurrency & Retries

Control Bedrock load with environment variables:

- `ENRICH_CONCURRENCY` (default `3`): simultaneous enrichment workers.
- `ENRICH_MAX_RETRIES` (default `3`): attempts per question before failing.
- `ENRICH_RETRY_BASE_MS` (default `500`): base delay for exponential backoff (random jitter is added).

When `--enrich` is used you must supply AWS credentials and Bedrock details, either via CLI flags or environment variables:

```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

npx question-bank-builder --input input.md --enrich --output enriched.json
```

### Markdown Expectations

Questions follow the same headings as `packages/trivia-server/questions/*.md`. A minimal example lives at `packages/question-bank-builder/samples/ai.md`:

```
# Quiz title

## Question N

Prompt paragraph

### Correct answers
* Single correct answer

### Incorrect answers
* Distractor A
* Distractor B
* Distractor C

### Metadata
* Category: Quiz title
* Difficulty: medium
* Type: multiple
* Hint: Optional builder-specific metadata

### Discussion
* Optional community note A
* Optional community note B
```

### JSON Output

Two JSON structures are supported:

- Trivia Ten server format (`results` array).
- AI sample format (`packages/question-bank-builder/samples/ai.json`)—an array of objects with `code`, `question`, `correct`, `incorrect`, and optional `discussion`.

For the server format the builder emits:

```json
{
  "title": "AWS basic networking",
  "response_code": 0,
  "results": [
    {
      "category": "AWS basic networking",
      "type": "multiple",
      "difficulty": "medium",
      "question": "...",
      "correct_answer": "...",
      "incorrect_answers": ["..."],
      "metadata": {
        "hint": "Optional metadata from enrichment"
      }
    }
  ]
}
```

Extra metadata keys are retained when converting back to Markdown.
