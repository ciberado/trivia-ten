import path from "node:path";
import http from "node:http";
import express from "express";
import { Server, Socket } from "socket.io";

import {
  add_score,
  add_ten_questions,
  create_room,
  get_a_question,
  get_room_scores,
  get_room_usernames,
  join_room,
  remove_user,
  reset_room_scores,
} from "./rooms";
import type { Question, Room, RoomUser } from "./types";
import { logger, socketLogger, roomLogger } from "./logger";
import {
  appendQuizReport,
  AnswerReportRow,
  GameSummaryRow,
} from "./reporting";
import { load_quiz } from "./question_loader";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "..", "public");
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info("HTTP request completed", {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.use(express.static(publicDir));

function sleep(timeoutInMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutInMs);
  });
}

interface RoomGameState {
  currentQuestion?: Question;
  currentIndex: number;
  isFirstToAnswer: boolean;
  cancelled: boolean;
  running: boolean;
  finished: boolean;
  questionStartTimestamp?: number;
  quizName?: string;
  questionCount?: number;
  playersAtStart: string[];
  answerLog: AnswerReportRow[];
  quizStartedAt: string;
  hostNameSnapshot: string;
  questionDurationMs: number;
  resultDurationMs: number;
  leaderboardDurationMs: number;
}

const roomGameState = new Map<string, RoomGameState>();

const DEFAULT_CATEGORY = "aws-basic-networking";
const DEFAULT_QUESTION_DURATION_MS = 18_000;
const DEFAULT_RESULT_DURATION_MS = 3_000;
const DEFAULT_LEADERBOARD_DURATION_MS = 3_000;

function initializeQuizState(room: Room): RoomGameState {
  const existing = roomGameState.get(room.room_name);
  const state: RoomGameState = existing ?? {
    currentQuestion: undefined,
    currentIndex: 0,
    isFirstToAnswer: false,
    cancelled: false,
    running: false,
    finished: false,
    questionStartTimestamp: undefined,
    quizName: undefined,
    questionCount: undefined,
    playersAtStart: [],
    answerLog: [],
    quizStartedAt: new Date().toISOString(),
    hostNameSnapshot:
      room.users.find((member) => member.is_host)?.user_name ?? "",
    questionDurationMs: DEFAULT_QUESTION_DURATION_MS,
    resultDurationMs: DEFAULT_RESULT_DURATION_MS,
    leaderboardDurationMs: DEFAULT_LEADERBOARD_DURATION_MS,
  };
  state.currentQuestion = undefined;
  state.currentIndex = 0;
  state.isFirstToAnswer = false;
  state.cancelled = false;
  state.running = true;
  state.finished = false;
  state.questionStartTimestamp = undefined;
  state.quizName = undefined;
  state.questionCount = undefined;
  state.playersAtStart = [];
  state.answerLog = [];
  state.quizStartedAt = new Date().toISOString();
  state.hostNameSnapshot =
    room.users.find((member) => member.is_host)?.user_name ??
    state.hostNameSnapshot ??
    "";
  state.questionDurationMs = DEFAULT_QUESTION_DURATION_MS;
  state.resultDurationMs = DEFAULT_RESULT_DURATION_MS;
  state.leaderboardDurationMs = DEFAULT_LEADERBOARD_DURATION_MS;
  roomGameState.set(room.room_name, state);
  room.quiz_active = true;
  return state;
}

function getQuizState(room: Room): RoomGameState | undefined {
  return roomGameState.get(room.room_name);
}

function finishQuiz(
  target: Server,
  room: Room,
  state: RoomGameState,
  reason: "cancelled" | "completed"
): void {
  if (state.finished) {
    return;
  }

  state.finished = true;
  state.running = false;
  state.currentQuestion = undefined;
  room.quiz_active = false;

  const scores = get_room_scores(room);

  const finalMessage =
    reason === "cancelled"
      ? "Quiz ended early. Final scores."
      : "Final scores";

  if (reason === "cancelled") {
    roomLogger.warn("Quiz cancelled", {
      room: room.room_name,
      question_index: state.currentIndex,
    });
  } else {
    roomLogger.info("Quiz completed", {
      room: room.room_name,
    });
  }

  target.to(room.host_socket_id).emit("progression_highlight", {
    index: -1,
  });

  target
    .to(room.room_name)
    .except(room.host_socket_id)
    .emit("display_leaderboard", {
      index: state.currentIndex,
      scores_in_room: scores,
      final: true,
      message: finalMessage,
    });

  emitScoreboardUpdate(target, room);

  if (!state.answerLog) {
    state.answerLog = [];
  }

  const summary = buildGameSummary(state, room, scores);
  appendQuizReport({ answers: state.answerLog, summary }).catch((error) => {
    logger.error("Failed to record quiz report", {
      error,
      room: room.room_name,
    });
  });

  target.to(room.host_socket_id).emit("quiz_finished", { reason, scores });
  roomGameState.delete(room.room_name);
}

