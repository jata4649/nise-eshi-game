console.log("app.js version 617 loaded");

// ==============================
// v617 バージョン表示
// ==============================
function showVersionBadge() {
  const oldBadge = document.getElementById("version-badge");
  if (oldBadge) oldBadge.remove();

  const badge = document.createElement("div");
  badge.id = "version-badge";
  badge.textContent = "v617";
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


// ==============================
// TOP下部 最新版更新ボタン
// ==============================
function showHardReloadButton() {
  const topScreen = document.getElementById("top-screen");
  if (!topScreen) return;

  const oldBox = document.getElementById("hard-reload-box");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.id = "hard-reload-box";
  box.className = "hard-reload-box";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hard-reload-btn";
  button.textContent = "最新版に更新する";

  const note = document.createElement("p");
  note.className = "hard-reload-note";
  note.textContent = "表示が古い・動きがおかしい時に押してください。";

  button.addEventListener("click", async () => {
    try {
      button.disabled = true;
      button.textContent = "更新中...";

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      const url = new URL(window.location.href);
      url.searchParams.set("v", "617");
      url.searchParams.set("reload", Date.now().toString());

      window.location.href = url.toString();
    } catch (error) {
      console.error("最新版更新失敗:", error);
      const url = new URL(window.location.href);
      url.searchParams.set("v", "617");
      url.searchParams.set("reload", Date.now().toString());
      window.location.href = url.toString();
    }
  });

  box.appendChild(button);
  box.appendChild(note);
  topScreen.appendChild(box);
}

showHardReloadButton();


// ==============================
// 基本状態
// ==============================
let currentRoomId = null;
let playerName = null;
let currentTopic = null;

let currentPlayers = [];
let currentRoomData = null;

let pendingAction = null;
let onlineTopicHandled = false;

let drawingPhase = 1;
let phaseEnding = false;

let timerAnimationId = null;
let phaseStartTime = 0;
let phaseDurationMs = 0;

let reviewTimerAnimationId = null;
let reviewStartTime = 0;
let reviewDurationMs = 0;

let midImageDataUrl = null;
let finalImageDataUrl = null;

let reviewGalleryUnsubscribe = null;
let voteUnsubscribe = null;

let hasVoted = false;
let resultShown = false;
let latestVotes = [];

const FIRST_DRAW_SECONDS = 15;
const SECOND_DRAW_SECONDS = 25;
const MID_DISCUSSION_SECONDS = 60;
const FINAL_DISCUSSION_SECONDS = 60;

const LOGICAL_CANVAS_SIZE = 1000;


// ==============================
// DOM
// ==============================
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;

let isDrawing = false;
let strokes = [];
let currentStroke = null;
let selectedColor = "#000000";
let selectedWidth = 10;


// ==============================
// 汎用関数
// ==============================
function $(id) {
  return document.getElementById(id);
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const target = $(screenId);
  if (target) {
    target.classList.add("active");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requireGameDB() {
  if (!window.GameDB) {
    alert(
      "通信機能の読み込みに失敗しました。\n\n" +
      "確認してください：\n" +
      "1. firebase.js が v617 で読み込まれているか\n" +
      "2. index.html の script 順番が正しいか\n" +
      "3. Firebase SDK が読み込まれているか"
    );
    throw new Error("GameDB is not loaded");
  }

  return window.GameDB;
}

function createRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < 5; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

function normalizeRoomInput(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getMyUidSafe() {
  if (!window.GameDB || !window.GameDB.getCurrentUid) return null;
  return window.GameDB.getCurrentUid();
}

function isCurrentUserHost() {
  const myUid = getMyUidSafe();
  if (!myUid || !currentRoomData) return false;
  return currentRoomData.hostUid === myUid;
}

function getGuestPlayers() {
  if (!currentRoomData || !currentRoomData.hostUid) return [];
  return currentPlayers.filter((player) => player.uid !== currentRoomData.hostUid);
}

function areAllGuestsReady() {
  const guestPlayers = getGuestPlayers();

  if (guestPlayers.length <= 0) {
    return false;
  }

  return guestPlayers.every((player) => player.ready === true);
}

function canHostStartGame() {
  if (!isCurrentUserHost()) return false;
  if (currentPlayers.length < 2) return false;
  return areAllGuestsReady();
}

function pickRandomTopic() {
  try {
    if (typeof getRandomTopic === "function") {
      return getRandomTopic();
    }

    if (typeof pickTopic === "function") {
      return pickTopic();
    }

    if (typeof pickRandomTheme === "function") {
      return pickRandomTheme();
    }

    if (Array.isArray(window.TOPICS) && window.TOPICS.length > 0) {
      return window.TOPICS[Math.floor(Math.random() * window.TOPICS.length)];
    }

    if (typeof TOPICS !== "undefined" && Array.isArray(TOPICS) && TOPICS.length > 0) {
      return TOPICS[Math.floor(Math.random() * TOPICS.length)];
    }
  } catch (error) {
    console.error("お題取得エラー:", error);
  }

  return "猫";
}

function topicToText(topic) {
  if (topic == null) return "？？？";

  if (typeof topic === "string") {
    return topic;
  }

  if (typeof topic === "object") {
    if (topic.word) return topic.word;
    if (topic.topic) return topic.topic;
    if (topic.name) return topic.name;
    if (topic.normal) return topic.normal;
    if (topic.answer) return topic.answer;
  }

  return String(topic);
}


// ==============================
// ロビー制御
// ==============================
function updateLobbyControlButtons() {
  const startBtn = $("start-game-btn");
  const readyBtn = $("ready-btn");

  const isHost = isCurrentUserHost();
  const canStart = canHostStartGame();

  if (startBtn) {
    if (isHost) {
      startBtn.style.display = "block";
      startBtn.disabled = !canStart;

      if (canStart) {
        startBtn.textContent = "ゲーム開始";
      } else {
        startBtn.textContent = "全員の準備待ち";
      }
    } else {
      startBtn.style.display = "none";
      startBtn.disabled = true;
    }
  }

  if (readyBtn) {
    if (isHost) {
      readyBtn.style.display = "none";
    } else {
      readyBtn.style.display = "block";

      const myUid = getMyUidSafe();
      const me = currentPlayers.find((player) => player.uid === myUid);

      if (me && me.ready) {
        readyBtn.textContent = "準備OK済み";
        readyBtn.classList.add("ready-done");
      } else {
        readyBtn.textContent = "準備OK";
        readyBtn.classList.remove("ready-done");
      }
    }
  }
}

function renderLobbyPlayers(players) {
  const playerList = $("players-list");
  if (!playerList) return;

  playerList.innerHTML = "";

  const hostUid = currentRoomData && currentRoomData.hostUid;

  players.forEach((player) => {
    const item = document.createElement("li");
    item.className = "player-item";

    const isHost = player.uid === hostUid;

    let statusText = "";

    if (isHost) {
      statusText = "ホスト";
    } else if (player.ready) {
      statusText = "準備OK";
    } else {
      statusText = "準備待ち";
    }

    item.innerHTML = `
      <span class="player-name">${escapeHtml(player.name || "名無し")}</span>
      <span class="player-status ${isHost ? "host" : player.ready ? "ready" : "waiting"}">
        ${statusText}
      </span>
    `;

    playerList.appendChild(item);
  });

  updateLobbyControlButtons();
}


// ==============================
// オンラインリスナー
// ==============================
function startOnlineListeners() {
  if (!currentRoomId) return;

  const GameDB = requireGameDB();

  if (GameDB.stopListeners) {
    GameDB.stopListeners();
  }

  GameDB.listenPlayers(currentRoomId, (players) => {
    currentPlayers = players || [];

    renderLobbyPlayers(currentPlayers);
    updateLobbyControlButtons();

    if (!resultShown && latestVotes.length > 0) {
      checkAllVotesAndShowResult(latestVotes);
    }
  });

  GameDB.listenRoom(currentRoomId, (room) => {
    currentRoomData = room || null;
    updateLobbyControlButtons();

    if (!room) return;

    if (room.status === "playing" && !onlineTopicHandled) {
      onlineTopicHandled = true;

      currentTopic = room.topic || room.currentTopic || "？？？";

      showTopicScreen(currentTopic);
    }
  });
}


// ==============================
// 部屋作成・参加
// ==============================
async function createRoomFlow() {
  try {
    const GameDB = requireGameDB();

    await GameDB.signIn();

    const roomId = createRoomId();

    currentRoomId = roomId;
    pendingAction = "create";

    const roomInput = $("room-id-input");
    if (roomInput) roomInput.value = roomId;

    const display = $("room-id-display");
    if (display) display.textContent = roomId;

    showScreen("name-screen");
  } catch (error) {
    console.error("部屋作成準備失敗:", error);
    alert(
      "通信に失敗しました。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
}

async function joinRoomFlow() {
  try {
    const GameDB = requireGameDB();

    await GameDB.signIn();

    const input = $("room-id-input");
    const roomId = normalizeRoomInput(input ? input.value : "");

    if (!roomId) {
      alert("部屋コードを入力してください。");
      return;
    }

    if (GameDB.roomExists) {
      const exists = await GameDB.roomExists(roomId);
      if (!exists) {
        alert("その部屋が見つかりませんでした。部屋コードを確認してください。");
        return;
      }
    }

    currentRoomId = roomId;
    pendingAction = "join";

    const display = $("room-id-display");
    if (display) display.textContent = roomId;

    showScreen("name-screen");
  } catch (error) {
    console.error("部屋参加準備失敗:", error);
    alert(
      "通信に失敗しました。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
}

async function enterRoomFlow() {
  try {
    const GameDB = requireGameDB();

    const nameInput = $("player-name-input");
    const name = String(nameInput ? nameInput.value : "").trim();

    if (!name) {
      alert("名前を入力してください。");
      return;
    }

    if (!currentRoomId) {
      alert("部屋情報がありません。トップからやり直してください。");
      showScreen("top-screen");
      return;
    }

    playerName = name;

    await GameDB.signIn();

    if (pendingAction === "create") {
      await GameDB.createRoom(currentRoomId, playerName);
    } else {
      await GameDB.joinRoom(currentRoomId, playerName);
    }

    const display = $("room-id-display");
    if (display) display.textContent = currentRoomId;

    onlineTopicHandled = false;
    hasVoted = false;
    resultShown = false;
    latestVotes = [];

    showScreen("lobby-screen");
    startOnlineListeners();
  } catch (error) {
    console.error("入室失敗:", error);
    alert(
      "参加に失敗しました。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
}


// ==============================
// お題画面
// ==============================
function showTopicScreen(topic) {
  currentTopic = topic;

  const display = $("topic-display");
  if (display) {
    display.textContent = topicToText(topic);
  }

  const badge = $("drawing-topic-badge");
  if (badge) {
    badge.textContent = "お題：" + topicToText(topic);
  }

  showScreen("topic-screen");
}


// ==============================
// キャンバス初期化
// ==============================
function initCanvas() {
  if (!canvas || !ctx) return;

  canvas.width = LOGICAL_CANVAS_SIZE;
  canvas.height = LOGICAL_CANVAS_SIZE;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  clearCanvasOnly();
}

function clearCanvasOnly() {
  if (!canvas || !ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function redrawCanvas() {
  if (!canvas || !ctx) return;

  clearCanvasOnly();

  strokes.forEach((stroke) => {
    if (!stroke || !stroke.points || stroke.points.length < 1) return;

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();

    stroke.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.stroke();
  });
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  let clientX;
  let clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height
  };
}

function startDrawing(event) {
  if (!canvas || !ctx) return;

  event.preventDefault();

  isDrawing = true;

  const point = getCanvasPoint(event);

  currentStroke = {
    color: selectedColor,
    width: selectedWidth,
    points: [point]
  };

  ctx.strokeStyle = selectedColor;
  ctx.lineWidth = selectedWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function moveDrawing(event) {
  if (!isDrawing || !currentStroke || !canvas || !ctx) return;

  event.preventDefault();

  const point = getCanvasPoint(event);
  currentStroke.points.push(point);

  ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

function endDrawing(event) {
  if (!isDrawing) return;

  if (event) event.preventDefault();

  isDrawing = false;

  if (currentStroke) {
    strokes.push(currentStroke);
    currentStroke = null;
  }
}

function setupCanvasEvents() {
  if (!canvas) return;

  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", moveDrawing);
  window.addEventListener("mouseup", endDrawing);

  canvas.addEventListener("touchstart", startDrawing, { passive: false });
  canvas.addEventListener("touchmove", moveDrawing, { passive: false });
  canvas.addEventListener("touchend", endDrawing, { passive: false });
  canvas.addEventListener("touchcancel", endDrawing, { passive: false });
}

function setupDrawingTools() {
  document.querySelectorAll(".color-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".color-btn").forEach((btn) => {
        btn.classList.remove("selected");
      });

      button.classList.add("selected");
      selectedColor = button.dataset.color || "#000000";
    });
  });

  document.querySelectorAll(".size-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".size-btn").forEach((btn) => {
        btn.classList.remove("selected");
      });

      button.classList.add("selected");
      selectedWidth = Number(button.dataset.size || 10);
    });
  });

  const undoBtn = $("undo-btn");
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      strokes.pop();
      redrawCanvas();
    });
  }

  const clearBtn = $("clear-canvas-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!confirm("絵を消しますか？")) return;
      strokes = [];
      redrawCanvas();
    });
  }
}

