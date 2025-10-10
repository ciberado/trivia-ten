import { promises as fs } from "node:fs";
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
import type { Question, RawQuestion, Room, RoomUser } from "./types";
import { logger, socketLogger, roomLogger } from "./logger";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "..", "public");
const questionsDir = path.join(__dirname, "..", "questions");

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
}

const roomGameState = new Map<string, RoomGameState>();

function initializeQuizState(room: Room): RoomGameState {
  const existing = roomGameState.get(room.room_name);
  const state: RoomGameState = existing ?? {
    currentQuestion: undefined,
    currentIndex: 0,
    isFirstToAnswer: false,
    cancelled: false,
    running: false,
    finished: false,
  };
  state.currentQuestion = undefined;
  state.currentIndex = 0;
  state.isFirstToAnswer = false;
  state.cancelled = false;
  state.running = true;
  state.finished = false;
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
  target.to(room.host_socket_id).emit("quiz_finished", { reason, scores });
  roomGameState.delete(room.room_name);
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

  if (answerIndex !== state.currentQuestion.correct_answer) {
    roomLogger.debug("Handle answer: incorrect response", {
      room: room.room_name,
      user: user.user_name,
      choice_id,
    });
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
  const data = await fs.readFile(
    path.join(questionsDir, `${category_selected}.json`),
    "utf-8"
  );
  const json = JSON.parse(data) as { results: RawQuestion[] };
  add_ten_questions(room, json.results);

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

    await sleep(18_000);
    if (!state.running) {
      break;
    }

    target
      .to(room.room_name)
      .except(room.host_socket_id)
      .emit("display_results", {
        correct_answer: nextQuestion.correct_answer,
      });

    await sleep(3_000);
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

    await sleep(3_000);

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

        socket.on("ask_start_game", async (category_selected: string) => {
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
          reset_room_scores(current_room);
          emitScoreboardUpdate(io, current_room);

          const playerNames = activePlayers.map((player) => player.user_name);
          socket.emit("quiz_started", {
            players: playerNames,
            questionCount: 10,
          });

          try {
            await runQuiz(io, current_room, category_selected);
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
        });

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