function recordAnswerLog(
  state: RoomGameState,
  room: Room,
  user: RoomUser,
  entry: {
    questionNumber: number;
    correct: boolean;
    scoreAwarded: number;
    totalScore: number;
    leaderboardPosition: number;
    timeMs: number;
    providedAnswerIndex: number;
    providedAnswer: string;
    correctAnswer: string;
    difficulty?: string;
    category?: string;
  }
): void {
  if (!state.answerLog) {
    state.answerLog = [];
  }

  if (!state.playersAtStart) {
    state.playersAtStart = [];
  }

  if (!state.playersAtStart.includes(user.user_name)) {
    state.playersAtStart.push(user.user_name);
  }

  const hostUser = room.users.find((member) => member.is_host);
  const playersCount = state.playersAtStart.length;

  const record: AnswerReportRow = {
    timestamp: new Date().toISOString(),
    hostName: state.hostNameSnapshot ?? hostUser?.user_name ?? "",
    roomName: room.room_name,
    quizName: state.quizName ?? entry.category ?? "",
    questionCount: state.questionCount ?? room.ten_questions.length,
    questionNumber: entry.questionNumber,
    playerName: user.user_name,
    difficulty: entry.difficulty ?? "unknown",
    category: entry.category ?? state.quizName ?? "",
    correctAnswer: entry.correctAnswer,
    providedAnswer: entry.providedAnswer,
    providedAnswerIndex: entry.providedAnswerIndex,
    correct: entry.correct,
    timeMs: entry.timeMs,
    scoreAwarded: entry.scoreAwarded,
    totalScore: entry.totalScore,
    leaderboardPosition: entry.leaderboardPosition,
    playersCount,
  };

  state.answerLog.push(record);
}

function buildGameSummary(
  state: RoomGameState,
  room: Room,
  finalScores: RoomUser[]
): GameSummaryRow {
  const answerLog = state.answerLog ?? [];
  const questionCount = state.questionCount ?? room.ten_questions.length;
  const playerSet = new Set(
    state.playersAtStart && state.playersAtStart.length
      ? state.playersAtStart
      : answerLog.map((entry) => entry.playerName)
  );
  const playerCount = playerSet.size;
  const totalAnswers = answerLog.length;
  const correctAnswers = answerLog.filter((entry) => entry.correct).length;
  const incorrectAnswers = totalAnswers - correctAnswers;
  const correctRatio = totalAnswers ? correctAnswers / totalAnswers : 0;
  const incorrectRatio = totalAnswers ? incorrectAnswers / totalAnswers : 0;
  const times = answerLog.map((entry) => entry.timeMs);
  const averageTimeMs = times.length
    ? times.reduce((sum, value) => sum + value, 0) / times.length
    : 0;
  const varianceTimeMs2 = times.length
    ? times.reduce((sum, value) => sum + Math.pow(value - averageTimeMs, 2), 0) /
      times.length
    : 0;
  const fastestTimeMs = times.length ? Math.min(...times) : 0;
  const slowestTimeMs = times.length ? Math.max(...times) : 0;
  const finalScoreTotal = finalScores.reduce((sum, entry) => sum + entry.score, 0);
  const averageScorePerPlayer = playerCount
    ? finalScoreTotal / playerCount
    : 0;
  const winner = finalScores[0];

  return {
    timestamp: state.quizStartedAt ?? new Date().toISOString(),
    hostName:
      state.hostNameSnapshot ??
      room.users.find((member) => member.is_host)?.user_name ??
      "",
    roomName: room.room_name,
    quizName: state.quizName ?? "",
    questionCount,
    playerCount,
    totalAnswers,
    correctAnswers,
    incorrectAnswers,
    correctRatio,
    incorrectRatio,
    averageTimeMs,
    varianceTimeMs2,
    fastestTimeMs,
    slowestTimeMs,
    averageScorePerPlayer,
    winnerName: winner?.user_name,
    winnerScore: winner?.score,
  };
}

