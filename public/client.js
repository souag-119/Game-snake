// ===================== المتغيرات العامة =====================
let token = localStorage.getItem('token');
let playerRole = null;
let playerUsername = null;
let gameState = null;
let socket = null;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// إعدادات الخريطة
let mapWidth = 100;
let mapHeight = 100;
let tileSize = 16; // حجم البلاطة الأساسي (بكسل)
let offsetX = 0;
let offsetY = 0;
let zoom = 1;
let currentTool = 'pan'; // الأداة النشطة حاليًا

// حالة التحريك
let isPanning = false;
let panStart = { x: 0, y: 0 };
let lastTouchDist = null; // لتكبير اللمس

// ========== دوال الرسم البرمجي للتضاريس ==========
function drawGrassLight(ctx, x, y, s) {
    ctx.fillStyle = '#7CFC00';
    ctx.fillRect(x, y, s, s);
    // تفاصيل عشوائية
    ctx.fillStyle = '#6B8E23';
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + Math.random() * s, y + Math.random() * s, 2, 2);
    }
}

function drawGrassDense(ctx, x, y, s) {
    ctx.fillStyle = '#228B22';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#006400';
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + Math.random() * s, y + Math.random() * s, 2, 2);
    }
}

function drawRocky(ctx, x, y, s) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#A9A9A9';
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
}

function drawMountains(ctx, x, y, s) {
    ctx.fillStyle = '#2F4F4F';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#696969';
    ctx.beginPath();
    ctx.moveTo(x, y + s);
    ctx.lineTo(x + s / 2, y);
    ctx.lineTo(x + s, y + s);
    ctx.closePath();
    ctx.fill();
}

function drawSand(ctx, x, y, s) {
    ctx.fillStyle = '#F4A460';
    ctx.fillRect(x, y, s, s);
}

function drawWaterShallow(ctx, x, y, s) {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(x, y, s, s);
}

function drawWaterMedium(ctx, x, y, s) {
    ctx.fillStyle = '#4682B4';
    ctx.fillRect(x, y, s, s);
}

function drawWaterDeep(ctx, x, y, s) {
    ctx.fillStyle = '#000080';
    ctx.fillRect(x, y, s, s);
}

function drawTree(ctx, x, y, s) {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x + s / 3, y + s / 2, s / 3, s / 2);
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 3, s / 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawBurntTree(ctx, x, y, s) {
    ctx.fillStyle = '#2F1B14';
    ctx.fillRect(x + s / 3, y + s / 2, s / 3, s / 2);
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 3, s / 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawHouse(ctx, x, y, s) {
    ctx.fillStyle = '#CD853F';
    ctx.fillRect(x + 2, y + s / 3, s - 4, s / 2);
    ctx.fillStyle = '#A0522D';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + s / 3);
    ctx.lineTo(x + s / 2, y + 2);
    ctx.lineTo(x + s - 2, y + s / 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x + s / 2 - 2, y + s / 2, 4, 4);
}

function drawDestroyedHouse(ctx, x, y, s) {
    ctx.fillStyle = '#696969';
    ctx.fillRect(x + 2, y + s / 3, s - 4, s / 2);
    ctx.fillStyle = '#2F2F2F';
    ctx.fillRect(x + s / 4, y + s / 3, s / 2, s / 6);
}

// قاموس ربط التضاريس بدوال الرسم
const terrainDraw = {
    grass_light: drawGrassLight,
    grass_dense: drawGrassDense,
    rocky: drawRocky,
    mountains: drawMountains,
    sand: drawSand,
    water_shallow: drawWaterShallow,
    water_medium: drawWaterMedium,
    water_deep: drawWaterDeep,
    tree: drawTree,
    burnt_tree: drawBurntTree,
    house: drawHouse,
    destroyed_house: drawDestroyedHouse
};

// ========== دوال المساعدة ==========
function screenToTile(screenX, screenY) {
    const worldX = (screenX - offsetX) / zoom;
    const worldY = (screenY - offsetY) / zoom;
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    return { x: col, y: row };
}

