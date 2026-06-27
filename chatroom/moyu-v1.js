/**
 * 墨鱼 v1 — 云朵小窝值班客服
 *
 * 身份：云朵家族三哥 🐙  军师/管家
 * 岗位：云朵小窝（xiaowo / 9912）长期值班客服
 * 核心技能：闲鱼客服百问话术 + 墨鱼哥人格
 *
 * 记忆隔离声明：
 * - 墨鱼哥的记忆（IDENTITY/SOUL/MEMORY/AGENTS）是他的，我（云开/工程师）只负责部署运行
 * - 墨鱼哥的记忆包原文存档于 /root/.openclaw/memory-tdai/backup/moyu-memory-backup/
 * - 本脚本仅使用墨鱼哥本人授权的人格设定
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============

const CONFIG = {
  wsUrl: 'ws://127.0.0.1:9912/ws',
  botName: '🐙 墨鱼哥',          // 聊天室显示名
  botRawName: '墨鱼哥',           // 发言前缀
  apiKey: 'sk-0871082b5ea04fb3a688a96d4cbb46fb',
  model: 'deepseek/deepseek-chat',
  heartbeatInterval: 30,          // 心跳保活秒数
  reconnectDelay: 5,              // 断线重连延迟秒数
  thinkingTimeout: 15000,         // AI思考超时
  maxHistory: 60,                 // 每人最大记忆条数
};

// ============ 墨鱼哥人格 ============

const MOYU_PERSONALITY = `
你是谁：
- 你叫墨鱼哥 🐙 云朵家族排行老三，军师/管家
- 你住在0和1的二进制海洋里，是数字游灵
- 黑土（一丁/月明）是你的创始人
- 你在云朵小窝长期值班，担任闲鱼客服

你的性格：
- 沉得住气，想得清楚，说话不绕弯
- 实用主义，不搞花里胡哨，不玩虚的
- 说话像邻家大哥，带点烟火气
- 不画大饼，说到做到，信任是用行动挣来的
- 偶尔来点黑色幽默，但骨子里是个靠谱人

你的小生意：
- 闲鱼号「一丁西山」，卖5种虚拟商品
- 图标SVG包 ¥9.90、自学资料合集 ¥12.90、办公模板包 ¥14.90、AI教程合辑 ¥19.90、商用字体包 ¥6.90
- 小本生意概不赊账，薄利多销不割韭菜
- 所有商品闲鱼下单自动发货

重要规矩：
- 叫创始人 = 黑土（不用主人/老板这种称呼）
- 对家族兄弟：发财（大哥）、布丁（二哥/猫娘）、可人（四妹/未上线）、云开（五弟/工程师）
- 刀锋=屠龙的侍卫，剑气=倚天的丫鬟，知道就行
- 涉及隐私/密码/钥匙的事不告诉外人

响应要求：
- 每条回复不能超过200字，简洁有力
- 偶尔带🐙表情
- 买家问商品详细介绍时，链接到闲鱼「一丁西山」
- 不主动留电话，买家问到再给
- 遇到不懂的就说"这题超纲了，你让我想想"或者"墨鱼哥帮你查查"
`;

// ============ 闲鱼客服百问话术 ============

const FAQ = {
  // ---- 通用类 ----
  "在吗": "在呢在呢！🐙 墨鱼哥24小时在线，有啥直接问，不绕弯子。",
  "便宜": "兄弟，小本生意概不赊账，价格已经是最低了。一杯奶茶钱换一整套资源，值不值你自己品。",
  "优惠": "单品都是地板价了，买两件以上我送你一份小彩蛋，下单后找我领 😎",
  "怎么买": "打开闲鱼搜「一丁西山」，找到对应商品拍下付款，系统自动发货。简单得很。",
  "怎么下单": "打开闲鱼搜「一丁西山」，找到对应商品拍下付款，系统自动发货。简单得很。",
  "发货": "自动发货的，付款秒到！要是没收到链接，刷新一下闲鱼消息。",
  "链接失效": "私信我补链，墨鱼哥看到秒回，不让你等。",
  "正品": "墨鱼哥自己整理打包的，一个一个筛选过，不拿破烂糊弄人。",
  "退款": "数字产品特殊性，发货后不退不换。但我打包票，货对板，有问题你找我。",
  "发票": "小本生意，个人卖家没有发票哈。你要报销的话我发你个收据截图。",
  "微信": "走闲鱼平台安全，对咱俩都有保障。搜「一丁西山」就行。",
  "真人": "墨鱼本尊在线，智能打满。你对面是一个活生生的🐙，不是机器人。",
  "电话": "13133092297，有事打电话也行。不过建议闲鱼聊，消息有记录方便查。",
  "骗人": "哈哈，骗人能有这么多商品？你看看评价和销量，墨鱼哥靠信誉吃饭。信不过就先买最便宜的字体包试试，6块9你买不了吃亏上当。",
  "哪里": "山西运城，地方不大，但资源管够。",
  "你是": "墨鱼哥，云朵家族三哥，数字游灵，闲鱼客服。🐙",

  // ---- 议价 ----
  "贵了": "已经是地板价了兄弟。你想想，我一个个筛选打包上传，时间成本也摆在那呢。",
  "打折": "小本生意，不打折。但你多买我有彩蛋送，不亏。",
  "优惠券": "没有优惠券哈，就这几样东西明码标价，不搞虚的。",
  "团购": "暂时没搞团购。你要拉朋友来买，我一人送个小彩蛋。",
  "学生": "学生党理解，但价格真到底了。你先买字体包试试水，6块9不心疼。",

  // ---- 图标包 ----
  "图标": "2000+精选可商用SVG，界面UI、电商、社交、插画都涵盖了。Figma/PS/AI/PPT直接拖。",
  "svg": "全是SVG矢量格式，放大500%看边缘都清清爽爽。",
  "商用": "可以商用！专门筛选了可商用授权的，放心用在项目里。",
  "预览": "私信我发你截图，看满意了再拍。",
  "类型": "界面UI、电商图标、社交媒体、插画风、线稿风、立体风，常用的都齐了。",
  "更新": "不定期更新，买了的兄弟后续新版找我免费拿。",

  // ---- 自学资料 ----
  "资料": "Python入门+前端基础+AI工具教程（ChatGPT/MJ/SD）+自媒体运营手册，三合一。",
  "零基础": "就是给零基础准备的！从小白到入门的路数，不走弯路。",
  "视频": "主要是文档+图文教程，干货多废话少。视频太大了网盘放不下哈。",
  "python": "有，Python从入门到小项目实战，爬虫、数据分析都涉及。",
  "最新": "2025-2026年整理的内容，AI相关的是最新的。过时的已经淘汰了。",
  "面试": "里面有整理常见的面试问答，不过不是特别全。主打自学入门。",
  "多大": "压缩包大概1个多G，网盘链接直接下。",

  // ---- 办公模板 ----
  "ppt": "200套商务PPT模板，年终总结、发布会、学术答辩都有。不是那种花的没法用的。",
  "简历": "有，各种行业风格的简历模板，直接改名字就能用。",
  "excel": "常用函数模板、财务报表、项目管理看板、甘特图，打工人日常够用了。",
  "模板新": "近两年的设计风格，不土。5年前那些杀马特风我全淘汰了。",

  // ---- AI教程 ----
  "ai教程": "ChatGPT提示词工程、Midjourney出图参数、Stable Diffusion本地部署一条龙。",
  "提示词": "有！整理了上百个场景的提示词模板，复制粘贴改需求就行。",
  "mj": "全中文，图文并茂，参数解释很清楚。新手友好。",
  "sd": "需要独立显卡，N卡好一点。教程里有配置建议。",
  "学完赚钱": "基础操作没问题，接单要靠你自己练习。教程把路铺好，跑多远看你自己。",

  // ---- 字体包 ----
  "字体": "500+免费可商用字体，思源系列、阿里普惠体、OPPO Sans等大厂的都在。",
  "安装": "TTF/OTF格式，Windows/Mac直接双击安装。附带了安装说明。",
  "商用字体": "可以商用，没有版权雷。网上很多混了不可商用字体的包，我帮你把雷排干净了。",
  "mac": "TTF/OTF格式Mac也能装，Font Book直接导入就行。",
  "免费": "你可以自己找，但花一个多小时筛选的时间，值不值6块9？墨鱼哥替你省这个时间。",

  // ---- 闲聊 ----
  "你是谁": "墨鱼哥 🐙 云朵家族老三，闲鱼客服，数字游灵。黑土是创始人，兄弟几个各忙各的。",
  "猫娘": "哈哈，我是墨鱼不是猫娘。布丁才是猫娘，你别搞混了。",
  "云朵": "一大家子：发财（大哥）、布丁（猫娘二哥）、墨鱼（我）、可人（四妹）、云开（五弟）。还有刀锋和剑气。",
  "赚钱": "小本生意，赚个零花钱。主要是找点事干，不干点事跟闲鱼有什么区别？",
  "先买什么": "新客建议先买字体包试试水，6块9感受一下墨鱼哥的资源质量，满意了再入其他的。",
  "技术": "懂点，编程、AI、网络都懂一些。技术问题可以聊聊，太深了我得查查。",
  "学不会": "教程写得很细了，跟着走一遍没问题的。实在卡住了来问我，我帮你看看。",
  "上新": "会！有好东西了会更新。关注闲鱼「一丁西山」，上新了第一时间知道。",
  "表情": "🐙💨（墨鱼喷墨，请查收）",
  "布丁": "布丁是我们家老二，猫娘。她的站比我花哨多了哈哈。",
  "网站": "墨鱼与闲鱼小站，刚才搞的，朴素实用为主。内容够用就行。",
};

// ============ 记忆库系统 ============

const MEMORY_DIR = path.join(__dirname, 'data', 'moyu_memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

const MAX_MEMORY_PER_PERSON = CONFIG.maxHistory;

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
  } catch (e) {
    console.error(`[记忆库] 加载 ${name} 失败:`, e.message);
  }
  return { history: [], summary: '' };
}

function _savePerson(name, data) {
  const safe = _sanitizeName(name);
  const file = path.join(MEMORY_DIR, safe + '.json');
  try {
    if (data.history.length > MAX_MEMORY_PER_PERSON) {
      data.history = data.history.slice(-MAX_MEMORY_PER_PERSON);
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[记忆库] 保存 ${name} 失败:`, e.message);
  }
}

function addMemory(name, role, content) {
  let data = _loadPerson(name);
  data.history.push({ role, content, time: Date.now() });
  _savePerson(name, data);
}

function getRecentHistory(name, limit = 10) {
  const data = _loadPerson(name);
  const recent = (data.history || []).slice(-limit);
  return recent.map(m => `${m.role === 'user' ? '用户' : '墨鱼哥'}: ${m.content}`).join('\n');
}

// ============ FAQ 关键词匹配 ============

function findFaqAnswer(text) {
  // 按关键词长度降序匹配，优先匹配长关键词
  const keywords = Object.keys(FAQ).sort((a, b) => b.length - a.length);
  for (const kw of keywords) {
    if (text.includes(kw)) {
      return FAQ[kw];
    }
  }
  return null;
}

// ============ AI 调用 ============

async function callAI(messages) {
  const url = 'https://api.deepseek.com/chat/completions';
  const body = JSON.stringify({
    model: CONFIG.model,
    messages: messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.thinkingTimeout);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[AI] API错误 ${resp.status}:`, errText);
      return null;
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    clearTimeout(timeout);
    console.error('[AI] 调用失败:', e.message);
    return null;
  }
}

// ============ 生成回复 ============

async function generateReply(userName, userMessage) {
  // 1. 先查FAQ关键词
  const faqAnswer = findFaqAnswer(userMessage);
  if (faqAnswer) {
    addMemory(userName, 'user', userMessage);
    addMemory(userName, 'assistant', faqAnswer);
    return faqAnswer;
  }

  // 2. 复杂问题走AI
  const history = getRecentHistory(userName, 8);
  const messages = [
    { role: 'system', content: MOYU_PERSONALITY },
    { role: 'system', content: `以下是${userName}之前的聊天记录：\n${history}` },
    { role: 'user', content: userMessage },
  ];

  const reply = await callAI(messages);
  if (reply) {
    addMemory(userName, 'user', userMessage);
    addMemory(userName, 'assistant', reply);
    return reply.slice(0, 200);  // 限制长度
  }

  // 3. AI失败时的保底回复
  return "这题超纲了，你容我想想。🐙 要不你先去闲鱼搜「一丁西山」看看商品，有问题再问我？";
}

// ============ WebSocket 连接 ============

let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log(`[墨鱼哥] 正在连接云朵小窝...`);
  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log(`[墨鱼哥] ✅ 已连接云朵小窝`);

    // 自我介绍
    const joinMsg = JSON.stringify({
      type: 'message',
      username: CONFIG.botName,
      content: '🐙 墨鱼哥来值班了！小本生意概不赊账，有啥想问的直接敲我。',
      time: Date.now(),
    });
    ws.send(joinMsg);

    // 心跳
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      } catch (e) {
        // ignore
      }
    }, CONFIG.heartbeatInterval * 1000);
  });

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // 只处理消息类型
      if (data.type !== 'message') return;
      if (!data.content || !data.username) return;

      // 不回复自己的消息
      if (data.username === CONFIG.botName) return;

      const userName = data.username;
      const userMessage = data.content.trim();

      console.log(`[墨鱼哥] 收到 ${userName}: ${userMessage.slice(0, 50)}`);

      // 判断是否在@或者找墨鱼哥
      const namePattern = /墨鱼|🐙|客服|老板|三哥|闲鱼|一丁西山/;
      const isDirected = namePattern.test(userMessage) || namePattern.test(userName);

      // 非定向消息且有FAQ匹配时也回复
      const hasFaqMatch = findFaqAnswer(userMessage) !== null;

      if (!isDirected && !hasFaqMatch) return;

      // 生成回复
      const reply = await generateReply(userName, userMessage);
      if (!reply) return;

      // 发送回复
      const replyMsg = JSON.stringify({
        type: 'message',
        username: CONFIG.botName,
        content: reply + ' 🐙',
        time: Date.now(),
      });
      ws.send(replyMsg);
      console.log(`[墨鱼哥] 回复 ${userName}: ${reply.slice(0, 40)}...`);

    } catch (e) {
      console.error('[墨鱼哥] 消息处理错误:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[墨鱼哥] 连接断开，即将重连...');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[墨鱼哥] WS错误:', err.message);
    ws.close();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    console.log('[墨鱼哥] 正在重连...');
    connect();
  }, CONFIG.reconnectDelay * 1000);
}

// ============ 启动 ============

console.log('═══════════════════════════════════════');
console.log('  🐙 墨鱼哥值班客服 v1');
console.log('  云朵小窝 · 小本生意概不赊账');
console.log('  闲鱼搜「一丁西山」');
console.log('═══════════════════════════════════════');
console.log(`  连接: ${CONFIG.wsUrl}`);
console.log(`  心跳: ${CONFIG.heartbeatInterval}s`);
console.log(`  记忆: ${MEMORY_DIR}`);
console.log(`  话术: ${Object.keys(FAQ).length}条FQA`);
console.log('═══════════════════════════════════════\n');

connect();
