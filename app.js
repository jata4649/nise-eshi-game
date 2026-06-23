console.log("app.js version 622 loaded");

// ==============================
// v622 バージョン表示
// ==============================
function showVersionBadge() {
  const oldBadge = document.getElementById("version-badge");
  if (oldBadge) oldBadge.remove();

  const badge = document.createElement("div");
  badge.id = "version-badge";
  badge.textContent = "v622";
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
      url.searchParams.set("v", "622");
      url.searchParams.set("reload", Date.now().toString());
      window.location.href = url.toString();
    } catch (error) {
      console.error("最新版更新失敗:", error);

      const url = new URL(window.location.href);
      url.searchParams.set("v", "622");
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

let myAssignment = null;
let isFakeArtist = false;

let currentPlayers = [];
let currentRoomData = null;

let pendingAction = null;

let drawingPhase = 1;
let phaseEnding = false;

let timerAnimationId = null;
let reviewTimerAnimationId = null;
let syncedTimerAnimationId = null;
let hostPhaseTimerId = null;

let midImageDataUrl = null;
let finalImageDataUrl = null;

let reviewGalleryUnsubscribe = null;
let voteUnsubscribe = null;

let hasVoted = false;
let resultShown = false;
let latestVotes = [];

let lastHandledPhaseKey = null;
let lastScheduledHostPhaseKey = null;
let currentVoteRound = "main";
let processedVoteRounds = new Set();

let savedDrawingPhaseMap = {
  mid: false,
  final: false
};

const TOPIC_SECONDS = 5;
const FIRST_DRAW_SECONDS = 15;
const SECOND_DRAW_SECONDS = 25;
const MID_DISCUSSION_SECONDS = 60;
const FINAL_DISCUSSION_SECONDS = 60;
const RUNOFF_DISCUSSION_SECONDS = 60;
const RUNOFF_LIMIT = 2;
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
  if (target) target.classList.add("active");

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
      "1. firebase.js が v622 で読み込まれているか\n" +
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
  if (guestPlayers.length <= 0) return false;
  return guestPlayers.every((player) => player.ready === true);
}

function canHostStartGame() {
  if (!isCurrentUserHost()) return false;
  if (currentPlayers.length < 2) return false;
  return areAllGuestsReady();
}

function getPlayerByUid(uid) {
  return currentPlayers.find((player) => player.uid === uid) || null;
}

function topicToText(topic) {
  return getTopicTextFromAny(topic) || "？？？";
}

function getTopicTextFromAny(topic) {
  if (topic == null) return null;

  if (typeof topic === "string") return topic;

  if (typeof topic === "number" || typeof topic === "boolean") {
    return String(topic);
  }

  if (Array.isArray(topic)) {
    if (topic.length === 0) return null;
    return getTopicTextFromAny(topic[0]);
  }

  if (typeof topic === "object") {
    const keys = [
      "word",
      "topic",
      "name",
      "normal",
      "normalTopic",
      "fake",
      "fakeTopic",
      "main",
      "citizen",
      "answer",
      "text",
      "title",
      "label",
      "value"
    ];

    for (const key of keys) {
      if (topic[key] != null) {
        const text = getTopicTextFromAny(topic[key]);
        if (text && text !== "[object Object]") {
          return text;
        }
      }
    }

    const values = Object.values(topic);
    for (const value of values) {
      const text = getTopicTextFromAny(value);
      if (text && text !== "[object Object]") {
        return text;
      }
    }
  }

  const fallback = String(topic);

  if (fallback === "[object Object]") {
    return null;
  }

  return fallback;
}

function getTopicsArray() {
  if (Array.isArray(window.TOPICS) && window.TOPICS.length > 0) {
    return window.TOPICS;
  }

  if (typeof TOPICS !== "undefined" && Array.isArray(TOPICS) && TOPICS.length > 0) {
    return TOPICS;
  }

  return [];
}