function getCanvasImage() {
  const exportSize = 700;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = exportSize;
  tempCanvas.height = exportSize;

  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, exportSize, exportSize);

  tempCtx.drawImage(canvas, 0, 0, exportSize, exportSize);

  const imageDataUrl = tempCanvas.toDataURL("image/jpeg", 0.55);

  console.log("共有用画像サイズ:", Math.round(imageDataUrl.length / 1024), "KB");

  return imageDataUrl;
}


// ==============================
// 描画フェーズ
// ==============================
function startFirstDrawing() {
  drawingPhase = 1;
  phaseEnding = false;
  strokes = [];

  initCanvas();

  const phaseLabel = $("drawing-phase-label");
  if (phaseLabel) phaseLabel.textContent = "前半お絵描き";

  const title = $("drawing-title");
  if (title) title.textContent = "まずは15秒で描こう";

  const help = $("drawing-help");
  if (help) help.textContent = "15秒で一度見せ合います。描きすぎ注意！";

  const topicBadge = $("drawing-topic-badge");
  if (topicBadge) topicBadge.textContent = "お題：" + topicToText(currentTopic);

  const finishBtn = $("finish-drawing-btn");
  if (finishBtn) finishBtn.textContent = "この段階を完了";

  showScreen("drawing-screen");

  startDrawingTimer(FIRST_DRAW_SECONDS);
}

