console.log("app.js loaded");

// -------------------------
// 基本状態
// -------------------------

let currentRoomId = null;
let playerName = null;
let currentTopic = null;

let drawingPhase = 1;

let timerAnimationId = null;
let phaseStartTime = 0;
let phaseDurationMs = 0;
let phaseEnding = false;

let midImageDataUrl = null;
let finalImageDataUrl = null;

const FIRST_DRAW_SECONDS = 20;
const SECOND_DRAW_SECONDS = 25;

// キャンバスの内部座標。
// スマホの見た目サイズとは別に、1000 x 1000 の世界として扱う。
const LOGICAL_CANVAS_SIZE = 1000;

const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let strokes = [];
let currentStroke = null;

// -------------------------
// キャンバス初期化
// -------------------------

function initCanvasOnce() {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = LOGICAL_CANVAS_SIZE * dpr;
  canvas.height = LOGICAL_CANVAS_SIZE * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  applyCanvasStyle();
  clearCanvasOnly();
}

function applyCanvasStyle() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 10;
}

// 最初に1回だけ初期化。
// ここ以外では canvas.width / canvas.height を変更しない。
// これが「タップすると消える」問題の対策。
initCanvasOnce();

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

  // 今は仮で多数派のお題だけ表示。
  // Firebase接続後は、1人だけ minority を配ります。
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

  isDrawing = false;
  strokes = [];
  currentStroke = null;

  phaseEnding = false;
  stopCountdown();

  clearCanvasOnly();
}

// -------------------------
// ゲージ式カウントダウン
// -------------------------

