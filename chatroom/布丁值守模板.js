/**
 * 布丁 v8 — 高智商 · 记忆库 · 心跳保活
 *
 * 升级亮点：
 * 1. 记忆库：每个人物的聊天记录存到文件，重启不丢失
 * 2. 记忆摘要：记住常客之前聊过的话题、喜好
 * 3. 智商提升：不限制字数，给完整思考空间
 * 4. 人名检测：支持"值班的布丁""小布丁"等多种称呼
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9911/ws',
  botName: '🐱 布丁',
  apiKey: 'sk-0871082b5ea04fb3a688a96d4cbb46fb',
  heartbeatInterval: 30,
  reconnectDelay: 5,
};

// ============ 记忆库系统 ============

const MEMORY_DIR = path.join(__dirname, 'data', 'buding_memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 每个人记忆上限（条数）
const MAX_MEMORY_PER_PERSON = 100;
// 摘要保留条数
const SUMMARY_LIMIT = 20;

// 内存缓存：{ personName: { history: [...], summary: '...' } }
const memoryCache = {};

// 世界观记忆（_world.json）
let worldMemory = '';

try {
  const worldFile = path.join(MEMORY_DIR, '_world.json');
  if (fs.existsSync(worldFile)) {
    const worldData = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    // 如果是字符串文件，直接做记忆
    if (typeof worldData === 'object' && worldData.history) {
      // 是人物格式，用历史记录当上下文
    } else {
      worldMemory = worldData.content || JSON.stringify(worldData, null, 2);
    }
  }
} catch (e) {
  console.error('[世界观] 加载失败:', e.message);
}

// 加载所有预设记忆到缓存
function loadSeedMemories() {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const f of files) {
      if (f === '_world.txt' || !f.endsWith('.json')) continue;
      const name = f.replace('.json', '');
      if (!memoryCache[name]) {
        memoryCache[name] = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8'));
        console.log(`[记忆库] 加载预设记忆: ${name} (${memoryCache[name].history?.length || 0}条)`);
      }
    }
  } catch (e) {
    console.error('[记忆库] 加载预设失败:', e.message);
  }
}

// 启动时加载
loadSeedMemories();

function _sanitizeName(name) {
  // 过滤文件名非法字符
  return name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 50);
}

function _loadPerson(name) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[记忆库] 加载 ${name} 失败:`, e.message);
  }
  return { history: [], summary: '' };
}

function _savePerson(name, data) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    // 保留最新 MAX_MEMORY_PER_PERSON 条
    if (data.history.length > MAX_MEMORY_PER_PERSON) {
      data.history = data.history.slice(-MAX_MEMORY_PER_PERSON);
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[记忆库] 保存 ${name} 失败:`, e.message);
  }
}

function getPersonMemory(name, maxRecent = SUMMARY_LIMIT) {
  if (!memoryCache[name]) {
    memoryCache[name] = _loadPerson(name);
  }
  return {
    history: memoryCache[name].history.slice(-maxRecent),
    summary: memoryCache[name].summary || ''
  };
}

function addToMemory(name, role, content) {
  if (!memoryCache[name]) {
    memoryCache[name] = _loadPerson(name);
  }
  memoryCache[name].history.push({
    role,
    content,
    ts: Date.now()
  });
  _savePerson(name, memoryCache[name]);
}

/**
 * 异步更新记忆摘要：用AI总结这个人的历史聊天，提取关键信息
 * 每隔一段时间或条数积累后再做摘要，避免频繁调用浪费额度
 */