function startSecondDrawing() {
  drawingPhase = 2;
  phaseEnding = false;

  const phaseLabel = $("drawing-phase-label");
  if (phaseLabel) phaseLabel.textContent = "後半お絵描き";

  const title = $("drawing-title");
  if (title) title.textContent = "あと25秒で仕上げよう";

  const help = $("drawing-help");
  if (help) help.textContent = "途中討論をヒントに、続きを描きましょう。";

  const topicBadge = $("drawing-topic-badge");
  if (topicBadge) topicBadge.textContent = "お題：" + topicToText(currentTopic);

  const finishBtn = $("finish-drawing-btn");
  if (finishBtn) finishBtn.textContent = "完成";

  showScreen("drawing-screen");

  startDrawingTimer(SECOND_DRAW_SECONDS);
}

function startDrawingTimer(seconds) {
  cancelAnimationFrame(timerAnimationId);

  phaseStartTime = performance.now();
  phaseDurationMs = seconds * 1000;

  const display = $("timer-display");
  const progress = $("timer-progress");

  function tick(now) {
    const elapsed = now - phaseStartTime;
    const remainMs = Math.max(0, phaseDurationMs - elapsed);
    const remainSec = Math.ceil(remainMs / 1000);

    if (display) display.textContent = String(remainSec);

    if (progress) {
      const ratio = Math.max(0, Math.min(1, remainMs / phaseDurationMs));
      progress.style.width = `${ratio * 100}%`;
    }

    if (remainMs <= 0) {
      forceFinishCurrentDrawingPhase();
      return;
    }

    timerAnimationId = requestAnimationFrame(tick);
  }

  timerAnimationId = requestAnimationFrame(tick);
}

