const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { JsonDB, Config } = require('node-json-db');
const { v4: uuidv4 } = require('uuid');

// إنشاء مجلدات إذا لم تكن موجودة
const dirs = ['database', 'public/assets/flags'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// إعداد قاعدة البيانات
const usersDB = new JsonDB(new Config("database/users", true, true, '/'));
// اللعبة الأساسية (يمكن أن يكون هناك ألعاب متعددة)
const gameDB = new JsonDB(new Config("database/game_1", true, true, '/'));

// تهيئة بيانات اللعبة الافتراضية
(async () => {
  try {
    await gameDB.getData("/map");
  } catch {
    await gameDB.push("/map", {
      width: 100,
      height: 100,
      tiles: [] // كل بلاطة {x, y, owner: null, resource: null, terrain: 'land'}
    });
    await gameDB.push("/players", {});
    await gameDB.push("/alliances", []);
    await gameDB.push("/wars", []);
    await gameDB.push("/settings", {
      ownerPassword: "زيطوط",
      tickInterval: 5000, // مللي ثانية لتحديث الموارد
    });
  }
})();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// إعداد multer لرفع صور الأعلام
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/assets/flags';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 } }); // حد 500 كيلوبايت

// ============ API Routes ============

// تسجيل لاعب جديد
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  try {
    await usersDB.getData(`/players/${username}`);
    return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
  } catch {
    await usersDB.push(`/players/${username}`, { password, role: 'player' });
    return res.json({ success: true });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await usersDB.getData(`/players/${username}`);
    if (user.password !== password) return res.status(401).json({ error: 'كلمة المرور خاطئة' });
    // توليد رمز بسيط للجلسة (في الإنتاج استخدم JWT)
    const token = uuidv4();
    await usersDB.push(`/sessions/${token}`, { username, role: user.role, created: Date.now() }, false);
    return res.json({ token, role: user.role });
  } catch {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
});

// تسجيل الدخول كمالك (يتحقق من كلمة المالك)
app.post('/api/owner-login', async (req, res) => {
  const { username, password, ownerPassword } = req.body;
  try {
    const settings = await gameDB.getData("/settings");
    if (ownerPassword !== settings.ownerPassword) return res.status(403).json({ error: 'كلمة المالك غير صحيحة' });
    // إنشاء حساب مالك إذا لم يكن موجوداً
    try {
      await usersDB.getData(`/players/${username}`);
    } catch {
      await usersDB.push(`/players/${username}`, { password, role: 'owner' });
    }
    const token = uuidv4();
    await usersDB.push(`/sessions/${token}`, { username, role: 'owner', created: Date.now() }, false);
    return res.json({ token, role: 'owner' });
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// إنشاء دولة للاعب (يتطلب token)
app.post('/api/create-nation', upload.single('flag'), async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const session = await usersDB.getData(`/sessions/${token}`);
    if (session.role !== 'player') return res.status(403).json({ error: 'فقط اللاعبون يمكنهم إنشاء دول' });
    const { name, color } = req.body;
    const flagPath = req.file ? '/assets/flags/' + req.file.filename : null;
    const nations = await gameDB.getData("/players");
    if (nations[session.username]) return res.status(400).json({ error: 'لديك دولة بالفعل' });
    await gameDB.push(`/players/${session.username}`, {
      name,
      color,
      flag: flagPath,
      resources: { gold: 100, wood: 100, iron: 50 },
      army: 0,
      tiles: [] // قائمة إحداثيات البلاطات المملوكة
    });
    res.json({ success: true });
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  }
});

// الحصول على حالة اللعبة كاملة (لللاعبين)
app.get('/api/game-state', async (req, res) => {
  try {
    const state = await gameDB.getData("/");
    // إزالة كلمة المالك من الإعدادات قبل الإرسال
    if (state.settings) delete state.settings.ownerPassword;
    res.json(state);
  } catch {
    res.status(500).json({ error: 'خطأ في تحميل حالة اللعبة' });
  }
});

// واجهة المالك: إضافة مورد على البلاط
app.post('/api/owner/add-resource', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const session = await usersDB.getData(`/sessions/${token}`);
    if (session.role !== 'owner') return res.status(403).json({ error: 'غير مسموح' });
    const { x, y, resourceType } = req.body;
    const map = await gameDB.getData("/map");
    const tile = map.tiles.find(t => t.x === x && t.y === y);
    if (tile) {
      tile.resource = resourceType; // مثل gold, wood, iron
    } else {
      map.tiles.push({ x, y, owner: null, resource: resourceType, terrain: 'land' });
    }
    await gameDB.push("/map", map);
    // إرسال تحديث عبر WebSocket لجميع العملاء
    broadcast({ type: 'map_update', map });
    res.json({ success: true });
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  }
});

// ============ WebSocket ============
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // التعامل مع الأوامر من العميل مثل طلب الانضمام، تحريك جيش، إعلان حرب
      handleGameMessage(ws, data);
    } catch (e) {
      console.error('خطأ في رسالة WebSocket:', e);
    }
  });

  ws.send(JSON.stringify({ type: 'welcome', message: 'مرحباً بك في لعبة الحروب!' }));
});

async function handleGameMessage(ws, data) {
  // سيتم تنفيذ المنطق لاحقًا (هجوم، تحالفات، الخ)
  if (data.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  }
  // المزيد من الأوامر ستضاف هنا
}

// ============ تشغيل الخادم ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