function startCountdown(seconds, onEnd) {
  stopCountdown();

  phaseEnding = false;
  phaseDurationMs = seconds * 1000;
  phaseStartTime = performance.now();

  updateCountdownDisplay(seconds, 1);

  function tick(now) {
    const elapsed = now - phaseStartTime;
    const remainingMs = Math.max(0, phaseDurationMs - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const progressRatio = Math.max(0, Math.min(1, remainingMs / phaseDurationMs));

    updateCountdownDisplay(remainingSeconds, progressRatio);

    if (remainingMs <= 0) {
      stopCountdown();
      onEnd();
      return;
    }

    timerAnimationId = requestAnimationFrame(tick);
  }

  timerAnimationId = requestAnimationFrame(tick);
}

function stopCountdown() {
  if (timerAnimationId !== null) {
    cancelAnimationFrame(timerAnimationId);
    timerAnimationId = null;
  }
}

function updateCountdownDisplay(seconds, progressRatio) {
  const timerDisplay = document.getElementById("timer-display");
  const timerProgress = document.getElementById("timer-progress");

  timerDisplay.textContent = String(seconds);

  // widthではなくtransformで動かすので滑らか
  timerProgress.style.transform = `scaleX(${progressRatio})`;

  if (seconds <= 5) {
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
  document.getElementById("drawing-help").textContent =
    "途中で一度見せ合います。ゲージがなくなったら強制的に公開されます。";

  // 時間制ルールなので手動完了ボタンは非表示
  document.getElementById("finish-drawing-btn").style.display = "none";

  showScreen("drawing-screen");

  startCountdown(FIRST_DRAW_SECONDS, () => {
    forceFinishCurrentDrawingPhase();
  });
}

function startSecondDrawingPhase() {
  drawingPhase = 2;

  document.getElementById("drawing-phase-label").textContent = "後半お絵描き";
  document.getElementById("drawing-title").textContent = "残り25秒で仕上げよう";
  document.getElementById("drawing-help").textContent =
    "途中討論をふまえて描き足しましょう。ゲージがなくなったら強制終了です。";

  document.getElementById("finish-drawing-btn").style.display = "none";

  showScreen("drawing-screen");

  startCountdown(SECOND_DRAW_SECONDS, () => {
    forceFinishCurrentDrawingPhase();
  });
}

// 念のため、ボタンが残っていても押せるようにしておく
document.getElementById("finish-drawing-btn").addEventListener("click", () => {
  forceFinishCurrentDrawingPhase();
});

function forceFinishCurrentDrawingPhase() {
  if (phaseEnding) return;

  phaseEnding = true;

  stopCountdown();
  stopDrawing();

  // その瞬間の線データから再描画して画像化
  redrawCanvas();

  if (drawingPhase === 1) {
    midImageDataUrl = getCanvasImage();
    showMidReview();
  } else {
    finalImageDataUrl = getCanvasImage();
    showFinalReview();
  }
}

// -------------------------
// キャンバス座標
// -------------------------

function getCanvasPos(event) {
  const rect = canvas.getBoundingClientRect();

  const x = ((event.clientX - rect.left) / rect.width) * LOGICAL_CANVAS_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * LOGICAL_CANVAS_SIZE;

  return { x, y };
}

// -------------------------
// 描画処理
// -------------------------

function startDrawing(event) {
  event.preventDefault();

  if (phaseEnding) return;

  isDrawing = true;

  const pos = getCanvasPos(event);

  currentStroke = {
    color: "#000000",
    width: 10,
    points: [pos]
  };

  // 重要：
  // 書き始めた瞬間に strokes に保存する。
  // これで pointerup が不安定でも、次のタップで前の線が消えにくい。
  strokes.push(currentStroke);

  // タップだけでも点が見えるようにする
  drawDot(pos, currentStroke);
}

function draw(event) {
  event.preventDefault();

  if (!isDrawing || !currentStroke || phaseEnding) return;

  const pos = getCanvasPos(event);
  const points = currentStroke.points;
  const lastPos = points[points.length - 1];

  currentStroke.points.push(pos);

  drawLineSegment(lastPos, pos, currentStroke);
}

function stopDrawing(event) {
  if (event) {
    event.preventDefault();
  }

  isDrawing = false;
  currentStroke = null;
}

function drawDot(pos, stroke) {
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, stroke.width / 2, 0, Math.PI * 2);
  ctx.fillStyle = stroke.color;
  ctx.fill();
}

function drawLineSegment(from, to, stroke) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function redrawCanvas() {
  clearCanvasOnly();

  strokes.forEach((stroke) => {
    drawStroke(stroke);
  });
}

function drawStroke(stroke) {
  if (!stroke.points || stroke.points.length === 0) return;

  if (stroke.points.length === 1) {
    drawDot(stroke.points[0], stroke);
    return;
  }

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
  ctx.clearRect(0, 0, LOGICAL_CANVAS_SIZE, LOGICAL_CANVAS_SIZE);
}

function clearCanvasAll() {
  strokes = [];
  currentStroke = null;
  isDrawing = false;

  clearCanvasOnly();
}

function undoStroke() {
  if (phaseEnding) return;

  strokes.pop();
  currentStroke = null;
  isDrawing = false;

  redrawCanvas();
}

function getCanvasImage() {
  redrawCanvas();
  return canvas.toDataURL("image/png");
}

// -------------------------
// キャンバスイベント
// -------------------------

canvas.addEventListener("pointerdown", startDrawing, { passive: false });
canvas.addEventListener("pointermove", draw, { passive: false });
canvas.addEventListener("pointerup", stopDrawing, { passive: false });
canvas.addEventListener("pointercancel", stopDrawing, { passive: false });
canvas.addEventListener("pointerleave", stopDrawing, { passive: false });

document.getElementById("clear-canvas-btn").addEventListener("click", () => {
  if (phaseEnding) return;

  clearCanvasAll();
});

document.getElementById("undo-btn").addEventListener("click", () => {
  undoStroke();
});

// 画面サイズが変わっても canvas.width / canvas.height は変更しない。
// 描いた絵が消えないように、線データから再描画だけする。
window.addEventListener("resize", () => {
  if (document.getElementById("drawing-screen").classList.contains("active")) {
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

// -------------------------
// トップへ戻る
// -------------------------

document.getElementById("back-top-btn").addEventListener("click", () => {
  currentRoomId = null;
  playerName = null;
  currentTopic = null;

  drawingPhase = 1;

  midImageDataUrl = null;
  finalImageDataUrl = null;

  phaseEnding = false;
  stopCountdown();

  isDrawing = false;
  strokes = [];
  currentStroke = null;

  document.getElementById("room-id-input").value = "";
  document.getElementById("player-name-input").value = "";
  document.getElementById("players-list").innerHTML = "";
  document.getElementById("result-display").innerHTML = "";

  clearCanvasOnly();

  showScreen("top-screen");
});