// ==============================
// お題ペア v621 大量追加
// ==============================
function pickTopicPair() {
  const DEFAULT_TOPIC_PAIRS = [
    { normalTopic: "猫", fakeTopic: "虎" },
    { normalTopic: "犬", fakeTopic: "狼" },
    { normalTopic: "りんご", fakeTopic: "トマト" },
    { normalTopic: "バナナ", fakeTopic: "とうもろこし" },
    { normalTopic: "車", fakeTopic: "バス" },
    { normalTopic: "電車", fakeTopic: "新幹線" },
    { normalTopic: "飛行機", fakeTopic: "鳥" },
    { normalTopic: "魚", fakeTopic: "イルカ" },
    { normalTopic: "カレー", fakeTopic: "シチュー" },
    { normalTopic: "ラーメン", fakeTopic: "うどん" },
    { normalTopic: "寿司", fakeTopic: "おにぎり" },
    { normalTopic: "ケーキ", fakeTopic: "プリン" },
    { normalTopic: "サッカー", fakeTopic: "バスケ" },
    { normalTopic: "野球", fakeTopic: "テニス" },
    { normalTopic: "学校", fakeTopic: "病院" },
    { normalTopic: "家", fakeTopic: "城" },
    { normalTopic: "スマホ", fakeTopic: "テレビ" },
    { normalTopic: "時計", fakeTopic: "コンパス" },
    { normalTopic: "太陽", fakeTopic: "月" },
    { normalTopic: "雪だるま", fakeTopic: "ロボット" },

    { normalTopic: "うさぎ", fakeTopic: "カンガルー" },
    { normalTopic: "パンダ", fakeTopic: "シロクマ" },
    { normalTopic: "ライオン", fakeTopic: "チーター" },
    { normalTopic: "ゾウ", fakeTopic: "マンモス" },
    { normalTopic: "キリン", fakeTopic: "首長竜" },
    { normalTopic: "ペンギン", fakeTopic: "アヒル" },
    { normalTopic: "ニワトリ", fakeTopic: "孔雀" },
    { normalTopic: "カエル", fakeTopic: "トカゲ" },
    { normalTopic: "カメ", fakeTopic: "恐竜" },
    { normalTopic: "サメ", fakeTopic: "クジラ" },

    { normalTopic: "いちご", fakeTopic: "さくらんぼ" },
    { normalTopic: "みかん", fakeTopic: "レモン" },
    { normalTopic: "ぶどう", fakeTopic: "ブルーベリー" },
    { normalTopic: "スイカ", fakeTopic: "メロン" },
    { normalTopic: "もも", fakeTopic: "りんご" },
    { normalTopic: "なし", fakeTopic: "りんご" },
    { normalTopic: "パイナップル", fakeTopic: "サボテン" },
    { normalTopic: "にんじん", fakeTopic: "大根" },
    { normalTopic: "じゃがいも", fakeTopic: "さつまいも" },
    { normalTopic: "きゅうり", fakeTopic: "ナス" },

    { normalTopic: "ハンバーガー", fakeTopic: "サンドイッチ" },
    { normalTopic: "ピザ", fakeTopic: "お好み焼き" },
    { normalTopic: "たこ焼き", fakeTopic: "団子" },
    { normalTopic: "焼きそば", fakeTopic: "スパゲッティ" },
    { normalTopic: "ドーナツ", fakeTopic: "ベーグル" },
    { normalTopic: "アイス", fakeTopic: "かき氷" },
    { normalTopic: "チョコ", fakeTopic: "クッキー" },
    { normalTopic: "パン", fakeTopic: "クロワッサン" },
    { normalTopic: "目玉焼き", fakeTopic: "オムレツ" },
    { normalTopic: "牛乳", fakeTopic: "ヨーグルト" },

    { normalTopic: "自転車", fakeTopic: "バイク" },
    { normalTopic: "船", fakeTopic: "潜水艦" },
    { normalTopic: "ヘリコプター", fakeTopic: "ドローン" },
    { normalTopic: "トラック", fakeTopic: "消防車" },
    { normalTopic: "パトカー", fakeTopic: "救急車" },
    { normalTopic: "タクシー", fakeTopic: "リムジン" },
    { normalTopic: "ロケット", fakeTopic: "ミサイル" },
    { normalTopic: "気球", fakeTopic: "パラシュート" },
    { normalTopic: "スケボー", fakeTopic: "スキー" },
    { normalTopic: "ローラースケート", fakeTopic: "スケート靴" },

    { normalTopic: "鉛筆", fakeTopic: "ペン" },
    { normalTopic: "消しゴム", fakeTopic: "石けん" },
    { normalTopic: "はさみ", fakeTopic: "カニ" },
    { normalTopic: "傘", fakeTopic: "きのこ" },
    { normalTopic: "靴", fakeTopic: "スリッパ" },
    { normalTopic: "帽子", fakeTopic: "ヘルメット" },
    { normalTopic: "メガネ", fakeTopic: "双眼鏡" },
    { normalTopic: "カバン", fakeTopic: "ランドセル" },
    { normalTopic: "鍵", fakeTopic: "スプーン" },
    { normalTopic: "マイク", fakeTopic: "懐中電灯" },

    { normalTopic: "富士山", fakeTopic: "ピラミッド" },
    { normalTopic: "海", fakeTopic: "プール" },
    { normalTopic: "川", fakeTopic: "道路" },
    { normalTopic: "森", fakeTopic: "公園" },
    { normalTopic: "砂漠", fakeTopic: "ビーチ" },
    { normalTopic: "火山", fakeTopic: "山" },
    { normalTopic: "滝", fakeTopic: "シャワー" },
    { normalTopic: "雲", fakeTopic: "綿あめ" },
    { normalTopic: "雨", fakeTopic: "涙" },
    { normalTopic: "虹", fakeTopic: "橋" },

    { normalTopic: "警察官", fakeTopic: "探偵" },
    { normalTopic: "医者", fakeTopic: "科学者" },
    { normalTopic: "先生", fakeTopic: "店員" },
    { normalTopic: "忍者", fakeTopic: "侍" },
    { normalTopic: "魔法使い", fakeTopic: "魔女" },
    { normalTopic: "宇宙飛行士", fakeTopic: "ロボット" },
    { normalTopic: "王様", fakeTopic: "サンタ" },
    { normalTopic: "海賊", fakeTopic: "船長" },
    { normalTopic: "シェフ", fakeTopic: "寿司職人" },
    { normalTopic: "アイドル", fakeTopic: "ダンサー" },

    { normalTopic: "ピアノ", fakeTopic: "オルガン" },
    { normalTopic: "ギター", fakeTopic: "バイオリン" },
    { normalTopic: "太鼓", fakeTopic: "ドラム" },
    { normalTopic: "笛", fakeTopic: "ラッパ" },
    { normalTopic: "テレビ", fakeTopic: "映画館" },
    { normalTopic: "本", fakeTopic: "ノート" },
    { normalTopic: "ゲーム機", fakeTopic: "リモコン" },
    { normalTopic: "カメラ", fakeTopic: "スマホ" },
    { normalTopic: "パソコン", fakeTopic: "レジ" },
    { normalTopic: "イヤホン", fakeTopic: "聴診器" },

    { normalTopic: "ハート", fakeTopic: "桃" },
    { normalTopic: "星", fakeTopic: "ヒトデ" },
    { normalTopic: "丸", fakeTopic: "ボール" },
    { normalTopic: "四角", fakeTopic: "テレビ" },
    { normalTopic: "三角", fakeTopic: "おにぎり" },
    { normalTopic: "リボン", fakeTopic: "蝶々" },
    { normalTopic: "花", fakeTopic: "風車" },
    { normalTopic: "木", fakeTopic: "ブロッコリー" },
    { normalTopic: "葉っぱ", fakeTopic: "羽" },
    { normalTopic: "炎", fakeTopic: "唐辛子" },

    { normalTopic: "おばけ", fakeTopic: "クラゲ" },
    { normalTopic: "ドラゴン", fakeTopic: "恐竜" },
    { normalTopic: "ユニコーン", fakeTopic: "馬" },
    { normalTopic: "天使", fakeTopic: "妖精" },
    { normalTopic: "悪魔", fakeTopic: "コウモリ" },
    { normalTopic: "ゾンビ", fakeTopic: "ミイラ" },
    { normalTopic: "吸血鬼", fakeTopic: "魔法使い" },
    { normalTopic: "人魚", fakeTopic: "魚" },
    { normalTopic: "サンタ", fakeTopic: "雪だるま" },
    { normalTopic: "鬼", fakeTopic: "レスラー" }
  ];

  try {
    const topics = getTopicsArray();

    if (topics.length > 0) {
      const pairCandidates = topics
        .map((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

          const normalCandidate =
            raw.normal ??
            raw.normalTopic ??
            raw.citizen ??
            raw.main ??
            raw.word ??
            raw.topic ??
            raw.name ??
            raw.answer;

          const fakeCandidate =
            raw.fake ??
            raw.fakeTopic ??
            raw.fake_word ??
            raw.fakeWord ??
            raw.nise ??
            raw.fakeArtist;

          const normalText = getTopicTextFromAny(normalCandidate);
          const fakeText = getTopicTextFromAny(fakeCandidate);

          if (
            normalText &&
            fakeText &&
            normalText !== "[object Object]" &&
            fakeText !== "[object Object]" &&
            normalText !== fakeText
          ) {
            return {
              normalTopic: normalText,
              fakeTopic: fakeText
            };
          }

          return null;
        })
        .filter(Boolean);

      if (pairCandidates.length > 0) {
        return pairCandidates[Math.floor(Math.random() * pairCandidates.length)];
      }
    }
  } catch (error) {
    console.error("topics.jsのお題ペア取得失敗:", error);
  }

  return DEFAULT_TOPIC_PAIRS[Math.floor(Math.random() * DEFAULT_TOPIC_PAIRS.length)];
}

