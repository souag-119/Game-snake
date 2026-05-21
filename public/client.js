// ============== المتغيرات العامة ==============
let token = localStorage.getItem('token');
let playerRole = null;
let playerUsername = null;
let gameState = null;
let socket = null;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// إعدادات الخريطة
let mapWidth = 100; // عدد البلاطات الأفقي
let mapHeight = 100; // عدد البلاطات العمودي
let tileSize = 16; // حجم البلاطة بالبكسل (سيتغير مع الزوم)
let offsetX = 0;
let offsetY = 0;
let zoom = 1;

// حالة التحكم
let isPanning = false;
let panStart = { x: 0, y: 0 };
let selectedTool = 'pan'; // الأداة الحالية المختارة

// ============== الأصول البرمجية للتضاريس ==============
// كل دالة ترسم البلاطة بحجم tileSize وتعيد صورة مصغرة أو ترسم مباشرة
function drawGrassLight(ctx, x, y, size) {
  ctx.fillStyle = '#7CFC00'; // أخضر فاتح
  ctx.fillRect(x, y, size, size);
  // إضافة تفاصيل بسيطة
  ctx.fillStyle = '#6B8E23';
  for (let i = 0; i < 3; i++) {
    const bx = x + Math.random() * size;
    const by = y + Math.random() * size;
    ctx.fillRect(bx, by, 2, 2);
  }
}

function drawGrassDense(ctx, x, y, size) {
  ctx.fillStyle = '#228B22'; // أخضر غامق
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#006400';
  for (let i = 0; i < 5; i++) {
    const bx = x + Math.random() * size;
    const by = y + Math.random() * size;
    ctx.fillRect(bx, by, 2, 2);
  }
}

function drawRocky(ctx, x, y, size) {
  ctx.fillStyle = '#808080';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#A9A9A9';
  ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
}

function drawMountains(ctx, x, y, size) {
  ctx.fillStyle = '#2F4F4F';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#696969';
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.lineTo(x + size/2, y);
  ctx.lineTo(x + size, y + size);
  ctx.closePath();
  ctx.fill();
}

function drawSand(ctx, x, y, size) {
  ctx.fillStyle = '#F4A460';
  ctx.fillRect(x, y, size, size);
}

function drawWaterShallow(ctx, x, y, size) {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(x, y, size, size);
}

function drawWaterMedium(ctx, x, y, size) {
  ctx.fillStyle = '#4682B4';
  ctx.fillRect(x, y, size, size);
}

function drawWaterDeep(ctx, x, y, size) {
  ctx.fillStyle = '#000080';
  ctx.fillRect(x, y, size, size);
}

