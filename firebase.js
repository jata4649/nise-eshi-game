console.log("firebase.js version 632 loaded");

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
// v624 オンライン判定
// ==============================
const FIREBASE_PRESENCE_TIMEOUT_MS = 25000;

function nowMs() {
  return Date.now();
}

function isPlayerOnline(player) {
  if (!player) return false;

  const lastSeenAtMs = Number(player.lastSeenAtMs || 0);

  if (!lastSeenAtMs) return false;

  return nowMs() - lastSeenAtMs <= FIREBASE_PRESENCE_TIMEOUT_MS;
}


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
  const startDelayMs = 1200;
  const phaseStartAtMs = Date.now() + startDelayMs;

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
// v624 プレゼンス更新
// ==============================
async function updateMyPresence(roomId) {
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
        online: true,
        lastSeenAtMs: Date.now(),
        lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  return true;
}

async function setMyOffline(roomId) {
  const uid = getCurrentUid();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!uid || !cleanRoomId) {
    return;
  }

  try {
    await db
      .collection("rooms")
      .doc(cleanRoomId)
      .collection("players")
      .doc(uid)
      .set(
        {
          online: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    console.log("自分をofflineにしました:", cleanRoomId, uid);
  } catch (error) {
    console.warn("offline更新失敗:", error);
  }
}

// app.js 互換用
async function updatePresence(roomId) {
  return updateMyPresence(roomId);
}

async function setPresence(roomId, online) {
  if (online === false) {
    return setMyOffline(roomId);
  }

  return updateMyPresence(roomId);
}


// ==============================
// v624 ホスト交代
// ==============================
async function checkAndTransferHost(roomId) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    return false;
  }

  const room = roomSnap.data();

  if (!room || !room.hostUid) {
    return false;
  }

  const playersSnap = await roomRef.collection("players").get();

  const players = [];

  playersSnap.forEach((doc) => {
    players.push({
      id: doc.id,
      uid: doc.id,
      ...doc.data()
    });
  });

  if (players.length <= 0) {
    return false;
  }

  const hostPlayer = players.find((player) => player.uid === room.hostUid);
  const hostOnline = isPlayerOnline(hostPlayer);

  if (hostOnline) {
    return false;
  }

  const onlinePlayers = players
    .filter((player) => player && player.uid && isPlayerOnline(player))
    .sort((a, b) => {
      const joinedA = Number(a.joinedAtMs || 0);
      const joinedB = Number(b.joinedAtMs || 0);

      if (joinedA !== joinedB) return joinedA - joinedB;

      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB, "ja");
    });

  if (onlinePlayers.length <= 0) {
    return false;
  }

  const nextHost = onlinePlayers[0];

  if (nextHost.uid !== uid) {
    return false;
  }

  await roomRef.set(
    {
      hostUid: nextHost.uid,
      hostName: nextHost.name || "名無し",
      hostChangedAtMs: Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("ホストを交代しました:", {
    oldHostUid: room.hostUid,
    newHostUid: nextHost.uid,
    newHostName: nextHost.name || "名無し"
  });

  return true;
}

// app.js 互換用
async function transferHost(roomId, newHostUid) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  if (!newHostUid) {
    throw new Error("新しいホストUIDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    throw new Error("部屋が存在しません");
  }

  const playersSnap = await roomRef.collection("players").get();

  const players = [];

  playersSnap.forEach((doc) => {
    players.push({
      uid: doc.id,
      ...doc.data()
    });
  });

  const nextHost = players.find((player) => player.uid === newHostUid);

  if (!nextHost) {
    throw new Error("新しいホスト候補が見つかりません");
  }

  if (uid !== newHostUid) {
    console.log("自分は新ホスト候補ではないため移譲しません");
    return false;
  }

  await roomRef.set(
    {
      hostUid: nextHost.uid,
      hostName: nextHost.name || "名無し",
      hostChangedAtMs: Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("ホストを移譲しました:", {
    newHostUid: nextHost.uid,
    newHostName: nextHost.name || "名無し"
  });

  return true;
}

const transferHostTo = transferHost;
const updateHost = transferHost;


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

  const joinedAtMs = Date.now();

  const roomData = {
    roomId: cleanRoomId,
    hostUid: uid,
    hostName: playerName || "名無し",
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
    online: true,
    joinedAtMs: joinedAtMs,
    lastSeenAtMs: Date.now(),
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
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
  const playerSnap = await playerRef.get();

  const joinedAtMs = playerSnap.exists && playerSnap.data().joinedAtMs
    ? playerSnap.data().joinedAtMs
    : Date.now();

  await playerRef.set(
    {
      uid: uid,
      name: playerName || "名無し",
      ready: false,
      isHost: false,
      online: true,
      joinedAtMs: joinedAtMs,
      lastSeenAtMs: Date.now(),
      joinedAt: playerSnap.exists
        ? playerSnap.data().joinedAt || firebase.firestore.FieldValue.serverTimestamp()
        : firebase.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
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
        online: true,
        lastSeenAtMs: Date.now(),
        lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  console.log("準備状態更新:", cleanRoomId, uid, ready);
}
async function leaveRoom(roomId) {
  await signIn();

  const uid = getCurrentUid();

  if (!uid) {
    throw new Error("ログイン情報がありません");
  }

  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedRoomId) {
    throw new Error("部屋IDが不正です");
  }

  const roomRef = db.collection("rooms").doc(normalizedRoomId);
  const playerRef = roomRef.collection("players").doc(uid);

  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    console.log("退出対象の部屋はすでに存在しません:", normalizedRoomId);
    return {
      roomDeleted: true,
      reason: "room_not_found"
    };
  }

  const roomData = roomSnap.data() || {};
  const oldHostUid = roomData.hostUid || null;

  // 自分のプレイヤーデータを削除
  try {
    await playerRef.delete();
  } catch (error) {
    console.warn("プレイヤー削除に失敗しましたが続行します:", error);
  }

  // 残っているプレイヤーを取得
  const playersSnap = await roomRef.collection("players").get();

  const remainingPlayers = [];

  playersSnap.forEach((doc) => {
    const data = doc.data() || {};
    remainingPlayers.push({
      uid: doc.id,
      ...data
    });
  });

  // 残り0人なら部屋ごと削除
  if (remainingPlayers.length === 0) {
    async function deleteSubcollectionForLeaveRoom(collectionName) {
      const snap = await roomRef.collection(collectionName).get();

      if (snap.empty) return;

      let batch = db.batch();
      let count = 0;
      const commits = [];

      snap.forEach((doc) => {
        batch.delete(doc.ref);
        count += 1;

        if (count >= 450) {
          commits.push(batch.commit());
          batch = db.batch();
          count = 0;
        }
      });

      if (count > 0) {
        commits.push(batch.commit());
      }

      await Promise.all(commits);
    }

    try {
      await deleteSubcollectionForLeaveRoom("players");
      await deleteSubcollectionForLeaveRoom("assignments");
      await deleteSubcollectionForLeaveRoom("drawings");
      await deleteSubcollectionForLeaveRoom("votes");
    } catch (error) {
      console.warn("サブコレクション削除中に警告:", error);
    }

    await roomRef.delete();

    console.log("最後の参加者が退出したため部屋を削除しました:", normalizedRoomId);

    return {
      roomDeleted: true,
      remainingCount: 0,
      hostTransferred: false
    };
  }

  // ホストが退出した、または現在のhostUidが残存プレイヤーにいない場合は移譲
  const oldHostStillExists = remainingPlayers.some((player) => player.uid === oldHostUid);
  const shouldTransferHost = oldHostUid === uid || !oldHostStillExists;

  const updateData = {
    updatedAtMs: nowMs(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (shouldTransferHost) {
    const nextHost = remainingPlayers
      .slice()
      .sort((a, b) => {
        const aTime =
          Number(a.joinedAtMs || 0) ||
          Number(a.createdAtMs || 0) ||
          Number(a.lastSeenAtMs || 0) ||
          0;

        const bTime =
          Number(b.joinedAtMs || 0) ||
          Number(b.createdAtMs || 0) ||
          Number(b.lastSeenAtMs || 0) ||
          0;

        if (aTime !== bTime) return aTime - bTime;

        return String(a.name || "").localeCompare(String(b.name || ""), "ja");
      })[0];

    if (nextHost && nextHost.uid) {
      updateData.hostUid = nextHost.uid;
      updateData.hostName = nextHost.name || "名無し";

      try {
        await roomRef.collection("players").doc(nextHost.uid).set({
          ready: false,
          updatedAtMs: nowMs(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn("新ホストready更新失敗:", error);
      }

      console.log("退出によりホストを移譲しました:", {
        oldHostUid,
        newHostUid: nextHost.uid,
        newHostName: nextHost.name || "名無し"
      });
    }
  }

  await roomRef.set(updateData, { merge: true });

  console.log("部屋から退出しました:", {
    roomId: normalizedRoomId,
    uid,
    remainingCount: remainingPlayers.length,
    hostTransferred: shouldTransferHost
  });

  return {
    roomDeleted: false,
    remainingCount: remainingPlayers.length,
    hostTransferred: shouldTransferHost
  };
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
    .orderBy("joinedAtMs", "asc")
    .onSnapshot(
      (snapshot) => {
        const players = [];

        snapshot.forEach((doc) => {
          players.push({
            id: doc.id,
            uid: doc.id,
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
// ゲーム開始
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
    const player = {
      uid: doc.id,
      ...doc.data()
    };

    if (isPlayerOnline(player)) {
      players.push(player);
    }
  });

  if (players.length < 2) {
    throw new Error("オンラインの参加者が2人以上で開始できます");
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

  console.log("ゲーム開始 v624fix1:", {
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
// フェーズ更新
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
// 同票再議論
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
// 結果保存
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
// 投票を保存
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
// 投票を監視
// ==============================
function listenVotes(roomId, voteRound, callback) {
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  let round = voteRound;
  let cb = callback;

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

        if (typeof cb === "function") {
          cb(votes);
        }
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
    const player = {
      uid: doc.id,
      ...doc.data()
    };

    const isHost = player.uid === room.hostUid || doc.id === room.hostUid;

    batch.set(
      doc.ref,
      {
        ready: isHost ? true : false,
        online: isPlayerOnline(player),
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
// v627 部屋退出
// ==============================
async function leaveRoom(roomId) {
  const uid = await signIn();
  const cleanRoomId = normalizeRoomId(roomId);

  if (!cleanRoomId) {
    throw new Error("部屋IDが空です");
  }

  const roomRef = db.collection("rooms").doc(cleanRoomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    return true;
  }

  const room = roomSnap.data();
  const playerRef = roomRef.collection("players").doc(uid);

  await playerRef.delete();

  const playersSnap = await roomRef.collection("players").get();

  if (playersSnap.empty) {
    await deleteSubcollection(roomRef, "drawings");
    await deleteSubcollection(roomRef, "votes");
    await deleteSubcollection(roomRef, "assignments");
    await roomRef.delete();

    console.log("最後の参加者が退出したため部屋を削除:", cleanRoomId);
    return true;
  }

  if (room.hostUid === uid) {
    const remainingPlayers = [];

    playersSnap.forEach((doc) => {
      remainingPlayers.push({
        uid: doc.id,
        ...doc.data()
      });
    });

    remainingPlayers.sort((a, b) => {
      const joinedA = Number(a.joinedAtMs || 0);
      const joinedB = Number(b.joinedAtMs || 0);

      if (joinedA !== joinedB) return joinedA - joinedB;

      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB, "ja");
    });

    const nextHost = remainingPlayers[0];

    if (nextHost && nextHost.uid) {
      await roomRef.set(
        {
          hostUid: nextHost.uid,
          hostName: nextHost.name || "名無し",
          hostChangedAtMs: Date.now(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await roomRef
        .collection("players")
        .doc(nextHost.uid)
        .set(
          {
            isHost: true,
            ready: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

      console.log("ホスト退出によりホスト移譲:", nextHost.uid);
    }
  }

  await roomRef.set(
    {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log("部屋から退出:", cleanRoomId, uid);
  return true;
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
  leaveRoom,
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
  resetRoomToLobby,
  leaveRoom,


  updateMyPresence,
  updatePresence,
  setPresence,
  setMyOffline,
  checkAndTransferHost,
  transferHost,
  transferHostTo,
  updateHost
};

console.log("GameDB ready:", window.GameDB);
