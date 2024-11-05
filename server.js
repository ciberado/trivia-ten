const path = require("path");
const http = require("http");
const express = require("express");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const socketio = require("socket.io");
const io = socketio(server);

const {
  add_user,
  get_room_usernames,
  remove_user,
  add_ten_questions,
  get_a_question,
  get_last_question,
  get_room_scores,
  add_score,
} = require("./rooms");

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

// Run when client connects
io.on("connection", (socket) => {
  // When user joins room
  socket.on("user_joined_room", ({ username, room }) => {
    let current = add_user(socket.id, username, room);
    let current_room = current.room;
    let current_user = current.user;

    let current_question;
    let current_room_scores;
    let current_index;

    let is_first_to_answer;
    var score_to_add;

    // Make user join the room
    socket.join(room);

    // Display waiting room message
    io.in(room).emit("display_wait", {
      room: current_room.room_name,
      users_in_room: get_room_usernames(current_room),
    });

    // Remove user if he leaves
    socket.on("disconnect", () => {
      remove_user(current_user, current_room);

      io.in(room).emit("display_wait", {
        room: current_room.room_name,
        users_in_room: get_room_usernames(current_room).join(", "),
      });
    });

    // When leader starts game
    socket.on("ask_start_game", (category_selected) => {
      // Get ten questions from api
      fetch(
        `http://localhost:3000/demo.json`
      )
        .then((res) => res.json())
        .then(function (json) {
          // Add the ten questions to the room
          add_ten_questions(current_room, json.results);
        });
    });

    // When leader requests a question
    socket.on("ask_question", (index) => {
      // Get next question
      current_question = get_a_question(current_room);
      current_index = index;
      is_first_to_answer = true;
console.log(JSON.stringify(current_question));
      // Display question
      io.in(room).emit("display_question", {
        index,
        difficulty: current_question?.difficulty || "medium",
        category: current_question?.category || "default",
        question: current_question.question,
        all_answers: current_question.incorrect_answers,
      });
    });

    // Receive user choice and add his score
    socket.on("user_sent_choice", (choice_id) => {
      let current_question = get_last_question(current_room);

      // Calculate score
      score_to_add = 0;
      if (choice_id == current_question.correct_answer) {
        if (current_question.difficulty == "easy") {
          score_to_add = 20;
        } else if (current_question.difficulty == "medium") {
          score_to_add = 30;
        } else {
          score_to_add = 40;
        }
        if (is_first_to_answer) {
          score_to_add += 10;
          is_first_to_answer = false;
        }
        if (current_index == 9) {
          score_to_add *= 2;
        }

        // Add score to user
        add_score(current_room, current_user.user_id, score_to_add);
      }
    });

    // When leader requests a result
    socket.on("ask_results", (index) => {
      // Display result
      io.in(room).emit("display_results", {
        correct_answer: current_question.correct_answer,
      });
    });

    // When leader requests a leaderboard
    socket.on("ask_leaderboard", (index) => {
      // Get next question
      current_room_scores = get_room_scores(current_room);

      // Display question
      io.in(room).emit("display_leaderboard", {
        index,
        scores_in_room: current_room_scores,
      });
    });
  });
});

// Start server on port
const PORT = process.env.PORT || 3000;
server.listen(PORT);
