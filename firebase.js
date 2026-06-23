console.log("firebase.js version 618 loaded");

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
      "fake",
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
    topic: null,
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
// ==============================
async function joinRoom(roomId, playerName) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const exists = await roomExists(cleanRoomId);

  if (!exists) {
    throw new Error("部屋が存在しません");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
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
// 自分のお題・役割を取得 v618
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
// ゲーム開始 v618
// 参加者から1人ニセ絵師を選び、各自のお題を assignments に保存
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

  const batch = db.batch();

  // 部屋状態更新
  batch.set(
    roomRef,
    {
      status: "playing",
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

      // 結果発表用
      answer: {
        fakeUid: fakeUid,
        fakeName: fakePlayer.name || "名無し",
        normalTopic: normalTopic,
        fakeTopic: fakeTopic
      }
    },
    { merge: true }
  );

  // 各プレイヤーに個別お題を配る
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
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();

  console.log("ゲーム開始 v618:", {
    roomId: cleanRoomId,
    fakeUid,
    fakeName: fakePlayer.name || "名無し",
    normalTopic,
    fakeTopic
  });
}

const startOnlineGame = startGame;


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
// 投票を保存
// ==============================
async function saveVote(roomId, votedPlayer) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!votedPlayer || !votedPlayer.uid) {
    throw new Error("投票先が不正です");
  }

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

  await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("votes")
    .doc(uid)
    .set(
      {
        uid: uid,
        name: myName,
        votedUid: votedPlayer.uid,
        votedName: votedPlayer.name || "名無し",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  console.log("投票保存:", cleanRoomId, uid, "->", votedPlayer.uid);
}


// ==============================
// 投票を監視
// ==============================
function listenVotes(roomId, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (unsubscribeVotes) {
    unsubscribeVotes();
    unsubscribeVotes = null;
  }

  unsubscribeVotes = db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("votes")
    .onSnapshot(
      (snapshot) => {
        const votes = [];

        snapshot.forEach((doc) => {
          votes.push({
            id: doc.id,
            ...doc.data()
          });
        });

        console.log("votes更新:", votes);
        callback(votes);
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

  const snapshot = await db
    .collection("rooms")
    .doc(cleanRoomId)
    .collection("votes")
    .get();

  const batch = db.batch();

  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  console.log("投票を削除しました:", cleanRoomId);
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
  stopListeners,
  getCurrentUid,
  getMyAssignment,
  saveDrawing,
  listenDrawings,
  saveVote,
  listenVotes,
  clearVotes
};

console.log("GameDB ready:", window.GameDB);