async function forceFinishCurrentDrawingPhase() {
  if (phaseEnding) return;

  phaseEnding = true;
  cancelAnimationFrame(timerAnimationId);

  const overlay = $("timeup-overlay");
  if (overlay) overlay.classList.add("active");

  await new Promise((resolve) => setTimeout(resolve, 600));

  if (overlay) overlay.classList.remove("active");

  const image = getCanvasImage();

  if (drawingPhase === 1) {
    midImageDataUrl = image;

    await saveDrawingOnline("mid", midImageDataUrl);

    showMidReview();
  } else {
    finalImageDataUrl = image;

    await saveDrawingOnline("final", finalImageDataUrl);

    showFinalReview();
  }
}

async function saveDrawingOnline(phase, imageDataUrl) {
  try {
    if (!currentRoomId) return;
    if (!window.GameDB || !window.GameDB.saveDrawing) return;

    await window.GameDB.saveDrawing(
      currentRoomId,
      phase,
      playerName || "名無し",
      imageDataUrl
    );
  } catch (error) {
    console.error(`${phase}絵の共有に失敗:`, error);
    alert(
      (phase === "mid" ? "途中絵" : "完成絵") +
      "の共有に失敗しました。\n自分の画面では続行します。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
}


// ==============================
// みんなの絵ギャラリー
// ==============================
function ensureReviewGalleryGrid() {
  let grid = $("review-gallery-grid");

  if (grid) return grid;

  const galleryCard = document.querySelector("#review-screen .gallery-card");
  if (!galleryCard) return null;

  grid = document.createElement("div");
  grid.id = "review-gallery-grid";
  grid.className = "review-gallery-grid";

  galleryCard.insertAdjacentElement("afterend", grid);

  return grid;
}

function renderReviewGallery(drawings, phaseLabel, fallbackImage) {
  const grid = ensureReviewGalleryGrid();
  if (!grid) return;

  const list = Array.isArray(drawings) ? drawings : [];

  let html = `
    <div class="review-gallery-title">みんなの絵：${escapeHtml(phaseLabel)}</div>
  `;

  if (list.length === 0 && fallbackImage) {
    html += `
      <div class="review-gallery-card">
        <div class="review-gallery-name">${escapeHtml(playerName || "あなた")}</div>
        <img class="review-gallery-image" src="${fallbackImage}" alt="あなたの絵">
      </div>
    `;
  } else if (list.length === 0) {
    html += `
      <div class="review-gallery-empty">
        みんなの絵を読み込み中...
      </div>
    `;
  } else {
    html += `<div class="review-gallery-list">`;

    list.forEach((drawing) => {
      html += `
        <div class="review-gallery-card">
          <div class="review-gallery-name">${escapeHtml(drawing.name || "名無し")}</div>
          <img class="review-gallery-image" src="${drawing.image}" alt="${escapeHtml(drawing.name || "名無し")}の絵">
        </div>
      `;
    });

    html += `</div>`;
  }

  grid.innerHTML = html;
}

function startDrawingGalleryListener(phase, phaseLabel, fallbackImage) {
  if (reviewGalleryUnsubscribe) {
    try {
      reviewGalleryUnsubscribe();
    } catch (error) {
      console.warn("前のギャラリーリスナー停止失敗:", error);
    }
    reviewGalleryUnsubscribe = null;
  }

  renderReviewGallery([], phaseLabel, fallbackImage);

  if (!currentRoomId) return;
  if (!window.GameDB || !window.GameDB.listenDrawings) return;

  try {
    reviewGalleryUnsubscribe = window.GameDB.listenDrawings(
      currentRoomId,
      phase,
      (drawings) => {
        renderReviewGallery(drawings || [], phaseLabel, fallbackImage);
      }
    );
  } catch (error) {
    console.error("絵ギャラリー購読失敗:", error);
  }
}


// ==============================
// 公開・討論
// ==============================
function showMidReview() {
  const phaseLabel = $("review-phase-label");
  if (phaseLabel) phaseLabel.textContent = "途中公開";

  const title = $("review-title");
  if (title) title.textContent = "途中経過を見せ合おう";

  const description = $("review-description");
  if (description) {
    description.textContent = "軽く話し合って、怪しい人を探しましょう。";
  }

  const timerLabel = $("review-timer-label");
  if (timerLabel) timerLabel.textContent = "途中討論";

  const image = $("review-image");
  if (image) image.src = midImageDataUrl || "";

  const name = $("gallery-player-name");
  if (name) name.textContent = playerName ? `${playerName}の絵` : "あなたの絵";

  const nextBtn = $("review-next-btn");
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "自動で進みます";
  }

  showScreen("review-screen");

  startDrawingGalleryListener("mid", "途中絵", midImageDataUrl);

  startReviewTimer(MID_DISCUSSION_SECONDS, () => {
    startSecondDrawing();
  });
}

function showFinalReview() {
  const phaseLabel = $("review-phase-label");
  if (phaseLabel) phaseLabel.textContent = "最終公開";

  const title = $("review-title");
  if (title) title.textContent = "完成した絵を見せ合おう";

  const description = $("review-description");
  if (description) {
    description.textContent = "最後の話し合いです。ニセ絵師を探しましょう。";
  }

  const timerLabel = $("review-timer-label");
  if (timerLabel) timerLabel.textContent = "最終討論";

  const image = $("review-image");
  if (image) image.src = finalImageDataUrl || "";

  const name = $("gallery-player-name");
  if (name) name.textContent = playerName ? `${playerName}の絵` : "あなたの絵";

  const nextBtn = $("review-next-btn");
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "自動で進みます";
  }

  showScreen("review-screen");

  startDrawingGalleryListener("final", "完成絵", finalImageDataUrl);

  startReviewTimer(FINAL_DISCUSSION_SECONDS, () => {
    showVoteScreen();
  });
}

