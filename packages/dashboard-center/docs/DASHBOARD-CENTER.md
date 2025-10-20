# Dashboard Center Package

This document outlines the proposed `dashboard-center` workspace, a new React-based package that delivers operational and analytical dashboards for Trivia Ten. The application is built on [React](https://react.dev) with [Refine](https://refine.dev) to accelerate data presentation, state management, and admin-style workflows.

> **Status:** WIP (mock data only). Realtime integrations and historical fetches are not yet wired to the trivia-server backend.

## Package Goals

- Provide hosts and support staff with a browser-based control center that surfaces real-time game health and player activity.
- Offer post-game analytics that help identify question banks that need tuning or replacement.
- Capture player-centric insights, both at the individual level and across room cohorts, to inform coaching, retention, and difficulty balancing efforts.

## Technical Stack

- **Framework:** React + Refine (powered by Ant Design components and React Query under the hood).
- **Language:** TypeScript targetting modern browsers.
- **Routing:** React Router v6 (bundled with Refine).
- **State/Data:** Refine data provider backed by the trivia-server REST and WebSocket APIs.
- **Build Tooling:** Vite for development server, Rollup for production builds.
- **Deployment Target:** Static build served from the main Express backend (`packages/trivia-server`) under `/dashboard`.

## Workspace Layout

```
packages/
  dashboard-center/
    src/
      main.tsx
      refine-client.ts
      data-providers/
      pages/
        realtime/
        game-analytics/
        player-insights/
      components/
        cards/
        tables/
        charts/
      hooks/
      styles/
    public/
    package.json
    tsconfig.json
    vite.config.ts
```

The workspace follows the existing npm workspaces setup, enabling isolated builds while reusing lint and TypeScript configs where practical.

## Data Integration

- **Realtime data:** Leverage the existing Socket.IO endpoints to subscribe to room lifecycle events, player joins/leaves, score updates, and quiz completion payloads (including the per-question accuracy details added in recent iterations). A small WebSocket bridge in `src/data-providers/realtimeProvider.ts` normalises the stream into Refine's live provider interface.
- **Historical data:** Extend the `reporting.ts` appenders to expose read endpoints (REST) for summaries already written to `reports/`. The dashboard accesses these via a new `/api/reports` namespace with pagination and filtering primitives.
- **Player insights:** Combine real-time streams with persisted reports. Cohort definitions piggyback on the notion of a "room run" (all games played within the same room id).

## Dashboard Overview

### 1. Realtime Operations Dashboard (`/realtime`)

Focus: current system state.

- **Active Rooms Panel:** Card grid showing room ID, host, quiz state (waiting, running, finished), connected players, and current question index. Updates via live WebSocket feed.
- **Player Presence Table:** Searchable list of all connected players with room affiliation, connection duration, and current score.
- **System Health Strip:** Aggregated metrics such as number of rooms running, average latency between question dispatch and first correct answer, recent error counts from `roomLogger`.
- **Alerts Stream:** Compact activity log highlighting disconnects, stalled rooms, or error-level logs surfaced through the server's logging pipeline.

### 2. Game Analytics Dashboard (`/game-analytics`)

Focus: historical performance of games and question banks.

- **Game Explorer:** Filterable table keyed by room + timestamp, displaying quiz title, category, player count, duration, winner, and average score.
- **Question Bank Performance:** Comparative charts (bar/line) summarising accuracy, time-to-answer, and score distributions across question banks. Utilises the `QuestionAccuracySummary` data recorded per quiz.
- **Drill-in View:** Selecting a game or question bank reveals detailed breakdowns—per-question accuracy, fastest responders, streak multipliers, and leaderboard progression snapshots.
- **Export Tools:** CSV/JSON export for selected games to support offline analysis.

### 3. Player & Cohort Insights Dashboard (`/player-insights`)

Focus: individual and grouped player behaviour.

- **Player Directory:** Searchable directory pulling from historical logs with key stats (games played, win rate, average response time, preferred categories).
- **Cohort Summary:** Aggregates by room id sessions to reveal cohort-level metrics—combined accuracy, question difficulty success rates, time-on-question variance.
- **Retention & Engagement:** Visualisations showing repeat participation, time between sessions, and churn indicators.
- **Player Drilldown:** Individual view with timeline of games, accuracy trends by category, and contribution to cohort outcomes. Includes notes/comments capability for support staff, stored in a lightweight JSON store or future database.

## Authentication & Access Control

Refine integrates naturally with simple auth providers. For the initial release:

- Implement token-based authentication reusing Trivia Ten's host credentials, or a new admin role stored in `.env`.
- Gate dashboards behind a login screen, with role-based routes (e.g., read-only analysts vs. operations admins).

## Deployment Strategy

1. Develop locally with `npm run dev --workspace=dashboard-center` (Vite dev server with proxy to trivia-server APIs).
2. Production build via `npm run build --workspace=dashboard-center`; output emitted to `packages/dashboard-center/dist/`.
3. Extend `trivia-server` build step to copy the compiled assets into `packages/trivia-server/public/dashboard/`.
4. Mount the dashboard at `/dashboard` within Express with fallback routing (React Router).

## Future Enhancements

- **Persistence Layer:** Introduce a database (e.g., PostgreSQL) to store reports instead of flat files, enabling richer queries from the dashboard.
- **Alerting:** Integrate with Slack or email for proactive notifications on room failures or suspicious player behaviour.
- **Simulator Hooks:** Allow launching simulator scenarios directly from the dashboard for rapid regression testing against specific question banks.
- **Custom Visuals:** Adopt a charting library (ECharts or Recharts) for bespoke visualisations aligned with Trivia Ten's branding.

This package establishes a right-sized foundation for both live monitoring and post-game analytics, unlocking a single pane of glass for Trivia Ten stakeholders.