function sanitizeDuration(
  value: unknown,
  fallback: number,
  min = 500,
  max = 5 * 60 * 1000
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const clamped = Math.max(min, Math.min(max, Math.floor(value)));
    return clamped;
  }
  return fallback;
}

function normalizeQuizStartPayload(
  payload:
    | string
    | {
        category?: string;
        questionDurationMs?: number;
        resultDurationMs?: number;
        leaderboardDurationMs?: number;
      }
): {
  category: string;
  questionDurationMs: number;
  resultDurationMs: number;
  leaderboardDurationMs: number;
} {
  if (typeof payload === "string") {
    return {
      category: payload || DEFAULT_CATEGORY,
      questionDurationMs: DEFAULT_QUESTION_DURATION_MS,
      resultDurationMs: DEFAULT_RESULT_DURATION_MS,
      leaderboardDurationMs: DEFAULT_LEADERBOARD_DURATION_MS,
    };
  }

  const category = payload.category && payload.category.trim()
    ? payload.category
    : DEFAULT_CATEGORY;
  const questionDurationMs = sanitizeDuration(
    payload.questionDurationMs,
    DEFAULT_QUESTION_DURATION_MS
  );
  const resultDurationMs = sanitizeDuration(
    payload.resultDurationMs,
    DEFAULT_RESULT_DURATION_MS,
    100,
    60_000
  );
  const leaderboardDurationMs = sanitizeDuration(
    payload.leaderboardDurationMs,
    DEFAULT_LEADERBOARD_DURATION_MS,
    100,
    60_000
  );

  return {
    category,
    questionDurationMs,
    resultDurationMs,
    leaderboardDurationMs,
  };
}

function broadcastWaitingRoom(target: Server, room: Room): void {
  roomLogger.debug("Broadcasting waiting room update", {
    room: room.room_name,
    users: get_room_usernames(room),
  });
  target.to(room.room_name).emit("display_wait", {
    room: room.room_name,
    users_in_room: get_room_usernames(room),
  });
}

function emitScoreboardUpdate(target: Server, room: Room): void {
  const payload = {
    room: room.room_name,
    players: room.users
      .filter((user) => !user.is_host)
      .map((user) => user.user_name),
    scores: get_room_scores(room).map((user) => ({
      user_name: user.user_name,
      score: user.score,
    })),
  };

  roomLogger.debug("Emitting scoreboard update", {
    room: room.room_name,
    payload,
  });

  target.to(room.host_socket_id).emit("scoreboard_update", payload);
}