function startReviewTimer(seconds, onFinish) {
  cancelAnimationFrame(reviewTimerAnimationId);

  reviewStartTime = performance.now();
  reviewDurationMs = seconds * 1000;

  const display = $("review-timer-display");
  const progress = $("review-progress");

  function tick(now) {
    const elapsed = now - reviewStartTime;
    const remainMs = Math.max(0, reviewDurationMs - elapsed);
    const remainSec = Math.ceil(remainMs / 1000);

    if (display) display.textContent = String(remainSec);

    if (progress) {
      const ratio = Math.max(0, Math.min(1, remainMs / reviewDurationMs));
      progress.style.width = `${ratio * 100}%`;
    }

    if (remainMs <= 0) {
      if (typeof onFinish === "function") onFinish();
      return;
    }

    reviewTimerAnimationId = requestAnimationFrame(tick);
  }

  reviewTimerAnimationId = requestAnimationFrame(tick);
}


// ==============================
// v617 投票・結果同期
// ==============================
function getValidVotingPlayers() {
  if (Array.isArray(currentPlayers) && currentPlayers.length > 0) {
    return currentPlayers.filter((player) => player && player.uid);
  }

  return [];
}

function getMyVote(votes) {
  const myUid = getMyUidSafe();
  if (!myUid) return null;

  return (votes || []).find((vote) => vote.uid === myUid) || null;
}

