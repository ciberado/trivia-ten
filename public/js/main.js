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
const endGameBtn = document.getElementById("endgame_btn");

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

const hostProgressionHead = document.getElementById("host_progression_head");
const hostProgressionBody = document.getElementById("host_progression_body");

const PROGRESSION_PENDING_SYMBOL = "–";
const PROGRESSION_CORRECT_SYMBOL = "✓";
const PROGRESSION_INCORRECT_SYMBOL = "✗";

// Sounds
const logClientEvent = (label, detail = {}) => {
  const timestamp = new Date().toISOString();
  console.info(`[client] ${label}`, { timestamp, ...detail });
};

const silentSound = { play() {} };
const loadSound = (path) => {
  if (typeof window !== "undefined" && window.Howl) {
    return new window.Howl({ src: [path], volume: 0.25 });
  }
  return silentSound;
};

const correctSound = loadSound("../sounds/correct.ogg");
const wrongSound = loadSound("../sounds/incorrect.wav");

let quizInProgress = false;
let latestHostPlayers = [];
let progressionState = createEmptyProgressionState();

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.closest("#create_room_cta")) {
    event.preventDefault();
    logClientEvent("CTA clicked: create_room_cta");
    showCreateScreen();
    return;
  }

  if (target.closest("#join_room_cta")) {
    event.preventDefault();
    logClientEvent("CTA clicked: join_room_cta");
    showJoinScreen();
    return;
  }

  if (target.closest("#create_back_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: create_back_btn");
    resetHostForm();
    showLanding();
    return;
  }

  if (target.closest("#join_back_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: join_back_btn");
    resetPlayerForm();
    showLanding();
    return;
  }

  if (target.closest("#create_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: create_btn");
    handleCreateRoom();
    return;
  }

  if (target.closest("#join_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: join_btn");
    handleJoinRoom();
    return;
  }

  if (target.closest("#endgame_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: endgame_btn");
    handleEndGame();
    return;
  }

  if (target.closest("#host_back_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: host_back_btn");
    handleHostBack();
    return;
  }

  if (target.closest("#startgame_btn")) {
    event.preventDefault();
    logClientEvent("CTA clicked: startgame_btn");
    handleStartGame();
    return;
  }
});

socket.on("room_created", ({ room: roomName }) => {
  if (!pendingHost) {
    logClientEvent("room_created ignored: no pending host", { roomName });
    return;
  }

  role = "host";
  username = pendingHost.username;
  room = roomName;
  pendingHost = null;
  logClientEvent("room_created handled", {
    role,
    username,
    room,
  });

  hostForm.classList.add("hidden");
  hostPanel.classList.remove("hidden");
  hostRoomIdText.textContent = roomName;
  hostPlayersText.textContent = "Waiting for players…";
  clearProgressionTable();
  highlightProgressionColumn(-1);
});

socket.on("room_joined", ({ room: roomName }) => {
  if (!pendingPlayer) {
    logClientEvent("room_joined ignored: no pending player", { roomName });
    return;
  }

  role = "player";
  username = pendingPlayer.username;
  room = roomName;
  pendingPlayer = null;
  logClientEvent("room_joined handled", {
    role,
    username,
    room,
  });

  joinDiv.classList.add("hidden");
  waitDiv.classList.remove("hidden");
});

socket.on("display_wait", ({ room: roomName, users_in_room }) => {
  if (role !== "player" || room !== roomName) {
    logClientEvent("display_wait skipped", { role, room, roomName });
    return;
  }

  logClientEvent("display_wait handled", {
    room: roomName,
    users_in_room,
  });

  roomIdText.textContent = roomName;
  playersText.textContent = users_in_room.length
    ? users_in_room.join(", ")
    : "Waiting for players…";
});

socket.on("scoreboard_update", ({ room: roomName, players, scores }) => {
  if (role !== "host" || room !== roomName) {
    logClientEvent("scoreboard_update skipped", { role, room, roomName });
    return;
  }

  logClientEvent("scoreboard_update handled", {
    room: roomName,
    players,
    scores,
  });

  hostRoomIdText.textContent = roomName;
  hostPlayersText.textContent = players.length
    ? players.join(", ")
    : "Waiting for players…";
  hostLeaderboardBody.innerHTML = "";

  latestHostPlayers = players;
  syncHostControls();

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
      logClientEvent("display_question skipped", { role, index });
      return;
    }

    logClientEvent("display_question handled", {
      index,
      difficulty,
      category,
    });

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
    logClientEvent("display_results skipped", { role, correct_answer });
    return;
  }

  logClientEvent("display_results handled", { correct_answer });

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