function handleAnswer(
  target: Server,
  room: Room,
  user: RoomUser,
  choice_id: string
): void {
  const state = roomGameState.get(room.room_name);
  if (!state?.currentQuestion) {
    roomLogger.warn("Handle answer skipped: no current question", {
      room: room.room_name,
      user: user.user_name,
    });
    return;
  }

  if (!state.running) {
    roomLogger.debug("Handle answer skipped: quiz not running", {
      room: room.room_name,
      user: user.user_name,
    });
    return;
  }

  const answerIndex = Number(choice_id);
  if (Number.isNaN(answerIndex)) {
    roomLogger.warn("Handle answer skipped: invalid choice id", {
      room: room.room_name,
      user: user.user_name,
      choice_id,
    });
    return;
  }

  const question = state.currentQuestion;
  const elapsedMs = state.questionStartTimestamp
    ? Date.now() - state.questionStartTimestamp
    : 0;
  const sanitizedElapsed = elapsedMs < 0 ? 0 : elapsedMs;
  const correctAnswerText =
    question?.incorrect_answers?.[question.correct_answer] ?? "";
  const providedAnswerText =
    question?.incorrect_answers?.[answerIndex] ?? String(choice_id);
  const questionNumber = state.currentIndex + 1;
  const category = question?.category ?? state.quizName ?? "";
  const difficulty = question?.difficulty ?? "unknown";

  const snapshotScores = () => get_room_scores(room);
  const computePosition = (scores: RoomUser[]) =>
    scores.findIndex((entry) => entry.user_id === user.user_id) + 1;

  const updateLog = (
    correct: boolean,
    scoreAwarded: number,
    scores: RoomUser[]
  ) => {
    const playerRecord = room.users.find(
      (member) => member.user_id === user.user_id
    );
    recordAnswerLog(state, room, user, {
      questionNumber,
      correct,
      scoreAwarded,
      totalScore: playerRecord?.score ?? 0,
      leaderboardPosition: computePosition(scores),
      timeMs: sanitizedElapsed,
      providedAnswerIndex: answerIndex,
      providedAnswer: providedAnswerText,
      correctAnswer: correctAnswerText,
      difficulty,
      category,
    });
  };

  if (answerIndex !== state.currentQuestion.correct_answer) {
    roomLogger.debug("Handle answer: incorrect response", {
      room: room.room_name,
      user: user.user_name,
      choice_id,
    });

    const scoresSnapshot = snapshotScores();
    updateLog(false, 0, scoresSnapshot);

    target.to(room.host_socket_id).emit("progression_update", {
      questionIndex: state.currentIndex,
      userName: user.user_name,
      correct: false,
    });
    return;
  }

  let score_to_add = 0;

  if (state.currentQuestion.difficulty === "easy") {
    score_to_add = 20;
  } else if (state.currentQuestion.difficulty === "medium") {
    score_to_add = 30;
  } else {
    score_to_add = 40;
  }

  if (state.isFirstToAnswer) {
    score_to_add += 10;
    state.isFirstToAnswer = false;
  }

  if (state.currentIndex === 9) {
    score_to_add *= 2;
  }

  add_score(room, user.user_id, score_to_add);
  const scoresSnapshot = snapshotScores();
  updateLog(true, score_to_add, scoresSnapshot);
  roomLogger.info("Score awarded", {
    room: room.room_name,
    user: user.user_name,
    choice_id,
    score_to_add,
  });
  target.to(room.host_socket_id).emit("progression_update", {
    questionIndex: state.currentIndex,
    userName: user.user_name,
    correct: true,
  });
  emitScoreboardUpdate(target, room);
}

async function runQuiz(
  target: Server,
  room: Room,
  category_selected: string
): Promise<void> {
  const state = getQuizState(room);
  if (!state) {
    roomLogger.error("Attempted to run quiz without initialized state", {
      room: room.room_name,
    });
    return;
  }

  roomLogger.info("Quiz starting", {
    room: room.room_name,
    category_selected,
  });
  const quiz = await load_quiz(category_selected);
  add_ten_questions(room, quiz.questions);

  state.quizName = quiz.title || category_selected;
  state.questionCount = room.ten_questions.length;
  state.playersAtStart = Array.from(
    new Set(
      room.users
        .filter((member) => !member.is_host)
        .map((member) => member.user_name)
    )
  );
  state.answerLog = [];
  state.quizStartedAt = state.quizStartedAt ?? new Date().toISOString();
  state.hostNameSnapshot =
    state.hostNameSnapshot ||
    room.users.find((member) => member.is_host)?.user_name ||
    "";

  for (let index = 0; index < 10; index += 1) {
    if (!state.running) {
      roomLogger.info("Quiz loop exiting early (not running)", {
        room: room.room_name,
        index,
      });
      break;
    }

    const nextQuestion = get_a_question(room);
    if (!nextQuestion) {
      roomLogger.warn("Quiz aborted: no question available", {
        room: room.room_name,
        index,
      });
      break;
    }

    state.currentQuestion = nextQuestion;
    state.currentIndex = index;
    state.isFirstToAnswer = true;
    state.questionStartTimestamp = Date.now();

    roomLogger.info("Question dispatched", {
      room: room.room_name,
      index,
      difficulty: nextQuestion.difficulty,
    });

    target.to(room.host_socket_id).emit("progression_highlight", {
      index,
    });

    target
      .to(room.room_name)
      .except(room.host_socket_id)
      .emit("display_question", {
        index,
        difficulty: nextQuestion.difficulty ?? "medium",
        category: nextQuestion.category ?? "default",
        question: nextQuestion.question,
        all_answers: nextQuestion.incorrect_answers,
      });

    await sleep(state.questionDurationMs);
    if (!state.running) {
      break;
    }

    target
      .to(room.room_name)
      .except(room.host_socket_id)
      .emit("display_results", {
        correct_answer: nextQuestion.correct_answer,
      });

    await sleep(state.resultDurationMs);
    if (!state.running) {
      break;
    }

    const scores = get_room_scores(room);

    target
      .to(room.room_name)
      .except(room.host_socket_id)
      .emit("display_leaderboard", {
        index,
        scores_in_room: scores,
      });
    emitScoreboardUpdate(target, room);

    await sleep(state.leaderboardDurationMs);

    roomLogger.debug("Leaderboard emitted", {
      room: room.room_name,
      index,
    });

    if (!state.running) {
      break;
    }
  }

  finishQuiz(
    target,
    room,
    state,
    state.cancelled ? "cancelled" : "completed"
  );
}

