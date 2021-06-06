const path = require("path");
const http = require("http");
const fetch = require("node-fetch");
const express = require("express");

const app = express();
const server = http.createServer(app);
const socketio = require("socket.io");
const io = socketio(server);

const {
  user_join,
  user_leave,
  get_room_users,
  set_score_zero,
  shuffle,
} = require("./functions");

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

// Run when client connects
io.on("connection", (socket) => {
  console.log(`⚠ New web socket connected with id "${socket.id}"`);

  // When user joins room
  socket.on("join_room", ({ username, room }) => {
    // Store user information in the users list
    const user = user_join(socket.id, username, room);

    // Make user join the room
    socket.join(user.room);
    console.log(`⚠ "${username}" just joined room "${room}"`);

    // Display waiting room message
    users_in_room = get_room_users(room);
    io.in(room).emit("waiting_step", { room, users_in_room });

    // When leader starts game
    socket.on("start_game", (category_selected) => {
      console.log(`⚠ Start game requested from user`);
      let i = 0;
      let ten_questions;
      let current_question;
      let correct_response;
      let responses;

      // Retrieve ten questions from api
      let api_url = `https://opentdb.com/api.php?amount=10&type=multiple&category=${category_selected}`;
      console.log(`⚠ Ten questions requested from api`);
      fetch(api_url)
        .then((res) => res.json())
        .then(function (json) {
          ten_questions = json.results;

          // Display questions while it's less than 10
          while (i < 10) {
            // Get next question
            current_question = ten_questions[i];
            console.log(`⚠ Current question is: ${current_question.question}`);

            // Get shuffled responses and correct one
            correct_response = current_question.correct_answer;
            responses = [
              current_question.correct_answer,
              ...current_question.incorrect_answers,
            ];
            shuffle(responses);

            // Set all scores to zero
            set_score_zero(room);

            // Display question
            io.in(room).emit("show_question", {
              number: i,
              difficulty: current_question.difficulty,
              category: current_question.category,
              question: current_question.question,
              choices: responses,
            });

            // Receive user choice
            socket.on("send_choice", (choice_id) => {
              return;
            });
            i++;
          }
        });
    });

    // Remove user if he leaves
    socket.on("disconnect", () => {
      console.log(`⚠ "${username}" just left room "${room}"`);
      const user = user_leave(socket.id);
      io.in(user.room).emit("waiting_step", {
        room: user.room,
        users_in_room: get_room_users(user.room),
      });
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`★ Server running on port ${PORT}`));
