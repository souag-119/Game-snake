const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 5000,
  pingTimeout: 10000,
});

app.use(express.static(path.join(__dirname, 'public')));

// ╔══════════════════════════════════════════╗
// ║        إعدادات السيرفر والغرف           ║
// ╚══════════════════════════════════════════╝
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const LOBBY_TIMEOUT = 60_000; // 60 ثانية
const GAME_DURATION = 120_000; // دقيقتين

const ROOM_STATES = {
  WAITING: 'WAITING',
  STARTING: 'STARTING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

// تخزين الغرف
const rooms = {};

// توليد لون مميز
function randomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// إنشاء غرفة جديدة
function createRoom() {
  const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  rooms[roomId] = {
    id: roomId,
    players: [],
    state: ROOM_STATES.WAITING,
    lobbyTimer: null,
    gameTimer: null,
    gameLoopInterval: null,
    worldObjects: [],
  };
  return roomId;
}

// العثور على غرفة متاحة أو إنشاء واحدة
function findOrCreateRoom() {
  for (const [id, room] of Object.entries(rooms)) {
    if (room.state === ROOM_STATES.WAITING && room.players.length < MAX_PLAYERS) {
      return id;
    }
  }
  return createRoom();
}

// بدء العد التنازلي للغرفة
function startLobbyCountdown(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== ROOM_STATES.WAITING) return;

  room.state = ROOM_STATES.STARTING;
  const countdownSeconds = 5;
  let remaining = countdownSeconds;

  // إعلام اللاعبين بالعد التنازلي
  io.to(roomId).emit('lobbyCountdown', {
    message: `اللعبة ستبدأ خلال ${remaining} ثواني...`,
    seconds: remaining,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
  });

  // إذا كان العدد أقل من الأدنى، انتظر
  if (room.players.length < MIN_PLAYERS) {
    // إلغاء - لا يمكن اللعب وحيداً
    io.to(roomId).emit('lobbyCancelled', {
      message: 'يلزم على الأقل لاعبين للبدء! انتظر...',
    });
    room.state = ROOM_STATES.WAITING;
    return;
  }

  // مؤقت العد التنازلي
  const countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      startGame(roomId);
    } else {
      io.to(roomId).emit('lobbyCountdown', {
        message: `اللعبة ستبدأ خلال ${remaining}...`,
        seconds: remaining,
        players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
      });
    }
  }, 1000);

  room._countdownInterval = countdownInterval;
}

// بدء اللعبة
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = ROOM_STATES.PLAYING;
  room.startTime = Date.now();

  // تهيئة مواقع اللاعبين في الحلبة
  const ringRadius = 4;
  room.players.forEach((p, i) => {
    const angle = (i / room.players.length) * Math.PI * 2;
    p.x = Math.cos(angle) * ringRadius;
    p.y = 0.5;
    p.z = Math.sin(angle) * ringRadius;
    p.health = 100;
    p.score = 0;
    p.alive = true;
  });

  // إعلام الجميع ببدء اللعبة
  io.to(roomId).emit('gameStart', {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      z: p.z,
      health: p.health,
      score: p.score,
      alive: true,
    })),
  });

  // مؤقت نهاية اللعبة
  room.gameTimer = setTimeout(() => endGame(roomId), GAME_DURATION);

  // حلقة اللعبة (30 مرة في الثانية)
  room.gameLoopInterval = setInterval(() => gameLoop(roomId), 1000 / 30);
}

// حلقة اللعبة
function gameLoop(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== ROOM_STATES.PLAYING) return;

  const elapsed = Date.now() - room.startTime;
  const remaining = Math.max(0, GAME_DURATION - elapsed);

  // إرسال تحديث الحالة
  io.to(roomId).emit('gameUpdate', {
    players: room.players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      health: p.health,
      score: p.score,
      alive: p.alive,
      dirX: p.dirX || 0,
      dirZ: p.dirZ || 0,
      punching: p.punching || false,
    })),
    remaining: remaining,
    elapsed: elapsed,
  });

  // فحص نهاية اللعبة (إذا بقي لاعب واحد حي)
  const alivePlayers = room.players.filter(p => p.alive);
  if (alivePlayers.length <= 1 && room.players.length >= 2) {
    endGame(roomId);
  }
}

// إنهاء اللعبة
function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = ROOM_STATES.FINISHED;

  // ترتيب اللاعبين حسب النتيجة
  const ranked = [...room.players].sort((a, b) => b.score - a.score);

  io.to(roomId).emit('gameEnd', {
    players: ranked.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      rank: i + 1,
      health: p.health,
      alive: p.alive,
    })),
    winner: ranked[0] ? { name: ranked[0].name, color: ranked[0].color } : null,
  });

  // تنظيف
  if (room.gameTimer) clearTimeout(room.gameTimer);
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
  if (room._countdownInterval) clearInterval(room._countdownInterval);

  // إعادة تعيين الغرفة بعد 10 ثواني
  setTimeout(() => {
    room.players = [];
    room.state = ROOM_STATES.WAITING;
    room.worldObjects = [];
  }, 10000);
}

