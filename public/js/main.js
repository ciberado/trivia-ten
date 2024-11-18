const QUESTION_TIME_SECONDS = 18;

// Socketio
const socket = io();
let username;
let room;
let category_selected;
let index = 0;

// Load sounds
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
join_btn.addEventListener("click", function () {
  // Get info
  username =
    username_input.value.charAt(0).toUpperCase() +
    username_input.value.slice(1);
  room = room_input.value;

  // Check if inputs are not empty
  if (username == "" || room == "") {
    alert("Please enter username and room id to play");
  } else {
    // Show waiting room
    document.querySelector(".home").classList.add("hidden");
    document.querySelector(".wait").classList.remove("hidden");

    // Make join
    socket.emit("user_joined_room", { username, room });
  }
});

// Display or change waiting room content
socket.on("display_wait", ({ room, users_in_room }) => {
  // Display info
  roomid_text.innerHTML = room;
  players_text.innerHTML = users_in_room.join(", ");

  // Show start button if it's the first player
  if (username == users_in_room[0]) {
    leader_div.classList.remove("hidden");
  }
});

// Start game when leader clicks on start btn
startgame_btn.addEventListener("click", async function () {
  // Emit socket to start game
  socket.emit("ask_start_game", category_select.value);
  /*
  await sleep(800);

  // Loop through all questions
  while (index < 10) {
    // Ask for question
    socket.emit("ask_question", index);
    await sleep(QUESTION_TIME_SECONDS*1000-2*1000);

    // Ask for results
    socket.emit("ask_results", index);
    await sleep(2000);

    // Ask for leaderboard
    socket.emit("ask_leaderboard", index);
    await sleep(3000);

    // Go next
    index++;
  }
    */
});

// Display question
socket.on(
  "display_question", ({ index, difficulty, category, question, all_answers }) => {
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
      duration: QUESTION_TIME_SECONDS * 1000 - 2*1000,
      color: "#eebbc3",
      trailColor: "#586497",
      trailWidth: 0.5,
      svgStyle: { width: "100%", height: "100%" },
    });
    bar.animate(1.0);

    // Display question
    number_text.innerHTML = index + 1;
    difficulty_text.innerHTML =
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    if (index == 10) {
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

// Display results
socket.on("display_results", ({ correct_answer }) => {
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

// Display leaderboard
socket.on("display_leaderboard", ({ index, scores_in_room }) => {
  let message = `Question ${index + 2}`;
  if (index == 8) {
    message = `Last question! Double points`;
  }
  if (index == 9) {
    message = `${scores_in_room[0].user_name} won with ${scores_in_room[0].score} points.`;

    let leaderboard_sound = new this.Howl({
      src: [`../sounds/leaderboard.wav`],
      volume: 0.25,
    });
    leaderboard_sound.play();
    confetti({
      particleCount: 250,
      startVelocity: 30,
      spread: 360,
      count: 200,
      origin: {
        y: 0.4,
      },
    });
  }

  leaderboard.innerHTML = "";
  leaderboard_text.innerHTML = message;
  for (i = 0; i < scores_in_room.length; i++) {
    const Template = `
    <tr>
    <td>${i + 1}</td>
    <td>${scores_in_room[i].user_name}</td>
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

// Send user answer to server when clicking answer
function submit_choice(choice_id) {
  // Show choice
  document.getElementById(choice_id).classList.add("selected");

  // Disable buttons
  for (let i = 0; i < choice_buttons.length; i++) {
    choice_buttons[i].disabled = true;
  }

  // Send choice to server
  socket.emit("user_sent_choice", choice_id);
}

// Delay function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
