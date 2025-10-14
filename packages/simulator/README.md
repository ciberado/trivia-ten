# Trivia Simulator

A headless client that exercises the Trivia Ten server by emulating a host and multiple players over Socket.IO. It is helpful for load testing, regression checks, or generating sample data for reports.

## Prerequisites

- Node.js ≥ 18
- Yarn or npm (the project uses npm scripts)
- The Trivia Ten server must be running and reachable (e.g. `npm run dev` in the root project).

## Installation

```bash
cd packages/simulator
npm install
```

> Dependency installation is already handled if you ran `npm install` at the repository root.

## Usage

Run the simulator via npm:

```bash
npm start -- \
  --address http://localhost:3000 \
  --players 4 \
  --rounds 2 \
  --questionDuration 1 \
  --resultDuration 0.5 \
  --leaderboardDuration 0.5
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--address` | Base URL of the trivia server (`/socket.io` endpoint) | required |
| `--players` | Number of simulated players | `3` |
| `--rounds` | Number of quizzes to run sequentially | `1` |
| `--category` | Category identifier (e.g., `aws-basic-networking`) | `aws-basic-networking` |
| `--questionDuration` | Seconds per question | `1` |
| `--resultDuration` | Seconds to display results | `1` |
| `--leaderboardDuration` | Seconds to display leaderboard | `1` |
| `--delayMin` | Minimum player answer delay (ms) | `500` |
| `--delayMax` | Maximum player answer delay (ms) | `2000` |

### What It Does

1. Spawns a host socket that calls `create_room`.
2. Creates N player sockets that join the room.
3. Starts the quiz with configurable timings.
4. Each player receives questions and answers after a random delay within `[delayMin, delayMax]`.
5. Waits for `quiz_finished` before starting the next round.
6. Logs key lifecycle events to the console.

## Debugging

A VS Code launch configuration is provided at project root (`.vscode/launch.json`) with entries for “Debug Trivia Server” and “Debug Simulator”. Adjust the `runtimeArgs` in that configuration to tweak simulation parameters while debugging.

## Caveats

- The simulator expects the trivia server to be reachable; if the host cannot connect it will exit with a `websocket error`.
- All rounds run sequentially; if you need concurrent load testing, run multiple instances of the simulator.
- Answer selection is random; adjust the logic in `src/index.ts` for custom strategies.

## License

ISC, inherited from the root project.
