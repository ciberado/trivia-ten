const socket = io();

// Get username and room from URL
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get("username");
const room = urlParams.get("room");

// Join room
socket.emit("join_room", { username, room });

// Display waiting info
const roomid_text = document.getElementById("roomid_text");
const players_text = document.getElementById("players_text");
const leader_div = document.getElementById("leader_div");
socket.on("waiting_step", ({ room, users_in_room }) => {
  roomid_text.innerHTML = room;
  players_text.innerHTML = users_in_room;

  // Show start button if it's the first player
  if (username == users_in_room[0]) {
    leader_div.classList.remove("hidden");
  }
});

// Start game when leader clicks on start button
const wait_div = document.querySelector(".wait");
const question_div = document.querySelector(".question");
const category_select = document.getElementById("category_select");
const startgame_btn = document.getElementById("startgame_btn");
startgame_btn.addEventListener("click", function () {
  // Display question div
  wait_div.classList.add("hidden");
  question_div.classList.remove("hidden");

  // Emit socket to start game
  let category_selected = category_select.value;
  socket.emit("start_game", category_selected);
});

const wait_text = document.getElementById("wait_text");
const newquestion_btn = document.getElementById("newquestion_btn");
newquestion_btn.addEventListener("click", function () {
  socket.emit("new_question");
  wait_text.innerHTML = "Asking for new question";
});

socket.on("new_question_show", (question) => {
  console.log("new question received from server");
  wait_text.innerHTML = question;
});

// Display question
const number_text = document.getElementById("number_text");
const category_text = document.getElementById("category_text");
const question_text = document.getElementById("question_div");
const choice1_text = document.getElementById("choice1_text");
const choice2_text = document.getElementById("choice2_text");
const choice3_text = document.getElementById("choice3_text");
const choice4_text = document.getElementById("choice4_text");
socket.on(
  "show_question",
  (number, difficulty, category, question, choices) => {
    console.log(number, difficulty, category, question, choices);
  }
);
