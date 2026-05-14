const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------- إعدادات اللعبة ----------
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_SPEED = 200; // بكسل في الثانية
const PLAYER_RADIUS = 25;
const GEM_RADIUS = 12;
const GEM_COUNT = 60;
const TICK_RATE = 1000 / 30; // 30 تحديث بالثانية

// ---------- حالة اللعبة ----------
let players = {};   // socketId -> { id, name, x, y, color, score, dirX, dirY }
let gems = [];      // [{ id, x, y }]

// توليد لون عشوائي مميز
function randomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
    '#F1948A', '#85C1E9', '#D7BDE2', '#A3E4D7',
    '#FAD7A0', '#ABEBC6', '#AED6F1', '#F5B7B1'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// توليد جوهرة في موقع عشوائي
function spawnGem() {
  return {
    id: 'gem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    x: Math.random() * (WORLD_WIDTH - 100) + 50,
    y: Math.random() * (WORLD_HEIGHT - 100) + 50,
  };
}

// تهيئة الجواهر
function initGems() {
  gems = [];
  for (let i = 0; i < GEM_COUNT; i++) {
    gems.push(spawnGem());
  }
}

// فحص تجميع الجواهر
function checkGemCollisions(playerId) {
  const player = players[playerId];
  if (!player) return;

  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i];
    const dx = player.x - gem.x;
    const dy = player.y - gem.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < PLAYER_RADIUS + GEM_RADIUS) {
      // جمع الجوهرة
      player.score += 10;
      gems.splice(i, 1);
      gems.push(spawnGem()); // تعويضها بواحدة جديدة
    }
  }
}

// حلقة اللعبة الرئيسية
function gameLoop() {
  const now = Date.now();
  const playersToUpdate = Object.values(players);

  for (const player of playersToUpdate) {
    if (player.dirX !== 0 || player.dirY !== 0) {
      // تطبيع الاتجاه
      const len = Math.sqrt(player.dirX * player.dirX + player.dirY * player.dirY);
      const nx = player.dirX / len;
      const ny = player.dirY / len;

      player.x += nx * PLAYER_SPEED * (TICK_RATE / 1000);
      player.y += ny * PLAYER_SPEED * (TICK_RATE / 1000);

      // تقييد داخل حدود العالم
      player.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, player.x));
      player.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, player.y));

      checkGemCollisions(player.id);
    }
  }

  // بث حالة اللعبة لجميع اللاعبين
  const state = {
    players: Object.values(players).map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      color: p.color,
      score: p.score,
    })),
    gems: gems,
  };

  io.emit('gameState', state);
}

// ---------- اتصالات Socket.io ----------
io.on('connection', (socket) => {
  console.log(`👋 لاعب متصل: ${socket.id}`);

  // إضافة لاعب جديد
  const playerColor = randomColor();
  players[socket.id] = {
    id: socket.id,
    name: 'Player',
    x: Math.random() * (WORLD_WIDTH - 200) + 100,
    y: Math.random() * (WORLD_HEIGHT - 200) + 100,
    color: playerColor,
    score: 0,
    dirX: 0,
    dirY: 0,
  };

  // إرسال بيانات اللاعب له
  socket.emit('playerInfo', {
    id: socket.id,
    color: playerColor,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    playerRadius: PLAYER_RADIUS,
    gemRadius: GEM_RADIUS,
  });

  // إرسال حالة اللعبة الحالية
  socket.emit('gameState', {
    players: Object.values(players).map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      color: p.color,
      score: p.score,
    })),
    gems: gems,
  });

  // إعلام الآخرين بلاعب جديد
  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    name: players[socket.id].name,
    x: players[socket.id].x,
    y: players[socket.id].y,
    color: playerColor,
    score: 0,
  });

  // استقبال تحديث الاسم
  socket.on('setName', (name) => {
    if (players[socket.id] && name && name.trim().length > 0) {
      players[socket.id].name = name.trim().substring(0, 15);
    }
  });

  // استقبال تحديث الاتجاه
  socket.on('setDirection', (data) => {
    if (players[socket.id]) {
      players[socket.id].dirX = data.x;
      players[socket.id].dirY = data.y;
    }
  });

  // عند الانفصال
  socket.on('disconnect', () => {
    console.log(`👋 لاعب غادر: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// بدء حلقة اللعبة
initGems();
setInterval(gameLoop, TICK_RATE);

// بدء السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 السيرفر يعمل على: http://0.0.0.0:${PORT}`);
  console.log(`🌐 للعب محلياً: http://localhost:${PORT}`);
});