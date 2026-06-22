console.log("firebase.js version 605 loaded");

// -------------------------
// Firebase 初期化
// -------------------------

const firebaseConfig = {
  apiKey:"AIzaSyDcYlfCcJVFwctETjLdHcEaCgXPdSZ-4Uc",
  authDomain: "nise-eshi-game.firebaseapp.com",
  projectId:"nise-eshi-game",
  storageBucket: "nise-eshi-game.firebasestorage.app",
  messagingSenderId: "284787119511",
  appId: "1:284787119511:web:a62be3e2f97f9c0e22a0d2"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let currentUid = null;
let unsubscribePlayers = null;
let unsubscribeRoom = null;

// -------------------------
// 匿名ログイン
// -------------------------

async function signInGameUser() {
  if (auth.currentUser) {
    currentUid = auth.currentUser.uid;
    return currentUid;
  }

  const result = await auth.signInAnonymously();
  currentUid = result.user.uid;

  console.log("signed in:", currentUid);

  return currentUid;
}

// -------------------------
// 部屋作成
// -------------------------

async function createGameRoom(roomId) {
  const uid = await signInGameUser();

  const roomRef = db.collection("rooms").doc(roomId);

  await roomRef.set({
    roomId: roomId,
    hostUid: uid,
    status: "lobby",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    topic: null
  });

  return roomId;
}

// -------------------------
// 部屋が存在するか確認
// -------------------------

async function checkRoomExists(roomId) {
  const roomDoc = await db.collection("rooms").doc(roomId).get();
  return roomDoc.exists;
}

// -------------------------
// 部屋参加・プレイヤー登録
// -------------------------

async function joinGameRoom(roomId, playerName) {
  const uid = await signInGameUser();

  const playerRef = db
    .collection("rooms")
    .doc(roomId)
    .collection("players")
    .doc(uid);

  await playerRef.set({
    uid: uid,
    name: playerName,
    ready: false,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return uid;
}

// -------------------------
// 準備OK
// -------------------------

async function setPlayerReady(roomId, ready) {
  const uid = await signInGameUser();

  const playerRef = db
    .collection("rooms")
    .doc(roomId)
    .collection("players")
    .doc(uid);

  await playerRef.set({
    ready: ready,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// -------------------------
// 参加者一覧をリアルタイム監視
// -------------------------

function listenGamePlayers(roomId, callback) {
  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  unsubscribePlayers = db
    .collection("rooms")
    .doc(roomId)
    .collection("players")
    .orderBy("joinedAt", "asc")
    .onSnapshot((snapshot) => {
      const players = [];

      snapshot.forEach((doc) => {
        players.push(doc.data());
      });

      callback(players);
    });
}

// -------------------------
// 部屋状態をリアルタイム監視
// -------------------------

function listenGameRoom(roomId, callback) {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  unsubscribeRoom = db
    .collection("rooms")
    .doc(roomId)
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      callback(doc.data());
    });
}

// -------------------------
// ゲーム開始
// -------------------------

async function startOnlineGame(roomId, topic) {
  await signInGameUser();

  const roomRef = db.collection("rooms").doc(roomId);

  await roomRef.set({
    status: "topic",
    topic: topic,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// -------------------------
// 接続解除
// -------------------------

function stopGameListeners() {
  if (unsubscribePlayers) {
    unsubscribePlayers();
    unsubscribePlayers = null;
  }

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

// -------------------------
// app.js から使えるようにする
// -------------------------

window.GameDB = {
  signIn: signInGameUser,
  createRoom: createGameRoom,
  roomExists: checkRoomExists,
  joinRoom: joinGameRoom,
  setReady: setPlayerReady,
  listenPlayers: listenGamePlayers,
  listenRoom: listenGameRoom,
  startGame: startOnlineGame,
  stopListeners: stopGameListeners,
  getCurrentUid: function () {
    return currentUid;
  }
};

