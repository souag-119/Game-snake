// ============== المتغيرات العامة ==============
let token = localStorage.getItem('token');
let playerRole = null;
let playerUsername = null;
let gameState = null;
let socket = null;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ============== شاشة البداية (الشعارات) ==============
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

// ============== دخول اللعبة ==============
function enterGame() {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-interface').style.display = 'flex';
  document.getElementById('player-info').innerText = `مرحباً، ${playerUsername} (${playerRole})`;
  initCanvas();
  connectWebSocket();
  loadGameState();
  setupGameUI();
}

// ============== إعداد Canvas ==============
function initCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawMap();
  });
}

// ============== WebSocket ==============
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
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

// ============== تحميل حالة اللعبة ورسم الخريطة ==============
async function loadGameState() {
  const res = await fetch('/api/game-state');
  gameState = await res.json();
  drawMap();
}

function drawMap() {
  if (!gameState || !gameState.map) return;
  const map = gameState.map;
  const tileSize = Math.min(canvas.width / map.width, canvas.height / map.height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // رسم البلاطات
  map.tiles.forEach(tile => {
    const x = tile.x * tileSize;
    const y = tile.y * tileSize;

    if (tile.owner && gameState.players[tile.owner]) {
      ctx.fillStyle = gameState.players[tile.owner].color;
    } else if (tile.resource) {
      switch (tile.resource) {
        case 'gold': ctx.fillStyle = '#FFD700'; break;
        case 'wood': ctx.fillStyle = '#8B4513'; break;
        case 'iron': ctx.fillStyle = '#708090'; break;
        default: ctx.fillStyle = '#555'; break;
      }
    } else {
      ctx.fillStyle = '#3a3a5c';
    }
    ctx.fillRect(x, y, tileSize, tileSize);
    ctx.strokeStyle = '#111';
    ctx.strokeRect(x, y, tileSize, tileSize);
  });

  // كتابة أسماء الدول فوق أراضيها
  const players = gameState.players;
  for (let username in players) {
    const player = players[username];
    if (player.tiles && player.tiles.length > 0) {
      const centerTile = player.tiles[Math.floor(player.tiles.length / 2)];
      const cx = centerTile.x * tileSize + tileSize / 2;
      const cy = centerTile.y * tileSize + tileSize / 2;
      ctx.fillStyle = 'white';
      ctx.font = `${tileSize/2}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(player.name, cx, cy);
      if (player.flag) {
        const img = new Image();
        img.src = player.flag;
        img.onload = () => {
          ctx.drawImage(img, cx - tileSize/4, cy - tileSize/2, tileSize/2, tileSize/2);
        };
      }
    }
  }
}

// ============== واجهة المستخدم داخل اللعبة ==============
function setupGameUI() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    location.reload();
  });

  document.getElementById('send-chat').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // التعامل مع النقر على الخريطة
  canvas.addEventListener('click', (e) => {
    if (!gameState) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const tileSize = Math.min(canvas.width / gameState.map.width, canvas.height / gameState.map.height);
    const tileX = Math.floor(mouseX / tileSize);
    const tileY = Math.floor(mouseY / tileSize);
    handleTileClick(tileX, tileY);
  });
}

function handleTileClick(x, y) {
  // هنا يتم إضافة منطق اختيار البلاط لشن هجوم أو إضافة مورد (للمالك)
  console.log(`تم النقر على البلاط (${x}, ${y})`);
  if (playerRole === 'owner') {
    // فتح نافذة إضافة مورد
    const resource = prompt('أدخل نوع المورد (gold, wood, iron):');
    if (resource) {
      fetch('/api/owner/add-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ x, y, resourceType: resource })
      }).then(() => loadGameState());
    }
  }
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (message && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'chat', message, username: playerUsername }));
    input.value = '';
  }
}

function appendChatMessage(data) {
  const div = document.getElementById('chat-messages');
  div.innerHTML += `<p><strong>${data.username}:</strong> ${data.message}</p>`;
  div.scrollTop = div.scrollHeight;
}

// ============== بدء التطبيق ==============
window.onload = () => {
  if (token) {
    // محاولة استعادة الجلسة (سنتحقق من token لاحقاً بشكل أفضل)
    // حالياً نعرض تسجيل الدخول
    showSplash();
    setupLogin();
  } else {
    showSplash();
    setupLogin();
  }
};
