# Repository Guidelines

## Project Structure & Module Organization
- `server.js` hosts the Express entry point, wires Socket.IO events, and serves everything beneath `public/`.
- `rooms.js` manages in-memory room state; keep its helpers pure and reuse them instead of duplicating room logic.
- Client assets live in `public/` (`js/`, `style/`, `sounds/`, and `index.html`), so front-end changes should stay there.
- Trivia content sits in `questions/*.json`; follow the existing key structure and keep filenames kebab-cased.
- High-level flows are captured in `docs/`; update these when you alter how game rounds progress.

## Build, Test, and Development Commands
- `npm install` sets up dependencies; run it once per environment or whenever `package-lock.json` changes.
- `npm run dev` starts Nodemon for rapid iteration; it watches `server.js`, `rooms.js`, and public assets.
- `npm start` runs the production-style server via plain Node for smoke tests or container deployment.

## Coding Style & Naming Conventions
- Use 2-space indentation, keep semicolons, and prefer double quotes on the server to match existing files.
- Functions and variables in shared modules follow snake_case (`add_user`, `current_room`); stick with that unless you are touching client-only code, where camelCase is acceptable.
- Group socket handlers logically and add brief comments before multi-step flows (join, question rotation, scoring) instead of inline noise.

## Testing Guidelines
- Automated tests are not yet wired; when adding them, colocate integration specs under `tests/` and run them by invoking `node` directly or via a future `npm test`.
- Until then, exercise the app via `npm run dev`, open `http://localhost:3000`, and simulate multiple clients; confirm timers, scoreboards, and question rotation.
- When adding question sets, validate JSON shape with a quick `node -e "require('./questions/aws-basic-networking.json')"` check before committing.

## Commit & Pull Request Guidelines
- History mixes short sentences (`Working prototype.`) and typed prefixes (`chore: defines the devcontainer`); standardize on `<type>: <imperative summary>` (e.g., `feat: add streak multiplier UI`).
- Make commits focused: server-side logic, data updates, and front-end tweaks should land separately to simplify reviews.
- PRs must describe gameplay changes, list impacted files or directories, attach screenshots/GIFs for UI tweaks, and reference any related issue or doc update.

## Configuration Tips
- The server reads `PORT` from the environment; default is 3000. Mirror that in deployment manifests.
- Keep `questions/*.json` under version control—avoid runtime edits—and regenerate any derived assets (demo data in `public/demo.json`) when question pools change.
