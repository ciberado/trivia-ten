# Repository Guidelines

## Monorepo Structure & Module Organization
- The repository is an npm workspaces monorepo: `packages/trivia-server` hosts the Express/Socket.IO backend and `packages/simulator` provides a headless test client.
- `packages/trivia-server/src/server.ts` is the entry point; it serves static assets from `packages/trivia-server/public/` and wires socket events. Keep shared helpers in `src/` modules instead of duplicating logic.
- `packages/trivia-server/src/rooms.ts` owns in-memory room state. Maintain its helpers as pure functions so socket handlers can remain thin.
- Client assets live in `packages/trivia-server/public/` (`js/`, `style/`, `sounds/`, `index.html`); keep browser-only code there.
- Trivia banks stay under `packages/trivia-server/questions/*.json`. Preserve the existing JSON key structure and keep filenames kebab-cased.
- High-level round flows and architecture notes are documented in `packages/trivia-server/docs/`; update them when gameplay sequencing or reporting changes.

## Build, Test, and Development Commands
- Run `npm install` once from the repository root to hydrate all workspaces.
- Use `npm run dev --workspace=trivia-server` for live reload via `ts-node-dev`; it watches `src/`, `public/`, and `questions/`.
- `npm run start --workspace=trivia-server` builds the TypeScript sources and serves the compiled `dist/` output for smoke tests or production parity checks.
- Build artifacts explicitly with `npm run build --workspace=trivia-server` before bundling or deploying.
- Exercise the simulator with `npm start --workspace=simulator -- --address http://localhost:3000 --players <n> --rounds <m>` when you need automated load/regression coverage.

## Coding Style & Naming Conventions
- Server-side TypeScript uses 2-space indentation, semicolons, and double quotes; match that when creating new modules.
- Shared helpers and socket-facing functions stick with snake_case identifiers (e.g., `add_score`, `current_room`). Client-only JavaScript can continue using camelCase.
- Keep socket handler groups cohesive and add short leading comments when a flow spans multiple emits (join, rotation, scoring) instead of verbose inline notes.
- Extend `packages/trivia-server/src/types.ts` when introducing new question or room fields so type safety stays consistent.

## Testing & Validation
- There is no automated test runner yet; manually verify via `npm run dev --workspace=trivia-server` and connect multiple browser tabs or the simulator to validate timers, scoring, and rotation.
- When adding question sets, quickly validate JSON shape with `node -e "require('./packages/trivia-server/questions/<file>.json')"` before committing.
- Generated quiz reports and logs live under each package’s `reports/` and `logs/` directories; inspect them when debugging end-to-end runs.

## Commit & Pull Request Guidelines
- Standardize commit messages as `<type>: <imperative summary>` (e.g., `feat: add streak multiplier UI`).
- Keep commits focused—separate backend logic, data updates, and front-end tweaks to ease reviews.
- Pull requests should outline gameplay impacts, highlight touched areas (packages, docs), and include screenshots or GIFs for UI work while referencing any related docs that were updated.

## Configuration Tips
- The server reads `PORT` from the environment, defaulting to 3000; mirror that in deployment manifests and simulator configs.
- TypeScript compiles to `packages/trivia-server/dist/`; clear or rebuild that directory instead of editing output by hand.
- Keep `packages/trivia-server/questions/*.json` under version control—avoid runtime edits—and regenerate any derived demo assets (e.g., `public/demo.json`) whenever the question pool changes.