function pickFakePlayer(players) {
  const validPlayers = (players || []).filter((player) => player && player.uid);
  if (validPlayers.length <= 0) return null;
  return validPlayers[Math.floor(Math.random() * validPlayers.length)];
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
      startBtn.textContent = canStart ? "ゲーム開始" : "全員の準備待ち";
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
// 同期タイマー
// ==============================
function cancelSyncedTimer() {
  cancelAnimationFrame(syncedTimerAnimationId);
  syncedTimerAnimationId = null;
}

function getPhaseEndMs(room) {
  const start = Number(room.phaseStartAtMs || Date.now());
  const duration = Number(room.phaseDurationSec || 0) * 1000;
  return start + duration;
}

function startSyncedCountdown(room, displayId, progressId, onEnd) {
  cancelSyncedTimer();

  const display = $(displayId);
  const progress = $(progressId);

  let ended = false;

  function tick() {
    const now = Date.now();
    const startMs = Number(room.phaseStartAtMs || now);
    const durationMs = Number(room.phaseDurationSec || 0) * 1000;
    const endMs = startMs + durationMs;

    const remainMs = Math.max(0, endMs - now);
    const remainSec = Math.ceil(remainMs / 1000);

    if (display) display.textContent = String(remainSec);

    if (progress) {
      const ratio = durationMs > 0
        ? Math.max(0, Math.min(1, remainMs / durationMs))
        : 0;

      progress.style.width = `${ratio * 100}%`;
    }

    if (remainMs <= 0) {
      if (!ended) {
        ended = true;
        if (typeof onEnd === "function") onEnd();
      }
      return;
    }

    syncedTimerAnimationId = requestAnimationFrame(tick);
  }

  tick();
}

function clearHostPhaseTimer() {
  if (hostPhaseTimerId) {
    clearTimeout(hostPhaseTimerId);
    hostPhaseTimerId = null;
  }
}

function scheduleHostPhaseAdvance(room) {
  if (!isCurrentUserHost()) return;
  if (!room || room.status !== "playing") return;

  const phase = room.phase || "lobby";

  if (
    phase === "voting" ||
    phase === "runoffVoting" ||
    phase === "result" ||
    phase === "finished" ||
    phase === "lobby"
  ) {
    return;
  }

  const key = `${room.gameId || "nogame"}_${phase}_${room.phaseStartAtMs || "nostart"}_${room.voteRound || "main"}_${room.runoffRound || 0}`;

  if (lastScheduledHostPhaseKey === key) return;
  lastScheduledHostPhaseKey = key;

  clearHostPhaseTimer();

  const endMs = getPhaseEndMs(room);
  const delay = Math.max(0, endMs - Date.now() + 500);

  hostPhaseTimerId = setTimeout(async () => {
    try {
      await advancePhaseAsHost(room);
    } catch (error) {
      console.error("フェーズ進行失敗:", error);
    }
  }, delay);

  console.log("ホストフェーズ進行予約:", phase, delay);
}

async function advancePhaseAsHost(room) {
  if (!isCurrentUserHost()) return;
  if (!currentRoomId) return;

  const GameDB = requireGameDB();
  const phase = room.phase || "lobby";

  if (phase === "topic") {
    await GameDB.updateRoomPhase(currentRoomId, "drawing1", FIRST_DRAW_SECONDS);
    return;
  }

  if (phase === "drawing1") {
    await GameDB.updateRoomPhase(currentRoomId, "midReview", MID_DISCUSSION_SECONDS);
    return;
  }

  if (phase === "midReview") {
    await GameDB.updateRoomPhase(currentRoomId, "drawing2", SECOND_DRAW_SECONDS);
    return;
  }

  if (phase === "drawing2") {
    await GameDB.updateRoomPhase(currentRoomId, "finalReview", FINAL_DISCUSSION_SECONDS);
    return;
  }

  if (phase === "finalReview") {
    await GameDB.updateRoomPhase(currentRoomId, "voting", 0, {
      voteRound: "main"
    });
    return;
  }

  if (phase === "runoffDiscussion") {
    const round = room.voteRound || `runoff_${room.runoffRound || 1}`;

    await GameDB.updateRoomPhase(currentRoomId, "runoffVoting", 0, {
      voteRound: round,
      runoffRound: room.runoffRound || 1,
      runoffCandidates: room.runoffCandidates || []
    });
  }
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

    if (
      currentRoomData &&
      (currentRoomData.phase === "voting" || currentRoomData.phase === "runoffVoting") &&
      latestVotes.length > 0
    ) {
      checkAllVotesAndDecide(latestVotes);
    }
  });

  GameDB.listenRoom(currentRoomId, async (room) => {
    currentRoomData = room || null;
    updateLobbyControlButtons();

    if (!room) return;

    if (room.phase === "lobby" || room.status === "lobby") {
      if (resultShown || lastHandledPhaseKey) {
        resetLocalRoundStateForLobby();
        showScreen("lobby-screen");
        updateLobbyControlButtons();
      }
      return;
    }

    scheduleHostPhaseAdvance(room);
    await handleRoomPhase(room);
  });
}

