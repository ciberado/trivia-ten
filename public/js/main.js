const QUESTION_TIME_SECONDS = 18;

const socket = io();
let role = null;
let username = "";
let room = "";
let pendingHost = null;
let pendingPlayer = null;

let progressBarInstance = null;

// Landing navigation
const landingDiv = document.querySelector(".landing");
const createDiv = document.querySelector(".create");
const joinDiv = document.querySelector(".join");

const createCta = document.getElementById("create_room_cta");
const joinCta = document.getElementById("join_room_cta");
const createBackBtn = document.getElementById("create_back_btn");
const joinBackBtn = document.getElementById("join_back_btn");

// Host controls
const hostForm = document.getElementById("create_form");
const hostPanel = document.getElementById("host_panel");
const hostNameInput = document.getElementById("host_username_input");
const hostRoomInput = document.getElementById("host_room_input");
const createBtn = document.getElementById("create_btn");
const hostRoomIdText = document.getElementById("host_roomid_text");
const hostPlayersText = document.getElementById("host_players_text");
const hostLeaderboardBody = document.getElementById(
  "host_leaderboard_tablebody"
);
const categorySelect = document.getElementById("category_select");
const startGameBtn = document.getElementById("startgame_btn");

// Player join form
const joinNameInput = document.getElementById("join_username_input");
const joinRoomInput = document.getElementById("join_room_input");
const joinBtn = document.getElementById("join_btn");

// Player waiting view
const waitDiv = document.querySelector(".wait");
const roomIdText = document.getElementById("roomid_text");
const playersText = document.getElementById("players_text");

// Question & leaderboard view
const questionDiv = document.querySelector(".question");
const timerWrapper = document.getElementById("timer");
const numberText = document.getElementById("number_text");
const difficultyText = document.getElementById("difficulty_text");
const categoryText = document.getElementById("category_text");
const questionText = document.getElementById("question_text");
const choiceButtons = document.getElementsByClassName("question__choice");

const leaderboardDiv = document.querySelector(".leaderboard");
const leaderboardText = document.querySelector(".leaderboard__text");
const leaderboardBody = document.querySelector(".leaderboard__tablebody");

// Sounds
const silentSound = { play() {} };
const loadSound = (path) => {
  if (typeof window !== "undefined" && window.Howl) {
    return new window.Howl({ src: [path], volume: 0.25 });
  }
  return silentSound;
};

const correctSound = loadSound("../sounds/correct.ogg");
const wrongSound = loadSound("../sounds/incorrect.wav");

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.closest("#create_room_cta")) {
    event.preventDefault();
    showCreateScreen();
    return;
  }

  if (target.closest("#join_room_cta")) {
    event.preventDefault();
    showJoinScreen();
    return;
  }

  if (target.closest("#create_back_btn")) {
    event.preventDefault();
    resetHostForm();
    showLanding();
    return;
  }

  if (target.closest("#join_back_btn")) {
    event.preventDefault();
    resetPlayerForm();
    showLanding();
    return;
  }

  if (target.closest("#create_btn")) {
    event.preventDefault();
    handleCreateRoom();
    return;
  }

  if (target.closest("#join_btn")) {
    event.preventDefault();
    handleJoinRoom();
    return;
  }

  if (target.closest("#startgame_btn")) {
    event.preventDefault();
    handleStartGame();
  }
});

socket.on("room_created", ({ room: roomName }) => {
  if (!pendingHost) {
    return;
  }

  role = "host";
  username = pendingHost.username;
  room = roomName;
  pendingHost = null;

  hostForm.classList.add("hidden");
  hostPanel.classList.remove("hidden");
  hostRoomIdText.textContent = roomName;
  hostPlayersText.textContent = "Waiting for players…";
});

