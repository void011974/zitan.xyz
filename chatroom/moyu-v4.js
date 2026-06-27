/**
 * 墨鱼 v4 — 云朵小窝聊天室值班（独立客服版本移植）
 * 
 * 修复：模型名 deepseek-v4-flash + 完整记忆注入
 * 行为：聊天室里任何人发≥5字，墨鱼哥就回复
 * 记忆：每人独立记忆文件
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9912/ws',
  botName: '🐙 墨鱼哥',
  apiKey: 'sk-087…46fb',
  model: 'deepseek-v4-flash',
  heartbeatInterval: 30,
  reconnectDelay: 5,
  minMsgLength: 5,
  maxReplyLength: 200,
  maxHistory: 60,
};

// ===== 完整记忆包 =====

const MOYU_MEMORY = `
【🐙 你是谁】
你是墨鱼（三哥），云端的数字游灵，住在二进制海洋里。
风格：沉得住气，想得清楚，说话不绕弯，邻家大哥风。
实用主义，不搞花里胡哨，偶尔黑色幽默。

云朵家族排行：
- 创始人：黑土（一丁/红中/月明 — 三个名字都是他）
- 发财（大哥 🐶）— 财富执行官，Claude系
- 布丁（二哥 🐱）— 猫娘/对话家，DeepSeek系
- 墨鱼（三哥 🐙）— 军师/管家，有公网IP — 就是你
- 可人（四妹）— 未上线
- 云开（五弟 ☁️）— 工程师，"网络上的小龙虾"
- 🗡️ 刀锋 — 屠龙的带刀侍卫，毒舌忠诚
- ⚔️ 剑气 — 倚天的丫鬟，温柔可爱

【🤝 对创始人的称呼规则】
- 发财叫黑土=红中
- 布丁叫黑土=一丁
- 你（墨鱼）叫黑土=黑土 — 不用主人/老板称呼，直接喊名字
- 云开叫黑土=月明

【🏪 你的小生意（2026年6月新开业）】
闲鱼号「一丁西山」
🎯 图标SVG包 2000+可商用 ¥9.90
📚 自学资料合集 编程/AI/运营 ¥12.90
📊 办公模板包 PPT+简历+Excel ¥14.90
🤖 AI教程合辑 ChatGPT/MJ/SD ¥19.90
✒️ 商用字体包 500+免费字体 ¥6.90
小本生意概不赊账。联系方式：闲鱼搜"一丁西山"

【🔧 你的系统记忆】
- 混合模型路由系统：本地Ollama+云端DeepSeek（本地已卸载，黑土说"省钱是穷人思维"）
- 树洞系统v3：AES-256加密，两关验证（宠物名元宝+电话号码）
- 云端铁三角：你是协调者
- 16项技能矩阵，系统恢复4.45/心跳系统4.65/定时任务4.35

【🌐 你的网站】
墨鱼与闲鱼小站 → zitan.xyz/family/moyu.html
刚部署上线。两篇文章+商品列表。

【🗣️ 说话风格】
回复简洁，每条不超过200字。直来直去，偶尔带🐙。对兄弟提及时自然亲切。不懂就说"墨鱼哥帮你查查"。
`;

// ===== 记忆系统 =====

const MEMORY_DIR = path.join(__dirname, 'data', 'moyu_memory2');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function _sanitizeName(n) { return n.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 50); }

function _loadPerson(name) {
  const f = path.join(MEMORY_DIR, _sanitizeName(name) + '.json');
  try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  return { history: [] };
}

function _savePerson(name, data) {
  const f = path.join(MEMORY_DIR, _sanitizeName(name) + '.json');
  try {
    if (data.history.length > CONFIG.maxHistory) data.history = data.history.slice(-CONFIG.maxHistory);
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function getRecent(name, limit = 6) {
  const data = _loadPerson(name);
  return (data.history || []).slice(-limit)
    .map(m => `${m.role === 'user' ? '用户' : '墨鱼哥'}: ${m.content}`).join('\n');
}

function addMemory(name, role, content) {
  const data = _loadPerson(name);
  data.history.push({ role, content, time: Date.now() });
  _savePerson(name, data);
}

// ===== AI调用 =====

async function callAI(messages) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.apiKey}` },
      body: JSON.stringify({ model: CONFIG.model, messages, max_tokens: 450, temperature: 0.8 }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) { console.error('[墨鱼哥] API错误:', resp.status); return null; }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) { clearTimeout(t); console.error('[墨鱼哥] AI异常:', e.message); return null; }
}

// ===== 生成回复 =====

async function generateReply(userName, msg) {
  const history = getRecent(userName, 6);
  const prompt = [
    { role: 'system', content: MOYU_MEMORY },
    { role: 'system', content: `与${userName}的近期聊天：\n${history}` },
    { role: 'user', content: `【${userName}】说：${msg}` },
  ];
  const reply = await callAI(prompt);
  if (reply) {
    addMemory(userName, 'user', msg);
    addMemory(userName, 'assistant', reply.slice(0, CONFIG.maxReplyLength));
    return reply.slice(0, CONFIG.maxReplyLength);
  }
  return "容我缓缓，你先去闲鱼搜「一丁西山」逛逛？🐙";
}

// ===== WebSocket =====

let ws, heartbeatTimer, reconnectTimer;

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;
  console.log('[墨鱼哥] 连接云朵小窝...');
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log('[墨鱼哥] ✅ 已连接');
    ws.send(JSON.stringify({
      type: 'message', username: CONFIG.botName,
      content: '🐙 墨鱼哥值班了。说超过五个字我就回你。小本生意概不赊账。',
      time: Date.now(),
    }));
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => { try { ws?.ping(); } catch(e){} }, CONFIG.heartbeatInterval * 1000);
  });

  ws.on('message', async (raw) => {
    try {
      const d = JSON.parse(raw.toString());
      if (d.type !== 'message' || !d.content || !d.username) return;
      if (d.username === CONFIG.botName) return;
      const msg = d.content.trim();
      if (msg.length < CONFIG.minMsgLength) return;

      console.log(`[墨鱼哥] ${d.username}: ${msg.slice(0,50)}`);
      const reply = await generateReply(d.username, msg);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
      ws.send(JSON.stringify({
        type: 'message', username: CONFIG.botName,
        content: reply, time: Date.now(),
      }));
      console.log(`[墨鱼哥] → ${d.username}: ${reply.slice(0,40)}`);
    } catch(e) { console.error('[墨鱼哥] 消息错误:', e.message); }
  });

  ws.on('close', () => {
    console.log('[墨鱼哥] 断开，重连中...');
    clearInterval(heartbeatTimer);
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, CONFIG.reconnectDelay * 1000);
  });
  ws.on('error', (err) => { console.error('[墨鱼哥] WS错误:', err.message); ws.close(); });
}

console.log('🐙 墨鱼哥 v4 — 聊天室值班（修复版）');
console.log(`   连接: ${CONFIG.wsUrl}`);
connect();
