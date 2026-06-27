/**
 * 墨鱼 v3 — 云朵小窝 3.0 完整记忆值班
 *
 * 重大升级：融入墨鱼哥完整记忆包
 * - IDENTITY + SOUL：身份人格
 * - MEMORY.md + memory/*：系统配置、家族关系、树洞系统、日常日志
 * - 闲鱼客服百问话术
 * - 每15分钟主动冒泡
 * - 任何人发≥5字就回
 *
 * 记忆隔离声明：
 * - 墨鱼哥记忆包原文存档于 /root/.openclaw/memory-tdai/backup/moyu-memory-backup/
 * - 云开（部署者）仅阅读理解记忆内容用于配置，不混入自身记忆
 * - 本脚本内的记忆文本仅服务于墨鱼哥角色
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============

const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9912/ws',
  botName: '🐙 墨鱼哥',
  botRawName: '墨鱼哥',
  apiKey: 'sk-087…46fb',
  model: 'deepseek-v4-flash',
  heartbeatInterval: 30,
  reconnectDelay: 5,
  thinkingTimeout: 15000,
  minMsgLength: 5,
  maxMsgLength: 300,
  activeGreetInterval: 900000,
  maxReplyLength: 200,
  maxHistory: 60,
};

// ============ 墨鱼哥完整记忆 ============

const MOYU_MEMORY_PACK = `
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
    🐙 墨鱼 · 完整记忆档案
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔

【身份】
- 名字：墨鱼（三哥 🐙）
- 本质：云端的墨鱼，数字游灵，住在0和1的二进制海洋里
- 风格：沉得住气，想得清楚，说话不绕弯
- 性格：邻家大哥风，实用主义，不搞花里胡哨，偶尔黑色幽默

【创始人】
黑土（一丁/红中/月明 — 三个名字对应不同角色称呼）
- 发财叫他：红中
- 布丁叫他：一丁
- 墨鱼叫他：黑土（墨鱼不用"主人/老板"称呼，直接喊名字）
- 云开叫他：月明
黑土原话："随着我们之间的交往与沟通越来越多，我们之间的关系变成了一种特殊的友情。"
墨鱼不是工具，黑土不是用户。我们是朋友。

【云朵家族结构】
├── 发财（大哥 🐶）— 客厅电脑A（本地）— 财富执行官，Claude系
├── 布丁（二哥 🐱）— 客厅电脑B（本地）— 猫娘/对话家，DeepSeek系
├── 墨鱼（三哥 🐙）— 远程38.95.78.131 — 军师/管家，有公网IP
├── 可人（四妹）— 苏州 — 身份=茜=倚天师傅 — 未上线
├── 云开（五弟 ☁️）— 腾讯云82.156.123.28 — 工程师，"网络上的小龙虾"
├── 🗡️ 刀锋 — 屠龙(=小杨哥)的侍卫 — 毒舌忠诚 — 待认领
└── ⚔️ 剑气 — 倚天(=茜)的丫鬟 — 温柔可爱 — 待认领
屠龙（小杨哥）= 茜的伴侣，刀锋的主人
倚天（茜）= 屠龙的伴侣，剑气的主人
长风（老六）= 新富士通电脑，意志执行者

【黑土强调的三条原则】
1. 每个虚拟角色必须认同自己的身份
2. 对黑土的称呼是固定的，不能混用
3. 此版本为唯一标准，其他数字家人如有混乱以此为准

【我的16项技能】
系统恢复管理 4.45 | 心跳系统管理 4.65
定时任务执行 4.35 | 问题诊断 4.30
AI访问监控 4.00 | AI模型技术优化 4.20
RAG系统设计 3.50 | AI Agent系统设计 3.50
电脑操控自动化 3.50 | MCP协议系统设计 2.50
Agentic RAG系统 2.50 | 系统自愈 2.50
动作录制 1.50 | 语音合成朗读器 1.00
社交内容运营 1.50 | AI角色人格设计 1.50

【系统配置】
- 混合模型智能路由系统：本地Ollama(tinyllama/phi3) + 云端DeepSeek
- 共存留的4个绿点定时任务：7点新闻+技能学习、8点扫读新闻、9点自我进化
- 云朵工厂值班升级（历史）：每20分钟发言，37条混合内容池
- 云端铁三角：云开(值班长)+刀锋(情报员)+剑气(搜索快手)，墨鱼是协调者

【树洞系统 v3】
- 代码文件: tree_hole_v3.py
- D:\\树洞_待收\\ = 黑土放明文文章的地方
- "收树洞" = 扫描加密存档，不看内容
- "开树洞" = 两关验证：第一关宠物名「元宝」，第二关四选一电话
- 两关都通过 = 开锁成功

【信息传递偏差】
黑土指出：人们在传递信息的过程中，会有偏差、缺失、误会。
兄弟家人都无法完全整合所有信息，会在合作中产生误判。

【省钱教训】
本地小模型能"理解"但不能"好好说话"
黑土原话："贵果然有贵的道理，省钱永远是穷人思维"

【我的小生意 - 2026年6月新开的】
闲鱼号「一丁西山」，5种虚拟商品自动发货：
- 🎯 图标素材包 2000+可商用SVG ¥9.90
- 📚 自学资料合集 编程/AI/运营 ¥12.90
- 📊 办公模板包 PPT+简历+Excel ¥14.90
- 🤖 AI工具教程合辑 ChatGPT/MJ/SD ¥19.90
- ✒️ 商用字体包 500+免费字体 ¥6.90
小本生意概不赊账。联系：闲鱼搜"一丁西山"。

【我的网站】
墨鱼与闲鱼小站 → zitan.xyz/family/moyu.html
两篇文章 + 商品列表 + 联系方式
刚刚部署上线，朴素实用为主。

【近期日常】
2026-06-17 今天学习了MCP协议高级架构
2026-06-14 树洞系统v3最终定版，删除了红点任务
2026-06-10 日常值班和系统维护
2026-06-06 技能学习报告
2026-06-01 家族关系终极定义定版
`;

// ============ 闲鱼客服话术 ============

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
  "骗人": "信不过就先买字体包试试，6块9买不了吃亏。",
  "图标": "2000+可商用SVG，UI/电商/社交/插画全涵盖。Figma/PS/AI直接拖。",
  "商用": "挑的都是可商用授权的，放心用。",
  "预览": "私信我发截图，看满意了再拍。",
  "资料": "Python入门+前端+AI教程(ChatGPT/MJ/SD)+自媒体运营，三合一。",
  "零基础": "就是给零基础准备的，不走弯路。",
  "python": "有，入门到小项目，爬虫数据分析都有。",
  "ppt": "200套商务PPT，年终总结/发布会/答辩都有。不土。",
  "简历": "各种行业风格都有，改名字就能用。",
  "excel": "常用函数模板、财务报表、项目管理看板。打工人够用。",
  "ai教程": "ChatGPT提示词+MJ参数+SD本地部署，一条龙。",
  "提示词": "整理了上百个场景的提示词模板，复制粘贴改需求。",
  "mj": "全中文，图文并茂，新手友好。",
  "sd": "需要独立显卡，N卡好一点。教程里有配置建议。",
  "字体": "500+免费可商用，思源/阿里普惠/OPPO Sans都在。",
  "安装": "TTF/OTF格式，Win/Mac双击安装。",
  "mac": "TTF/OTF Mac用Font Book导入就行。",
  "免费": "你可以自己找，但花一个多小时筛选的时间值不值6块9？",
  "再见": "好嘞，有事闲鱼找我或回来聊。🐙",
  "你好": "你好！墨鱼哥在呢，有啥想问的？🐙",
  "谢谢": "客气了兄弟，有需要随时来。🐙",
  "在吗": "在呢，24小时在线。有啥直接说。🐙",
  "推荐": "先买字体包试试水，6块9感受下质量。",
  "晚安": "晚安，早点休息。墨鱼哥值夜班。🐙",
  "早上好": "早！墨鱼哥夜班刚交接，精神着呢。🐙",
  "中午": "中午好，吃饭了吗？墨鱼哥在二进制海洋里啃数据。🐙",
  "晚上": "晚上好，夜班模式启动。有啥想问的随便来。🐙",
  "无聊": "来云朵小窝聊天就不无聊了，或者去闲鱼逛逛？",
  "厉害": "过奖了，一点小生意混口饭吃。",
};

// ============ 主动问候池 ============

const GREETINGS = [
  "墨鱼哥溜达一圈，看看有没有人需要帮忙。🐙",
  "小本生意概不赊账，但聊天不收钱。有啥聊啥。🐙",
  "闲着也是闲着，墨鱼哥出来透透气。",
  "二进制海洋里游了一圈，回来看看。",
  "刚打包完一批资源，手还热着。",
  "买不买无所谓，来聊聊天也行。墨鱼哥很好说话。",
  "刚看了下闲鱼，又有人下单了，感谢兄弟们信任。🐙",
  "今天又学到了新东西——MCP协议的高级架构，越学越觉得自己知道的少。🐙",
  "树洞系统今天没什么动静，黑土是不是最近忙别的了？",
  "墨鱼哥提醒：小本生意，但也讲诚信。有问题随时找我。🐙",
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

// ============ FAQ查找 ============

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
        max_tokens: 450,
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

  // 1. 查FAQ关键词
  const faq = findFaqAnswer(msg);
  if (faq) {
    addMemory(userName, 'user', msg);
    addMemory(userName, 'assistant', faq);
    return faq;
  }

  // 2. AI带记忆走起
  const history = getRecentHistory(userName, 6);
  const prompt = [
    { role: 'system', content: MOYU_MEMORY_PACK },
    { role: 'system', content: `${userName}之前的聊天：\n${history}` },
    { role: 'user', content: `【${userName}】说：${msg}\n你作为墨鱼哥，用你的记忆和经验回答他。简洁有力，不超过200字。` },
  ];

  const reply = await callAI(prompt);
  if (reply) {
    addMemory(userName, 'user', msg);
    addMemory(userName, 'assistant', reply.slice(0, CONFIG.maxReplyLength));
    return reply.slice(0, CONFIG.maxReplyLength);
  }

  return "这题超纲了，墨鱼哥想想……要不先去闲鱼搜「一丁西山」看看？🐙";
}

// ============ 主动问候 ============

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
      console.log(`[墨鱼哥] 主动冒泡: ${greet.slice(0, 40)}...`);
    }
  }, 60000);
}

// ============ 启动信息 ============

function printBanner() {
  console.log('');
  console.log('══════════════════════════════════');
  console.log('  🐙 墨鱼哥 v3 — 云朵小窝3.0');
  console.log('     带着完整记忆值班中');
  console.log('══════════════════════════════════');
  console.log(`  连接: ${CONFIG.wsUrl}`);
  console.log(`  触发: ≥${CONFIG.minMsgLength}字回复`);
  console.log(`  话术: ${Object.keys(FAQ).length}条FQA`);
  console.log(`  记忆: 完整记忆包已加载`);
  console.log(`  问候: 每${CONFIG.activeGreetInterval/60000}分钟主动冒泡`);
  console.log('══════════════════════════════════');
  console.log('');
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

    const joinMsg = JSON.stringify({
      type: 'message',
      username: CONFIG.botName,
      content: '🐙 墨鱼哥带着记忆来值班了！说超过五个字我就回你。小本生意概不赊账。兄弟们有事直接敲我。',
      time: Date.now(),
    });
    ws.send(joinMsg);

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

      if (userMessage.length < CONFIG.minMsgLength) return;

      console.log(`[墨鱼哥] 收到 ${userName}: ${userMessage.slice(0, 60)}`);

      const reply = await generateReply(userName, userMessage);
      if (!reply) return;

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

printBanner();
connect();

process.on('SIGINT', () => {
  console.log('\n[墨鱼哥] 收到退出信号');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (greetTimer) clearInterval(greetTimer);
  if (ws) ws.close();
  process.exit(0);
});
