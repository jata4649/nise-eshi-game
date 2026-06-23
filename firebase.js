console.log("firebase.js version 622 loaded");

// ==============================
// Firebase 設定
// ==============================
const firebaseConfig = {
  apiKey: "AIzaSyDcYlfCcJVFwctETjLdHcEaCgXPdSZ-4Uc",
  authDomain: "nise-eshi-game.firebaseapp.com",
  projectId: "nise-eshi-game",
  storageBucket: "nise-eshi-game.firebasestorage.app",
  messagingSenderId: "284787119511",
  appId: "1:284787119511:web:a62be3e2f97f9c0e22a0d2"
};

// ==============================
// Firebase 初期化
// ==============================
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
  } else {
    console.log("Firebase already initialized");
  }
} catch (error) {
  console.error("Firebase初期化エラー:", error);
  alert(
    "Firebase初期化に失敗しました。\n\n" +
    "code: " + (error.code || "なし") + "\n" +
    "message: " + (error.message || error)
  );
}

const auth = firebase.auth();
const db = firebase.firestore();


// ==============================
// リスナー管理
// ==============================
let unsubscribePlayers = null;
let unsubscribeRoom = null;
let unsubscribeDrawings = null;
let unsubscribeVotes = null;


// ==============================
// 共通関数
// ==============================
function normalizeRoomId(roomId) {
  return String(roomId || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function topicValueToText(value) {
  if (value == null) return "？？？";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "？？？";
    return topicValueToText(value[0]);
  }

  if (typeof value === "object") {
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
      if (value[key] != null) {
        const text = topicValueToText(value[key]);
        if (text && text !== "[object Object]") {
          return text;
        }
      }
    }

    const values = Object.values(value);
    for (const item of values) {
      const text = topicValueToText(item);
      if (text && text !== "[object Object]") {
        return text;
      }
    }
  }

  const fallback = String(value);

  if (fallback === "[object Object]") {
    return "？？？";
  }

  return fallback;
}

function getCurrentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

async function signIn() {
  try {
    if (auth.currentUser) {
      console.log("すでにログイン済み:", auth.currentUser.uid);
      return auth.currentUser.uid;
    }

    const result = await auth.signInAnonymously();
    console.log("匿名ログイン成功:", result.user.uid);
    return result.user.uid;
  } catch (error) {
    console.error("匿名ログイン失敗:", error);
    throw error;
  }
}

async function assertHost(roomRef) {
  const uid = await signIn();
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    throw new Error("部屋が存在しません");
  }

  const room = roomSnap.data();

  if (room.hostUid !== uid) {
    throw new Error("この操作ができるのはホストだけです");
  }

  return {
    uid,
    room
  };
}

async function deleteSubcollection(roomRef, collectionName) {
  const snapshot = await roomRef.collection(collectionName).get();

  if (snapshot.empty) {
    console.log(collectionName + " は空です");
    return;
  }

  let batch = db.batch();
  let count = 0;
  let total = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    total++;

    if (count >= 450) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(collectionName + " を削除しました:", total);
}

function createPhaseData(phase, durationSec, extraData) {
  const nowMs = Date.now();
  const startDelayMs = 1200;
  const phaseStartAtMs = nowMs + startDelayMs;

  return {
    phase: phase,
    phaseStartAtMs: phaseStartAtMs,
    phaseDurationSec: durationSec || 0,
    phaseUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...(extraData || {})
  };
}


// ==============================
// 部屋作成
// ==============================
async function createRoom(roomId, playerName) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const playerRef = roomRef.collection("players").doc(uid);

  const roomData = {
    roomId: cleanRoomId,
    hostUid: uid,
    status: "lobby",
    phase: "lobby",
    phaseStartAtMs: null,
    phaseDurationSec: 0,
    topic: null,
    answer: null,
    gameId: null,
    voteRound: "main",
    runoffRound: 0,
    runoffCandidates: null,
    resultData: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const playerData = {
    uid: uid,
    name: playerName || "名無し",
    ready: true,
    isHost: true,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  batch.set(roomRef, roomData, { merge: true });
  batch.set(playerRef, playerData, { merge: true });

  await batch.commit();

  console.log("部屋作成成功:", cleanRoomId);
  return cleanRoomId;
}


// ==============================
// 部屋存在チェック
// ==============================
async function roomExists(roomId) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    return false;
  }

  await signIn();

  for (let i = 0; i < 10; i++) {
    try {
      const snap = await db.collection("rooms").doc(cleanRoomId).get();

      if (snap.exists) {
        console.log("部屋存在確認成功:", cleanRoomId);
        return true;
      }

      console.log("部屋確認リトライ:", i + 1, cleanRoomId);

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error("部屋存在チェック失敗:", error);
      throw error;
    }
  }

  console.warn("部屋が見つかりません:", cleanRoomId);
  return false;
}


