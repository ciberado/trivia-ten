// Socketio
const socket = io();

// Sounds
let correct_sound = new this.Howl({
  src: [`../sounds/correct.ogg`],
  volume: 0.25,
});
let wrong_sound = new this.Howl({
  src: [`../sounds/incorrect.wav`],
  volume: 0.25,
});

// Get dom elements
// Home
const home_div = document.querySelector(".home");
const username_input = document.getElementById("username_input");
const room_input = document.getElementById("room_input");
const join_btn = document.getElementById("join_btn");
// Wait
const wait_div = document.querySelector(".wait");
const roomid_text = document.getElementById("roomid_text");
const players_text = document.getElementById("players_text");
const leader_div = document.getElementById("leader_div");
const category_select = document.getElementById("category_select");
const startgame_btn = document.getElementById("startgame_btn");
// Question
const question_div = document.querySelector(".question");
const timer = document.getElementById("timer");
const number_text = document.getElementById("number_text");
const difficulty_text = document.getElementById("difficulty_text");
const category_text = document.getElementById("category_text");
const question_text = document.getElementById("question_text");
const choice_buttons = document.getElementsByClassName("question__choice");
// Scoreboard
const leaderboard_div = document.querySelector(".leaderboard");
const leaderboard_text = document.querySelector(".leaderboard__text");
const leaderboard = document.querySelector(".leaderboard__tablebody");

// Make user join the room when join btn clicked
let username;
let room;
join_btn.addEventListener("click", function () {
  // Get info
  named = username_input.value;
  username = named.charAt(0).toUpperCase() + named.slice(1);
  room = room_input.value;
  // Show waiting room
  document.querySelector(".home").classList.add("hidden");
  document.querySelector(".wait").classList.remove("hidden");
  // Make join
  socket.emit("join_room", { username, room });
});

// Display waiting room
socket.on("waiting_step", ({ room, users_in_room }) => {
  // Display info
  roomid_text.innerHTML = room;
  players_text.innerHTML = users_in_room;
  // Show start button if it's the first player
  if (username == users_in_room[0]) {
    leader_div.classList.remove("hidden");
  }
});

// Start game when leader clicks on start btn
startgame_btn.addEventListener("click", function () {
  // Emit socket to start game
  let category_selected = category_select.value;
  socket.emit("start_game", category_selected);
});

// Display question
socket.on(
  "show_question",
  ({ number, difficulty, category, question, all_answers }) => {
    // Enable slide in animation
    leaderboard_div.classList.remove("slide-in-right");
    leaderboard_div.classList.add("slide-out-left");
    question_div.classList.remove("slide-out-left");
    question_div.classList.add("slide-in-right");

    // Show question div
    wait_div.classList.add("hidden");
    leaderboard_div.classList.add("hidden");
    question_div.classList.remove("hidden");

    // Reset answer buttons
    for (let i = 0; i < choice_buttons.length; i++) {
      choice_buttons[i].disabled = false;
      choice_buttons[i].classList.remove("selected");
      choice_buttons[i].classList.remove("incorrect");
      choice_buttons[i].classList.remove("correct");
    }

    // Start timer
    document.getElementById("timer").innerHTML = "";
    var bar = new ProgressBar.Line(timer, {
      strokeWidth: 1,
      easing: "linear",
      duration: 10000,
      color: "#eebbc3",
      trailColor: "#586497",
      trailWidth: 0.5,
      svgStyle: { width: "100%", height: "100%" },
    });
    bar.animate(1.0);

    // Display question
    number_text.innerHTML = number;
    difficulty_text.innerHTML =
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    if (number == 10) {
      difficulty_text.innerHTML = "hidden";
    }
    category_text.innerHTML = (
      category.charAt(0).toUpperCase() + category.slice(1)
    ).replace("Entertainment:", "");
    question_text.innerHTML = question;
    choice_buttons[0].innerHTML = all_answers[0];
    choice_buttons[1].innerHTML = all_answers[1];
    choice_buttons[2].innerHTML = all_answers[2];
    choice_buttons[3].innerHTML = all_answers[3];
  }
);

// Function to send user answer to server
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

// Show results after each question
socket.on("results", ({ correct_answer }) => {
  let choice = document.querySelector(".selected");
  let answers = document.getElementsByClassName("question__choice");
  if (choice != null && choice.id == correct_answer) {
    choice.classList.add("correct");
    correct_sound.play();
  } else if (choice != null) {
    choice.classList.add("incorrect");
    answers[correct_answer].classList.add("correct");
    wrong_sound.play();
  } else {
    answers[correct_answer].classList.add("correct");
    wrong_sound.play();
  }
});

// Show leaderboard after each result
socket.on("leaderboard", ({ number, scores_in_room }) => {
  let message = `Question ${number}`;
  if (number == 10) {
    message = `Last question! Double points`;
  }
  if (number == 11) {
    message = `${scores_in_room[0].name} won with ${scores_in_room[0].score} points.`;
    let leaderboard_sound = new this.Howl({
      src: [`../sounds/leaderboard.wav`],
      volume: 0.25,
    });
    leaderboard_sound.play();
  }

  leaderboard.innerHTML = "";
  leaderboard_text.innerHTML = message;
  for (i = 0; i < scores_in_room.length; i++) {
    const Template = `
    <tr>
      <td >${i + 1}</td>
      <td>${scores_in_room[i].name}</td>
      <td>${scores_in_room[i].score}</td>
    </tr>
    `;
    leaderboard.insertAdjacentHTML("beforeend", Template);
  }

  question_div.classList.remove("slide-in-right");
  question_div.classList.add("slide-out-left");
  leaderboard_div.classList.remove("slide-out-left");
  leaderboard_div.classList.add("slide-in-right");

  leaderboard_div.classList.remove("hidden");
  question_div.classList.add("hidden");
});