// ╔══════════════════════════════════════════╗
// ║          اتصالات Socket.io              ║
// ╚══════════════════════════════════════════╝
io.on('connection', (socket) => {
  console.log(`👋 اتصال جديد: ${socket.id}`);

  let currentRoomId = null;
  let currentPlayerData = null;

  // طلب الانضمام للغرفة
  socket.on('joinLobby', (data) => {
    const playerName = (data.name || 'لاعب').trim().substring(0, 15);
    const roomId = findOrCreateRoom();
    const room = rooms[roomId];

    // التحقق من السعة
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('joinError', { message: 'الغرفة ممتلئة!' });
      return;
    }

    // إضافة اللاعب
    const playerData = {
      id: socket.id,
      name: playerName,
      color: randomColor(),
      x: 0, y: 0.5, z: 0,
      health: 100,
      score: 0,
      alive: true,
      dirX: 0,
      dirZ: 0,
      punching: false,
    };

    room.players.push(playerData);
    socket.join(roomId);
    currentRoomId = roomId;
    currentPlayerData = playerData;

    console.log(`👤 ${playerName} انضم للغرفة ${roomId} (${room.players.length}/${MAX_PLAYERS})`);

    // إعلام اللاعب ببياناته
    socket.emit('joinedLobby', {
      playerId: socket.id,
      playerColor: playerData.color,
      roomId: roomId,
      players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
      count: room.players.length,
      max: MAX_PLAYERS,
      min: MIN_PLAYERS,
    });

    // إعلام الآخرين
    socket.to(roomId).emit('playerJoinedLobby', {
      id: socket.id,
      name: playerName,
      color: playerData.color,
      count: room.players.length,
      max: MAX_PLAYERS,
    });

    // فحص البدء
    checkRoomStart(roomId);
  });

  // فحص شروط بدء الغرفة
  function checkRoomStart(roomId) {
    const room = rooms[roomId];
    if (!room || room.state !== ROOM_STATES.WAITING) return;

    const count = room.players.length;

    // اكتمل العدد -> ابدأ فوراً
    if (count >= MAX_PLAYERS) {
      if (room._lobbyTimeout) clearTimeout(room._lobbyTimeout);
      startLobbyCountdown(roomId);
      return;
    }

    // وصل العدد الأدنى -> ابدأ مؤقت 60 ثانية
    if (count >= MIN_PLAYERS && !room._lobbyTimeout) {
      io.to(roomId).emit('lobbyWaiting', {
        message: `بانتظار لاعبين إضافيين... (${count}/${MAX_PLAYERS})`,
        count: count,
        max: MAX_PLAYERS,
        timeout: LOBBY_TIMEOUT / 1000,
      });

      room._lobbyTimeout = setTimeout(() => {
        if (room.state === ROOM_STATES.WAITING && room.players.length >= MIN_PLAYERS) {
          startLobbyCountdown(roomId);
        }
        room._lobbyTimeout = null;
      }, LOBBY_TIMEOUT);
    }
  }

  // استقبال حركة اللاعب
  socket.on('playerMove', (data) => {
    if (!currentPlayerData || !currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || room.state !== ROOM_STATES.PLAYING) return;

    currentPlayerData.x = data.x;
    currentPlayerData.y = data.y;
    currentPlayerData.z = data.z;
    currentPlayerData.dirX = data.dirX || 0;
    currentPlayerData.dirZ = data.dirZ || 0;
    currentPlayerData.punching = data.punching || false;
    currentPlayerData.health = data.health ?? currentPlayerData.health;
    currentPlayerData.score = data.score ?? currentPlayerData.score;
    currentPlayerData.alive = data.alive ?? currentPlayerData.alive;

    // بث للآخرين
    socket.to(currentRoomId).emit('playerUpdate', {
      id: socket.id,
      x: currentPlayerData.x,
      y: currentPlayerData.y,
      z: currentPlayerData.z,
      dirX: currentPlayerData.dirX,
      dirZ: currentPlayerData.dirZ,
      punching: currentPlayerData.punching,
      health: currentPlayerData.health,
      score: currentPlayerData.score,
      alive: currentPlayerData.alive,
    });
  });

  // حدث الضربة
  socket.on('playerPunch', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('playerPunched', {
      attackerId: socket.id,
      targetId: data.targetId,
      power: data.power || 10,
      direction: data.direction || { x: 0, y: 1, z: 0 },
    });
  });

  // عند الانفصال
  socket.on('disconnect', () => {
    console.log(`👋 انفصال: ${socket.id}`);

    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        // حذف الغرفة الفارغة
        if (room.gameTimer) clearTimeout(room.gameTimer);
        if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
        if (room._lobbyTimeout) clearTimeout(room._lobbyTimeout);
        if (room._countdownInterval) clearInterval(room._countdownInterval);
        delete rooms[currentRoomId];
      } else {
        io.to(currentRoomId).emit('playerLeftLobby', {
          id: socket.id,
          count: room.players.length,
          max: MAX_PLAYERS,
        });

        // إعادة فحص شروط البدء
        if (room.state === ROOM_STATES.WAITING) {
          if (room.players.length < MIN_PLAYERS && room._lobbyTimeout) {
            clearTimeout(room._lobbyTimeout);
            room._lobbyTimeout = null;
          }
        }
      }
    }
  });
});

// تنظيف دوري للغرف المهجورة
setInterval(() => {
  for (const [id, room] of Object.entries(rooms)) {
    if (room.players.length === 0 && room.state === ROOM_STATES.WAITING) {
      if (room._lobbyTimeout) clearTimeout(room._lobbyTimeout);
      delete rooms[id];
    }
  }
}, 300000); // كل 5 دقائق

// بدء السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Bone Brawl يعمل على: http://0.0.0.0:${PORT}`);
  console.log(`👥 الحد الأدنى للاعبين: ${MIN_PLAYERS}`);
  console.log(`👥 الحد الأقصى للاعبين: ${MAX_PLAYERS}`);
  console.log(`⏱️ مدة انتظار اللوبي: ${LOBBY_TIMEOUT / 1000} ثانية`);
  console.log(`⏱️ مدة اللعبة: ${GAME_DURATION / 1000} ثانية`);
});