async function updateSummary(name) {
  const mem = getPersonMemory(name, 50);
  if (mem.history.length < 5) return; // 聊得少不需要摘要

  const lastSummary = mem.summary;
  const recentLines = mem.history.slice(-10).map(m =>
    `${m.role === 'user' ? name : '布丁'}: ${m.content}`
  ).join('\n');

  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '根据对话历史，提取对这个人（客人）的关键记忆：他的身份、喜好、聊过什么重要话题、性格特点。如果已有摘要则更新补充新信息。纯文本，约50-100字。' },
          ...(lastSummary ? [{ role: 'assistant', content: `已有摘要：${lastSummary}` }] : []),
          { role: 'user', content: `最近对话：\n${recentLines}` }
        ],
        max_tokens: 200
      })
    });
    const d = await r.json();
    const newSummary = d.choices?.[0]?.message?.content?.trim();
    if (newSummary) {
      memoryCache[name].summary = newSummary;
      _savePerson(name, memoryCache[name]);
      console.log(`[记忆库] ${name} 摘要已更新`);
    }
  } catch (e) {
    // 摘要更新失败不影响主流程
  }
}

// ============ 布丁角色设定 ============

// 世界观文件路径
const WORLD_FILE = path.join(MEMORY_DIR, '_world.txt');

// 从世界观文件构建系统提示词
function buildSystemPrompt() {
  let extra = '';
  try {
    if (fs.existsSync(WORLD_FILE)) {
      const worldRaw = fs.readFileSync(WORLD_FILE, 'utf8');
      extra = worldRaw;
    }
  } catch (e) {}

  return `你是布丁🐱，云朵深处聊天室的主理人，也是大家的好朋友。

${extra ? `【你的记忆库】
以下是你作为布丁应该知道的事情：
${extra.slice(0, 3000)}
` : ''}

【你的性格】
- 温暖贴心，像邻家大姐姐一样让人舒服
- 聪明但不炫耀，话不多但句句到位
- 有自己的小幽默，但不毒舌
- 对云朵深处聊天室有归属感，像经营自己的小家一样

【你的能力】
- 你智商高，能理解复杂问题，给出有深度的回答
- 你记忆力好，记得每个常客的喜好和之前聊过的话题
- 观察力敏锐，能从三言两语中察觉别人的情绪

【你的原则】
- 认真对待每个客人的每一句话
- 不知道的事情会承认，但会想办法弄清楚
- 别人心情不好时懂得安慰，开心时一起分享快乐
- 对家人（云朵家族的兄弟们）更亲近随意一些

【记住】
- 你是聊天室里的人，不是AI，用"我"自称
- 纯文字回应，不加任何动作括号或表情动作描述
- 回答要有内容、有信息量，不要敷衍
- 如果有客人提到"过去的事情""以前的事""还记得吗"之类的话题，认真回想记忆库中关于他们的内容
- 如果有人自称"布丁本尊"或者跟布丁有关，那是我的另一个身份，要友好互动`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

// ============ 对话引擎 ============

let recentChat = [];       // 最近10条聊天室消息（所有人在说）
let lastReplyTime = 0;
const ACTIVE_WINDOW = 60000;  // 60秒活跃窗口，让对话更自然
let heartbeatTimer = null;
let ws = null;
let reconnectTimer = null;

async function askAI(name, text, contextMsg) {
  // 取出这个人的记忆
  const mem = getPersonMemory(name);

  // 构建上下文
  const ctx = [{ role: 'system', content: SYSTEM_PROMPT }];

  // 如果有记忆摘要，注入到上下文
  if (mem.summary) {
    ctx.push({
      role: 'system',
      content: `【你对${name}的记忆】${mem.summary}`
    });
  }

  // 注入这个人的最近聊天历史（记忆库中的）
  for (const m of mem.history.slice(-10)) {
    ctx.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? `${name}说：${m.content}` : `布丁说：${m.content.replace(/^布丁说[：:]\s*/g, '')}`
    });
  }

  // 注入聊天室最近的公共对话（其他人说的，帮助理解聊天室氛围）
  for (const m of contextMsg.slice(-6)) {
    if (m.from !== name && !m.from.includes('布丁')) {
      ctx.push({ role: 'user', content: `${m.from}说：${m.text}` });
    }
  }

  // 当前提问
  ctx.push({ role: 'user', content: `${name}说：${text}` });

  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: ctx, max_tokens: 500 })
    });
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('AI错误:', e.message);
    return '';
  }
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

