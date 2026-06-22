console.log("app.js version 605 loaded");

// -------------------------
// バージョン確認表示
// -------------------------

function showVersionBadge() {
  const badge = document.createElement("div");
  badge.textContent = "v605";
  badge.style.position = "fixed";
  badge.style.right = "8px";
  badge.style.bottom = "8px";
  badge.style.zIndex = "9999";
  badge.style.padding = "4px 8px";
  badge.style.fontSize = "12px";
  badge.style.fontWeight = "bold";
  badge.style.color = "#2b2118";
  badge.style.background = "#ffcf5c";
  badge.style.border = "2px solid #2b2118";
  badge.style.borderRadius = "999px";
  badge.style.pointerEvents = "none";
  document.body.appendChild(badge);
}

showVersionBadge();

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

let reviewTimerAnimationId = null;
let reviewStartTime = 0;
let reviewDurationMs = 0;

let midImageDataUrl = null;
let finalImageDataUrl = null;

let onlineTopicHandled = false;

const FIRST_DRAW_SECONDS = 15;
const SECOND_DRAW_SECONDS = 25;
const MID_DISCUSSION_SECONDS = 60;
const FINAL_DISCUSSION_SECONDS = 60;

const LOGICAL_CANVAS_SIZE = 1000;

const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let strokes = [];
let currentStroke = null;

let selectedColor = "#000000";
let selectedWidth = 10;

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
  ctx.strokeStyle = selectedColor;
  ctx.lineWidth = selectedWidth;
}

initCanvasOnce();

// -------------------------
// 共通UI
// -------------------------

function flashButton(button) {
  if (!button) return;

  button.classList.remove("pressed-pop");

  requestAnimationFrame(() => {
    button.classList.add("pressed-pop");

    setTimeout(() => {
      button.classList.remove("pressed-pop");
    }, 120);
  });
}

function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");

  screens.forEach((screen) => {
    screen.classList.remove("active");
  });

  const targetScreen = document.getElementById(screenId);

  if (!targetScreen) {
    console.error("screen not found:", screenId);
    return;
  }

  targetScreen.classList.add("active");

  if (screenId === "drawing-screen") {
    requestAnimationFrame(() => {
      redrawCanvas();
    });
  }

  window.scrollTo(0, 0);
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
// オンライン同期：ロビー表示
// -------------------------

function showOnlineMessage(message) {
  console.log(message);

  const lobbyNote = document.querySelector("#lobby-screen .note");

  if (lobbyNote) {
    lobbyNote.textContent = message;
  }
}

function renderOnlinePlayers(players) {
  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";

  if (!players || players.length === 0) {
    const li = document.createElement("li");
    li.textContent = "参加者を待っています";
    playersList.appendChild(li);
    return;
  }

  const myUid = window.GameDB ? window.GameDB.getCurrentUid() : null;

  players.forEach((player) => {
    const li = document.createElement("li");

    const isMe = player.uid === myUid;
    const readyText = player.ready ? " ✅" : "";

    li.textContent =
      "🎨 " +
      player.name +
      (isMe ? "（あなた）" : "") +
      readyText;

    playersList.appendChild(li);
  });
}

function startOnlineListeners() {
  if (!window.GameDB) {
    console.warn("GameDB がありません。firebase.js を確認してください。");
    return;
  }

  if (!currentRoomId) {
    console.warn("部屋IDがありません。");
    return;
  }

  window.GameDB.listenPlayers(currentRoomId, (players) => {
    renderOnlinePlayers(players);
  });

  window.GameDB.listenRoom(currentRoomId, (room) => {
    if (!room) return;

    if (room.status === "topic" && room.topic) {
      if (!onlineTopicHandled) {
        onlineTopicHandled = true;

        resetRound();

        currentTopic = room.topic;

        document.getElementById("topic-display").textContent = currentTopic.majority;

        showScreen("topic-screen");
      }
    }
  });
}

// -------------------------
// お題バッジ
// -------------------------

