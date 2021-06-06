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

// Display question
const timer = document.getElementById("timer");
const number_text = document.getElementById("number_text");
const difficulty_text = document.getElementById("difficulty_text");
const category_text = document.getElementById("category_text");
const question_text = document.getElementById("question_text");
const choice_buttons = document.getElementsByClassName("question__choice");
const choice0_text = document.getElementById("0");
const choice1_text = document.getElementById("1");
const choice2_text = document.getElementById("2");
const choice3_text = document.getElementById("3");
socket.on(
  "show_question",
  ({ number, difficulty, category, question, choices }) => {
    // Enable buttons
    for (let i = 0; i < choice_buttons.length; i++) {
      choice_buttons[i].disabled = false;
      choice_buttons[i].classList.remove("selected");
    }

    // Start timer
    document.getElementById("timer").innerHTML = "";
    var bar = new ProgressBar.Line(timer, {
      strokeWidth: 4,
      easing: "easeInOut",
      duration: 5000,
      color: "#61afef",
      trailColor: "#eee",
      trailWidth: 4,
      svgStyle: { width: "100%", height: "100%" },
    });
    bar.animate(1.0);

    // Show text
    number_text.innerHTML = number;
    difficulty_text.innerHTML = difficulty;
    category_text.innerHTML = category;
    question_text.innerHTML = question;
    choice0_text.innerHTML = choices[0];
    choice1_text.innerHTML = choices[1];
    choice2_text.innerHTML = choices[2];
    choice3_text.innerHTML = choices[3];
  }
);

// Show user choice and send it to server
function submit_choice(choice_id) {
  // Show choice
  document.getElementById(choice_id).classList.add("selected");

  // Disable buttons
  for (let i = 0; i < choice_buttons.length; i++) {
    choice_buttons[i].disabled = true;
  }

  // Send choice to server
  socket.emit("send_choice", choice_id);
}
