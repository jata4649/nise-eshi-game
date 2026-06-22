console.log("app.js loaded");

let currentRoomId = null;
let playerName = null;
let currentTopic = null;

let drawingPhase = 1;
let timerId = null;
let timeLeft = 0;
let maxTime = 0;

let midImageDataUrl = null;
let finalImageDataUrl = null;

const FIRST_DRAW_SECONDS = 20;
const SECOND_DRAW_SECONDS = 25;

const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let canvasCssWidth = 300;
let canvasCssHeight = 300;

let strokes = [];
let currentStroke = null;

// -------------------------
// 画面管理
// -------------------------

function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach((screen) => {
    screen.classList.remove("active");
  });

  const targetScreen = document.getElementById(screenId);
  targetScreen.classList.add("active");

  if (screenId === "drawing-screen") {
    requestAnimationFrame(() => {
      resizeCanvasForMobile();
      redrawCanvas();
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
  li.textContent = "🎨 " + name + "（あなた）";
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
  resetRound();

  currentTopic = pickRandomTopic();

  // 今は仮で多数派のお題だけ表示
  // Firebase接続後は、1人だけ minority を配ります
  document.getElementById("topic-display").textContent = currentTopic.majority;

  showScreen("topic-screen");
});

// -------------------------
// お題確認
// -------------------------

document.getElementById("go-drawing-btn").addEventListener("click", () => {
  startFirstDrawingPhase();
});

// -------------------------
// ラウンド初期化
// -------------------------

function resetRound() {
  drawingPhase = 1;
  midImageDataUrl = null;
  finalImageDataUrl = null;
  strokes = [];
  currentStroke = null;
  stopTimer();

  requestAnimationFrame(() => {
    resizeCanvasForMobile();
    clearCanvasOnly();
  });
}

// -------------------------
// タイマー
// -------------------------

function startTimer(seconds, onEnd) {
  stopTimer();

  maxTime = seconds;
  timeLeft = seconds;

  updateTimerDisplay();

  timerId = setInterval(() => {
    timeLeft -= 1;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      stopTimer();
      onEnd();
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateTimerDisplay() {
  const timerDisplay = document.getElementById("timer-display");
  const timerProgress = document.getElementById("timer-progress");

  timerDisplay.textContent = String(timeLeft);

  const percent = Math.max(0, Math.min(100, (timeLeft / maxTime) * 100));
  timerProgress.style.width = percent + "%";

  if (timeLeft <= 5) {
    timerProgress.style.background = "linear-gradient(90deg, #ff3b3b, #ff9b9b)";
  } else {
    timerProgress.style.background = "linear-gradient(90deg, #ff7f7f, #ffcf5c)";
  }
}

// -------------------------
// お絵描きフェーズ
// -------------------------

function startFirstDrawingPhase() {
  drawingPhase = 1;

  document.getElementById("drawing-phase-label").textContent = "前半お絵描き";
  document.getElementById("drawing-title").textContent = "まずは20秒で描こう";
  document.getElementById("drawing-help").textContent = "途中で一度見せ合います。描きすぎ注意！";
  document.getElementById("finish-drawing-btn").textContent = "前半を完了";

  showScreen("drawing-screen");

  startTimer(FIRST_DRAW_SECONDS, () => {
    finishCurrentDrawingPhase();
  });
}

function startSecondDrawingPhase() {
  drawingPhase = 2;

  document.getElementById("drawing-phase-label").textContent = "後半お絵描き";
  document.getElementById("drawing-title").textContent = "残り25秒で仕上げよう";
  document.getElementById("drawing-help").textContent = "途中討論をふまえて、絵を完成させましょう。";
  document.getElementById("finish-drawing-btn").textContent = "最終絵を完成";

  showScreen("drawing-screen");

  startTimer(SECOND_DRAW_SECONDS, () => {
    finishCurrentDrawingPhase();
  });
}

document.getElementById("finish-drawing-btn").addEventListener("click", () => {
  finishCurrentDrawingPhase();
});

function finishCurrentDrawingPhase() {
  stopTimer();
  stopDrawing();

  if (drawingPhase === 1) {
    midImageDataUrl = getCanvasImage();
    showMidReview();
  } else {
    finalImageDataUrl = getCanvasImage();
    showFinalReview();
  }
}

// -------------------------
// キャンバス処理
// -------------------------

function resizeCanvasForMobile() {
  const rect = canvas.getBoundingClientRect();

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

  if (canvas.setPointerCapture && event.pointerId !== undefined) {
    canvas.setPointerCapture(event.pointerId);
  }

  const pos = getCanvasPos(event);

  currentStroke = {
    color: "#000000",
    width: 4,
    points: [pos]
  };

  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function startDrawing(event) {
  event.preventDefault();

  if (phaseEnding) return;

  // 念のため、前の描画中データが残っていた場合でも消えないようにする
  if (currentStroke && !strokes.includes(currentStroke)) {
    strokes.push(currentStroke);
  }

  isDrawing = false;
  currentStroke = null;

  applyCanvasStyle();

  // ここで既存の線を必ず復元してから新しい線を始める
  // もしスマホ側で見た目だけ白紙になっていても、strokesから復活する
  redrawCanvas();

  isDrawing = true;

  if (canvas.setPointerCapture && event.pointerId !== undefined) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // 何もしない
    }
  }

  const pos = getCanvasPos(event);

  currentStroke = {
    color: "#000000",
    width: 10,
    points: [pos]
  };

  // 重要：
  // 線を書き始めた瞬間に strokes に入れる
  // これで pointerup がうまく発火しなくても線が消えにくくなる
  strokes.push(currentStroke);

  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}


function stopDrawing(event) {
  if (event) {
    event.preventDefault();

    if (canvas.releasePointerCapture && event.pointerId !== undefined) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // 何もしない
      }
    }
  }

  // currentStroke はすでに startDrawing の時点で strokes に入れている
  // ここで再度 push すると重複するので push しない
  isDrawing = false;
  currentStroke = null;

  // 点だけタップした場合も表示されるように再描画
  redrawCanvas();
}


function redrawCanvas() {
  clearCanvasOnly();

  strokes.forEach((stroke) => {
    drawStroke(stroke);
  });
}


function drawStroke(stroke) {
  if (!stroke.points || stroke.points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function clearCanvasOnly() {
  ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
}

function clearCanvasAll() {
  strokes = [];
  currentStroke = null;
  clearCanvasOnly();
}

function undoStroke() {
  strokes.pop();
  redrawCanvas();
}

function getCanvasImage() {
  resizeCanvasForMobile();
  redrawCanvas();
  return canvas.toDataURL("image/png");
}

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);
canvas.addEventListener("lostpointercapture", stopDrawing);

document.getElementById("clear-canvas-btn").addEventListener("click", () => {
  clearCanvasAll();
});

document.getElementById("undo-btn").addEventListener("click", () => {
  undoStroke();
});

window.addEventListener("resize", () => {
  if (document.getElementById("drawing-screen").classList.contains("active")) {
    resizeCanvasForMobile();
    redrawCanvas();
  }
});

// -------------------------
// 途中公開・最終公開
// -------------------------

function showMidReview() {
  document.getElementById("review-phase-label").textContent = "途中公開";
  document.getElementById("review-title").textContent = "途中経過を見せ合おう";
  document.getElementById("review-description").textContent =
    "ここで軽く討論します。誰が怪しいか探りましょう。";

  document.getElementById("gallery-player-name").textContent =
    (playerName || "あなた") + " の途中絵";

  document.getElementById("review-image").src = midImageDataUrl;

  document.getElementById("discussion-text").innerHTML =
    "軽く話し合いましょう。<br>ただし、お題を直接言うのは禁止！";

  const nextBtn = document.getElementById("review-next-btn");
  nextBtn.textContent = "後半25秒を始める";

  nextBtn.onclick = () => {
    startSecondDrawingPhase();
  };

  showScreen("review-screen");
}

function showFinalReview() {
  document.getElementById("review-phase-label").textContent = "最終公開";
  document.getElementById("review-title").textContent = "完成した絵を見せ合おう";
  document.getElementById("review-description").textContent =
    "最終討論です。ニセ絵師だと思う人を決めましょう。";

  document.getElementById("gallery-player-name").textContent =
    (playerName || "あなた") + " の完成絵";

  document.getElementById("review-image").src = finalImageDataUrl;

  document.getElementById("discussion-text").innerHTML =
    "最終討論タイム！<br>絵の違和感や発言からニセ絵師を探しましょう。";

  const nextBtn = document.getElementById("review-next-btn");
  nextBtn.textContent = "投票へ進む";

  nextBtn.onclick = () => {
    showVoteScreen();
  };

  showScreen("review-screen");
}

// -------------------------
// 投票
// -------------------------

function showVoteScreen() {
  showScreen("vote-screen");

  const voteList = document.getElementById("vote-list");
  voteList.innerHTML = "";

  const btn = document.createElement("button");
  btn.className = "primary-btn";
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
    <div class="result-big">仮の結果です</div>
    <p>Firebase接続後に、実際の投票結果とニセ絵師を表示します。</p>
    <hr>
    <p><strong>多数派のお題：</strong>${majorityWord}</p>
    <p><strong>ニセ絵師のお題：</strong>${minorityWord}</p>
    <p class="note">今後はここに得票数・勝敗・正体を表示します。</p>
  `;

  showScreen("result-screen");
}

document.getElementById("back-top-btn").addEventListener("click", () => {
  currentRoomId = null;
  playerName = null;
  currentTopic = null;
  drawingPhase = 1;
  midImageDataUrl = null;
  finalImageDataUrl = null;

  stopTimer();

  document.getElementById("room-id-input").value = "";
  document.getElementById("player-name-input").value = "";
  document.getElementById("players-list").innerHTML = "";
  document.getElementById("result-display").innerHTML = "";

  clearCanvasAll();

  showScreen("top-screen");
});