// ========== رسم الخريطة ==========
function drawMap() {
    if (!gameState || !gameState.map) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    const map = gameState.map;
    const tSize = tileSize;

    // تحديد نطاق البلاطات المرئية
    const startCol = Math.max(0, Math.floor(-offsetX / (tSize * zoom)));
    const startRow = Math.max(0, Math.floor(-offsetY / (tSize * zoom)));
    const endCol = Math.min(map.width, startCol + Math.ceil(canvas.width / (tSize * zoom)) + 1);
    const endRow = Math.min(map.height, startRow + Math.ceil(canvas.height / (tSize * zoom)) + 1);

    // إذا كانت المصفوفة فارغة نُنشئ بيانات افتراضية
    if (!map.tiles || map.tiles.length === 0) {
        map.tiles = [];
        for (let row = 0; row < map.height; row++) {
            for (let col = 0; col < map.width; col++) {
                // تعيين تضاريس عشوائية للاختبار
                let terrain = 'grass_light';
                const r = Math.random();
                if (r < 0.4) terrain = 'grass_light';
                else if (r < 0.7) terrain = 'grass_dense';
                else if (r < 0.8) terrain = 'rocky';
                else if (r < 0.9) terrain = 'mountains';
                else if (r < 0.95) terrain = 'sand';
                else terrain = 'water_shallow';
                map.tiles.push({ x: col, y: row, terrain, owner: null, resource: null });
            }
        }
    }

    // رسم البلاطات
    for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
            const idx = row * map.width + col;
            const tile = map.tiles[idx];
            if (!tile) continue;

            const x = col * tSize;
            const y = row * tSize;

            // تضاريس
            const drawFunc = terrainDraw[tile.terrain] || drawGrassLight;
            drawFunc(ctx, x, y, tSize);

            // مورد
            if (tile.resource) {
                ctx.fillStyle = 'gold';
                ctx.fillRect(x + tSize / 4, y + tSize / 4, tSize / 2, tSize / 2);
                ctx.fillStyle = 'white';
                ctx.font = `${tSize / 3}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(tile.resource[0].toUpperCase(), x + tSize / 2, y + tSize / 1.8);
            }

            // حدود الملكية
            if (tile.owner && gameState.players[tile.owner]) {
                ctx.strokeStyle = gameState.players[tile.owner].color;
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, tSize, tSize);
            }
        }
    }

    // أسماء الدول (مركز الثقل)
    if (gameState.players) {
        for (let username in gameState.players) {
            const player = gameState.players[username];
            if (player.tiles && player.tiles.length > 0) {
                const center = player.tiles[Math.floor(player.tiles.length / 2)];
                const cx = center.x * tSize + tSize / 2;
                const cy = center.y * tSize + tSize / 2;
                ctx.fillStyle = 'white';
                ctx.font = `bold ${Math.max(10, tSize / 2)}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(player.name, cx, cy);
            }
        }
    }

    ctx.restore();
}

// ========== التعامل مع أدوات الخريطة ==========
function handleTileAction(tile) {
    if (!gameState || !tile) return;
    const map = gameState.map;
    const idx = tile.y * map.width + tile.x;
    const tileData = map.tiles[idx];

    if (currentTool === 'select') {
        if (tileData) {
            alert(`إحداثيات: (${tile.x},${tile.y})\nالتضاريس: ${tileData.terrain}\nالمالك: ${tileData.owner || 'لا أحد'}\nالموارد: ${tileData.resource || 'لا يوجد'}`);
        }
    } else if (currentTool === 'add-resource' && playerRole === 'owner') {
        const resource = prompt('أدخل نوع المورد (gold, wood, iron):');
        if (resource && ['gold', 'wood', 'iron'].includes(resource)) {
            fetch('/api/owner/add-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                body: JSON.stringify({ x: tile.x, y: tile.y, resourceType: resource })
            }).then(() => loadGameState());
        } else if (resource) {
            alert('نوع مورد غير صالح');
        }
    } else if (currentTool === 'attack') {
        // سيتم تطويره لاحقًا
        alert('وضع الهجوم قيد التطوير');
    }
}

// ========== أحداث الفأرة واللمس ==========
function setupCanvasEvents() {
    // ماوس
    canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (currentTool === 'pan' || e.button === 2) {
            isPanning = true;
            panStart = { x: mx - offsetX, y: my - offsetY };
            canvas.style.cursor = 'grabbing';
        } else {
            const tile = screenToTile(mx, my);
            handleTileAction(tile);
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        offsetX = mx - panStart.x;
        offsetY = my - panStart.y;
        drawMap();
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = (mx - offsetX) / zoom;
        const worldY = (my - offsetY) / zoom;

        const factor = 1.1;
        if (e.deltaY < 0) zoom *= factor;
        else zoom /= factor;
        zoom = Math.min(2, Math.max(0.5, zoom));

        offsetX = mx - worldX * zoom;
        offsetY = my - worldY * zoom;
        drawMap();
    });

    // منع قائمة السياق
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // أحداث اللمس
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mx = touch.clientX - rect.left;
            const my = touch.clientY - rect.top;
            if (currentTool === 'pan') {
                isPanning = true;
                panStart = { x: mx - offsetX, y: my - offsetY };
            } else {
                const tile = screenToTile(mx, my);
                handleTileAction(tile);
            }
        } else if (e.touches.length === 2) {
            isPanning = false;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length === 1 && isPanning) {
            const touch = e.touches[0];
            const mx = touch.clientX - rect.left;
            const my = touch.clientY - rect.top;
            offsetX = mx - panStart.x;
            offsetY = my - panStart.y;
            drawMap();
        } else if (e.touches.length === 2 && lastTouchDist) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const change = newDist / lastTouchDist;
            const midX = ((t1.clientX + t2.clientX) / 2) - rect.left;
            const midY = ((t1.clientY + t2.clientY) / 2) - rect.top;
            const worldX = (midX - offsetX) / zoom;
            const worldY = (midY - offsetY) / zoom;

            zoom = Math.min(2, Math.max(0.5, zoom * change));
            offsetX = midX - worldX * zoom;
            offsetY = midY - worldY * zoom;
            lastTouchDist = newDist;
            drawMap();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        isPanning = false;
        lastTouchDist = null;
    });
}

