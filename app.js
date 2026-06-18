console.log("app.js loaded");

let currentRoomId = null;
let playerName = null;

function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach((screen) => {
    screen.classList.remove("active");
  });

  document.getElementById(screenId).classList.add("active");
}

function createRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";

  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

document.getElementById("create-room-btn").addEventListener("click", () => {
  currentRoomId = createRoomId();
  showScreen("name-screen");
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  const inputRoomId = document.getElementById("room-id-input").value.trim();

  if (!inputRoomId) {
    alert("部屋コードを入力してください");
    return;
  }

  currentRoomId = inputRoomId;
  showScreen("name-screen");
});

document.getElementById("enter-room-btn").addEventListener("click", () => {
  const nameInput = document.getElementById("player-name-input").value.trim();

  if (!nameInput) {
    alert("名前を入力してください");
    return;
  }

  playerName = nameInput;

  document.getElementById("room-id-display").textContent = currentRoomId;

  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = playerName + "（あなた）";
  playersList.appendChild(li);

  showScreen("lobby-screen");
});

document.getElementById("ready-btn").addEventListener("click", () => {
  alert("準備OKしました");
});

document.getElementById("start-game-btn").addEventListener("click", () => {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  document.getElementById("topic-display").textContent = topic.majority;

  showScreen("topic-screen");
});

document.getElementById("go-drawing-btn").addEventListener("click", () => {
  showScreen("drawing-screen");
});

document.getElementById("finish-drawing-btn").addEventListener("click", () => {
  showScreen("vote-screen");

  const voteList = document.getElementById("vote-list");
  voteList.innerHTML = "";

  const btn = document.createElement("button");
  btn.textContent = playerName;
  btn.addEventListener("click", () => {
    document.getElementById("result-display").innerHTML = `
      <p>まだ仮の結果です。</p>
      <p>Firebase接続後に本物の投票結果を出します。</p>
    `;
    showScreen("result-screen");
  });

  voteList.appendChild(btn);
});

document.getElementById("back-top-btn").addEventListener("click", () => {
  showScreen("top-screen");
});

const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;

function getCanvasPos(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

canvas.addEventListener("pointerdown", (event) => {
  isDrawing = true;

  const pos = getCanvasPos(event);

  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDrawing) return;

  const pos = getCanvasPos(event);

  ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
});

canvas.addEventListener("pointerup", () => {
  isDrawing = false;
});

canvas.addEventListener("pointerleave", () => {
  isDrawing = false;
});

document.getElementById("clear-canvas-btn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});


