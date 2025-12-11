# Trivia Monorepo

This repository hosts the Trivia Ten ecosystem as npm workspaces.

## Packages

- `packages/trivia-server` – Express/Socket.IO server that powers the game (formerly the root project).
- `packages/simulator` – Headless Socket.IO client that simulates hosts and players for load/regression tests.
- `packages/question-bank-builder` – TypeScript CLI tool for transforming and AI-enriching trivia question banks.

## Getting Started

Install dependencies once from the repository root:

```bash
npm install
```

### Run the Server

```bash
npm run dev --workspace=trivia-server
```

The server serves static assets from `packages/trivia-server/public` and expects the question bank under `packages/trivia-server/questions`.

### Run the Simulator

```bash
cd packages/simulator
npm start -- --address http://localhost:3000 --players 4 --rounds 2
```

> You can also run workspace scripts with `npm run start --workspace=simulator -- --address ...`.

## Reporting & Logs

Each package writes its own `reports/` and `logs/` directories. These paths are ignored by git.

## Contributing

1. Create a feature branch.
2. Work inside the relevant workspace (`packages/trivia-server`, `packages/simulator`, ...).
3. Use `npm run build --workspace=<pkg>` to verify TypeScript builds.
4. Commit and push.

Enjoy building! 🎯
