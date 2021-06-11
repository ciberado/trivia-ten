const socket = io();

// Get username and room from URL
const urlParams = new URLSearchParams(window.location.search);
const namee = urlParams.get("username");
const username = namee.charAt(0).toUpperCase() + namee.slice(1);
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
const end_div = document.querySelector(".end");
const scoreboard_div = document.querySelector(".end__scoreboard");
const category_select = document.getElementById("category_select");
const startgame_btn = document.getElementById("startgame_btn");
startgame_btn.addEventListener("click", function () {
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
  ({ number, difficulty, category, question, all_answers }) => {
    // Enable slide in animation
    end_div.classList.remove("slide-in-right");
    end_div.classList.add("slide-out-left");
    question_div.classList.remove("slide-out-left");
    question_div.classList.add("slide-in-right");

    // Enable buttons
    for (let i = 0; i < choice_buttons.length; i++) {
      choice_buttons[i].disabled = false;
      choice_buttons[i].classList.remove("selected");
      choice_buttons[i].classList.remove("incorrect");
      choice_buttons[i].classList.remove("correct");
    }

    // Start timer
    document.getElementById("timer").innerHTML = "";
    var bar = new ProgressBar.Line(timer, {
      strokeWidth: 4,
      easing: "linear",
      duration: 10000,
      color: "#61afef",
      trailColor: "#eee",
      trailWidth: 4,
      svgStyle: { width: "100%", height: "100%" },
    });
    bar.animate(1.0);

    // Show text
    wait_div.classList.add("hidden");
    end_div.classList.add("hidden");
    question_div.classList.remove("hidden");

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
    choice0_text.innerHTML = all_answers[0];
    choice1_text.innerHTML = all_answers[1];
    choice2_text.innerHTML = all_answers[2];
    choice3_text.innerHTML = all_answers[3];
  }
);

// Show results
let correct_sound = new this.Howl({
  src: [`../sounds/correct.ogg`],
  volume: 0.25,
});
let wrong_sound = new this.Howl({
  src: [`../sounds/incorrect.wav`],
  volume: 0.25,
});
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

// Show leaderboard after each question
socket.on("leaderboard", ({ number, scores_in_room }) => {
  let message = `Question ${number}`;
  if (number == 10) {
    message = `Last question! Double points`;
  }
  if (number == 11) {
    message = `${scores_in_room[0].name} won with ${scores_in_room[0].score} points. Congrats!`;
    let leaderboard_sound = new this.Howl({
      src: [`../sounds/leaderboard.wav`],
      volume: 0.25,
    });
    leaderboard_sound.play();
  }

  scoreboard_div.innerHTML = "";
  document.querySelector(".end__result").innerHTML = message;
  for (i = 0; i < scores_in_room.length; i++) {
    const Template = `
    <tr>
      <td>${i + 1}</td>
      <td>${scores_in_room[i].name}</td>
      <td>${scores_in_room[i].score}</td>
    </tr>
    `;
    scoreboard_div.insertAdjacentHTML("beforeend", Template);
  }

  question_div.classList.remove("slide-in-right");
  question_div.classList.add("slide-out-left");
  end_div.classList.remove("slide-out-left");
  end_div.classList.add("slide-in-right");

  end_div.classList.remove("hidden");
  question_div.classList.add("hidden");
});

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