function updateDrawingTopicBadge() {
  const badge = document.getElementById("drawing-topic-badge");

  if (!badge) return;

  if (currentTopic && currentTopic.majority) {
    badge.textContent = "お題：" + currentTopic.majority;
  } else {
    badge.textContent = "お題：？？？";
  }
}

// -------------------------
// トップ・部屋作成・参加
// -------------------------

document.getElementById("create-room-btn").addEventListener("click", async (event) => {
  flashButton(event.currentTarget);

  if (!window.GameDB) {
    alert("通信の準備がまだできていません。少し待ってからもう一度お試しください。");
    return;
  }

  try {
    currentRoomId = createRoomId();
    onlineTopicHandled = false;

    event.currentTarget.textContent = "みんなと通信中〜";
    event.currentTarget.disabled = true;

    await window.GameDB.signIn();
    await window.GameDB.createRoom(currentRoomId);

    event.currentTarget.textContent = "部屋を作る";
    event.currentTarget.disabled = false;

    showScreen("name-screen");
  } catch (error) {
    console.error(error);

    event.currentTarget.textContent = "部屋を作る";
    event.currentTarget.disabled = false;

    alert("部屋の作成に失敗しました。通信状況を確認してもう一度お試しください。");
  }
});

document.getElementById("join-room-btn").addEventListener("click", async (event) => {
  flashButton(event.currentTarget);

  if (!window.GameDB) {
    alert("通信の準備がまだできていません。少し待ってからもう一度お試しください。");
    return;
  }

  const inputRoomId = document.getElementById("room-id-input").value.trim().toUpperCase();

  if (!inputRoomId) {
    alert("部屋コードを入力してください");
    return;
  }

  try {
    event.currentTarget.textContent = "部屋を探しています…";
    event.currentTarget.disabled = true;

    await window.GameDB.signIn();

    const exists = await window.GameDB.roomExists(inputRoomId);

    if (!exists) {
      event.currentTarget.textContent = "部屋に参加する";
      event.currentTarget.disabled = false;

      alert("その部屋が見つかりませんでした。部屋コードを確認してください。");
      return;
    }

    currentRoomId = inputRoomId;
    onlineTopicHandled = false;

    event.currentTarget.textContent = "部屋に参加する";
    event.currentTarget.disabled = false;

    showScreen("name-screen");
  } catch (error) {
    console.error(error);

    event.currentTarget.textContent = "部屋に参加する";
    event.currentTarget.disabled = false;

    alert("通信に失敗しました。もう一度お試しください。");
  }
});

document.getElementById("enter-room-btn").addEventListener("click", async (event) => {
  flashButton(event.currentTarget);

  if (!window.GameDB) {
    alert("通信の準備がまだできていません。少し待ってからもう一度お試しください。");
    return;
  }

  const nameInput = document.getElementById("player-name-input").value.trim();

  if (!nameInput) {
    alert("名前を入力してください");
    return;
  }

  try {
    event.currentTarget.textContent = "参加中…";
    event.currentTarget.disabled = true;

    playerName = nameInput;

    await window.GameDB.joinRoom(currentRoomId, playerName);

    document.getElementById("room-id-display").textContent = currentRoomId;

    showScreen("lobby-screen");

    showOnlineMessage("みんなと通信中〜 参加者を待っています。");

    startOnlineListeners();

    event.currentTarget.textContent = "参加する";
    event.currentTarget.disabled = false;
  } catch (error) {
    console.error(error);

    event.currentTarget.textContent = "参加する";
    event.currentTarget.disabled = false;

    alert("参加に失敗しました。もう一度お試しください。");
  }
});

// -------------------------
// ロビー
// -------------------------

document.getElementById("ready-btn").addEventListener("click", async (event) => {
  flashButton(event.currentTarget);

  if (!window.GameDB || !currentRoomId) {
    alert("まだ部屋に接続できていません。");
    return;
  }

  try {
    event.currentTarget.textContent = "準備OK済み";

    await window.GameDB.setReady(currentRoomId, true);

    showOnlineMessage("みんなと通信中〜 準備状態を共有しました。");
  } catch (error) {
    console.error(error);
    alert("準備状態の共有に失敗しました。もう一度お試しください。");
  }
});

