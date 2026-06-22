console.log("firebase.js version 608 loaded");

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
  console.error("Firebase initialize error:", error);
  alert(
    "Firebase初期化に失敗しました。\n\n" +
    "エラー内容:\n" +
    (error.message || String(error))
  );
}

const auth = firebase.auth();
const db = firebase.firestore();

let unsubscribeRoom = null;
let unsubscribePlayers = null;
let unsubscribeDrawings = null;


// ==============================
// 共通
// ==============================

function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

function getCurrentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

async function signIn() {
  try {
    if (auth.currentUser) {
      console.log("すでに匿名ログイン済み:", auth.currentUser.uid);
      return auth.currentUser;
    }

    console.log("匿名ログイン開始");

    const result = await auth.signInAnonymously();

    console.log("匿名ログイン成功:", result.user.uid);

    return result.user;
  } catch (error) {
    console.error("匿名ログイン失敗:", error);

    throw error;
  }
}

// ==============================
// 部屋作成
// ==============================

async function createRoom(roomId) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    throw new Error("部屋IDが空です");
  }

  try {
    await signIn();

    const uid = getCurrentUid();

    if (!uid) {
      throw new Error("ログインUIDが取得できません");
    }

    const roomRef = db.collection("rooms").doc(fixedRoomId);

    console.log("Firestore 部屋作成開始:", fixedRoomId);

    await roomRef.set(
      {
        roomId: fixedRoomId,
        status: "lobby",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        hostUid: uid,
        topic: null
      },
      { merge: true }
    );

    console.log("Firestore 部屋作成完了:", fixedRoomId);

    return fixedRoomId;
  } catch (error) {
    console.error("createRoom error:", error);
    throw error;
  }
}

// ==============================
// 部屋存在確認
// ==============================

async function roomExists(roomId) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    console.warn("roomExists: 部屋IDが空");
    return false;
  }

  try {
    await signIn();

    const roomRef = db.collection("rooms").doc(fixedRoomId);

    console.log("部屋存在確認開始:", fixedRoomId);

    for (let i = 0; i < 10; i++) {
      const snap = await roomRef.get();

      if (snap.exists) {
        console.log("部屋発見:", fixedRoomId);
        return true;
      }

      console.log(`部屋確認中 ${i + 1}/10:`, fixedRoomId);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.warn("部屋が見つかりません:", fixedRoomId);

    return false;
  } catch (error) {
    console.error("roomExists error:", error);
    throw error;
  }
}

// ==============================
// 入室
// ==============================

async function joinRoom(roomId, playerName) {
  const fixedRoomId = normalizeRoomId(roomId);
  const fixedName = String(playerName || "").trim();

  if (!fixedRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!fixedName) {
    throw new Error("名前が空です");
  }

  try {
    await signIn();

    const uid = getCurrentUid();

    if (!uid) {
      throw new Error("ログインUIDが取得できません");
    }

    const roomRef = db.collection("rooms").doc(fixedRoomId);

    console.log("入室前の部屋確認:", fixedRoomId);

    const roomSnap = await roomRef.get();

    if (!roomSnap.exists) {
      throw new Error("部屋が存在しません: " + fixedRoomId);
    }

    const playerRef = roomRef.collection("players").doc(uid);

    console.log("プレイヤー登録開始:", fixedRoomId, fixedName, uid);

    await playerRef.set(
      {
        uid: uid,
        name: fixedName,
        ready: false,
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

    console.log("入室完了:", fixedRoomId, fixedName);

    return true;
  } catch (error) {
    console.error("joinRoom error:", error);
    throw error;
  }
}

// ==============================
// 準備OK
// ==============================

async function setReady(roomId, ready) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    throw new Error("部屋IDが空です");
  }

  try {
    await signIn();

    const uid = getCurrentUid();

    if (!uid) {
      throw new Error("ログインしていません");
    }

    await db
      .collection("rooms")
      .doc(fixedRoomId)
      .collection("players")
      .doc(uid)
      .set(
        {
          ready: !!ready,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    console.log("準備状態更新:", fixedRoomId, ready);
  } catch (error) {
    console.error("setReady error:", error);
    throw error;
  }
}

// ==============================
// プレイヤー監視
// ==============================

function listenPlayers(roomId, callback) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    console.warn("listenPlayers: 部屋IDが空");
    return null;
  }

  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  console.log("プレイヤー監視開始:", fixedRoomId);

  unsubscribePlayers = db
    .collection("rooms")
    .doc(fixedRoomId)
    .collection("players")
    .orderBy("joinedAt", "asc")
    .onSnapshot(
      (snapshot) => {
        const players = [];

        snapshot.forEach((doc) => {
          players.push({
            uid: doc.id,
            ...doc.data()
          });
        });

        console.log("参加者更新:", players);

        callback(players);
      },
      (error) => {
        console.error("参加者監視エラー:", error);
      }
    );

  return unsubscribePlayers;
}

// ==============================
// 部屋監視
// ==============================

function listenRoom(roomId, callback) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    console.warn("listenRoom: 部屋IDが空");
    return null;
  }

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  console.log("部屋監視開始:", fixedRoomId);

  unsubscribeRoom = db
    .collection("rooms")
    .doc(fixedRoomId)
    .onSnapshot(
      (doc) => {
        if (!doc.exists) {
          console.warn("部屋が存在しません:", fixedRoomId);
          callback(null);
          return;
        }

        const room = {
          id: doc.id,
          ...doc.data()
        };

        console.log("部屋更新:", room);

        callback(room);
      },
      (error) => {
        console.error("部屋監視エラー:", error);
      }
    );

  return unsubscribeRoom;
}

// ==============================
// ゲーム開始
// ==============================

async function startGame(roomId, topic) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    throw new Error("部屋IDが空です");
  }

  try {
    await signIn();

    await db.collection("rooms").doc(fixedRoomId).set(
      {
        status: "topic",
        topic: topic,
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    console.log("ゲーム開始:", fixedRoomId, topic);
  } catch (error) {
    console.error("startGame error:", error);
    throw error;
  }
}

async function startOnlineGame(roomId, topic) {
  return startGame(roomId, topic);
}

// ==============================
// リスナー停止
// ==============================

function stopListeners() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
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
  getCurrentUid
};

console.log("GameDB ready:", window.GameDB);