function renderVoteWaiting(votes) {
  const voteList = $("vote-list");
  if (!voteList) return;

  const players = getValidVotingPlayers();
  const voteCount = Array.isArray(votes) ? votes.length : 0;
  const playerCount = players.length;

  let status = document.getElementById("vote-status-box");

  if (!status) {
    status = document.createElement("div");
    status.id = "vote-status-box";
    status.className = "vote-status-box";
    voteList.insertAdjacentElement("beforebegin", status);
  }

  const myVote = getMyVote(votes);

  if (myVote) {
    hasVoted = true;
    status.innerHTML = `
      <strong>投票済み</strong>
      <p>${escapeHtml(myVote.votedName || "名無し")} に投票しました。</p>
      <p>全員の投票を待っています。 ${voteCount} / ${playerCount}</p>
    `;
  } else {
    status.innerHTML = `
      <strong>投票してください</strong>
      <p>全員の投票が終わると、自動で結果画面に進みます。</p>
      <p>現在の投票数：${voteCount} / ${playerCount}</p>
    `;
  }

  updateVoteButtonsDisabled();
}

function updateVoteButtonsDisabled() {
  document.querySelectorAll(".vote-btn").forEach((button) => {
    button.disabled = hasVoted || resultShown;
    if (hasVoted) {
      button.classList.add("vote-disabled");
    } else {
      button.classList.remove("vote-disabled");
    }
  });
}

function startVoteListener() {
  if (voteUnsubscribe) {
    try {
      voteUnsubscribe();
    } catch (error) {
      console.warn("投票リスナー停止失敗:", error);
    }
    voteUnsubscribe = null;
  }

  if (!currentRoomId) return;
  if (!window.GameDB || !window.GameDB.listenVotes) return;

  try {
    voteUnsubscribe = window.GameDB.listenVotes(currentRoomId, (votes) => {
      latestVotes = votes || [];

      const myVote = getMyVote(latestVotes);
      hasVoted = !!myVote;

      renderVoteWaiting(latestVotes);
      checkAllVotesAndShowResult(latestVotes);
    });
  } catch (error) {
    console.error("投票リスナー開始失敗:", error);
  }
}

function checkAllVotesAndShowResult(votes) {
  if (resultShown) return;

  const players = getValidVotingPlayers();
  const voteList = Array.isArray(votes) ? votes : [];

  if (players.length <= 0) return;

  const votedUidSet = new Set(voteList.map((vote) => vote.uid));
  const allPlayerUids = players.map((player) => player.uid);

  const allVoted = allPlayerUids.every((uid) => votedUidSet.has(uid));

  if (allVoted && voteList.length >= players.length) {
    showSyncedResultScreen(voteList);
  }
}