// ==============================
// 部屋参加
// ゲーム中・終了済みの部屋には途中参加できない
// ==============================
async function joinRoom(roomId, playerName) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    throw new Error("部屋が存在しません");
  }

  const room = roomSnap.data();
  const status = room.status || "lobby";

  if (status !== "lobby") {
    throw new Error("この部屋はすでにゲーム中、または終了済みです。新しい部屋で参加してください。");
  }

  const playerRef = roomRef.collection("players").doc(uid);

  await playerRef.set(
    {
      uid: uid,
      name: playerName || "名無し",
      ready: false,
      isHost: false,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await roomRef.set(
    {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("部屋参加成功:", cleanRoomId, playerName);
  return cleanRoomId;
}


// ==============================
// 準備OK
// ==============================
async function setReady(roomId, ready) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("players")
    .doc(uid)
    .set(
      {
        ready: ready,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  console.log("準備状態更新:", cleanRoomId, uid, ready);
}


// ==============================
// プレイヤー監視
// ==============================
function listenPlayers(roomId, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  unsubscribePlayers = db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("players")
    .orderBy("joinedAt", "asc")
    .onSnapshot(
      (snapshot) => {
        const players = [];

        snapshot.forEach((doc) => {
          players.push({
            id: doc.id,
            ...doc.data()
          });
        });

        console.log("players更新:", players);
        callback(players);
      },
      (error) => {
        console.error("players監視エラー:", error);
      }
    );

  return unsubscribePlayers;
}


// ==============================
// 部屋監視
// ==============================
function listenRoom(roomId, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  unsubscribeRoom = db
    .collection("rooms")
    .doc(cleanRoomId)
    .onSnapshot(
      (doc) => {
        if (!doc.exists) {
          console.warn("部屋が存在しません:", cleanRoomId);
          callback(null);
          return;
        }

        const room = {
          id: doc.id,
          ...doc.data()
        };

        console.log("room更新:", room);
        callback(room);
      },
      (error) => {
        console.error("room監視エラー:", error);
      }
    );

  return unsubscribeRoom;
}


// ==============================
// 自分のお題・役割を取得
// ==============================
async function getMyAssignment(roomId) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const snap = await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("assignments")
    .doc(uid)
    .get();

  if (!snap.exists) {
    throw new Error("自分のお題がまだ配られていません");
  }

  return {
    id: snap.id,
    ...snap.data()
  };
}


// ==============================
// ゲーム開始 v620
// 古い絵・投票・役割を削除してから新ゲーム開始
// Firestore phase 同期方式
// ==============================
async function startGame(roomId, gameSetup) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    throw new Error("部屋が存在しません");
  }

  const room = roomSnap.data();

  if (room.hostUid !== uid) {
    throw new Error("ゲームを開始できるのはホストだけです");
  }

  const playersSnap = await roomRef.collection("players").get();

  const players = [];
  playersSnap.forEach((doc) => {
    players.push({
      uid: doc.id,
      ...doc.data()
    });
  });

  if (players.length < 2) {
    throw new Error("2人以上で開始できます");
  }

  if (!gameSetup || !gameSetup.normalTopic || !gameSetup.fakeTopic || !gameSetup.fakeUid) {
    throw new Error("ゲーム設定が不正です");
  }

  const normalTopic = topicValueToText(gameSetup.normalTopic);
  const fakeTopic = topicValueToText(gameSetup.fakeTopic);
  const fakeUid = String(gameSetup.fakeUid);

  const fakePlayer = players.find((player) => player.uid === fakeUid);

  if (!fakePlayer) {
    throw new Error("ニセ絵師の選択に失敗しました");
  }

  await deleteSubcollection(roomRef, "drawings");
  await deleteSubcollection(roomRef, "votes");
  await deleteSubcollection(roomRef, "assignments");

  const gameId = Date.now().toString();

  const batch = db.batch();

  batch.set(
    roomRef,
    {
      status: "playing",
      phase: "topic",
      phaseStartAtMs: Date.now() + 1200,
      phaseDurationSec: 5,
      gameId: gameId,
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      finishedAt: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

      voteRound: "main",
      runoffRound: 0,
      runoffCandidates: null,
      resultData: null,

      answer: {
        fakeUid: fakeUid,
        fakeName: fakePlayer.name || "名無し",
        normalTopic: normalTopic,
        fakeTopic: fakeTopic
      }
    },
    { merge: true }
  );

  players.forEach((player) => {
    const isFake = player.uid === fakeUid;

    const assignmentRef = roomRef
      .collection("assignments")
      .doc(player.uid);

    batch.set(
      assignmentRef,
      {
        uid: player.uid,
        name: player.name || "名無し",
        isFake: isFake,
        topic: isFake ? fakeTopic : normalTopic,
        role: isFake ? "fake" : "citizen",
        gameId: gameId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();

  console.log("ゲーム開始 v620:", {
    roomId: cleanRoomId,
    gameId,
    fakeUid,
    fakeName: fakePlayer.name || "名無し",
    normalTopic,
    fakeTopic
  });
}

const startOnlineGame = startGame;


// ==============================
// フェーズ更新 v620
// ホストだけが実行
// ==============================
async function updateRoomPhase(roomId, phase, durationSec, extraData) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!phase) {
    throw new Error("phaseが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  await assertHost(roomRef);

  const phaseData = createPhaseData(phase, durationSec || 0, extraData || {});

  await roomRef.set(phaseData, { merge: true });

  console.log("phase更新:", cleanRoomId, phaseData);
}


// ==============================
// 同票再議論 v620
// ==============================
async function setRunoff(roomId, candidates, round) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  await assertHost(roomRef);

  const runoffRound = Number(round || 1);
  const voteRound = "runoff_" + runoffRound;

  await roomRef.set(
    {
      phase: "runoffDiscussion",
      phaseStartAtMs: Date.now() + 1200,
      phaseDurationSec: 60,
      runoffRound: runoffRound,
      voteRound: voteRound,
      runoffCandidates: Array.isArray(candidates) ? candidates : [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      phaseUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("同票再議論へ:", {
    roomId: cleanRoomId,
    runoffRound,
    voteRound,
    candidates
  });
}


// ==============================
// 結果保存 v620
// ==============================
async function setResult(roomId, resultData) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  await assertHost(roomRef);

  await roomRef.set(
    {
      phase: "result",
      phaseStartAtMs: Date.now() + 1200,
      phaseDurationSec: 0,
      resultData: resultData || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      phaseUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("結果保存:", cleanRoomId, resultData);
}


// ==============================
// 絵を保存
// ==============================
async function saveDrawing(roomId, phase, playerName, imageDataUrl) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!phase) {
    throw new Error("phaseが空です");
  }

  if (!imageDataUrl) {
    throw new Error("画像データが空です");
  }

  const roomSnap = await db.collection("rooms").doc(cleanRoomId).get();
  const room = roomSnap.exists ? roomSnap.data() : {};
  const gameId = room.gameId || null;

  const drawingId = `${phase}_${uid}`;

  await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("drawings")
    .doc(drawingId)
    .set(
      {
        uid: uid,
        name: playerName || "名無し",
        phase: phase,
        image: imageDataUrl,
        gameId: gameId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  console.log("絵を保存しました:", cleanRoomId, drawingId);
}


// ==============================
// 絵を監視
// ==============================
function listenDrawings(roomId, phase, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!phase) {
    throw new Error("phaseが空です");
  }

  if (unsubscribeDrawings) {
    unsubscribeDrawings();
    unsubscribeDrawings = null;
  }

  unsubscribeDrawings = db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("drawings")
    .where("phase", "==", phase)
    .onSnapshot(
      (snapshot) => {
        const drawings = [];

        snapshot.forEach((doc) => {
          drawings.push({
            id: doc.id,
            ...doc.data()
          });
        });

        drawings.sort((a, b) => {
          const nameA = a.name || "";
          const nameB = b.name || "";
          return nameA.localeCompare(nameB, "ja");
        });

        console.log("drawings更新:", phase, drawings);
        callback(drawings);
      },
      (error) => {
        console.error("drawings監視エラー:", error);
      }
    );

  return unsubscribeDrawings;
}


// ==============================
// 投票を保存 v620
// voteRoundごとに保存
// main, runoff_1, runoff_2 ...
// 自分投票も可能
// ==============================
async function saveVote(roomId, votedPlayer, voteRound) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!votedPlayer || !votedPlayer.uid) {
    throw new Error("投票先が不正です");
  }

  const round = voteRound || "main";
  const voteDocId = `${round}_${uid}`;

  let myName = "名無し";

  try {
    const myPlayerSnap = await db
      .collection("rooms")
      .doc(cleanRoomId)
      .collection("players")
      .doc(uid)
      .get();

    if (myPlayerSnap.exists) {
      myName = myPlayerSnap.data().name || "名無し";
    }
  } catch (error) {
    console.warn("自分の名前取得失敗:", error);
  }

  const roomSnap = await db.collection("rooms").doc(cleanRoomId).get();
  const room = roomSnap.exists ? roomSnap.data() : {};
  const gameId = room.gameId || null;

  await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("votes")
    .doc(voteDocId)
    .set(
      {
        uid: uid,
        name: myName,
        votedUid: votedPlayer.uid,
        votedName: votedPlayer.name || "名無し",
        voteRound: round,
        gameId: gameId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  console.log("投票保存:", cleanRoomId, round, uid, "->", votedPlayer.uid);
}


// ==============================
// 投票を監視 v620
// voteRound指定可能
// ==============================
function listenVotes(roomId, voteRound, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  let round = voteRound;
  let cb = callback;

  // v619互換: listenVotes(roomId, callback)
  if (typeof voteRound === "function") {
    cb = voteRound;
    round = "main";
  }

  if (!round) {
    round = "main";
  }

  if (unsubscribeVotes) {
    unsubscribeVotes();
    unsubscribeVotes = null;
  }

  unsubscribeVotes = db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("votes")
    .where("voteRound", "==", round)
    .onSnapshot(
      (snapshot) => {
        const votes = [];

        snapshot.forEach((doc) => {
          votes.push({
            id: doc.id,
            ...doc.data()
          });
        });

        console.log("votes更新:", round, votes);
        if (typeof cb === "function") cb(votes);
      },
      (error) => {
        console.error("votes監視エラー:", error);
      }
    );

  return unsubscribeVotes;
}


// ==============================
// 投票を削除
// ==============================
async function clearVotes(roomId) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  await signIn();

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  await deleteSubcollection(roomRef, "votes");

  console.log("投票を削除しました:", cleanRoomId);
}


// ==============================
// 結果後に部屋を finished にする
// ==============================
async function finishRoom(roomId) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  await assertHost(roomRef);

  await roomRef.set(
    {
      status: "finished",
      phase: "finished",
      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("部屋を finished にしました:", cleanRoomId);
}


// ==============================
// もう一度遊ぶ
// ホストだけがロビーに戻せる
// ==============================
async function resetRoomToLobby(roomId) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const hostCheck = await assertHost(roomRef);
  const room = hostCheck.room;

  await deleteSubcollection(roomRef, "drawings");
  await deleteSubcollection(roomRef, "votes");
  await deleteSubcollection(roomRef, "assignments");

  const playersSnap = await roomRef.collection("players").get();
  const batch = db.batch();

  playersSnap.forEach((doc) => {
    const player = doc.data();
    const isHost = player.uid === room.hostUid || doc.id === room.hostUid;

    batch.set(
      doc.ref,
      {
        ready: isHost ? true : false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  batch.set(
    roomRef,
    {
      status: "lobby",
      phase: "lobby",
      phaseStartAtMs: null,
      phaseDurationSec: 0,
      answer: null,
      topic: null,
      gameId: null,
      voteRound: "main",
      runoffRound: 0,
      runoffCandidates: null,
      resultData: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();

  console.log("ロビーに戻しました:", cleanRoomId);
}


// ==============================
// リスナー停止
// ==============================
function stopListeners() {
  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  if (unsubscribeDrawings) {
    unsubscribeDrawings();
    unsubscribeDrawings = null;
  }

  if (unsubscribeVotes) {
    unsubscribeVotes();
    unsubscribeVotes = null;
  }

  console.log("Firebase リスナー停止");
}


// ==============================
// app.js へ公開
// ==============================
window.GameDB = {
  signIn,
  createRoom,
  roomExists,
  joinRoom,
  setReady,

  listenPlayers,
  listenRoom,

  startGame,
  startOnlineGame,

  updateRoomPhase,
  setRunoff,
  setResult,

  stopListeners,
  getCurrentUid,
  getMyAssignment,

  saveDrawing,
  listenDrawings,

  saveVote,
  listenVotes,
  clearVotes,

  finishRoom,
  resetRoomToLobby
};

console.log("GameDB ready:", window.GameDB);
