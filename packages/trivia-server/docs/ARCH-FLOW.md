# Messaging Flow Overview

This document captures how the host and player clients interact with the server during the life of a quiz round. It focuses on Socket.IO events and the state transitions they trigger.

## Host Experience

```mermaid
sequenceDiagram
    autonumber
    participant Host UI
    participant Server
    participant Players

    Host UI->>Server: create_room { username, room }
    Server-->>Host UI: room_created { room }
    Server-->>Host UI: scoreboard_update
    loop until quiz start
        Players-->>Server: join_room
        Server-->>Host UI/Players: broadcast waiting state
    end
    Host UI->>Server: ask_start_game { category, questionDurationMs, resultDurationMs, leaderboardDurationMs }
    Server-->>Host UI: quiz_started { players, questionCount, timings }
    Server->>Server: reset scores, progression & timers
    loop For each question
        Server-->>Players: display_question
        Players->>Server: user_sent_choice { choice }
        Server-->>Host UI: progression_update (correct/incorrect)
        Server-->>Players: display_results
    Server-->>Players: display_leaderboard
    Server-->>Host UI: progression_highlight (next question)
    end
    alt host clicks End early
        Host UI->>Server: ask_end_game
        Server-->>Players: display_leaderboard (final)
    end
    Server-->>Host UI: quiz_finished { reason, scores }
    Server-->>Host UI: scoreboard_update
    Server->>Server: append quiz results to Excel report
```

### Narrative
1. **Creation** – The host invokes `create_room`. On success, the server acknowledges with `room_created` and begins sending `scoreboard_update`s whenever players join or scores change.
2. **Lobby** – Players joining the room trigger `join_room` on the server, which updates both the waiting panel (for players) and the host scoreboard.
3. **Start Quiz** – The host calls `ask_start_game` with the chosen category and optional timing overrides. The server validates there are players, resets scores, emits `quiz_started` (listing participants, question count, and the effective per-phase timings), and clears the progression table.
4. **Per Question Loop** – For each question, the server emits `display_question` to players, listens for `user_sent_choice`, evaluates correctness, updates scores, and sends `progression_update` + `progression_highlight` to the host. Players receive `display_results` and `display_leaderboard` alongside point totals. The loop pacing honours the configured question/result/leaderboard durations.
5. **Ending** – If the host finishes early via `ask_end_game`, or after the last question, the server calls `finishQuiz`, pushing the final leaderboard to players, resetting the highlight (index `-1`), notifying the host with `quiz_finished`, and appending the quiz to `reports/trivia-report.xlsx`.

## Player Experience

```mermaid
sequenceDiagram
    autonumber
    participant Player UI
    participant Server
    participant Host

    Player UI->>Server: join_room { username, room }
    Server-->>Player UI: room_joined { room }
    loop Lobby updates
        Server-->>Player UI: display_wait
    end
    Note right of Player UI: Host issues ask_start_game
    loop For each question
        Server-->>Player UI: display_question
        Player UI->>Server: user_sent_choice { choice }
        Server-->>Player UI: display_results
        Server-->>Player UI: display_leaderboard
    end
    Server-->>Player UI: display_leaderboard { final: true }
```

### Narrative
1. **Join** – The player sends `join_room`. Upon success, `room_joined` transitions them to the waiting screen.
2. **Waiting** – The player listens to `display_wait` updates showing the current roster while the host prepares.
3. **Quiz Loop** – For each question, `display_question` wakes the UI. The player responds via `user_sent_choice`, then sees the answer summary (`display_results`) followed by the leaderboard.
4. **Completion** – After the last question or an early end, `display_leaderboard` with `final: true` gives the closing standings.

## Accuracy Check
- **Creation Flow**: Verified against `create_room` handler in `src/server.ts`. The server sends `room_created`, continues `scoreboard_update`s, and now reassigns host sockets when reconnecting. ✅
- **Start Logic**: `ask_start_game` accepts timing overrides, resets scores (`reset_room_scores`), initialises quiz state, emits `quiz_started` (with timings), and refuses to start without players. ✅
- **Per Question Loop**: Observed in `runQuiz`, where the configured durations drive `display_question`, `progression_highlight`, `progression_update`, `display_results`, and `display_leaderboard`. ✅
- **Finishing**: `finishQuiz` emits the final leaderboard, clears highlights, notifies the host via `quiz_finished`, and appends answer & summary rows to the Excel report. ✅
- **Player Loop**: Matches the events in `runQuiz` and the player-side listeners in `public/js/main.js`. ✅
- **Reporting**: `appendQuizReport` writes to `reports/trivia-report.xlsx`; writes are now logged with the existing row counts for traceability. ✅

The diagrams and explanations mirror current code behavior.
