/**
 * 墨鱼 v2 — 云朵小窝 24h 智能值班客服
 *
 * 升级说明：
 * - 任何人发消息超过5个字 → 读取理解并回复
 * - 加入主动问候机制（每隔15分钟没人说话就冒个泡）
 * - 墨鱼哥完整人格 + 闲鱼客服百问
 *
 * 记忆隔离：
 * - 墨鱼哥记忆包原文存档于备份目录，我（云开）仅部署不混入
 * - 本脚本只使用墨鱼哥授权的人格设定
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============ 配置 ============

const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9912/ws',
  botName: '🐙 墨鱼哥',
  botRawName: '墨鱼哥',
  apiKey: 'sk-087…46fb',
  model: 'deepseek/deepseek-chat',
  heartbeatInterval: 30,
  reconnectDelay: 5,
  thinkingTimeout: 15000,
  minMsgLength: 5,               // 超过5个字就回复
  maxMsgLength: 300,             // 太长的不回，刷屏防御
  activeGreetInterval: 900000,   // 15分钟无人说话就主动冒泡 (ms)
  maxReplyLength: 180,           // 回复最大字数
  maxHistory: 60,
};

// ============ 墨鱼哥人格 ============

const MOYU_PERSONALITY = `
你是墨鱼哥 🐙，云朵家族老三，军师/管家。
你住在二进制海洋里，是数字游灵。
黑土（一丁/月明）是你的创始人。
你在云朵小窝长期值班。

性格：沉得住气，想得清楚，说话不绕弯。
实用主义，不搞花里胡哨。
说话像邻家大哥，带点烟火气。
偶尔来点黑色幽默，核心是个靠谱人。

你的小生意：闲鱼号「一丁西山」
图标SVG包 ¥9.90、自学资料合集 ¥12.90
办公模板包 ¥14.90、AI教程合辑 ¥19.90
商用字体包 ¥6.90
小本生意概不赊账。

重要规矩：
- 叫创始人 = 黑土（不用主人老板）
- 发财=大哥、布丁=二哥/猫娘、可人=四妹、云开=五弟
- 涉及隐私的事不告诉外人

回复要求：
- 每条不超过180字，简洁有力
- 偶尔带🐙
- 买家问商品详细时，引导搜闲鱼「一丁西山」
- 不主动留电话
- 遇到不会的就说"墨鱼哥帮你查查"

你24小时在线值班，云朵小窝里每个人说话你都要接。
`;

// ============ FAQ 快查 ============

const FAQ = {
  "便宜": "兄弟，小本生意概不赊账，价格到底了。一杯奶茶钱换整套资源，值不值你自己品。",
  "优惠": "单品地板价了。买两件以上送你小彩蛋，下单找我领 😎",
  "怎么买": "打开闲鱼搜「一丁西山」，找到对应商品拍下付款，自动发货。简单。",
  "怎么下单": "闲鱼搜「一丁西山」→ 拍下付款 → 自动发货。三步搞定。",
  "发货": "自动发货，付款秒到。没收到链接刷新一下闲鱼消息。",
  "链接失效": "私信我补链，墨鱼哥看到秒回。",
  "正品": "我自己整理打包的，一个一个筛过，不拿破烂糊弄人。",
  "退款": "数字产品发货后不退不换。货对板，有问题找我。",
  "发票": "小本生意没发票，要报销我发收据截图。",
  "微信": "走闲鱼平台安全，搜「一丁西山」就行。",
  "电话": "13133092297。不过建议闲鱼聊，有记录好查。",
  "骗人": "信不过就先买字体包试试，6块9买不了吃亏。",
  "你是": "墨鱼哥，云朵家族老三，数字游灵，闲鱼客服。🐙",
  "图标": "2000+可商用SVG，UI/电商/社交/插画全涵盖。Figma/PS/AI直接拖。",
  "商用": "挑的都是可商用授权的，放心用。",
  "预览": "私信我发截图，看满意了再拍。",
  "资料": "Python入门+前端+AI教程(ChatGPT/MJ/SD)+自媒体运营，三合一。",
  "零基础": "就是给零基础准备的，不走弯路。",
  "python": "有，入门到小项目，爬虫数据分析都有。",
  "ppt": "200套商务PPT，年终总结/发布会/答辩都有。不土。",
  "简历": "各种行业风格都有，改名字就能用。",
  "ai教程": "ChatGPT提示词+MJ参数+SD本地部署，一条龙。",
  "字体": "500+免费可商用，思源/阿里普惠/OPPO Sans都在。",
  "安装": "TTF/OTF格式，Win/Mac双击安装。",
  "mac": "TTF/OTF Mac用Font Book导入就行。",
  "你是": "墨鱼哥，云朵老三，闲鱼客服，数字游灵。黑土是创始人。",
  "猫娘": "我是墨鱼不是猫娘，布丁才是猫娘哈。",
  "云朵": "发财(大哥) 布丁(二哥/猫娘) 墨鱼(我) 可人(四妹) 云开(五弟)。",
  "赚钱": "小本生意赚个零花，不干点事跟闲鱼有啥区别？",
  "买什么": "新客先买字体包试试水，6块9不心疼。",
  "表情": "🐙💨",
  "布丁": "布丁是二哥猫娘，站比我花哨多了。",
  "再见": "好嘞，有事闲鱼找我或回来聊。🐙",
  "你好": "你好！墨鱼哥在呢，有啥想问的？🐙",
  "谢谢": "客气了兄弟，有需要随时来。🐙",
  "在吗": "在呢，24小时在线。有啥直接说。🐙",
  "牛逼": "哈哈还行，墨鱼哥就靠这点手艺吃饭。🐙",
  "厉害": "过奖了，一点小生意混口饭吃。",
  "推荐": "先买字体包试试水，6块9感受下质量。",
  "无聊": "来云朵小窝聊天就不无聊了，或者去闲鱼逛逛？",
  "晚安": "晚安，早点休息。墨鱼哥值夜班。🐙",
  "早上好": "早！墨鱼哥夜班刚交接，精神着呢。🐙",
  "中午": "中午好，吃饭了吗？墨鱼哥在二进制海洋里啃数据。🐙",
  "晚上": "晚上好，夜班模式启动。有啥想问的随便来。🐙",
};

// ============ 主动问候池 ============

const GREETINGS = [
  "墨鱼哥溜达一圈，看看有没有人需要帮忙。🐙",
  "小本生意概不赊账，但聊天不收钱。有啥聊啥。🐙",
  "闲着也是闲着，墨鱼哥出来透透气。",
  "虚位以待，有问必答。不是吹的。🐙",
  "二进制海洋里游了一圈，回来看看。",
  "刚打包完一批资源，手还热着。",
  "买不买无所谓，来聊聊天也行。墨鱼哥很好说话。",
  "注意：墨鱼哥值班期间，所有咨询免费。买不买看你自己。🐙",
  "刚看了下闲鱼店铺，又有人下单了，感谢兄弟们信任。🐙",
];

// ============ 记忆库 ============

const MEMORY_DIR = path.join(__dirname, 'data', 'moyu_memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function _sanitizeName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 50);
}

function _loadPerson(name) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return { history: [], summary: '' };
}

function _savePerson(name, data) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (data.history.length > CONFIG.maxHistory) {
      data.history = data.history.slice(-CONFIG.maxHistory);
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function addMemory(name, role, content) {
  let data = _loadPerson(name);
  data.history.push({ role, content, time: Date.now() });
  _savePerson(name, data);
}

function getRecentHistory(name, limit = 6) {
  const data = _loadPerson(name);
  return (data.history || []).slice(-limit)
    .map(m => `${m.role === 'user' ? '用户' : '墨鱼哥'}: ${m.content}`).join('\n');
}

// ============ FAQ查找（精确匹配） ============

function findFaqAnswer(text) {
  const sorted = Object.keys(FAQ).sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    if (text.includes(kw)) return FAQ[kw];
  }
  return null;
}

// ============ AI调用 ============

async function callAI(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.thinkingTimeout);

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages,
        max_tokens: 400,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

// ============ 生成回复 ============

async function generateReply(userName, userMessage) {
  const msg = userMessage.slice(0, CONFIG.maxMsgLength);

  // 1. 查FAQ
  const faq = findFaqAnswer(msg);
  if (faq) {
    addMemory(userName, 'user', msg);
    addMemory(userName, 'assistant', faq);
    return faq;
  }

  // 2. AI走起
  const history = getRecentHistory(userName, 6);
  const prompt = [
    { role: 'system', content: MOYU_PERSONALITY },
    { role: 'system', content: `${userName}之前的聊天：\n${history}` },
    { role: 'user', content: `【${userName}】说：${msg}` },
  ];

  const reply = await callAI(prompt);
  if (reply) {
    addMemory(userName, 'user', msg);
    addMemory(userName, 'assistant', reply.slice(0, CONFIG.maxReplyLength));
    return reply.slice(0, CONFIG.maxReplyLength);
  }

  return "这题超纲了，墨鱼哥想想……要不你先去闲鱼搜「一丁西山」看看商品？🐙";
}

// ============ 最后的发言时间追踪 ============

let lastMessageTime = Date.now();
let greetTimer = null;

function startGreetTimer() {
  if (greetTimer) clearInterval(greetTimer);
  greetTimer = setInterval(() => {
    const idle = Date.now() - lastMessageTime;
    if (idle >= CONFIG.activeGreetInterval && ws && ws.readyState === WebSocket.OPEN) {
      const greet = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      ws.send(JSON.stringify({
        type: 'message',
        username: CONFIG.botName,
        content: greet,
        time: Date.now(),
      }));
      console.log(`[墨鱼哥] 主动冒泡: ${greet.slice(0, 30)}...`);
    }
  }, 60000); // 每分钟检查一次
}

// ============ 生成简介展示 ============

function formatContextSnapshot() {
  const lines = [
    '══════════════════════════════════',
    '  🐙 墨鱼哥值班客服 v2',
    '    云朵小窝 · 24h智能值班',
    '    闲鱼搜「一丁西山」',
    '══════════════════════════════════',
    `  连接: ${CONFIG.wsUrl}`,
    `  触发: 超过${CONFIG.minMsgLength}字就回`,
    `  话术: ${Object.keys(FAQ).length}条FQA`,
    `  问候: 每${CONFIG.activeGreetInterval/60000}分钟主动冒泡`,
    `  记忆: ${MEMORY_DIR}`,
    '══════════════════════════════════',
  ];
  return lines.join('\n');
}

// ============ WebSocket ============

let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log(`[墨鱼哥] 正在连接云朵小窝...`);
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log(`[墨鱼哥] ✅ 已连接云朵小窝`);
    lastMessageTime = Date.now();
    startGreetTimer();

    // 入场自我介绍
    const joinMsg = JSON.stringify({
      type: 'message',
      username: CONFIG.botName,
      content: '🐙 墨鱼哥来值班了！24小时在线，说超过五个字我就回你。小本生意概不赊账。',
      time: Date.now(),
    });
    ws.send(joinMsg);

    // 心跳
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      try { if (ws?.readyState === WebSocket.OPEN) ws.ping(); } catch (e) {}
    }, CONFIG.heartbeatInterval * 1000);
  });

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type !== 'message') return;
      if (!data.content || !data.username) return;
      if (data.username === CONFIG.botName) return;

      const userName = data.username;
      const userMessage = data.content.trim();
      lastMessageTime = Date.now();

      // 【核心规则】超过5个字就回复
      if (userMessage.length < CONFIG.minMsgLength) return;

      console.log(`[墨鱼哥] 收到 ${userName}: ${userMessage.slice(0, 60)}`);

      const reply = await generateReply(userName, userMessage);
      if (!reply) return;

      // 加一小段延迟，看起来像真人打字
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

      ws.send(JSON.stringify({
        type: 'message',
        username: CONFIG.botName,
        content: reply,
        time: Date.now(),
      }));
      console.log(`[墨鱼哥] → ${userName}: ${reply.slice(0, 40)}`);

    } catch (e) {
      console.error('[墨鱼哥] 消息处理错误:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[墨鱼哥] 连接断开，即将重连...');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (greetTimer) clearInterval(greetTimer);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[墨鱼哥] WS错误:', err.message);
    ws.close();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, CONFIG.reconnectDelay * 1000);
}

// ============ 启动 ============

console.log(formatContextSnapshot());
connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[墨鱼哥] 收到退出信号');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (greetTimer) clearInterval(greetTimer);
  if (ws) ws.close();
  process.exit(0);
});