document.getElementById("start-game-btn").addEventListener("click", async (event) => {
  flashButton(event.currentTarget);

  if (!window.GameDB || !currentRoomId) {
    alert("まだ部屋に接続できていません。");
    return;
  }

  try {
    event.currentTarget.textContent = "みんなに開始を知らせています…";
    event.currentTarget.disabled = true;

    resetRound();

    currentTopic = pickRandomTopic();

    onlineTopicHandled = true;

    await window.GameDB.startGame(currentRoomId, currentTopic);

    document.getElementById("topic-display").textContent = currentTopic.majority;

    event.currentTarget.textContent = "ゲーム開始";
    event.currentTarget.disabled = false;

    showScreen("topic-screen");
  } catch (error) {
    console.error(error);

    event.currentTarget.textContent = "ゲーム開始";
    event.currentTarget.disabled = false;

    alert("ゲーム開始の共有に失敗しました。もう一度お試しください。");
  }
});

// -------------------------
// お題確認
// -------------------------

document.getElementById("go-drawing-btn").addEventListener("click", (event) => {
  flashButton(event.currentTarget);
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

  stopDrawingCountdown();
  stopReviewCountdown();

  hideTimeupOverlay();
  clearCanvasOnly();

  updateDrawingTopicBadge();
}

// -------------------------
// お絵描きカウントダウン
// -------------------------

function startDrawingCountdown(seconds, onEnd) {
  stopDrawingCountdown();

  phaseEnding = false;
  phaseDurationMs = seconds * 1000;
  phaseStartTime = performance.now();

  updateDrawingCountdownDisplay(seconds, 1);

  function tick(now) {
    const elapsed = now - phaseStartTime;
    const remainingMs = Math.max(0, phaseDurationMs - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const progressRatio = Math.max(0, Math.min(1, remainingMs / phaseDurationMs));

    updateDrawingCountdownDisplay(remainingSeconds, progressRatio);

    if (remainingMs <= 0) {
      stopDrawingCountdown();
      onEnd();
      return;
    }

    timerAnimationId = requestAnimationFrame(tick);
  }

  timerAnimationId = requestAnimationFrame(tick);
}

function stopDrawingCountdown() {
  if (timerAnimationId !== null) {
    cancelAnimationFrame(timerAnimationId);
    timerAnimationId = null;
  }
}

function updateDrawingCountdownDisplay(seconds, progressRatio) {
  const timerDisplay = document.getElementById("timer-display");
  const timerProgress = document.getElementById("timer-progress");

  timerDisplay.textContent = String(seconds);
  timerProgress.style.transform = `scaleX(${progressRatio})`;

  if (seconds <= 5) {
    timerProgress.style.background = "linear-gradient(90deg, #ff3b3b, #ff9b9b)";
  } else {
    timerProgress.style.background = "linear-gradient(90deg, #ff7f7f, #ffcf5c)";
  }
}

// -------------------------
// 討論カウントダウン
// -------------------------

function startReviewCountdown(seconds, label, onEnd) {
  stopReviewCountdown();

  reviewDurationMs = seconds * 1000;
  reviewStartTime = performance.now();

  const labelEl = document.getElementById("review-timer-label");
  const displayEl = document.getElementById("review-timer-display");
  const progressEl = document.getElementById("review-progress");

  if (!labelEl || !displayEl || !progressEl) {
    console.error("review timer elements not found");
    return;
  }

  labelEl.textContent = label;

  updateReviewCountdownDisplay(seconds, 1);

  function tick(now) {
    const elapsed = now - reviewStartTime;
    const remainingMs = Math.max(0, reviewDurationMs - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const progressRatio = Math.max(0, Math.min(1, remainingMs / reviewDurationMs));

    updateReviewCountdownDisplay(remainingSeconds, progressRatio);

    if (remainingMs <= 0) {
      stopReviewCountdown();
      onEnd();
      return;
    }

    reviewTimerAnimationId = requestAnimationFrame(tick);
  }

  reviewTimerAnimationId = requestAnimationFrame(tick);
}

function stopReviewCountdown() {
  if (reviewTimerAnimationId !== null) {
    cancelAnimationFrame(reviewTimerAnimationId);
    reviewTimerAnimationId = null;
  }
}

function updateReviewCountdownDisplay(seconds, progressRatio) {
  const display = document.getElementById("review-timer-display");
  const progress = document.getElementById("review-progress");

  if (!display || !progress) return;

  display.textContent = String(seconds);
  progress.style.transform = `scaleX(${progressRatio})`;

  if (seconds <= 5) {
    progress.style.background = "linear-gradient(90deg, #ff3b3b, #ff9b9b)";
  } else {
    progress.style.background = "linear-gradient(90deg, #8fd3ff, #ffcf5c)";
  }
}

// -------------------------
// お絵描きフェーズ
// -------------------------

function startFirstDrawingPhase() {
  drawingPhase = 1;

  hideTimeupOverlay();
  updateDrawingTopicBadge();

  document.getElementById("drawing-phase-label").textContent = "前半お絵描き";
  document.getElementById("drawing-title").textContent = "まずは15秒で描こう";
  document.getElementById("drawing-help").textContent =
    "15秒で一度見せ合います。ゲージがなくなったら強制的に公開されます。";

  document.getElementById("finish-drawing-btn").style.display = "none";

  showScreen("drawing-screen");

  startDrawingCountdown(FIRST_DRAW_SECONDS, () => {
    forceFinishCurrentDrawingPhase();
  });
}

function startSecondDrawingPhase() {
  drawingPhase = 2;

  hideTimeupOverlay();
  updateDrawingTopicBadge();

  document.getElementById("drawing-phase-label").textContent = "後半お絵描き";
  document.getElementById("drawing-title").textContent = "残り25秒で仕上げよう";
  document.getElementById("drawing-help").textContent =
    "途中討論をふまえて描き足しましょう。ゲージがなくなったら強制終了です。";

  document.getElementById("finish-drawing-btn").style.display = "none";

  showScreen("drawing-screen");

  startDrawingCountdown(SECOND_DRAW_SECONDS, () => {
    forceFinishCurrentDrawingPhase();
  });
}

document.getElementById("finish-drawing-btn").addEventListener("click", () => {
  forceFinishCurrentDrawingPhase();
});

function forceFinishCurrentDrawingPhase() {
  if (phaseEnding) return;

  phaseEnding = true;

  stopDrawingCountdown();
  stopDrawing();

  redrawCanvas();
  showTimeupOverlay();

  setTimeout(() => {
    redrawCanvas();

    if (drawingPhase === 1) {
      midImageDataUrl = getCanvasImage();
      showMidReview();
    } else {
      finalImageDataUrl = getCanvasImage();
      showFinalReview();
    }
  }, 500);
}

function showTimeupOverlay() {
  const overlay = document.getElementById("timeup-overlay");
  const sfx = document.getElementById("timeup-sfx");

  const sfxList = ["ドン！", "バーン！", "ジャーン！", "カン！", "ドドン！"];
  const randomSfx = sfxList[Math.floor(Math.random() * sfxList.length)];

  if (sfx) {
    sfx.textContent = randomSfx;
  }

  if (overlay) {
    overlay.classList.add("show");
  }
}

function hideTimeupOverlay() {
  const overlay = document.getElementById("timeup-overlay");

  if (overlay) {
    overlay.classList.remove("show");
  }
}

// -------------------------
// ペン設定
// イベント委任方式：確実に反応させる
// -------------------------

document.addEventListener("pointerdown", (event) => {
  const colorButton = event.target.closest(".color-btn");
  const sizeButton = event.target.closest(".size-btn");

  if (colorButton) {
    event.preventDefault();

    if (phaseEnding) return;

    selectedColor = colorButton.dataset.color;

    document.querySelectorAll(".color-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });

    colorButton.classList.add("selected");
    flashButton(colorButton);

    console.log("selectedColor:", selectedColor);
    return;
  }

  if (sizeButton) {
    event.preventDefault();

    if (phaseEnding) return;

    selectedWidth = Number(sizeButton.dataset.size);

    document.querySelectorAll(".size-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });

    sizeButton.classList.add("selected");
    flashButton(sizeButton);

    console.log("selectedWidth:", selectedWidth);
    return;
  }
}, { passive: false });

document.addEventListener("click", (event) => {
  const colorButton = event.target.closest(".color-btn");
  const sizeButton = event.target.closest(".size-btn");

  if (colorButton) {
    event.preventDefault();

    if (phaseEnding) return;

    selectedColor = colorButton.dataset.color;

    document.querySelectorAll(".color-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });

    colorButton.classList.add("selected");

    console.log("selectedColor click:", selectedColor);
    return;
  }

  if (sizeButton) {
    event.preventDefault();

    if (phaseEnding) return;

    selectedWidth = Number(sizeButton.dataset.size);

    document.querySelectorAll(".size-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });

    sizeButton.classList.add("selected");

    console.log("selectedWidth click:", selectedWidth);
    return;
  }
});

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
    color: selectedColor,
    width: selectedWidth,
    points: [pos]
  };

  strokes.push(currentStroke);

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

document.getElementById("clear-canvas-btn").addEventListener("click", (event) => {
  if (phaseEnding) return;

  flashButton(event.currentTarget);
  clearCanvasAll();
});

document.getElementById("undo-btn").addEventListener("click", (event) => {
  if (phaseEnding) return;

  flashButton(event.currentTarget);
  undoStroke();
});

window.addEventListener("resize", () => {
  if (document.getElementById("drawing-screen").classList.contains("active")) {
    redrawCanvas();
  }
});

// -------------------------
// 途中公開・最終公開
// -------------------------

function showMidReview() {
  hideTimeupOverlay();

  document.getElementById("review-phase-label").textContent = "途中公開";
  document.getElementById("review-title").textContent = "途中経過を見せ合おう";
  document.getElementById("review-description").textContent =
    "60秒だけ軽く討論します。誰が怪しいか探りましょう。";

  document.getElementById("gallery-player-name").textContent =
    (playerName || "あなた") + " の途中絵";

  document.getElementById("review-image").src = midImageDataUrl;

  document.getElementById("discussion-text").innerHTML =
    "途中討論タイム！<br>ただし、お題を直接言うのは禁止！";

  const nextBtn = document.getElementById("review-next-btn");
  nextBtn.textContent = "60秒後に後半へ進みます";
  nextBtn.disabled = true;

  showScreen("review-screen");

  setTimeout(() => {
    startReviewCountdown(MID_DISCUSSION_SECONDS, "途中討論", () => {
      startSecondDrawingPhase();
    });
  }, 50);
}

function showFinalReview() {
  hideTimeupOverlay();

  document.getElementById("review-phase-label").textContent = "最終公開";
  document.getElementById("review-title").textContent = "完成した絵を見せ合おう";
  document.getElementById("review-description").textContent =
    "60秒の最終討論です。ニセ絵師だと思う人を決めましょう。";

  document.getElementById("gallery-player-name").textContent =
    (playerName || "あなた") + " の完成絵";

  document.getElementById("review-image").src = finalImageDataUrl;

  document.getElementById("discussion-text").innerHTML =
    "最終討論タイム！<br>絵の違和感や発言からニセ絵師を探しましょう。";

  const nextBtn = document.getElementById("review-next-btn");
  nextBtn.textContent = "60秒後に投票へ進みます";
  nextBtn.disabled = true;

  showScreen("review-screen");

  setTimeout(() => {
    startReviewCountdown(FINAL_DISCUSSION_SECONDS, "最終討論", () => {
      showVoteScreen();
    });
  }, 50);
}

// -------------------------
// 投票
// -------------------------

function showVoteScreen() {
  stopReviewCountdown();

  showScreen("vote-screen");

  const voteList = document.getElementById("vote-list");
  voteList.innerHTML = "";

  const message = document.createElement("div");
  message.className = "vote-notice";
  message.innerHTML = `
    <p><strong>投票タイム！</strong></p>
    <p>今はお試しプレイなので、自分の名前を押すと結果発表に進みます。</p>
    <p class="note">正式版では、みんなの投票が集まってから結果が発表されます。</p>
  `;
  voteList.appendChild(message);

  const btn = document.createElement("button");
  btn.className = "primary-btn";
  btn.textContent = playerName || "あなた";

  btn.addEventListener("click", (event) => {
    flashButton(event.currentTarget);
    showResultScreen();
  });

  voteList.appendChild(btn);
}

// -------------------------
// 結果 豪華版
// -------------------------

function showResultScreen() {
  const majorityWord = currentTopic ? currentTopic.majority : "猫";
  const minorityWord = currentTopic ? currentTopic.minority : "虎";

  const resultDisplay = document.getElementById("result-display");

  showScreen("result-screen");

  resultDisplay.innerHTML = `
    <div class="result-showcase">
      <div class="result-drumroll">
        <div class="drumroll-icon">🥁</div>
        <div class="drumroll-text">集計中……</div>
        <div class="drumroll-sub">みんなの投票を確認しています</div>
      </div>
    </div>
  `;

  setTimeout(() => {
    resultDisplay.innerHTML = `
      <div class="result-showcase">

        <div class="result-burst">🎉 結果発表 🎉</div>

        <div class="result-reveal-card">
          <div class="result-label">今回のお題</div>

          <div class="topic-versus">
            <div class="topic-box majority">
              <span>多数派</span>
              <strong>${majorityWord}</strong>
            </div>

            <div class="vs-mark">VS</div>

            <div class="topic-box minority">
              <span>ニセ絵師</span>
              <strong>${minorityWord}</strong>
            </div>
          </div>
        </div>

        <div class="result-winner-card">
          <div class="winner-icon">🕵️‍♂️</div>
          <h3>今回はお試し結果です</h3>
          <p>
            正式版では、ここに<br>
            <strong>一番票を集めた人</strong>、<strong>ニセ絵師の正体</strong>、<strong>勝ったチーム</strong><br>
            がド派手に表示されます。
          </p>
        </div>

        <div class="result-mini-stats">
          <div>
            <span>投票状況</span>
            <strong>準備中</strong>
          </div>
          <div>
            <span>通信状態</span>
            <strong>みんなと通信中〜</strong>
          </div>
          <div>
            <span>次の目標</span>
            <strong>オンライン対戦</strong>
          </div>
        </div>

        <div class="result-notice">
          <p>
            今は1人で流れを確認するお試し版です。<br>
            次のアップデートで、みんなの絵・投票・結果がリアルタイムで反映されるようになります。
          </p>
        </div>

      </div>
    `;
  }, 1200);
}

// -------------------------
// トップへ戻る
// -------------------------

document.getElementById("back-top-btn").addEventListener("click", (event) => {
  flashButton(event.currentTarget);

  if (window.GameDB) {
    window.GameDB.stopListeners();
  }

  currentRoomId = null;
  playerName = null;
  currentTopic = null;

  onlineTopicHandled = false;

  drawingPhase = 1;

  midImageDataUrl = null;
  finalImageDataUrl = null;

  phaseEnding = false;

  stopDrawingCountdown();
  stopReviewCountdown();

  isDrawing = false;
  strokes = [];
  currentStroke = null;

  document.getElementById("room-id-input").value = "";
  document.getElementById("player-name-input").value = "";
  document.getElementById("players-list").innerHTML = "";
  document.getElementById("result-display").innerHTML = "";

  hideTimeupOverlay();
  clearCanvasOnly();
  updateDrawingTopicBadge();

  showScreen("top-screen");
});