function drawTree(ctx, x, y, size) {
  // جذع
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x + size/3, y + size/2, size/3, size/2);
  // أوراق
  ctx.fillStyle = '#228B22';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/3, size/3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBurntTree(ctx, x, y, size) {
  ctx.fillStyle = '#2F1B14';
  ctx.fillRect(x + size/3, y + size/2, size/3, size/2);
  ctx.fillStyle = '#1A1A1A';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/3, size/4, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse(ctx, x, y, size) {
  ctx.fillStyle = '#CD853F';
  ctx.fillRect(x + 2, y + size/3, size - 4, size/2);
  ctx.fillStyle = '#A0522D';
  ctx.beginPath();
  ctx.moveTo(x + 2, y + size/3);
  ctx.lineTo(x + size/2, y + 2);
  ctx.lineTo(x + size - 2, y + size/3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(x + size/2 - 2, y + size/2, 4, 4);
}

function drawDestroyedHouse(ctx, x, y, size) {
  ctx.fillStyle = '#696969';
  ctx.fillRect(x + 2, y + size/3, size - 4, size/2);
  ctx.fillStyle = '#2F2F2F';
  ctx.fillRect(x + size/4, y + size/3, size/2, size/6);
}

// خريطة التضاريس إلى دوال الرسم
const terrainDrawFunctions = {
  'grass_light': drawGrassLight,
  'grass_dense': drawGrassDense,
  'rocky': drawRocky,
  'mountains': drawMountains,
  'sand': drawSand,
  'water_shallow': drawWaterShallow,
  'water_medium': drawWaterMedium,
  'water_deep': drawWaterDeep,
  'tree': drawTree,
  'burnt_tree': drawBurntTree,
  'house': drawHouse,
  'destroyed_house': drawDestroyedHouse
};

// ============== إعدادات الرسم والتفاعل ==============
function initCanvas() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // أحداث الفأرة واللمس للتحريك والتكبير
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('wheel', onWheel);
  
  // أحداث اللمس
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
}

function resizeCanvas() {
  const container = document.getElementById('game-container');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  drawMap();
}

// تحويل إحداثيات الشاشة إلى إحداثيات البلاط
function screenToTile(screenX, screenY) {
  const tileX = Math.floor((screenX - offsetX) / (tileSize * zoom));
  const tileY = Math.floor((screenY - offsetY) / (tileSize * zoom));
  return { x: tileX, y: tileY };
}

// ============== الرسم الرئيسي ==============
function drawMap() {
  if (!gameState || !gameState.map) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // تطبيق التحويلات للتحريك والتكبير
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoom, zoom);
  
  const effectiveTileSize = tileSize;
  const map = gameState.map;
  
  // رسم البلاطات المرئية فقط (تحديد النطاق)
  const startCol = Math.max(0, Math.floor(-offsetX / (effectiveTileSize * zoom)));
  const startRow = Math.max(0, Math.floor(-offsetY / (effectiveTileSize * zoom)));
  const endCol = Math.min(map.width, startCol + Math.ceil(canvas.width / (effectiveTileSize * zoom)) + 1);
  const endRow = Math.min(map.height, startRow + Math.ceil(canvas.height / (effectiveTileSize * zoom)) + 1);
  
  // إنشاء خريطة البلاطات إذا لم تكن موجودة مسبقاً (للتبسيط سنفترض أن المصفوفة كاملة)
  if (!map.tiles || map.tiles.length === 0) {
    // توليد بيانات افتراضية للاختبار (سنقوم بإزالتها لاحقاً عندما نوفر بيانات حقيقية)
    map.tiles = [];
    for (let i = 0; i < map.width; i++) {
      for (let j = 0; j < map.height; j++) {
        map.tiles.push({ x: i, y: j, terrain: 'grass_light', owner: null, resource: null });
      }
    }
  }
  
  // رسم كل بلاطة
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tileIndex = row * map.width + col;
      const tile = map.tiles[tileIndex];
      if (!tile) continue;
      
      const x = col * effectiveTileSize;
      const y = row * effectiveTileSize;
      
      // رسم التضاريس الأساسية
      const drawFunc = terrainDrawFunctions[tile.terrain] || drawGrassLight;
      drawFunc(ctx, x, y, effectiveTileSize);
      
      // رسم الموارد إن وجدت
      if (tile.resource) {
        ctx.fillStyle = 'gold';
        ctx.fillRect(x + effectiveTileSize/4, y + effectiveTileSize/4, effectiveTileSize/2, effectiveTileSize/2);
        ctx.fillStyle = 'white';
        ctx.font = `${effectiveTileSize/3}px Arial`;
        ctx.fillText(tile.resource[0].toUpperCase(), x + effectiveTileSize/3, y + effectiveTileSize/2);
      }
      
      // رسم حدود الملكية
      if (tile.owner && gameState.players[tile.owner]) {
        ctx.strokeStyle = gameState.players[tile.owner].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, effectiveTileSize, effectiveTileSize);
      }
    }
  }
  
  ctx.restore();
}

// ============== أحداث التحكم بالخريطة ==============
function onPointerDown(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (selectedTool === 'pan' || e.button === 2) {
    isPanning = true;
    panStart = { x: x - offsetX, y: y - offsetY };
    canvas.style.cursor = 'grabbing';
  } else if (selectedTool === 'select' || selectedTool === 'attack' || selectedTool === 'add-resource') {
    const tile = screenToTile(x, y);
    handleTileAction(tile);
  }
}