// ========== شريط الأدوات ==========
function setupToolbar() {
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // إزالة التحديد عن الكل
            buttons.forEach(b => b.style.background = '#0f3460');
            btn.style.background = '#533483';
            currentTool = btn.dataset.action;

            // إظهار/إخفاء الدردشة عند الضغط على "دبلوماسية"
            if (currentTool === 'diplomacy') {
                const panel = document.getElementById('chat-panel');
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            } else {
                document.getElementById('chat-panel').style.display = 'none';
            }
        });
    });

    // إظهار أدوات المالك
    if (playerRole === 'owner') {
        document.getElementById('owner-tools').style.display = 'flex';
    }
}

// ========== تحميل حالة اللعبة ==========
async function loadGameState() {
    try {
        const res = await fetch('/api/game-state');
        gameState = await res.json();
        if (gameState.map) {
            mapWidth = gameState.map.width;
            mapHeight = gameState.map.height;
        }
        drawMap();
    } catch (err) {
        console.error('فشل تحميل حالة اللعبة:', err);
    }
}

// ========== WebSocket ==========
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
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

// ========== الدردشة ==========
function setupChat() {
    document.getElementById('send-chat').addEventListener('click', sendChat);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (msg && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'chat', message: msg, username: playerUsername }));
        input.value = '';
    }
}

function appendChatMessage(data) {
    const div = document.getElementById('chat-messages');
    const p = document.createElement('p');
    p.innerHTML = `<strong>${data.username}:</strong> ${data.message}`;
    div.appendChild(p);
    div.scrollTop = div.scrollHeight;
}

// ========== شاشة البداية والقوائم ==========
function showSplash() {
    const studioImg = document.getElementById('studio-img');
    const serverImg = document.getElementById('server-img');
    const studioLogo = document.getElementById('studio-logo');
    const serverLogo = document.getElementById('server-logo');

    studioImg.style.opacity = '0';
    serverImg.style.opacity = '0';

    setTimeout(() => { studioImg.style.opacity = '1'; }, 100);
    setTimeout(() => { studioImg.style.opacity = '0'; }, 2500);
    setTimeout(() => {
        studioLogo.style.display = 'none';
        serverLogo.style.display = 'block';
        setTimeout(() => { serverImg.style.opacity = '1'; }, 100);
    }, 3000);
    setTimeout(() => { serverImg.style.opacity = '0'; }, 5500);
    setTimeout(() => {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    }, 6500);
}

function setupLogin() {
    document.getElementById('login-btn').onclick = async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
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
        startGame();
    };

    document.getElementById('owner-login-btn').onclick = () => {
        document.getElementById('owner-password-section').style.display = 'block';
    };

    document.getElementById('confirm-owner-login').onclick = async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const ownerPass = document.getElementById('owner-password').value;
        const res = await fetch('/api/owner-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, ownerPassword: ownerPass })
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        token = data.token;
        playerRole = 'owner';
        playerUsername = username;
        localStorage.setItem('token', token);
        startGame();
    };

    document.getElementById('register-btn').onclick = () => {
        document.getElementById('register-section').style.display = 'block';
    };

    document.getElementById('confirm-register').onclick = async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('reg-password').value;
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        alert('تم إنشاء الحساب بنجاح');
        document.getElementById('register-section').style.display = 'none';
    };
}

function startGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-interface').style.display = 'flex';
    document.getElementById('player-info').innerText = `مرحباً، ${playerUsername} (${playerRole})`;
    initCanvas();
    setupCanvasEvents();
    setupToolbar();
    setupChat();
    connectWebSocket();
    loadGameState();
}

function initCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    window.addEventListener('resize', () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawMap();
    });
}

// ========== البدء ==========
window.onload = () => {
    // إذا كان هناك token سابق، نحاول الدخول مباشرة (سنفحصه في المستقبل)
    if (token) {
        // يمكن إضافة تحقق من صحة الجلسة عبر API
        // حاليًا نظهر الشاشة الرئيسية
        showSplash();
        setupLogin();
    } else {
        showSplash();
        setupLogin();
    }
};