function renderLeaderboardView({ index, scores_in_room, final, message }) {
  if (role !== "player") {
    logClientEvent("display_leaderboard skipped", { role, index });
    return;
  }

  logClientEvent("display_leaderboard handled", {
    index,
    scores: scores_in_room,
    final,
  });

  const isFinal = Boolean(final);
  let messageText = message ?? `Question ${index + 2}`;

  if (!isFinal) {
    if (index === 8) {
      messageText = "Last question! Double points";
    }
    if (index === 9 && scores_in_room.length > 0) {
      messageText = `${scores_in_room[0].user_name} won with ${scores_in_room[0].score} points.`;
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
  }

  leaderboardBody.innerHTML = "";
  leaderboardText.textContent = messageText;

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
}

socket.on("display_leaderboard", renderLeaderboardView);

socket.on("room_error", ({ message }) => {
  logClientEvent("room_error received", { message });
  alert(message);
  pendingHost = null;
  pendingPlayer = null;
});

function submit_choice(choice_id) {
  if (role !== "player") {
    logClientEvent("submit_choice blocked: not player", { role, choice_id });
    return;
  }

  const button = document.getElementById(choice_id);
  if (!button || button.disabled) {
    logClientEvent("submit_choice blocked: invalid button", {
      choice_id,
      buttonExists: Boolean(button),
      disabled: button?.disabled ?? null,
    });
    return;
  }

  button.classList.add("selected");
  disableAnswerButtons();
  logClientEvent("Emit: user_sent_choice", { choice_id });
  socket.emit("user_sent_choice", choice_id);
}

function resetAnswerButtons() {
  logClientEvent("UI helper: resetAnswerButtons");
  for (let i = 0; i < choiceButtons.length; i += 1) {
    choiceButtons[i].disabled = false;
    choiceButtons[i].classList.remove("selected", "incorrect", "correct");
  }
}

function disableAnswerButtons() {
  logClientEvent("UI helper: disableAnswerButtons");
  for (let i = 0; i < choiceButtons.length; i += 1) {
    choiceButtons[i].disabled = true;
  }
}

function showLanding() {
  logClientEvent("UI transition: landing");
  landingDiv.classList.remove("hidden");
  createDiv.classList.add("hidden");
  joinDiv.classList.add("hidden");
  waitDiv.classList.add("hidden");
}

function showCreateScreen() {
  logClientEvent("UI transition: create");
  landingDiv.classList.add("hidden");
  waitDiv.classList.add("hidden");
  joinDiv.classList.add("hidden");
  createDiv.classList.remove("hidden");
  hostForm.classList.remove("hidden");
  latestHostPlayers = [];
  quizInProgress = false;
  clearProgressionTable();
  syncHostControls();
  hostPanel.classList.add("hidden");
  hostNameInput.focus();
}

function showJoinScreen() {
  logClientEvent("UI transition: join");
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
    logClientEvent("Validation: create_room missing fields", {
      desiredName,
      desiredRoom,
    });
    alert("Provide both your host name and a room id.");
    return;
  }

  pendingHost = { username: desiredName, room: desiredRoom };
  logClientEvent("Emit: create_room", pendingHost);
  socket.emit("create_room", pendingHost);
}

function handleJoinRoom() {
  const desiredName = capitalise(joinNameInput?.value.trim() ?? "");
  const desiredRoom = joinRoomInput?.value.trim() ?? "";

  if (!desiredName || !desiredRoom) {
    logClientEvent("Validation: join_room missing fields", {
      desiredName,
      desiredRoom,
    });
    alert("Please enter a username and room id to join.");
    return;
  }

  pendingPlayer = { username: desiredName, room: desiredRoom };
  logClientEvent("Emit: join_room", pendingPlayer);
  socket.emit("join_room", pendingPlayer);
}

function handleStartGame() {
  if (role !== "host") {
    logClientEvent("Blocked: ask_start_game (not host)", { role });
    return;
  }

  if (quizInProgress) {
    logClientEvent("Blocked: ask_start_game while running", {});
    return;
  }

  if (latestHostPlayers.length === 0) {
    alert("Please wait for at least one player before starting the quiz.");
    return;
  }

  const selectedCategory = categorySelect?.value ?? "";
  logClientEvent("Emit: ask_start_game", { category: selectedCategory });
  socket.emit("ask_start_game", selectedCategory);
}

function handleEndGame() {
  if (role !== "host") {
    logClientEvent("Blocked: ask_end_game (not host)", { role });
    return;
  }

  if (!quizInProgress) {
    logClientEvent("Blocked: ask_end_game while idle", {});
    return;
  }

  logClientEvent("Emit: ask_end_game");
  socket.emit("ask_end_game");
}

function handleHostBack() {
  if (role !== "host") {
    return;
  }

  if (quizInProgress) {
    const confirmEnd = window.confirm(
      "The quiz is currently running. Do you want to end it and return?"
    );
    if (!confirmEnd) {
      return;
    }
    handleEndGame();
  }

  resetHostForm();
  showLanding();
}

function syncHostControls() {
  if (role !== "host") {
    return;
  }

  if (!startGameBtn || !endGameBtn) {
    return;
  }

  const hasPlayers = latestHostPlayers.length > 0;

  if (quizInProgress) {
    startGameBtn.classList.add("hidden");
    endGameBtn.classList.remove("hidden");
  } else {
    endGameBtn.classList.add("hidden");
    if (hasPlayers) {
      startGameBtn.classList.remove("hidden");
    } else {
      startGameBtn.classList.add("hidden");
    }
  }
}