function onPointerMove(e) {
  if (!isPanning) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  offsetX = x - panStart.x;
  offsetY = y - panStart.y;
  drawMap();
}

function onPointerUp() {
  isPanning = false;
  canvas.style.cursor = 'default';
}

function onWheel(e) {
  e.preventDefault();
  const zoomFactor = 1.1;
  const oldZoom = zoom;
  if (e.deltaY < 0) {
    zoom *= zoomFactor;
  } else {
    zoom /= zoomFactor;
  }
  // الحدود
  zoom = Math.min(2, Math.max(0.5, zoom));
  
  // ضبط الإزاحة ليتم التكبير نحو المؤشر
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const worldX = (mouseX - offsetX) / oldZoom;
  const worldY = (mouseY - offsetY) / oldZoom;
  offsetX = mouseX - worldX * zoom;
  offsetY = mouseY - worldY * zoom;
  
  drawMap();
}

// أحداث اللمس
function onTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  if (e.touches.length === 1) {
    // بدء التحريك أو النقر
    isPanning = true;
    panStart = { x: x - offsetX, y: y - offsetY };
  } else if (e.touches.length === 2) {
    // بدء التكبير بإصبعين
    isPanning = false;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && isPanning) {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    offsetX = x - panStart.x;
    offsetY = y - panStart.y;
    drawMap();
  } else if (e.touches.length === 2) {
    // تكبير بإصبعين
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
    if (this.lastTouchDist) {
      const zoomChange = currentDist / this.lastTouchDist;
      zoom = Math.min(2, Math.max(0.5, zoom * zoomChange));
      // مركز التكبير بين الإصبعين
      const rect = canvas.getBoundingClientRect();
      const midX = ((touch1.clientX + touch2.clientX) / 2 - rect.left);
      const midY = ((touch1.clientY + touch2.clientY) / 2 - rect.top);
      const worldX = (midX - offsetX) / (zoom / zoomChange);
      const worldY = (midY - offsetY) / (zoom / zoomChange);
      offsetX = midX - worldX * zoom;
      offsetY = midY - worldY * zoom;
    }
    this.lastTouchDist = currentDist;
    drawMap();
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    isPanning = false;
    this.lastTouchDist = null;
  }
}

// ============== شريط الأدوات ==============
function setupToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // إزالة النشاط من الكل
      document.querySelectorAll('.tool-btn').forEach(b => b.style.background = '#0f3460');
      btn.style.background = '#533483';
      selectedTool = btn.dataset.action;
      
      // إظهار/إخفاء الدردشة عند الضغط على زر الدبلوماسية مثلاً
      if (selectedTool === 'diplomacy') {
        document.getElementById('chat-panel').style.display = 
          document.getElementById('chat-panel').style.display === 'none' ? 'flex' : 'none';
      } else {
        document.getElementById('chat-panel').style.display = 'none';
      }
    });
  });
  
  // إظهار أدوات المالك إذا كان الدور owner
  if (playerRole === 'owner') {
    document.getElementById('owner-tools').style.display = 'flex';
  }
}

function handleTileAction(tile) {
  if (!tile || !gameState) return;
  
  if (selectedTool === 'add-resource' && playerRole === 'owner') {
    const resource = prompt('أدخل نوع المورد (gold, wood, iron):');
    if (resource) {
      fetch('/api/owner/add-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ x: tile.x, y: tile.y, resourceType: resource })
      }).then(() => loadGameState());
    }
  } else if (selectedTool === 'select') {
    // إظهار معلومات البلاط
    const tileData = gameState.map.tiles.find(t => t.x === tile.x && t.y === tile.y);
    alert(`بلاط (${tile.x},${tile.y}): ${tileData.terrain} - المالك: ${tileData.owner || 'لا أحد'}`);
  }
  // إضافة أدوات أخرى مثل الهجوم لاحقاً
}