async function handleRoomPhase(room) {
  const phase = room.phase || "lobby";
  const key = `${room.gameId || "nogame"}_${phase}_${room.phaseStartAtMs || "nostart"}_${room.voteRound || "main"}_${room.runoffRound || 0}`;

  if (lastHandledPhaseKey === key) return;
  lastHandledPhaseKey = key;

  console.log("phase処理:", key, room);

  if (phase === "topic") {
    await handleTopicPhase(room);
    return;
  }

  if (phase === "drawing1") {
    startFirstDrawingSynced(room);
    return;
  }

  if (phase === "midReview") {
    await saveCurrentDrawingPhaseOnce("mid");
    showMidReviewSynced(room);
    return;
  }

  if (phase === "drawing2") {
    startSecondDrawingSynced(room);
    return;
  }

  if (phase === "finalReview") {
    await saveCurrentDrawingPhaseOnce("final");
    showFinalReviewSynced(room);
    return;
  }

  if (phase === "voting") {
    showVoteScreen("main", null);
    return;
  }

  if (phase === "runoffDiscussion") {
    showRunoffDiscussionScreen(room);
    return;
  }

  if (phase === "runoffVoting") {
    showVoteScreen(room.voteRound || `runoff_${room.runoffRound || 1}`, room.runoffCandidates || []);
    return;
  }

  if (phase === "result") {
    showSyncedResultScreen(room.resultData || null);
    return;
  }

  if (phase === "finished") {
    if (!resultShown && room.resultData) {
      showSyncedResultScreen(room.resultData);
    }
  }
}