function showVoteScreen() {
  hasVoted = false;
  resultShown = false;

  const voteList = $("vote-list");
  if (!voteList) return;

  voteList.innerHTML = "";

  const oldStatus = $("vote-status-box");
  if (oldStatus) oldStatus.remove();

  const players = getValidVotingPlayers();

  if (players.length <= 0) {
    voteList.innerHTML = `
      <p class="note">
        投票できる参加者情報がまだ読み込まれていません。少し待ってください。
      </p>
    `;

    showScreen("vote-screen");
    startVoteListener();
    return;
  }

  const myUid = getMyUidSafe();

  players.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-btn vote-btn";

    const isMe = player.uid === myUid;

    if (isMe) {
      button.textContent = `${player.name || "名無し"}（自分）`;
    } else {
      button.textContent = player.name || "名無し";
    }

    button.addEventListener("click", async () => {
      await handleVote(player);
    });

    voteList.appendChild(button);
  });

  showScreen("vote-screen");
  startVoteListener();
  renderVoteWaiting(latestVotes);
}

async function handleVote(votedPlayer) {
  try {
    if (!currentRoomId) {
      alert("部屋情報がありません。");
      return;
    }

    if (!votedPlayer || !votedPlayer.uid) {
      alert("投票先が不正です。");
      return;
    }

    if (hasVoted) {
      alert("すでに投票済みです。");
      return;
    }

    const GameDB = requireGameDB();

    await GameDB.saveVote(currentRoomId, votedPlayer);

    hasVoted = true;
    updateVoteButtonsDisabled();

    renderVoteWaiting(latestVotes);
  } catch (error) {
    console.error("投票失敗:", error);
    alert(
      "投票に失敗しました。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
}

function buildVoteResult(votes) {
  const players = getValidVotingPlayers();

  const resultMap = {};

  players.forEach((player) => {
    resultMap[player.uid] = {
      uid: player.uid,
      name: player.name || "名無し",
      count: 0,
      voters: []
    };
  });

  votes.forEach((vote) => {
    const votedUid = vote.votedUid;

    if (!resultMap[votedUid]) {
      resultMap[votedUid] = {
        uid: votedUid,
        name: vote.votedName || "名無し",
        count: 0,
        voters: []
      };
    }

    resultMap[votedUid].count += 1;
    resultMap[votedUid].voters.push(vote.name || "名無し");
  });

  const results = Object.values(resultMap);

  results.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, "ja");
  });

  const maxCount = results.length > 0 ? results[0].count : 0;
  const topPlayers = results.filter((result) => result.count === maxCount && maxCount > 0);

  return {
    results,
    topPlayers,
    maxCount
  };
}

function showSyncedResultScreen(votes) {
  if (resultShown) return;

  resultShown = true;

  if (voteUnsubscribe) {
    try {
      voteUnsubscribe();
    } catch (error) {
      console.warn("投票リスナー停止失敗:", error);
    }
    voteUnsubscribe = null;
  }

  const resultDisplay = $("result-display");

  const voteResult = buildVoteResult(votes || []);
  const results = voteResult.results;
  const topPlayers = voteResult.topPlayers;

  let topText = "";

  if (topPlayers.length === 0) {
    topText = "投票結果を集計できませんでした。";
  } else if (topPlayers.length === 1) {
    topText = `一番疑われた人：${escapeHtml(topPlayers[0].name)}`;
  } else {
    topText = `同票：${topPlayers.map((player) => escapeHtml(player.name)).join("、")}`;
  }

  let resultHtml = `
    <div class="result-message">
      <h3>${topText}</h3>
      <p>全員の投票が完了しました。</p>
    </div>

    <div class="vote-result-list">
  `;

  results.forEach((result) => {
    const votersText = result.voters.length > 0
      ? result.voters.map((name) => escapeHtml(name)).join("、")
      : "なし";

    resultHtml += `
      <div class="vote-result-item">
        <div class="vote-result-main">
          <strong>${escapeHtml(result.name)}</strong>
          <span>${result.count}票</span>
        </div>
        <p>投票した人：${votersText}</p>
      </div>
    `;
  });

  resultHtml += `
    </div>

    <p class="note">
      ※v617では投票同期まで対応しました。ニセ絵師の正解判定は次の段階で追加します。
    </p>
  `;

  if (resultDisplay) {
    resultDisplay.innerHTML = resultHtml;
  }

  showScreen("result-screen");
}