// ============== دوال الشبكة والجلسة (لم تتغير كثيراً) ==============
async function loadGameState() {
  const res = await fetch('/api/game-state');
  gameState = await res.json();
  // ضبط حجم الخريطة إذا تغير
  if (gameState.map) {
    mapWidth = gameState.map.width;
    mapHeight = gameState.map.height;
  }
  drawMap();
}

// ... (باقي دوال WebSocket وتسجيل الدخول كما هي، مع تعديل طفيف لتضمين setupToolbar)// ============== شاشة البداية (الشعارات) ==============
function showSplash() {
const studioLogo = document.getElementById('studio-logo');
const serverLogo = document.getElementById('server-logo');
const studioImg = document.getElementById('studio-img');
const serverImg = document.getElementById('server-img');

// تعيين مسارات افتراضية للصور
studioImg.src = 'assets/studio-logo.png';
serverImg.src = 'assets/server-logo.png';

// تأثير الظهور والاختفاء
studioImg.style.opacity = '0';
serverImg.style.opacity = '0';
studioLogo.style.display = 'block';
serverLogo.style.display = 'none';

setTimeout(() => {
studioImg.style.opacity = '1';
}, 100);

setTimeout(() => {
studioImg.style.opacity = '0';
}, 2500);

setTimeout(() => {
studioLogo.style.display = 'none';
serverLogo.style.display = 'block';
setTimeout(() => {
serverImg.style.opacity = '1';
}, 100);
}, 3000);

setTimeout(() => {
serverImg.style.opacity = '0';
}, 5500);

setTimeout(() => {
document.getElementById('splash-screen').style.display = 'none';
document.getElementById('main-menu').style.display = 'flex';
}, 6500);
}

// ============== واجهة تسجيل الدخول ==============
function setupLogin() {
document.getElementById('login-btn').addEventListener('click', async () => {
const username = document.getElementById('username').value;
const password = document.getElementById('password').value;
try {
const res = await fetch('/api/login', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ username, password })
});
const data = await res.json();
if (data.error) return alert(data.error);
token = data.token;
playerRole = data.role;
playerUsername = username;
localStorage.setItem('token', token);
enterGame();
} catch (e) {
alert('خطأ في الاتصال');
}
});

document.getElementById('owner-login-btn').addEventListener('click', () => {
document.getElementById('owner-password-section').style.display = 'block';
});

document.getElementById('confirm-owner-login').addEventListener('click', async () => {
const username = document.getElementById('username').value;
const password = document.getElementById('password').value;
const ownerPassword = document.getElementById('owner-password').value;
const res = await fetch('/api/owner-login', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ username, password, ownerPassword })
});
const data = await res.json();
if (data.error) return alert(data.error);
token = data.token;
playerRole = 'owner';
playerUsername = username;
localStorage.setItem('token', token);
enterGame();
});

document.getElementById('register-btn').addEventListener('click', () => {
document.getElementById('register-section').style.display = 'block';
});

document.getElementById('confirm-register').addEventListener('click', async () => {
const username = document.getElementById('username').value;
const password = document.getElementById('reg-password').value;
const res = await fetch('/api/register', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ username, password })
});
const data = await res.json();
if (data.error) return alert(data.error);
alert('تم التسجيل بنجاح، يمكنك تسجيل الدخول الآن');
document.getElementById('register-section').style.display = 'none';
});
}

// ============== WebSocket ==============
function connectWebSocket() {
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = ${protocol}//${window.location.host};
socket = new WebSocket(wsUrl);

socket.onopen = () => {
console.log('WebSocket متصل');
socket.send(JSON.stringify({ type: 'join', token }));
};

socket.onmessage = (event) => {
const data = JSON.parse(event.data);
if (data.type === 'map_update') {
gameState.map = data.map;
drawMap();
} else if (data.type === 'chat_message') {
appendChatMessage(data);
}
};

socket.onclose = () => {
console.log('WebSocket مغلق، إعادة المحاولة...');
setTimeout(connectWebSocket, 3000);
};
}
