console.log("app.js loaded");

let currentRoomId = null;
let playerName = null;
let currentTopic = null;

const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let canvasCssWidth = 300;
let canvasCssHeight = 300;

function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach((screen) => {
    screen.classList.remove("active");
  });

  const targetScreen = document.getElementById(screenId);
  targetScreen.classList.add("active");

  // お絵描き画面を表示した後にキャンバスサイズを調整
  if (screenId === "drawing-screen") {
    requestAnimationFrame(() => {
      resizeCanvasForMobile();
    });
  }

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}

function createRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";

  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

function pickRandomTopic() {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

function addPlayerToLobby(name) {
  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";

  const li = document.createElement("li");
  li.textContent = name + "（あなた）";
  playersList.appendChild(li);
}

// -------------------------
// トップ・部屋作成・参加
// -------------------------

document.getElementById("create-room-btn").addEventListener("click", () => {
  currentRoomId = createRoomId();
  showScreen("name-screen");
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  const inputRoomId = document.getElementById("room-id-input").value.trim().toUpperCase();

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
  addPlayerToLobby(playerName);

  showScreen("lobby-screen");
});

// -------------------------
// ロビー
// -------------------------

document.getElementById("ready-btn").addEventListener("click", () => {
  alert("準備OKしました。Firebase接続後は他の人にも同期されます。");
});

document.getElementById("start-game-btn").addEventListener("click", () => {
  currentTopic = pickRandomTopic();

  // 今は仮で多数派のお題だけ表示
  // Firebase接続後は、1人だけ minority を配るようにする
  document.getElementById("topic-display").textContent = currentTopic.majority;

  showScreen("topic-screen");
});

// -------------------------
// お題確認
// -------------------------

document.getElementById("go-drawing-btn").addEventListener("click", () => {
  showScreen("drawing-screen");
});

// -------------------------
// お絵描き
// -------------------------

function resizeCanvasForMobile() {
  const rect = canvas.getBoundingClientRect();

  // display:none の状態だと rect が 0 になるため、その場合は何もしない
  if (rect.width === 0 || rect.height === 0) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;

  canvasCssWidth = rect.width;
  canvasCssHeight = rect.height;

  canvas.width = canvasCssWidth * dpr;
  canvas.height = canvasCssHeight * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
}

function getCanvasPos(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function startDrawing(event) {
  event.preventDefault();

  resizeCanvasForMobile();

  isDrawing = true;

  if (canvas.setPointerCapture) {
    canvas.setPointerCapture(event.pointerId);
  }

  const pos = getCanvasPos(event);

  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function draw(event) {
  event.preventDefault();

  if (!isDrawing) return;

  const pos = getCanvasPos(event);

  ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function stopDrawing(event) {
  if (event) {
    event.preventDefault();

    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // 何もしない
      }
    }
  }

  isDrawing = false;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
}

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);

document.getElementById("clear-canvas-btn").addEventListener("click", () => {
  clearCanvas();
});

document.getElementById("finish-drawing-btn").addEventListener("click", () => {
  showVoteScreen();
});

// 画面回転・サイズ変更時
// 注意：今の仮実装ではリサイズすると絵が消えます。
// Firebase接続後はストロークデータから再描画するので改善できます。
window.addEventListener("resize", () => {
  if (document.getElementById("drawing-screen").classList.contains("active")) {
    resizeCanvasForMobile();
  }
});

// -------------------------
// 投票
// -------------------------

function showVoteScreen() {
  showScreen("vote-screen");

  const voteList = document.getElementById("vote-list");
  voteList.innerHTML = "";

  const btn = document.createElement("button");
  btn.textContent = playerName || "あなた";

  btn.addEventListener("click", () => {
    showResultScreen();
  });

  voteList.appendChild(btn);
}

// -------------------------
// 結果
// -------------------------

function showResultScreen() {
  const majorityWord = currentTopic ? currentTopic.majority : "猫";
  const minorityWord = currentTopic ? currentTopic.minority : "虎";

  document.getElementById("result-display").innerHTML = `
    <p>これは仮の結果画面です。</p>
    <p>Firebase接続後に、実際の投票結果を表示します。</p>
    <hr>
    <p><strong>多数派のお題：</strong>${majorityWord}</p>
    <p><strong>ニセ絵師のお題：</strong>${minorityWord}</p>
  `;

  showScreen("result-screen");
}

document.getElementById("back-top-btn").addEventListener("click", () => {
  currentRoomId = null;
  playerName = null;
  currentTopic = null;

  document.getElementById("room-id-input").value = "";
  document.getElementById("player-name-input").value = "";
  document.getElementById("players-list").innerHTML = "";
  document.getElementById("result-display").innerHTML = "";

  clearCanvas();

  showScreen("top-screen");
});