socket.on("room_joined", ({ room: roomName }) => {
  if (!pendingPlayer) {
    return;
  }

  role = "player";
  username = pendingPlayer.username;
  room = roomName;
  pendingPlayer = null;

  joinDiv.classList.add("hidden");
  waitDiv.classList.remove("hidden");
});

socket.on("display_wait", ({ room: roomName, users_in_room }) => {
  if (role !== "player" || room !== roomName) {
    return;
  }

  roomIdText.textContent = roomName;
  playersText.textContent = users_in_room.length
    ? users_in_room.join(", ")
    : "Waiting for players…";
});

socket.on("scoreboard_update", ({ room: roomName, players, scores }) => {
  if (role !== "host" || room !== roomName) {
    return;
  }

  hostRoomIdText.textContent = roomName;
  hostPlayersText.textContent = players.length
    ? players.join(", ")
    : "Waiting for players…";
  hostLeaderboardBody.innerHTML = "";

  scores.forEach((entry, index) => {
    const template = `
      <tr>
        <td>${index + 1}</td>
        <td>${entry.user_name}</td>
        <td>${entry.score}</td>
      </tr>
    `;
    hostLeaderboardBody.insertAdjacentHTML("beforeend", template);
  });
});

socket.on(
  "display_question",
  ({ index, difficulty, category, question, all_answers }) => {
    if (role !== "player") {
      return;
    }

    leaderboardDiv.classList.remove("slide-in-right");
    leaderboardDiv.classList.add("slide-out-left");
    questionDiv.classList.remove("slide-out-left");
    questionDiv.classList.add("slide-in-right");

    waitDiv.classList.add("hidden");
    leaderboardDiv.classList.add("hidden");
    questionDiv.classList.remove("hidden");

    resetAnswerButtons();

    if (progressBarInstance) {
      progressBarInstance.destroy();
    }

    if (typeof window !== "undefined" && window.ProgressBar) {
      timerWrapper.innerHTML = "";
      progressBarInstance = new window.ProgressBar.Line(timerWrapper, {
        strokeWidth: 1,
        easing: "linear",
        duration: QUESTION_TIME_SECONDS * 1000 - 2000,
        color: "#eebbc3",
        trailColor: "#586497",
        trailWidth: 0.5,
        svgStyle: { width: "100%", height: "100%" },
      });
      progressBarInstance.animate(1);
    }

    numberText.textContent = index + 1;
    difficultyText.textContent =
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    categoryText.textContent = (
      category.charAt(0).toUpperCase() + category.slice(1)
    ).replace("Entertainment:", "");
    questionText.innerHTML = question;

    for (let i = 0; i < choiceButtons.length; i += 1) {
      choiceButtons[i].innerHTML = all_answers[i];
    }
  }
);

socket.on("display_results", ({ correct_answer }) => {
  if (role !== "player") {
    return;
  }

  const selectedChoice = document.querySelector(".selected");
  const answers = document.getElementsByClassName("question__choice");

  if (selectedChoice && Number(selectedChoice.id) === correct_answer) {
    selectedChoice.classList.add("correct");
    correctSound.play();
  } else if (selectedChoice) {
    selectedChoice.classList.add("incorrect");
    answers[correct_answer].classList.add("correct");
    wrongSound.play();
  } else {
    answers[correct_answer].classList.add("correct");
    wrongSound.play();
  }
});