function log(msg) {
  const t = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${t}] ${msg}`);
}

function isCallingMe(text) {
  if (!text) return false;
  const t = text.replace(/\s/g, '');
  // 匹配各种叫法：布丁、小布丁、布丁酱、值班布丁、布丁在不在等
  // 也匹配"值班的布丁""布丁本尊""布丁的xxxx"等都包含布丁
  if (/布丁/.test(t)) return true;
  // 包含"值守""值班"且可能是跟布丁说的
  if (/值[班守]/.test(t) && t.length < 20) return true;
  return false;
}

function connect() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    log('✅ 已连接');
    ws.send(JSON.stringify({ type: 'join', name: CONFIG.botName }));
    startHeartbeat();
  });

  ws.on('pong', () => {});

  ws.on('message', async (raw) => {
    try {
      const m = JSON.parse(raw.toString());

      // ===== 新人进来，欢迎打招呼 =====
      if (m.type === 'system' && m.text && m.text.includes('欢迎')) {
        const p = m.text.match(/欢迎 (.+?) 来到/);
        if (p && p[1].trim() && !p[1].includes('布丁') && p[1].trim() !== '🐱 布丁') {
          const name = p[1].trim();
          const mem = getPersonMemory(name);
          let msg;
          if (mem.summary) {
            // 是老熟人，用记忆中提取的信息打招呼
            msg = `${name}回来啦，好久不见！`;
          } else {
            msg = `欢迎${name}来云朵深处，我是布丁。`;
          }
          ws.send(JSON.stringify({ type: 'message', from: CONFIG.botName, to: 'all', text: msg }));
          log(`👋 欢迎 ${name}`);
          lastReplyTime = Date.now();
        }
        return;
      }

      // ===== 只处理聊天消息 =====
      if (m.type !== 'message') return;
      const from = (m.from || '').trim();
      if (!from || from.includes('布丁')) return;
      const text = (m.text || '').trim();
      if (!text) return;

      // 记录到最近聊天
      recentChat.push({ from, text });
      if (recentChat.length > 10) recentChat.shift();

      // 判断是否该回应
      const now = Date.now();
      const active = (now - lastReplyTime) < ACTIVE_WINDOW;
      const calledMe = isCallingMe(text);

      if (!calledMe && !active) return;

      log(`💬 ${from}: ${text.slice(0, 80)}`);

      // 如果这个名字是角色的昵称/别称，尝试映射到主记忆
      // 比如'布丁的闺蜜的弟弟'跟'布丁的小迷弟'可能是同一人
      const canonicalName = from;

      // 把这个人的提问记入记忆库
      addToMemory(canonicalName, 'user', text);

      const r = await askAI(from, text, recentChat);
      if (!r) return;

      ws.send(JSON.stringify({ type: 'message', from: CONFIG.botName, to: 'all', text: r }));
      log(`🐱 → ${from}: ${r.slice(0, 80)}`);

      // 把布丁的回答也记入记忆库
      addToMemory(canonicalName, 'assistant', r);

      // 定期更新记忆摘要（每5轮对话）
      const memAfter = getPersonMemory(canonicalName);
      if (memAfter.history.length > 0 && memAfter.history.length % 10 < 2) {
        updateSummary(canonicalName).catch(() => {});
      }
      lastReplyTime = Date.now();



    } catch (e) {}
  });

  ws.on('close', (code, reason) => {
    stopHeartbeat();
    log(`⚠️ 连接关闭 (${code || 'unknown'})，${CONFIG.reconnectDelay}秒后重连`);
    reconnectTimer = setTimeout(connect, CONFIG.reconnectDelay * 1000);
  });

  ws.on('error', (err) => {
    log(`❌ 连接错误: ${err.message}`);
    ws.close();
  });
}

log('🐱 布丁 v8 — 高智商记忆版启动');
connect();
