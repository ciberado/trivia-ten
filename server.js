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
  add_score,
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
      // Set all scores to zero
      set_score_zero(room);

      console.log(`⚠ Start game requested from user`);
      let i = 0;
      let ten_questions;
      let current_question;
      let correct_response;
      let responses;
      let is_first_to_answer = true;
      let score_to_add;

      // Retrieve ten questions from api
      let api_url = `https://opentdb.com/api.php?amount=10&type=multiple&category=${category_selected}`;
      console.log(`⚠ Ten questions requested from api`);
      fetch(api_url)
        .then((res) => res.json())
        .then(function (json) {
          ten_questions = json.results;

          // Display first question
          current_question = ten_questions[i];
          console.log(
            `⚠ Answer of ${i + 1}${i + 1}${i + 1} is "${
              current_question.correct_answer
            }" (${current_question.difficulty})`
          );
          get_question(current_question, correct_response, responses);
          i++;

          // Display all other questions
          var intr = setInterval(function () {
            // Get next question
            is_first_to_answer = true;
            current_question = ten_questions[i];
            console.log(
              `⚠ Answer of ${i + 1}${i + 1}${i + 1} is "${
                current_question.correct_answer
              }" (${current_question.difficulty})`
            );
            get_question(current_question, correct_response, responses);

            // End
            if (++i == 10) {
              clearInterval(intr);
              console.log(`⚠ End of the quiz`);
            }
          }, 10000);

          // Receive user choice and add his score
          socket.on("send_choice", (choice_id) => {
            // Calculate score
            score_to_add = 0;
            if (responses[choice_id] == correct_response) {
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
              if (i == 10) {
                score_to_add *= 2;
              }

              // Add score
              add_score(socket.id, score_to_add);
            }
          });

          function get_question() {
            // Get shuffled responses and correct one
            correct_response = current_question.correct_answer;
            responses = [
              current_question.correct_answer,
              ...current_question.incorrect_answers,
            ];
            shuffle(responses);

            // Display question
            io.in(room).emit("show_question", {
              number: i + 1,
              difficulty: current_question.difficulty,
              category: current_question.category,
              question: current_question.question,
              choices: responses,
            });
          }
        });
    });

    // Remove user if he leaves
    socket.on("disconnect", () => {
      console.log(`⚠ "${username}" just left room "${room}"`);
      users = get_room_users;
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