// ==============================
// トップへ戻る
// ==============================
function backToTop() {
  cancelAnimationFrame(timerAnimationId);
  cancelAnimationFrame(reviewTimerAnimationId);

  if (reviewGalleryUnsubscribe) {
    try {
      reviewGalleryUnsubscribe();
    } catch (error) {
      console.warn(error);
    }
    reviewGalleryUnsubscribe = null;
  }

  if (voteUnsubscribe) {
    try {
      voteUnsubscribe();
    } catch (error) {
      console.warn(error);
    }
    voteUnsubscribe = null;
  }

  if (window.GameDB && window.GameDB.stopListeners) {
    window.GameDB.stopListeners();
  }

  currentRoomId = null;
  playerName = null;
  currentTopic = null;
  currentPlayers = [];
  currentRoomData = null;
  pendingAction = null;
  onlineTopicHandled = false;

  drawingPhase = 1;
  phaseEnding = false;

  strokes = [];
  currentStroke = null;

  hasVoted = false;
  resultShown = false;
  latestVotes = [];

  const roomInput = $("room-id-input");
  if (roomInput) roomInput.value = "";

  const nameInput = $("player-name-input");
  if (nameInput) nameInput.value = "";

  showScreen("top-screen");
}


// ==============================
// イベント設定
// ==============================
function setupEvents() {
  const createBtn = $("create-room-btn");
  if (createBtn) {
    createBtn.addEventListener("click", createRoomFlow);
  }

  const joinBtn = $("join-room-btn");
  if (joinBtn) {
    joinBtn.addEventListener("click", joinRoomFlow);
  }

  const enterBtn = $("enter-room-btn");
  if (enterBtn) {
    enterBtn.addEventListener("click", enterRoomFlow);
  }

  const goDrawingBtn = $("go-drawing-btn");
  if (goDrawingBtn) {
    goDrawingBtn.addEventListener("click", () => {
      startFirstDrawing();
    });
  }

  const finishDrawingBtn = $("finish-drawing-btn");
  if (finishDrawingBtn) {
    finishDrawingBtn.addEventListener("click", () => {
      forceFinishCurrentDrawingPhase();
    });
  }

  const readyBtn = $("ready-btn");
  if (readyBtn) {
    readyBtn.addEventListener("click", async () => {
      try {
        if (!currentRoomId) {
          alert("部屋情報がありません。");
          return;
        }

        if (isCurrentUserHost()) {
          alert("ホストは準備OKを押す必要はありません。");
          updateLobbyControlButtons();
          return;
        }

        const GameDB = requireGameDB();

        const myUid = getMyUidSafe();
        const me = currentPlayers.find((player) => player.uid === myUid);
        const nextReady = !(me && me.ready);

        await GameDB.setReady(currentRoomId, nextReady);

        updateLobbyControlButtons();
      } catch (error) {
        console.error("準備OK失敗:", error);
        alert(
          "準備OKの更新に失敗しました。\n\n" +
          "code: " + (error.code || "なし") + "\n" +
          "message: " + (error.message || error)
        );
      }
    });
  }

  const startGameBtn = $("start-game-btn");
  if (startGameBtn) {
    startGameBtn.addEventListener("click", async () => {
      try {
        if (!currentRoomId) {
          alert("部屋情報がありません。");
          return;
        }

        if (!isCurrentUserHost()) {
          alert("ゲームを開始できるのはホストだけです。");
          return;
        }

        if (currentPlayers.length < 2) {
          alert("2人以上で開始できます。");
          return;
        }

        if (!areAllGuestsReady()) {
          alert("ホスト以外の全員が準備OKを押すまで開始できません。");
          return;
        }

        const GameDB = requireGameDB();

        const topic = pickRandomTopic();

        if (!topic) {
          alert("お題の取得に失敗しました。topics.jsを確認してください。");
          return;
        }

        currentTopic = topic;
        hasVoted = false;
        resultShown = false;
        latestVotes = [];

        await GameDB.startOnlineGame(currentRoomId, topic);
      } catch (error) {
        console.error("ゲーム開始失敗:", error);
        alert(
          "ゲーム開始に失敗しました。\n\n" +
          "code: " + (error.code || "なし") + "\n" +
          "message: " + (error.message || error)
        );
      }
    });
  }

  const backTopBtn = $("back-top-btn");
  if (backTopBtn) {
    backTopBtn.addEventListener("click", backToTop);
  }
}


// ==============================
// 初期化
// ==============================
function initApp() {
  initCanvas();
  setupCanvasEvents();
  setupDrawingTools();
  setupEvents();

  showScreen("top-screen");

  setTimeout(() => {
    updateLobbyControlButtons();
  }, 300);

  console.log("app.js v617 initialized");
}

document.addEventListener("DOMContentLoaded", initApp);
