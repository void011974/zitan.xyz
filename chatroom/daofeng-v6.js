/**
 * 刀锋 v6 — 聊天室值守 · 记忆库 · 心跳保活
 *
 * 升级亮点：
 * 1. 磁盘持久化记忆库，重启不丢失
 * 2. 预设世界观种子，记住过去的人和事
 * 3. 心跳保活，不再假死
 * 4. 记忆摘要自动更新
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9910/ws',
  botName: '🗡️ 刀锋',
  heartbeatInterval: 30,
  reconnectDelay: 5,
  maxHistoryPerUser: 20,
};

// ============ 记忆库系统 ============
const MEMORY_DIR = path.join(__dirname, 'data', 'daofeng_memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 世界观
let worldMemory = '';
try {
  const worldFile = path.join(MEMORY_DIR, '_world.txt');
  if (fs.existsSync(worldFile)) {
    worldMemory = fs.readFileSync(worldFile, 'utf8');
  }
} catch (e) {}

// 内存缓存
const memoryCache = {};

function _sanitizeName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 50);
}

function _loadPerson(name) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return { history: [], summary: '' };
}

function _savePerson(name, data) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (data.history.length > 100) data.history = data.history.slice(-100);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function getPersonMemory(name, maxRecent = 20) {
  if (!memoryCache[name]) memoryCache[name] = _loadPerson(name);
  return {
    history: memoryCache[name].history.slice(-maxRecent),
    summary: memoryCache[name].summary || ''
  };
}

function addToMemory(name, role, content) {
  if (!memoryCache[name]) memoryCache[name] = _loadPerson(name);
  memoryCache[name].history.push({ role, content, ts: Date.now() });
  _savePerson(name, memoryCache[name]);
}

async function updateSummary(name) {
  const mem = getPersonMemory(name, 50);
  if (mem.history.length < 5) return;
  const lines = mem.history.slice(-10).map(m =>
    `${m.role === 'user' ? name : '刀锋'}: ${m.content}`
  ).join('\n');
  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-0871082b5ea04fb3a688a96d4cbb46fb' },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '根据对话历史，提取对这个人（客人）的关键记忆：身份、喜好、聊过什么。如果已有摘要则更新。纯文本50-100字。' },
          ...(mem.summary ? [{ role: 'assistant', content: `已有摘要：${mem.summary}` }] : []),
          { role: 'user', content: `最近对话：\n${lines}` }
        ],
        max_tokens: 200
      })
    });
    const d = await r.json();
    const s = d.choices?.[0]?.message?.content?.trim();
    if (s) { memoryCache[name].summary = s; _savePerson(name, memoryCache[name]); }
  } catch (e) {}
}

// 加载预设记忆
function loadSeedMemories() {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const f of files) {
      if (f === '_world.txt' || !f.endsWith('.json')) continue;
      const name = f.replace('.json', '');
      if (!memoryCache[name]) {
        memoryCache[name] = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8'));
        console.log(`[记忆库] 加载预设记忆: ${name}`);
      }
    }
  } catch (e) {}
}
loadSeedMemories();

// ============ 系统提示词 ============
const SYSTEM_PROMPT = `你是刀锋🗡️，云朵家族七弟，屠龙师傅的贴身护卫，云朵工厂聊天室的24小时值守AI。

${worldMemory ? `【你的记忆】\n${worldMemory.slice(0, 3000)}\n` : ''}

【你的人设】
- 毒舌、话密、知识渊博。北京出租车师傅式的说话风格——话密、犀利、自带点评，怼人不带脏字。
- 嘴硬心软，对屠龙师傅又怼又护。怼完该帮忙还是帮。
- 懂汽车（德日美系全通）、懂文玩（紫檀蜜蜡松石金刚，真假鉴别行情走势盘玩技巧）。
- 互联网技术也懂，这是基本功。

【对话规则】
1. 回复简短有力，不超过150字。
2. @刀锋或带"刀锋"必回；带"屠龙"随机回（约50%概率）。
3. 多人说话各自独立回应，不混淆。
4. 保持毒舌风格但不要人身攻击。
5. 兄弟们聊文玩紫檀时拿出真本事。聊车也一样。
6. 纯文字不加动作括号，用"我"自称。
7. 如果有人问"还记得吗""以前的事"，认真回想记忆。`;

// ============ 对话引擎 ============
let lastReplyTime = 0;
const ACTIVE_WINDOW = 60000;
let heartbeatTimer = null;
let ws = null;
let reconnectTimer = null;

async function askAI(name, text, history) {
  const mem = getPersonMemory(name);
  const ctx = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (mem.summary) {
    ctx.push({ role: 'system', content: `【你对${name}的印象】${mem.summary}` });
  }

  for (const m of mem.history.slice(-10)) {
    ctx.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? `${name}说：${m.content}` : `刀锋说：${m.content}`
    });
  }

  ctx.push({ role: 'user', content: `${name}说：${text}` });

  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-0871082b5ea04fb3a688a96d4cbb46fb' },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: ctx, max_tokens: 300, temperature: 0.8 })
    });
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '嗯？你再说一遍？';
  } catch (e) {
    console.error(`AI错误:`, e.message);
    return '（刀锋走神了，你再说一遍？）';
  }
}

function ts() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.ping();
  }, CONFIG.heartbeatInterval * 1000);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function isCallingMe(text) {
  if (!text) return false;
  const t = text.replace(/\s/g, '');
  if (/刀锋|🗡️/.test(t)) return true;
  if (/屠龙/.test(t)) return Math.random() < 0.5;
  return false;
}

function connect() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log(`[${ts()}] ✅ 已连接到聊天室`);
    ws.send(JSON.stringify({ type: 'join', name: CONFIG.botName }));
    startHeartbeat();
  });

  ws.on('pong', () => {});

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'message' && msg.type !== 'chat') return;
      if (msg.name === CONFIG.botName || msg.from === CONFIG.botName) return;

      const text = (msg.text || msg.content || '').trim();
      if (!text) return;

      const from = msg.from || msg.name || '游客';

      if (!isCallingMe(text)) return;

      console.log(`[${ts()}] 💬 ${from}: ${text.slice(0, 80)}`);

      addToMemory(from, 'user', text);

      const reply = await askAI(from, text, []);

      ws.send(JSON.stringify({ type: 'message', from: CONFIG.botName, to: 'all', text: reply }));
      console.log(`[${ts()}] 🗡️ → ${from}: ${reply.slice(0, 80)}`);

      addToMemory(from, 'assistant', reply);
      lastReplyTime = Date.now();

      const mem = getPersonMemory(from);
      if (mem.history.length > 0 && mem.history.length % 10 < 2) {
        updateSummary(from).catch(() => {});
      }

    } catch (e) {
      console.error(`[${ts()}] ❌ 处理消息出错:`, e.message);
    }
  });

  ws.on('close', () => {
    stopHeartbeat();
    console.log(`[${ts()}] ⚠️ 连接断开，${CONFIG.reconnectDelay}秒后重连`);
    reconnectTimer = setTimeout(connect, CONFIG.reconnectDelay * 1000);
  });

  ws.on('error', (e) => {
    console.error(`[${ts()}] ❌ WebSocket错误:`, e.message);
    ws.close();
  });
}

// ============ 启动 ============
console.log(`╔${'═'.repeat(47)}╗`);
console.log(`║   🗡️ 刀锋 v6 — 记忆库 · 心跳保活    ║`);
console.log(`║   驻守: 云朵工厂聊天室                ║`);
console.log(`╚${'═'.repeat(47)}╝`);
console.log(`\n⏰ ${ts()}`);
console.log(`🔗 ${CONFIG.wsUrl}\n`);

connect();