io.on("connection", (socket: Socket) => {
  const socketLog = socketLogger.child({ socketId: socket.id });
  socketLog.info("Socket connected");

  socket.on(
    "create_room",
    async ({ username, room }: { username: string; room: string }) => {
      if (socket.data.room_name) {
        socketLog.warn("Create room rejected: already managing room", {
          existing_room: socket.data.room_name,
          attempted_room: room,
        });
        socket.emit("room_error", {
          message: "You are already managing a room. Refresh to start over.",
        });
        return;
      }

      try {
        const { room: current_room, user: current_user } = create_room(
          socket.id,
          username,
          room
        );

        socketLog.info("Host created room", {
          room: current_room.room_name,
          username,
        });

        socket.data.room_name = current_room.room_name;
        socket.data.user_id = current_user.user_id;
        socket.data.role = "host";

        await socket.join(current_room.room_name);
        socket.emit("room_created", { room: current_room.room_name });

        emitScoreboardUpdate(io, current_room);
        broadcastWaitingRoom(io, current_room);

        socket.once("disconnect", () => {
          socketLog.info("Host socket disconnected", {
            room: current_room.room_name,
          });
          const state = getQuizState(current_room);
          if (state?.running) {
            state.cancelled = true;
            finishQuiz(io, current_room, state, "cancelled");
          }

          const roomRemoved = remove_user(current_user, current_room);
          if (!roomRemoved) {
            broadcastWaitingRoom(io, current_room);
            emitScoreboardUpdate(io, current_room);
          }
        });

        socket.on(
          "ask_start_game",
          async (
            payload:
              | string
              | {
                  category?: string;
                  questionDurationMs?: number;
                  resultDurationMs?: number;
                  leaderboardDurationMs?: number;
                }
          ) => {
          const existingState = getQuizState(current_room);
          if (existingState?.running) {
            socketLog.warn("Start game rejected: quiz already running", {
              room: current_room.room_name,
            });
            socket.emit("room_error", {
              message: "The quiz is already running.",
            });
            return;
          }

          const activePlayers = current_room.users.filter((user) => !user.is_host);
          if (activePlayers.length === 0) {
            socketLog.warn("Start game rejected: no players", {
              room: current_room.room_name,
            });
            socket.emit("room_error", {
              message: "Invite at least one player before starting the quiz.",
            });
            return;
          }

          const state = initializeQuizState(current_room);
          const startOptions = normalizeQuizStartPayload(payload);
          state.questionDurationMs = startOptions.questionDurationMs;
          state.resultDurationMs = startOptions.resultDurationMs;
          state.leaderboardDurationMs = startOptions.leaderboardDurationMs;
          state.quizName = startOptions.category;

          reset_room_scores(current_room);
          emitScoreboardUpdate(io, current_room);

          const playerNames = activePlayers.map((player) => player.user_name);
          const quizStartedPayload = {
            players: playerNames,
            questionCount: 10,
            questionDurationMs: state.questionDurationMs,
            resultDurationMs: state.resultDurationMs,
            leaderboardDurationMs: state.leaderboardDurationMs,
          };

          io.to(current_room.room_name).emit("quiz_started", quizStartedPayload);

          try {
            await runQuiz(io, current_room, startOptions.category);
          } catch (error) {
            socketLog.error("Failed to run quiz", {
              error,
              room: current_room.room_name,
            });
            state.cancelled = true;
            finishQuiz(io, current_room, state, "cancelled");
            socket.emit("room_error", {
              message: "Unable to start quiz. Please try another category.",
            });
          }
        }
        );

        socket.on("ask_end_game", () => {
          const state = getQuizState(current_room);
          if (!state?.running) {
            socketLog.warn("End game ignored: quiz not running", {
              room: current_room.room_name,
            });
            socket.emit("quiz_finished", { reason: "not_running" });
            return;
          }

          socketLog.info("Host requested quiz termination", {
            room: current_room.room_name,
          });
          state.cancelled = true;
          finishQuiz(io, current_room, state, "cancelled");
        });

        socket.on("ask_results", () => {
          const state = roomGameState.get(current_room.room_name);
          if (!state?.currentQuestion) {
            socketLog.debug("ask_results ignored: no question", {
              room: current_room.room_name,
            });
            return;
          }

          if (!state.running) {
            socketLog.debug("ask_results ignored: quiz not running", {
              room: current_room.room_name,
            });
            return;
          }

          io
            .to(current_room.room_name)
            .except(current_room.host_socket_id)
            .emit("display_results", {
              correct_answer: state.currentQuestion.correct_answer,
            });
        });

        socket.on("ask_leaderboard", (index: number) => {
          const state = roomGameState.get(current_room.room_name);
          if (state && !state.running) {
            socketLog.debug("ask_leaderboard ignored: quiz not running", {
              room: current_room.room_name,
            });
            return;
          }

          const scores = get_room_scores(current_room);

          io
            .to(current_room.room_name)
            .except(current_room.host_socket_id)
            .emit("display_leaderboard", {
              index,
              scores_in_room: scores,
            });
          emitScoreboardUpdate(io, current_room);
        });
      } catch (error: unknown) {
        socketLog.error("Create room failed", { error, username, room });
        let message = "Unable to create room.";
        if (error instanceof Error && error.message === "room_exists") {
          message = "Room already exists. Choose another id.";
        }
        socket.emit("room_error", { message });
      }
    }
  );

  socket.on(
    "join_room",
    async ({ username, room }: { username: string; room: string }) => {
      if (socket.data.room_name) {
        socketLog.warn("Join room rejected: already in room", {
          existing_room: socket.data.room_name,
          attempted_room: room,
        });
        socket.emit("room_error", {
          message: "You are already in a room. Refresh to join a new one.",
        });
        return;
      }

      try {
        const { room: current_room, user: current_user } = join_room(
          socket.id,
          username,
          room
        );

        socketLog.info("Player joined room", {
          room: current_room.room_name,
          username,
        });

        socket.data.room_name = current_room.room_name;
        socket.data.user_id = current_user.user_id;
        socket.data.role = "player";

        await socket.join(current_room.room_name);
        socket.emit("room_joined", { room: current_room.room_name });

        broadcastWaitingRoom(io, current_room);
        emitScoreboardUpdate(io, current_room);

        socket.once("disconnect", () => {
          socketLog.info("Player socket disconnected", {
            room: current_room.room_name,
            username,
          });
          const roomRemoved = remove_user(current_user, current_room);
          if (!roomRemoved) {
            broadcastWaitingRoom(io, current_room);
            emitScoreboardUpdate(io, current_room);
          } else {
            roomGameState.delete(current_room.room_name);
          }
        });

        socket.on("user_sent_choice", (choice_id: string) => {
          if (socket.data.role !== "player") {
            socketLog.warn("user_sent_choice ignored: non-player", {
              socket_role: socket.data.role,
              room: current_room.room_name,
            });
            return;
          }
          socketLog.debug("user_sent_choice received", {
            room: current_room.room_name,
            username,
            choice_id,
          });
          handleAnswer(io, current_room, current_user, choice_id);
        });
      } catch (error: unknown) {
        socketLog.error("Join room failed", { error, username, room });
        let message = "Unable to join room.";
        if (error instanceof Error && error.message === "room_not_found") {
          message = "Room not found. Check the code and try again.";
        }
        socket.emit("room_error", { message });
      }
    }
  );

  socket.on("disconnect", (reason) => {
    socketLog.info("Socket disconnected", { reason });
  });
});

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  logger.info("Server listening", { port: PORT });
});

server.on("error", (error) => {
  logger.error("HTTP server error", { error });
});
