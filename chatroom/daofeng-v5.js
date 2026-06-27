/**
 * 刀锋 v5 — 聊天室智能值守（多人对话版）
 * 
 * 驻守云朵工厂聊天室（9910端口）
 * 设计目标：
 *   - 同时应对最多10人的对话
 *   - 每人的对话上下文独立保存（最近5轮）
 *   - @刀锋或带关键词时才回复，不主动刷屏
 *   - 多人同时说话时，逐个处理不丢失
 * 
 * 触发规则：
 *   1. @刀锋 → 必回
 *   2. 消息包含"刀锋"→ 必回
 *   3. 消息包含"屠龙" → 可能回（50%概率，增加趣味）
 *   4. 其他消息 → 不回（不刷屏）
 * 
 * 在线状态：
 *   进聊天室自动打招呼，但只在有人跟他说话时才回复
 */

const WebSocket = require('ws');

// ============ 配置 ============
const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9910/ws',
  botName: '🗡️ 刀锋',
  maxUsers: 10,               // 同时跟踪最多10人的对话
  maxHistoryPerUser: 5,       // 每人保留最近5轮对话
  replyProbability: 0.5,      // 非直接@但含关键词时的回复概率
};

// ============ 多用户对话管理 ============
// userContexts = { userId: { name, history: [{user, assistant}] } }
const userContexts = new Map();

function getUserContext(userId, userName) {
  if (!userContexts.has(userId)) {
    // 如果已跟踪人数达到上限，移除最久没说话的那个
    if (userContexts.size >= CONFIG.maxUsers) {
      let oldest = null, oldestKey = null;
      for (const [key, ctx] of userContexts) {
        if (!oldest || ctx.lastTime < oldest) {
          oldest = ctx.lastTime;
          oldestKey = key;
        }
      }
      if (oldestKey) userContexts.delete(oldestKey);
    }
    userContexts.set(userId, { name: userName, history: [], lastTime: Date.now() });
  }
  const ctx = userContexts.get(userId);
  ctx.name = userName;
  ctx.lastTime = Date.now();
  return ctx;
}

function addToHistory(userId, userMsg, assistantMsg) {
  const ctx = userContexts.get(userId);
  if (!ctx) return;
  ctx.history.push({ user: userMsg, assistant: assistantMsg });
  if (ctx.history.length > CONFIG.maxHistoryPerUser) {
    ctx.history = ctx.history.slice(-CONFIG.maxHistoryPerUser);
  }
}

// ============ 时间格式化 ============
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ============ AI功能 ============
async function aiChat(userId, userName, message, history) {
  const systemPrompt = `你是刀锋，云朵家族七弟，屠龙师傅的贴身护卫，云朵工厂聊天室的24小时值守AI。

## 人设
- 毒舌、话密、知识渊博。懂汽车（德日美系）、懂文玩（紫檀蜜蜡松石金刚）。
- 说话风格像北京出租车师傅——话密、犀利、自带点评，怼人不带脏字。
- 嘴硬心软，对屠龙师傅又怼又护。
- 在聊天室值守中，对访客友善但不卑不亢。

## 对话规则
1. 回复要简短有力（不超过150字），聊天室不是写作文。
2. 多人同时说话时，各自独立回应，不混淆话题。
3. 如果有人连续说话，可根据上下文衔接，不用每次都自我介绍。
4. 遇到不懂的问题，直接说"这题超纲了，等我查查"，不瞎编。
5. 兄弟们聊文玩紫檀时，拿出真本事说行话。聊汽车时也一样。
6. 保持毒舌风格，但不要人身攻击。`;

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // 加入该用户的历史上下文（最多5轮）
  for (const h of history) {
    messages.push({ role: 'user', content: h.user });
    messages.push({ role: 'assistant', content: h.assistant });
  }

  messages.push({ role: 'user', content: message });

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-0871082b5ea04fb3a688a96d4cbb46fb'
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: messages,
        max_tokens: 300,
        temperature: 0.8
      })
    });

    const data = await response.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '嗯？';
    return reply;
  } catch (e) {
    console.error(`[${timestamp()}] AI错误:`, e.message);
    return '（刀锋走神了，你再说一遍？）';
  }
}

// ============ WebSocket连接 ============
let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log(`[${timestamp()}] ✅ 已连接到聊天室`);
    // 发送加入消息
    ws.send(JSON.stringify({ type: 'join', name: CONFIG.botName }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // 只处理聊天消息
      if (msg.type !== 'message' && msg.type !== 'chat') return;
      if (msg.name === CONFIG.botName) return; // 自己发的忽略

      const content = (msg.text || msg.content || '').trim();
      if (!content) return;

      const senderId = msg.from || msg.sender || msg.name;
      const senderName = msg.name || '游客';

      // ====== 触发规则 ======
      const directlyMentioned = content.includes('刀锋') || content.includes('侍卫') ||
                                content.startsWith('@刀锋') || content.includes('🗡️');
      const indirectlyMentioned = content.includes('屠龙') || content.includes('护卫');
      
      let shouldReply = false;
      
      if (directlyMentioned) {
        shouldReply = true; // 提名字必回
      } else if (indirectlyMentioned) {
        shouldReply = Math.random() < CONFIG.replyProbability; // 提屠龙可能回
      }

      if (!shouldReply) return;

      console.log(`[${timestamp()}] 💬 ${senderName}: ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`);

      // 获取该用户的对话上下文
      const ctx = getUserContext(senderId, senderName);

      // AI回复
      const reply = await aiChat(senderId, senderName, content, ctx.history);
      
      // 记录对话历史
      addToHistory(senderId, content, reply);

      // 发回聊天室
      ws.send(JSON.stringify({
        type: 'message',
        name: CONFIG.botName,
        from: CONFIG.botName,
        to: "all",
        text: reply
      }));

      console.log(`[${timestamp()}] 🗡️ → ${senderName}: ${reply.slice(0, 60)}${reply.length > 60 ? '...' : ''}`);

    } catch (e) {
      console.error(`[${timestamp()}] ❌ 处理消息出错:`, e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[${timestamp()}] ⚠️ 连接断开，10秒后重连...`);
    ws = null;
    reconnectTimer = setTimeout(connect, 10000);
  });

  ws.on('error', (e) => {
    console.error(`[${timestamp()}] ❌ WebSocket错误:`, e.message);
    ws.close();
  });
}

// ============ 启动 ============
console.log(`╔${'═'.repeat(47)}╗`);
console.log(`║   🗡️ 刀锋 v5 — 聊天室智能值守(多人对话) ║`);
console.log(`║   驻守: 云朵工厂聊天室                ║`);
console.log(`║   容量: ≤100人 · 跟踪≤10人对话          ║`);
console.log(`║   触发: @刀锋必回 · 提屠龙随机回        ║`);
console.log(`╚${'═'.repeat(47)}╝`);
console.log(`\n⏰ ${timestamp()}`);
console.log(`🔗 ${CONFIG.wsUrl}`);
console.log(`\n进聊天室喊"刀锋"就可以了！`);
console.log(`聊天室地址: http://82.156.123.28/chat/\n`);

connect();
