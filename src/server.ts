import { promises as fs } from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import { Server, Socket } from "socket.io";

import {
  add_user,
  add_score,
  add_ten_questions,
  get_a_question,
  get_last_question,
  get_room_scores,
  get_room_usernames,
  remove_user,
} from "./rooms";
import type { Question, RawQuestion, RoomUser } from "./types";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "..", "public");
const questionsDir = path.join(__dirname, "..", "questions");

app.use(express.static(publicDir));

function sleep(timeoutInMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutInMs);
  });
}

io.on("connection", (socket: Socket) => {
  socket.on(
    "user_joined_room",
    ({ username, room }: { username: string; room: string }) => {
      const { room: current_room, user: current_user } = add_user(
        socket.id,
        username,
        room
      );

      let current_question: Question | undefined;
      let current_room_scores: RoomUser[] = [];
      let current_index: number | undefined;
      let is_first_to_answer: boolean | undefined;

      void socket.join(room);

      io.to(room).emit("display_wait", {
        room: current_room.room_name,
        users_in_room: get_room_usernames(current_room),
      });

      socket.on("disconnect", () => {
        remove_user(current_user, current_room);

        io.to(room).emit("display_wait", {
          room: current_room.room_name,
          users_in_room: get_room_usernames(current_room),
        });
      });

      socket.on("ask_start_game", async (category_selected: string) => {
        const data = await fs.readFile(
          path.join(questionsDir, `${category_selected}.json`),
          "utf-8"
        );
        const json = JSON.parse(data) as { results: RawQuestion[] };
        add_ten_questions(current_room, json.results);

        for (let index = 0; index < 10; index += 1) {
          const nextQuestion = get_a_question(current_room);
          if (!nextQuestion) {
            break;
          }

          current_question = nextQuestion;
          current_index = index;
          is_first_to_answer = true;

          io.to(room).emit("display_question", {
            index,
            difficulty: nextQuestion.difficulty ?? "medium",
            category: nextQuestion.category ?? "default",
            question: nextQuestion.question,
            all_answers: nextQuestion.incorrect_answers,
          });

          await sleep(18_000);

          io.to(room).emit("display_results", {
            correct_answer: nextQuestion.correct_answer,
          });

          await sleep(3_000);

          current_room_scores = get_room_scores(current_room);

          io.to(room).emit("display_leaderboard", {
            index,
            scores_in_room: current_room_scores,
          });

          await sleep(3_000);
        }
      });

      socket.on("ask_question", (index: number) => {
        const nextQuestion = get_a_question(current_room);
        if (!nextQuestion) {
          return;
        }

        current_question = nextQuestion;
        current_index = index;
        is_first_to_answer = true;

        io.to(room).emit("display_question", {
          index,
          difficulty: nextQuestion.difficulty ?? "medium",
          category: nextQuestion.category ?? "default",
          question: nextQuestion.question,
          all_answers: nextQuestion.incorrect_answers,
        });
      });

      socket.on("user_sent_choice", (choice_id: string) => {
        const recentQuestion = get_last_question(current_room);
        if (!recentQuestion) {
          return;
        }

        const answerIndex = Number(choice_id);
        if (Number.isNaN(answerIndex)) {
          return;
        }

        if (answerIndex === recentQuestion.correct_answer) {
          let score_to_add = 0;

          if (recentQuestion.difficulty === "easy") {
            score_to_add = 20;
          } else if (recentQuestion.difficulty === "medium") {
            score_to_add = 30;
          } else {
            score_to_add = 40;
          }

          if (is_first_to_answer) {
            score_to_add += 10;
            is_first_to_answer = false;
          }

          if (current_index === 9) {
            score_to_add *= 2;
          }

          add_score(current_room, current_user.user_id, score_to_add);
        }
      });

      socket.on("ask_results", () => {
        if (!current_question) {
          return;
        }

        io.to(room).emit("display_results", {
          correct_answer: current_question.correct_answer,
        });
      });

      socket.on("ask_leaderboard", (index: number) => {
        current_room_scores = get_room_scores(current_room);

        io.to(room).emit("display_leaderboard", {
          index,
          scores_in_room: current_room_scores,
        });
      });
    }
  );
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT);