socket.on("display_leaderboard", ({ index, scores_in_room }) => {
  if (role !== "player") {
    return;
  }

  let message = `Question ${index + 2}`;
  if (index === 8) {
    message = "Last question! Double points";
  }
  if (index === 9 && scores_in_room.length > 0) {
    message = `${scores_in_room[0].user_name} won with ${scores_in_room[0].score} points.`;
    const leaderboardSound = loadSound("../sounds/leaderboard.wav");
    leaderboardSound.play();
    if (typeof window !== "undefined" && window.confetti) {
      window.confetti({
        particleCount: 250,
        startVelocity: 30,
        spread: 360,
        count: 200,
        origin: { y: 0.4 },
      });
    }
  }

  leaderboardBody.innerHTML = "";
  leaderboardText.textContent = message;

  scores_in_room.forEach((entry, position) => {
    const template = `
      <tr>
        <td>${position + 1}</td>
        <td>${entry.user_name}</td>
        <td>${entry.score}</td>
      </tr>
    `;
    leaderboardBody.insertAdjacentHTML("beforeend", template);
  });

  questionDiv.classList.remove("slide-in-right");
  questionDiv.classList.add("slide-out-left");
  leaderboardDiv.classList.remove("slide-out-left");
  leaderboardDiv.classList.add("slide-in-right");

  leaderboardDiv.classList.remove("hidden");
  questionDiv.classList.add("hidden");
});

socket.on("room_error", ({ message }) => {
  alert(message);
  pendingHost = null;
  pendingPlayer = null;
});

function submit_choice(choice_id) {
  if (role !== "player") {
    return;
  }

  const button = document.getElementById(choice_id);
  if (!button || button.disabled) {
    return;
  }

  button.classList.add("selected");
  disableAnswerButtons();
  socket.emit("user_sent_choice", choice_id);
}

function resetAnswerButtons() {
  for (let i = 0; i < choiceButtons.length; i += 1) {
    choiceButtons[i].disabled = false;
    choiceButtons[i].classList.remove("selected", "incorrect", "correct");
  }
}

function disableAnswerButtons() {
  for (let i = 0; i < choiceButtons.length; i += 1) {
    choiceButtons[i].disabled = true;
  }
}

function showLanding() {
  landingDiv.classList.remove("hidden");
  createDiv.classList.add("hidden");
  joinDiv.classList.add("hidden");
  waitDiv.classList.add("hidden");
}

function showCreateScreen() {
  landingDiv.classList.add("hidden");
  joinDiv.classList.add("hidden");
  waitDiv.classList.add("hidden");
  createDiv.classList.remove("hidden");
  hostForm.classList.remove("hidden");
  hostPanel.classList.add("hidden");
  hostNameInput.focus();
}

function showJoinScreen() {
  landingDiv.classList.add("hidden");
  createDiv.classList.add("hidden");
  waitDiv.classList.add("hidden");
  joinDiv.classList.remove("hidden");
  joinNameInput.focus();
}

function handleCreateRoom() {
  const desiredName = capitalise(hostNameInput?.value.trim() ?? "");
  const desiredRoom = hostRoomInput?.value.trim() ?? "";

  if (!desiredName || !desiredRoom) {
    alert("Provide both your host name and a room id.");
    return;
  }

  pendingHost = { username: desiredName, room: desiredRoom };
  socket.emit("create_room", pendingHost);
}

function handleJoinRoom() {
  const desiredName = capitalise(joinNameInput?.value.trim() ?? "");
  const desiredRoom = joinRoomInput?.value.trim() ?? "";

  if (!desiredName || !desiredRoom) {
    alert("Please enter a username and room id to join.");
    return;
  }

  pendingPlayer = { username: desiredName, room: desiredRoom };
  socket.emit("join_room", pendingPlayer);
}

function handleStartGame() {
  if (role !== "host") {
    return;
  }

  const selectedCategory = categorySelect?.value ?? "";
  socket.emit("ask_start_game", selectedCategory);
}

function resetHostForm() {
  pendingHost = null;
  hostForm.classList.remove("hidden");
  hostPanel.classList.add("hidden");
  hostNameInput.value = "";
  hostRoomInput.value = "";
  hostLeaderboardBody.innerHTML = "";
  hostPlayersText.textContent = "";
}

function resetPlayerForm() {
  pendingPlayer = null;
  joinNameInput.value = "";
  joinRoomInput.value = "";
}

function capitalise(value) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

if (typeof window !== "undefined") {
  window.submit_choice = submit_choice;
}
