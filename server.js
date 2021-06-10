const path = require("path");
const http = require("http");
const express = require("express");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const socketio = require("socket.io");
const io = socketio(server);

// Display qustion
var user;
var is_first_to_answer;
var current_question;
var score_to_add;

const {
  user_join,
  user_leave,
  get_room_users,
  get_room_scores,
  set_score_zero,
  add_score,
} = require("./utils/users");

const { response } = require("express");

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

// Run when client connects
io.on("connection", (socket) => {
  console.log(`⚠ New web socket connected with id "${socket.id}"`);

  // When user joins room
  socket.on("join_room", ({ username, room }) => {
    // Store user information in the users list
    user = user_join(socket.id, username, room);

    // Make user join the room
    socket.join(user.room);
    console.log(`⚠ "${username}" just joined room "${room}"`);

    // Display waiting room message
    users_in_room = get_room_users(room);
    io.in(room).emit("waiting_step", { room, users_in_room });

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

  // When leader starts game
  socket.on("start_game", (category_selected) => {
    // Set all scores to zero
    console.log(`⚠ Start game requested from user`);

    // Retrieve ten questions from api
    console.log(`⚠ Ten questions requested from api`);

    // Get ten questions from api
    fetch(
      `https://opentdb.com/api.php?amount=10&type=multiple&category=${category_selected}`
    )
      .then((res) => res.json())
      .then(function (json) {
        ten_questions = json.results;
        console.log(ten_questions);
        // Start game
        start_game();
      });
  });

  // Receive user choice and add his score
  socket.on("send_choice", (choice_id) => {
    console.log(`RECEIVED CHOICE FROM CLIENT ${socket.id}`);
    console.log(`CHOICES = ${current_question.all_answers}`);

    // Calculate score
    score_to_add = 0;
    if (
      current_question.all_answers[choice_id] == current_question.correct_answer
    ) {
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

      // Add score to user
      add_score(socket.id, score_to_add);
    }
  });
});

// Game function
async function start_game() {
  i = 0;
  while (i < 10) {
    // Get question
    current_question = get_next_question(ten_questions, i);
    console.log(current_question);
    console.log(`All answers = ${current_question.responses}`);
    console.log(
      `⚠ Answer of ${i + 1}${i + 1}${i + 1} is 
      "${current_question.correct_answer}"`
    );

    // Display question
    io.in(user.room).emit("show_question", {
      number: i + 1,
      difficulty: current_question.difficulty,
      category: current_question.category,
      question: current_question.question,
      all_answers: current_question.all_answers,
    });

    // Wait 10 seconds
    await sleep(10000);

    // Display results
    io.in(user.room).emit("results", {
      correct_answer: current_question.correct_answer,
    });

    // Wait 2 seconds
    await sleep(2000);

    // Display leaderboard or end
    io.in(user.room).emit("leaderboard", {
      number: i + 2,
      users_in_room: get_room_users(user.room),
      scores_in_room: get_room_scores(user.room),
    });

    // Wait 2 seconds
    await sleep(2500);

    // Go next
    i++;
  }
  console.log(`⚠ End of the quiz`);
}

// Delay function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Get next question
function get_next_question(ten_questions, index) {
  // Shuffle answers
  let all_answers = [];
  all_answers[0] = ten_questions[index].correct_answer;
  all_answers[1] = ten_questions[index].incorrect_answers[0];
  all_answers[2] = ten_questions[index].incorrect_answers[1];
  all_answers[3] = ten_questions[index].incorrect_answers[2];
  for (let i = all_answers.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [all_answers[i], all_answers[j]] = [all_answers[j], all_answers[i]];
  }

  correct_answer = all_answers.findIndex(
    (element) => element == ten_questions[index].correct_answer
  );

  // Return question object
  obj = {
    question: ten_questions[index].question,
    category: ten_questions[index].category,
    difficulty: ten_questions[index].difficulty,
    correct_answer: correct_answer,
    all_answers: all_answers,
  };
  return obj;
}

// Start server on port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`★ Server running on port ${PORT}`));