function createEmptyProgressionState() {
  return {
    players: [],
    questionCount: 0,
    headerCells: [],
    cellMap: new Map(),
  };
}

function clearProgressionTable() {
  if (hostProgressionHead) {
    hostProgressionHead.innerHTML = "";
  }
  if (hostProgressionBody) {
    hostProgressionBody.innerHTML = "";
  }
  progressionState = createEmptyProgressionState();
}

function resetProgressionTable(players, questionCount) {
  clearProgressionTable();

  if (!hostProgressionHead || !hostProgressionBody) {
    return;
  }

  const effectivePlayers = Array.isArray(players) ? players : [];
  const effectiveQuestionCount = Number.isFinite(questionCount)
    ? Math.max(0, questionCount)
    : 0;

  if (effectivePlayers.length === 0 || effectiveQuestionCount === 0) {
    return;
  }

  const headRow = document.createElement("tr");
  const playerHeader = document.createElement("th");
  playerHeader.textContent = "Player";
  playerHeader.scope = "col";
  headRow.appendChild(playerHeader);

  const headerCells = [];
  for (let i = 0; i < effectiveQuestionCount; i += 1) {
    const th = document.createElement("th");
    th.textContent = `Q${i + 1}`;
    th.dataset.index = String(i);
    headRow.appendChild(th);
    headerCells.push(th);
  }

  hostProgressionHead.appendChild(headRow);

  progressionState.players = [...effectivePlayers];
  progressionState.questionCount = effectiveQuestionCount;
  progressionState.headerCells = headerCells;
  progressionState.cellMap = new Map();

  effectivePlayers.forEach((player) => {
    appendProgressionRow(player);
  });
}

function appendProgressionRow(player, explicitQuestionCount) {
  if (!hostProgressionBody) {
    return [];
  }

  if (progressionState.cellMap.has(player)) {
    return progressionState.cellMap.get(player) ?? [];
  }

  const questionCount =
    explicitQuestionCount ??
    (progressionState.questionCount ? progressionState.questionCount : 10);

  const row = document.createElement("tr");
  const nameCell = document.createElement("th");
  nameCell.scope = "row";
  nameCell.textContent = player;
  row.appendChild(nameCell);

  const cells = [];
  for (let i = 0; i < questionCount; i += 1) {
    const td = document.createElement("td");
    td.classList.add("progression__cell--pending");
    td.textContent = PROGRESSION_PENDING_SYMBOL;
    row.appendChild(td);
    cells.push(td);
  }

  hostProgressionBody.appendChild(row);
  progressionState.cellMap.set(player, cells);
  return cells;
}

function highlightProgressionColumn(index) {
  progressionState.headerCells.forEach((cell, cellIndex) => {
    cell.classList.toggle("progression__header--active", cellIndex === index);
  });
}

function updateProgressionCell(player, questionIndex, correct) {
  if (typeof questionIndex !== "number" || questionIndex < 0) {
    return;
  }

  const targetCells = appendProgressionRow(player);
  const cell = targetCells[questionIndex];
  if (!cell) {
    return;
  }

  cell.classList.remove(
    "progression__cell--pending",
    "progression__cell--correct",
    "progression__cell--incorrect"
  );

  if (correct) {
    cell.classList.add("progression__cell--correct");
    cell.textContent = PROGRESSION_CORRECT_SYMBOL;
  } else {
    cell.classList.add("progression__cell--incorrect");
    cell.textContent = PROGRESSION_INCORRECT_SYMBOL;
  }
}

socket.on("quiz_started", ({ players = [], questionCount = 10 } = {}) => {
  logClientEvent("quiz_started received", { players, questionCount });
  if (role === "host") {
    quizInProgress = true;
    resetProgressionTable(players, questionCount);
    highlightProgressionColumn(-1);
    syncHostControls();
  }
});

socket.on("quiz_finished", ({ reason }) => {
  logClientEvent("quiz_finished received", { reason });
  quizInProgress = false;
  if (role === "host") {
    syncHostControls();
    highlightProgressionColumn(-1);
  }
});

socket.on("progression_highlight", ({ index }) => {
  logClientEvent("progression_highlight received", { index });
  if (role === "host") {
    highlightProgressionColumn(index);
  }
});

socket.on("progression_update", ({ questionIndex, userName, correct }) => {
  logClientEvent("progression_update received", {
    questionIndex,
    userName,
    correct,
  });
  if (role === "host") {
    updateProgressionCell(userName, questionIndex, correct);
  }
});

function resetHostForm() {
  pendingHost = null;
  hostForm.classList.remove("hidden");
  hostPanel.classList.add("hidden");
  hostNameInput.value = "";
  hostRoomInput.value = "";
  hostLeaderboardBody.innerHTML = "";
  hostPlayersText.textContent = "";
  logClientEvent("State reset: host form cleared");
  latestHostPlayers = [];
  quizInProgress = false;
  clearProgressionTable();
  syncHostControls();
}

function resetPlayerForm() {
  pendingPlayer = null;
  joinNameInput.value = "";
  joinRoomInput.value = "";
  logClientEvent("State reset: player form cleared");
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
