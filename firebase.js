console.log("firebase.js version 607 loaded");

// ==============================
// Firebase 設定
// ==============================
// ↓ ここは Firebase Console の設定を入れてください
const firebaseConfig = {
apiKey:"AIzaSyDcYlfCcJVFwctETjLdHcEaCgXPdSZ-4Uc",
authDomain: "nise-eshi-game.firebaseapp.com",
projectId:"nise-eshi-game",
storageBucket: "nise-eshi-game.firebasestorage.app",
messagingSenderId: "284787119511",
appId: "1:284787119511:web:a62be3e2f97f9c0e22a0d2"
};

// ==============================
// Firebase 初期化
// ==============================
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

let unsubscribeRoom = null;
let unsubscribePlayers = null;

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
  if (auth.currentUser) {
    console.log("すでにログイン済み:", auth.currentUser.uid);
    return auth.currentUser;
  }

  const result = await auth.signInAnonymously();
  console.log("匿名ログイン成功:", result.user.uid);
  return result.user;
}

// ==============================
// 部屋作成
// ==============================
async function createRoom(roomId) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    throw new Error("部屋IDが空です");
  }

  await signIn();

  const roomRef = db.collection("rooms").doc(fixedRoomId);

  await roomRef.set(
    {
      roomId: fixedRoomId,
      status: "lobby",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      hostUid: getCurrentUid(),
      topic: null
    },
    { merge: true }
  );

  console.log("部屋作成完了:", fixedRoomId);
  return fixedRoomId;
}

// ==============================
// 部屋存在確認
// ==============================
// GitHub Pages / スマホ通信で少し遅れることがあるのでリトライ付き
async function roomExists(roomId) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (!fixedRoomId) {
    return false;
  }

  await signIn();

  const roomRef = db.collection("rooms").doc(fixedRoomId);

  for (let i = 0; i < 10; i++) {
    const snap = await roomRef.get();

    if (snap.exists) {
      console.log("部屋発見:", fixedRoomId);
      return true;
    }

    console.log(`部屋確認中 ${i + 1}/10:`, fixedRoomId);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.warn("部屋が見つかりません:", fixedRoomId);
  return false;
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

  await signIn();

  const exists = await roomExists(fixedRoomId);

  if (!exists) {
    throw new Error("部屋が存在しません: " + fixedRoomId);
  }

  const uid = getCurrentUid();

  const playerRef = db
    .collection("rooms")
    .doc(fixedRoomId)
    .collection("players")
    .doc(uid);

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

  await db.collection("rooms").doc(fixedRoomId).set(
    {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("入室完了:", fixedRoomId, fixedName);
}

// ==============================
// 準備OK
// ==============================
async function setReady(roomId, ready) {
  const fixedRoomId = normalizeRoomId(roomId);

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

  console.log("準備状態更新:", ready);
}

// ==============================
// プレイヤー監視
// ==============================
function listenPlayers(roomId, callback) {
  const fixedRoomId = normalizeRoomId(roomId);

  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  unsubscribePlayers = db
    .collection("rooms")
    .doc(fixedRoomId)
    .collection("players")
    .orderBy("joinedAt", "asc")
    .onSnapshot(
      snapshot => {
        const players = [];

        snapshot.forEach(doc => {
          players.push({
            uid: doc.id,
            ...doc.data()
          });
        });

        console.log("参加者更新:", players);
        callback(players);
      },
      error => {
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

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  unsubscribeRoom = db
    .collection("rooms")
    .doc(fixedRoomId)
    .onSnapshot(
      doc => {
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
      error => {
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
}

// 既存 app.js が startOnlineGame という名前を使っていても動くようにする
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