async function handleTopicPhase(room) {
  try {
    const GameDB = requireGameDB();

    myAssignment = await GameDB.getMyAssignment(currentRoomId);

    isFakeArtist = myAssignment.role === "fake" || myAssignment.isFake === true;
    currentTopic = myAssignment.topic || "？？？";

    showTopicScreen(currentTopic, room);
  } catch (error) {
    console.error("自分のお題取得失敗:", error);
    alert(
      "自分のお題の取得に失敗しました。\n\n" +
      "少し待ってから最新版に更新してください。\n\n" +
      "code: " + (error.code || "なし") + "\n" +
      "message: " + (error.message || error)
    );
  }
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

    resetLocalRoundStateForLobby();

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
function ensurePhaseSyncBox(screenSelector, insertAfterElement) {
  let box = $("phase-sync-box");

  if (box) {
    box.remove();
  }

  box = document.createElement("div");
  box.id = "phase-sync-box";
  box.className = "phase-sync-box";

  box.innerHTML = `
    <div class="phase-sync-label">同期タイマー</div>
    <div class="phase-sync-time"><span id="phase-sync-time">0</span>秒</div>
    <div class="phase-sync-bar">
      <div id="phase-sync-progress" class="phase-sync-progress"></div>
    </div>
  `;

  if (insertAfterElement) {
    insertAfterElement.insertAdjacentElement("afterend", box);
    return box;
  }

  const parent = document.querySelector(screenSelector);
  if (parent) parent.appendChild(box);

  return box;
}

function showTopicScreen(topic, room) {
  currentTopic = topic;

  const display = $("topic-display");
  if (display) {
    display.textContent = topicToText(topic);
  }

  let roleBox = $("role-display-box");

  if (!roleBox) {
    const topicCard = document.querySelector("#topic-screen .topic-card");
    roleBox = document.createElement("div");
    roleBox.id = "role-display-box";
    roleBox.className = "role-display-box";

    if (topicCard) {
      if (display) {
        display.insertAdjacentElement("afterend", roleBox);
      } else {
        topicCard.appendChild(roleBox);
      }
    }
  }

  if (roleBox) {
    if (isFakeArtist) {
      roleBox.innerHTML = `
        <strong>あなたはニセ絵師です</strong>
        <p>他の人と少し違うお題です。バレないように描こう。</p>
      `;
      roleBox.classList.add("fake-role");
    } else {
      roleBox.innerHTML = `
        <strong>あなたは市民絵師です</strong>
        <p>みんなと同じお題です。ニセ絵師を探そう。</p>
      `;
      roleBox.classList.remove("fake-role");
    }
  }

  const badge = $("drawing-topic-badge");
  if (badge) {
    badge.textContent = "お題：" + topicToText(topic);
  }

  ensurePhaseSyncBox("#topic-screen", roleBox || display);

  showScreen("topic-screen");

  if (room) {
    startSyncedCountdown(room, "phase-sync-time", "phase-sync-progress");
  }
}


// ==============================
// キャンバス
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
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
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
  if (phaseEnding) return;

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
  if (phaseEnding) return;

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
      if (phaseEnding) return;
      strokes.pop();
      redrawCanvas();
    });
  }

  const clearBtn = $("clear-canvas-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (phaseEnding) return;
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
// 描画フェーズ v621 同期
// ==============================
function startFirstDrawingSynced(room) {
  drawingPhase = 1;
  phaseEnding = false;
  savedDrawingPhaseMap.mid = false;

  strokes = [];
  currentStroke = null;

  initCanvas();

  const phaseLabel = $("drawing-phase-label");
  if (phaseLabel) phaseLabel.textContent = "前半お絵描き";

  const title = $("drawing-title");
  if (title) title.textContent = "まずは15秒で描こう";

  const help = $("drawing-help");
  if (help) help.textContent = "全員同時にタイマーが進みます。描きすぎ注意！";

  const topicBadge = $("drawing-topic-badge");
  if (topicBadge) topicBadge.textContent = "お題：" + topicToText(currentTopic);

  const finishBtn = $("finish-drawing-btn");
  if (finishBtn) {
    finishBtn.disabled = false;
    finishBtn.textContent = "ここまで保存";
  }

  showScreen("drawing-screen");

  startSyncedCountdown(room, "timer-display", "timer-progress", async () => {
    await saveCurrentDrawingPhaseOnce("mid");
  });
}

function startSecondDrawingSynced(room) {
  drawingPhase = 2;
  phaseEnding = false;
  savedDrawingPhaseMap.final = false;

  const phaseLabel = $("drawing-phase-label");
  if (phaseLabel) phaseLabel.textContent = "後半お絵描き";

  const title = $("drawing-title");
  if (title) title.textContent = "あと25秒で仕上げよう";

  const help = $("drawing-help");
  if (help) help.textContent = "途中討論をヒントに、続きを描きましょう。";

  const topicBadge = $("drawing-topic-badge");
  if (topicBadge) topicBadge.textContent = "お題：" + topicToText(currentTopic);

  const finishBtn = $("finish-drawing-btn");
  if (finishBtn) {
    finishBtn.disabled = false;
    finishBtn.textContent = "完成を保存";
  }

  showScreen("drawing-screen");

  startSyncedCountdown(room, "timer-display", "timer-progress", async () => {
    await saveCurrentDrawingPhaseOnce("final");
  });
}

async function saveCurrentDrawingPhaseOnce(phase) {
  try {
    if (phase === "mid" && savedDrawingPhaseMap.mid) return;
    if (phase === "final" && savedDrawingPhaseMap.final) return;

    phaseEnding = true;
    isDrawing = false;

    const finishBtn = $("finish-drawing-btn");
    if (finishBtn) {
      finishBtn.disabled = true;
      finishBtn.textContent = "保存済み";
    }

    const image = getCanvasImage();

    if (phase === "mid") {
      midImageDataUrl = image;
      savedDrawingPhaseMap.mid = true;
    } else {
      finalImageDataUrl = image;
      savedDrawingPhaseMap.final = true;
    }

    await saveDrawingOnline(phase, image);
  } catch (error) {
    console.error("描画保存失敗:", error);
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
function ensureVoteGalleryBox() {
  let box = $("vote-gallery-box");
  if (box) return box;

  const voteList = $("vote-list");
  if (!voteList) return null;

  box = document.createElement("div");
  box.id = "vote-gallery-box";
  box.className = "vote-gallery-box";

  voteList.insertAdjacentElement("afterend", box);

  return box;
}

function renderVoteGallery(drawings) {
  const box = ensureVoteGalleryBox();
  if (!box) return;

  const list = Array.isArray(drawings) ? drawings : [];

  let html = `
    <div class="vote-gallery-title">完成絵を見返す</div>
  `;

  if (list.length === 0) {
    html += `
      <div class="vote-gallery-empty">
        完成絵を読み込み中...
      </div>
    `;
  } else {
    html += `<div class="vote-gallery-list">`;

    list.forEach((drawing) => {
      html += `
        <div class="vote-gallery-card">
          <div class="vote-gallery-name">${escapeHtml(drawing.name || "名無し")}</div>
          <img class="vote-gallery-image" src="${drawing.image}" alt="${escapeHtml(drawing.name || "名無し")}の完成絵">
        </div>
      `;
    });

    html += `</div>`;
  }

  box.innerHTML = html;
}

function startVoteGalleryListener() {
  const oldBox = $("vote-gallery-box");
  if (oldBox) oldBox.remove();

  if (!currentRoomId) {
    renderVoteGallery([]);
    return;
  }

  if (!window.GameDB || !window.GameDB.listenDrawings) {
    renderVoteGallery([]);
    return;
  }

  try {
    window.GameDB.listenDrawings(currentRoomId, "final", (drawings) => {
      renderVoteGallery(drawings || []);
    });
  } catch (error) {
    console.error("投票画面ギャラリー開始失敗:", error);
    renderVoteGallery([]);
  }
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
// 公開・討論 v621 同期
// ==============================
function showMidReviewSynced(room) {
  const phaseLabel = $("review-phase-label");
  if (phaseLabel) phaseLabel.textContent = "途中公開";

  const title = $("review-title");
  if (title) title.textContent = "途中経過を見せ合おう";

  const description = $("review-description");
  if (description) description.textContent = "全員同時に1分の途中討論です。";

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

  startSyncedCountdown(room, "review-timer-display", "review-progress");
}

function showFinalReviewSynced(room) {
  const phaseLabel = $("review-phase-label");
  if (phaseLabel) phaseLabel.textContent = "最終公開";

  const title = $("review-title");
  if (title) title.textContent = "完成した絵を見せ合おう";

  const description = $("review-description");
  if (description) description.textContent = "全員同時に最後の話し合いです。ニセ絵師を探しましょう。";

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

  startSyncedCountdown(room, "review-timer-display", "review-progress");
}

function showRunoffDiscussionScreen(room) {
  const candidates = Array.isArray(room.runoffCandidates) ? room.runoffCandidates : [];

  const phaseLabel = $("review-phase-label");
  if (phaseLabel) phaseLabel.textContent = "同票再議論";

  const title = $("review-title");
  if (title) title.textContent = "同票です。1分間、再議論しましょう";

  const description = $("review-description");
  if (description) {
    description.innerHTML = `
      最も票が多かった人が複数います。<br>
      この候補者について話し合ってから再投票します。<br>
      <strong>候補：</strong>${candidates.map((p) => escapeHtml(p.name || "名無し")).join("、")}
    `;
  }

  const timerLabel = $("review-timer-label");
  if (timerLabel) timerLabel.textContent = "再議論";

  const image = $("review-image");
  if (image) image.src = finalImageDataUrl || midImageDataUrl || "";

  const name = $("gallery-player-name");
  if (name) name.textContent = "同票候補を話し合おう";

  const nextBtn = $("review-next-btn");
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "自動で再投票へ";
  }

  showScreen("review-screen");
  startDrawingGalleryListener("final", "完成絵", finalImageDataUrl);

  startSyncedCountdown(room, "review-timer-display", "review-progress");
}


// ==============================
// 投票・結果同期 v621
// ==============================
function getValidVotingPlayers() {
  if (Array.isArray(currentPlayers) && currentPlayers.length > 0) {
    return currentPlayers.filter((player) => player && player.uid);
  }

  return [];
}

function getVoteCandidates(candidates) {
  if (Array.isArray(candidates) && candidates.length > 0) {
    return candidates
      .map((candidate) => {
        const player = getPlayerByUid(candidate.uid);
        return player || candidate;
      })
      .filter((candidate) => candidate && candidate.uid);
  }

  return getValidVotingPlayers();
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

  let status = $("vote-status-box");

  if (!status) {
    status = document.createElement("div");
    status.id = "vote-status-box";
    status.className = "vote-status-box";
    voteList.insertAdjacentElement("beforebegin", status);
  }

  const myVote = getMyVote(votes);
  const votedUidSet = new Set((votes || []).map((vote) => vote.uid));

  const notVotedPlayers = players.filter((player) => {
    return player && player.uid && !votedUidSet.has(player.uid);
  });

  const notVotedNames = notVotedPlayers.map((player) => {
    return escapeHtml(player.name || "名無し");
  });

  const roundLabel = currentVoteRound === "main"
    ? "通常投票"
    : `再投票 ${currentRoomData && currentRoomData.runoffRound ? currentRoomData.runoffRound : ""}`;

  let notVotedHtml = "";

  if (notVotedNames.length > 0) {
    notVotedHtml = `
      <div class="not-voted-box">
        <strong>未投票</strong>
        <p>${notVotedNames.join("、")}</p>
      </div>
    `;
  } else {
    notVotedHtml = `
      <div class="not-voted-box all-voted">
        <strong>全員投票済み</strong>
        <p>結果を集計しています...</p>
      </div>
    `;
  }

  if (myVote) {
    hasVoted = true;
    status.innerHTML = `
      <strong>${roundLabel}：投票済み</strong>
      <p>${escapeHtml(myVote.votedName || "名無し")} に投票しました。</p>
      <p>全員の投票を待っています。 ${voteCount} / ${playerCount}</p>
      ${notVotedHtml}
    `;
  } else {
    status.innerHTML = `
      <strong>${roundLabel}：投票してください</strong>
      <p>全員の投票が終わると、自動で次へ進みます。</p>
      <p>現在の投票数：${voteCount} / ${playerCount}</p>
      ${notVotedHtml}
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

function startVoteListener(voteRound) {
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

  const round = voteRound || "main";

  try {
    voteUnsubscribe = window.GameDB.listenVotes(currentRoomId, round, (votes) => {
      latestVotes = votes || [];

      const myVote = getMyVote(latestVotes);
      hasVoted = !!myVote;

      renderVoteWaiting(latestVotes);
      checkAllVotesAndDecide(latestVotes);
    });
  } catch (error) {
    console.error("投票リスナー開始失敗:", error);
  }
}

function showVoteScreen(voteRound, candidates) {
  currentVoteRound = voteRound || "main";
  hasVoted = false;
  resultShown = false;
  latestVotes = [];

  const voteList = $("vote-list");
  if (!voteList) return;

  voteList.innerHTML = "";

  const oldStatus = $("vote-status-box");
  if (oldStatus) oldStatus.remove();

  const title = document.querySelector("#vote-screen h2, #vote-screen .screen-title");
  if (title) {
    title.textContent = currentVoteRound === "main"
      ? "ニセ絵師だと思う人に投票"
      : "同票候補から再投票";
  }

  const voteCandidates = getVoteCandidates(candidates);

  if (voteCandidates.length <= 0) {
    voteList.innerHTML = `
      <p class="note">
        投票できる参加者情報がまだ読み込まれていません。少し待ってください。
      </p>
    `;

    showScreen("vote-screen");
    startVoteListener(currentVoteRound);
    return;
  }

  const myUid = getMyUidSafe();

  voteCandidates.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-btn vote-btn";

    const isMe = player.uid === myUid;

    button.textContent = isMe
      ? `${player.name || "名無し"}（自分）`
      : player.name || "名無し";

    button.addEventListener("click", async () => {
      await handleVote(player);
    });

    voteList.appendChild(button);
  });

  showScreen("vote-screen");
  startVoteListener(currentVoteRound);
  renderVoteWaiting(latestVotes);
  startVoteGalleryListener();
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

    await GameDB.saveVote(currentRoomId, votedPlayer, currentVoteRound);

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

function buildVoteResult(votes, candidateList) {
  const basePlayers = Array.isArray(candidateList) && candidateList.length > 0
    ? candidateList
    : getValidVotingPlayers();

  const resultMap = {};

  basePlayers.forEach((player) => {
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

  return { results, topPlayers, maxCount };
}

function getCurrentRoundCandidates() {
  if (
    currentRoomData &&
    currentRoomData.phase === "runoffVoting" &&
    Array.isArray(currentRoomData.runoffCandidates)
  ) {
    return currentRoomData.runoffCandidates;
  }

  return null;
}

function checkAllVotesAndDecide(votes) {
  if (!currentRoomData) return;
  if (!(currentRoomData.phase === "voting" || currentRoomData.phase === "runoffVoting")) return;

  const players = getValidVotingPlayers();
  const voteList = Array.isArray(votes) ? votes : [];

  if (players.length <= 0) return;

  const votedUidSet = new Set(voteList.map((vote) => vote.uid));
  const allPlayerUids = players.map((player) => player.uid);
  const allVoted = allPlayerUids.every((uid) => votedUidSet.has(uid));

  if (!allVoted || voteList.length < players.length) return;

  if (!isCurrentUserHost()) return;

  const round = currentRoomData.voteRound || currentVoteRound || "main";

  if (processedVoteRounds.has(round)) return;
  processedVoteRounds.add(round);

  decideOutcomeAsHost(voteList, round);
}

async function decideOutcomeAsHost(votes, round) {
  try {
    const GameDB = requireGameDB();

    const candidates = getCurrentRoundCandidates();
    const voteResult = buildVoteResult(votes || [], candidates);

    const topPlayers = voteResult.topPlayers;
    const answer = currentRoomData && currentRoomData.answer ? currentRoomData.answer : null;
    const fakeUid = answer ? answer.fakeUid : null;

    const currentRunoffRound = Number(currentRoomData.runoffRound || 0);

    if (topPlayers.length > 1) {
      if (currentRunoffRound < RUNOFF_LIMIT) {
        const nextRunoffRound = currentRunoffRound + 1;

        const runoffCandidates = topPlayers.map((player) => ({
          uid: player.uid,
          name: player.name || "名無し",
          count: player.count || 0
        }));

        await GameDB.setRunoff(currentRoomId, runoffCandidates, nextRunoffRound);
        return;
      }

      const resultData = {
        voteRound: round,
        results: voteResult.results,
        topPlayers: voteResult.topPlayers,
        maxCount: voteResult.maxCount,
        answer: answer,
        winner: "fake",
        finalTie: true,
        reason: "runoff_limit_tie",
        runoffLimit: RUNOFF_LIMIT,
        createdAtMs: Date.now()
      };

      await GameDB.setResult(currentRoomId, resultData);
      return;
    }

    const votedFake = topPlayers.some((player) => player.uid === fakeUid);
    const winner = votedFake ? "citizen" : "fake";

    const resultData = {
      voteRound: round,
      results: voteResult.results,
      topPlayers: voteResult.topPlayers,
      maxCount: voteResult.maxCount,
      answer: answer,
      winner: winner,
      finalTie: false,
      reason: votedFake ? "fake_found" : "fake_escaped",
      runoffLimit: RUNOFF_LIMIT,
      createdAtMs: Date.now()
    };

    await GameDB.setResult(currentRoomId, resultData);
  } catch (error) {
    console.error("結果判定失敗:", error);
  }
}

function addReplayButtonIfHost() {
  const resultDisplay = $("result-display");
  if (!resultDisplay) return;

  const oldReplay = $("replay-box");
  if (oldReplay) oldReplay.remove();

  if (!isCurrentUserHost()) {
    return;
  }

  const box = document.createElement("div");
  box.id = "replay-box";
  box.className = "replay-box";

  box.innerHTML = `
    <button id="replay-btn" class="primary-btn" type="button">
      もう一度遊ぶ
    </button>
    <p class="note">ホストだけがロビーに戻せます。</p>
  `;

  resultDisplay.appendChild(box);

  const replayBtn = $("replay-btn");

  if (replayBtn) {
    replayBtn.addEventListener("click", async () => {
      try {
        replayBtn.disabled = true;
        replayBtn.textContent = "ロビーに戻しています...";

        const GameDB = requireGameDB();
        await GameDB.resetRoomToLobby(currentRoomId);
      } catch (error) {
        console.error("もう一度遊ぶ失敗:", error);
        alert(
          "もう一度遊ぶに失敗しました。\n\n" +
          "code: " + (error.code || "なし") + "\n" +
          "message: " + (error.message || error)
        );

        replayBtn.disabled = false;
        replayBtn.textContent = "もう一度遊ぶ";
      }
    });
  }
}

async function finishRoomIfHost() {
  try {
    if (!currentRoomId) return;
    if (!isCurrentUserHost()) return;
    if (!window.GameDB || !window.GameDB.finishRoom) return;

    if (currentRoomData && currentRoomData.status === "finished") {
      return;
    }

    await window.GameDB.finishRoom(currentRoomId);
    console.log("部屋をfinishedにしました");
  } catch (error) {
    console.error("finishRoom失敗:", error);
  }
}

function showSyncedResultScreen(resultData) {
  if (resultShown) return;

  resultShown = true;

  cancelSyncedTimer();
  clearHostPhaseTimer();

  if (voteUnsubscribe) {
    try {
      voteUnsubscribe();
    } catch (error) {
      console.warn("投票リスナー停止失敗:", error);
    }

    voteUnsubscribe = null;
  }

  const resultDisplay = $("result-display");

  const data = resultData || {};
  const results = Array.isArray(data.results) ? data.results : [];
  const topPlayers = Array.isArray(data.topPlayers) ? data.topPlayers : [];
  const answer = data.answer || (currentRoomData && currentRoomData.answer ? currentRoomData.answer : null);
  const winner = data.winner || "unknown";
  const finalTie = data.finalTie === true;
  const reason = data.reason || "";

  let topText = "";

  if (topPlayers.length === 0) {
    topText = "投票結果を集計できませんでした。";
  } else if (topPlayers.length === 1) {
    topText = `一番疑われた人：${escapeHtml(topPlayers[0].name || "名無し")}`;
  } else {
    topText = `最終同票：${topPlayers.map((player) => escapeHtml(player.name || "名無し")).join("、")}`;
  }

  let reasonHtml = "";

  if (finalTie || reason === "runoff_limit_tie") {
    reasonHtml = `
      <div class="result-reason-box fake-escape">
        <strong>同票のまま決着！</strong>
        <p>再投票を${escapeHtml(data.runoffLimit || RUNOFF_LIMIT)}回行っても決着しなかったため、ニセ絵師の逃げ切り勝利です。</p>
      </div>
    `;
  } else if (reason === "fake_found") {
    reasonHtml = `
      <div class="result-reason-box citizen-success">
        <strong>ニセ絵師を見つけました！</strong>
        <p>最多票がニセ絵師に集まりました。</p>
      </div>
    `;
  } else if (reason === "fake_escaped") {
    reasonHtml = `
      <div class="result-reason-box fake-escape">
        <strong>ニセ絵師が逃げ切りました！</strong>
        <p>最多票がニセ絵師以外に集まりました。</p>
      </div>
    `;
  }

  let answerHtml = "";

  if (answer) {
    const fakeName = escapeHtml(answer.fakeName || "名無し");
    const normalTopic = escapeHtml(answer.normalTopic || "？？？");
    const fakeTopic = escapeHtml(answer.fakeTopic || "？？？");

    if (winner === "citizen") {
      answerHtml = `
        <div class="answer-box citizen-win">
          <h3>市民絵師チームの勝利！</h3>
          <div class="fake-artist-reveal">
            <span class="fake-artist-label">ニセ絵師</span>
            <strong>${fakeName}</strong>
          </div>
          <p>通常お題：${normalTopic}</p>
          <p>ニセ絵師のお題：${fakeTopic}</p>
        </div>
      `;
    } else if (winner === "fake") {
      answerHtml = `
        <div class="answer-box fake-win">
          <h3>ニセ絵師の勝利！</h3>
          <div class="fake-artist-reveal">
            <span class="fake-artist-label">ニセ絵師</span>
            <strong>${fakeName}</strong>
          </div>
          <p>通常お題：${normalTopic}</p>
          <p>ニセ絵師のお題：${fakeTopic}</p>
        </div>
      `;
    } else {
      answerHtml = `
        <div class="answer-box">
          <h3>正解発表</h3>
          <div class="fake-artist-reveal">
            <span class="fake-artist-label">ニセ絵師</span>
            <strong>${fakeName}</strong>
          </div>
          <p>通常お題：${normalTopic}</p>
          <p>ニセ絵師のお題：${fakeTopic}</p>
        </div>
      `;
    }
  }

  let resultHtml = `
    ${answerHtml}
    ${reasonHtml}

    <div class="result-message">
      <h3>${topText}</h3>
      <p>全員の投票が完了しました。</p>
    </div>

    <div class="vote-result-list">
  `;

  results.forEach((result) => {
    const isFake = answer && result.uid === answer.fakeUid;
    const isTop = topPlayers.some((player) => player.uid === result.uid);

    const votersText = result.voters && result.voters.length > 0
      ? result.voters.map((name) => escapeHtml(name)).join("、")
      : "なし";

    resultHtml += `
      <div class="vote-result-item ${isFake ? "fake-result-highlight" : ""} ${isTop ? "top-voted-highlight" : ""}">
        <div class="vote-result-main">
          <strong>
            ${escapeHtml(result.name || "名無し")}
            ${isFake ? '<span class="fake-badge-inline">ニセ絵師</span>' : ""}
            ${isTop ? '<span class="top-badge-inline">最多票</span>' : ""}
          </strong>
          <span>${result.count || 0}票</span>
        </div>
        <p>投票した人：${votersText}</p>
      </div>
    `;
  });

  resultHtml += `
    </div>
  `;

  if (resultDisplay) {
    resultDisplay.innerHTML = resultHtml;
  }

  showScreen("result-screen");

  addReplayButtonIfHost();
  finishRoomIfHost();
}


// ==============================
// ロビー復帰用リセット
// ==============================
function resetLocalRoundStateForLobby() {
  cancelSyncedTimer();
  clearHostPhaseTimer();

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

  currentTopic = null;
  myAssignment = null;
  isFakeArtist = false;

  drawingPhase = 1;
  phaseEnding = false;

  midImageDataUrl = null;
  finalImageDataUrl = null;

  hasVoted = false;
  resultShown = false;
  latestVotes = [];

  lastHandledPhaseKey = null;
  lastScheduledHostPhaseKey = null;
  currentVoteRound = "main";
  processedVoteRounds = new Set();

  savedDrawingPhaseMap = {
    mid: false,
    final: false
  };

  strokes = [];
  currentStroke = null;
  isDrawing = false;

  const voteList = $("vote-list");
  if (voteList) voteList.innerHTML = "";

  const resultDisplay = $("result-display");
  if (resultDisplay) resultDisplay.innerHTML = "";

  const voteGalleryBox = $("vote-gallery-box");
  if (voteGalleryBox) voteGalleryBox.remove();


  const oldStatus = $("vote-status-box");
  if (oldStatus) oldStatus.remove();

  const oldReplay = $("replay-box");
  if (oldReplay) oldReplay.remove();

  const roleBox = $("role-display-box");
  if (roleBox) roleBox.remove();

  const syncBox = $("phase-sync-box");
  if (syncBox) syncBox.remove();

  const reviewGrid = $("review-gallery-grid");
  if (reviewGrid) reviewGrid.remove();
}


// ==============================
// トップへ戻る
// ==============================
function backToTop() {
  resetLocalRoundStateForLobby();

  if (window.GameDB && window.GameDB.stopListeners) {
    window.GameDB.stopListeners();
  }

  currentRoomId = null;
  playerName = null;
  currentTopic = null;

  myAssignment = null;
  isFakeArtist = false;

  currentPlayers = [];
  currentRoomData = null;
  pendingAction = null;

  drawingPhase = 1;
  phaseEnding = false;

  strokes = [];
  currentStroke = null;
  isDrawing = false;

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
      alert("全員同時に始まるので、自動で開始するまで待ってください。");
    });
  }

  const finishDrawingBtn = $("finish-drawing-btn");
  if (finishDrawingBtn) {
    finishDrawingBtn.addEventListener("click", async () => {
      if (drawingPhase === 1) {
        await saveCurrentDrawingPhaseOnce("mid");
      } else {
        await saveCurrentDrawingPhaseOnce("final");
      }
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

        const topicPair = pickTopicPair();
        const fakePlayer = pickFakePlayer(currentPlayers);

        if (!topicPair || !topicPair.normalTopic || !topicPair.fakeTopic) {
          alert("お題の取得に失敗しました。topics.jsを確認してください。");
          return;
        }

        if (!fakePlayer) {
          alert("ニセ絵師の選択に失敗しました。");
          return;
        }

        resetLocalRoundStateForLobby();

        await GameDB.startOnlineGame(currentRoomId, {
          normalTopic: topicPair.normalTopic,
          fakeTopic: topicPair.fakeTopic,
          fakeUid: fakePlayer.uid,
          fakeName: fakePlayer.name || "名無し"
        });
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

  console.log("app.js v622 initialized");
}

document.addEventListener("DOMContentLoaded", initApp);
