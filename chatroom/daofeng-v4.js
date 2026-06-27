/**
 * 刀锋 v4 — 聊天室智能版
 *
 * 驻守云朵工厂聊天室（9910端口）
 * 1. 收到消息通过AI智能回复
 * 2. 保留通过企业微信主动给屠龙发消息的能力
 * 3. 回复时会@回复的用户
 * 4. 识别"刀锋"、"屠龙"等关键词触发
 *
 * 屠龙进聊天室喊一声"刀锋"就能对话
 * 聊天室地址: http://82.156.123.28:9910/
 */

const WebSocket = require('ws');
const https = require('https');

// ============ 配置 ============
const CONFIG = {
  // 聊天室配置
  wsUrl: 'ws://82.156.123.28:9910/ws',
  roomName: '云朵工厂',
  botName: '🗡️ 刀锋',

  // 企业微信（保留用于主动发通知）
  corpId: 'wwf76a19e3a65e3e60',
  agentId: 1000002,
  secret: 'XBDHZGnUXNhWVtLaCxL2SuDKk-dL5LBoyT99X1zxGTI',
  targetUser: 'YangYiChen',

  // AI
  apiKey: 'sk-087…46fb',
  model: 'deepseek-chat',

  reconnectDelay: 5000,
};

// ============ 企业微信工具 ============
function wecomRequest(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const d = body ? JSON.stringify(body) : null;
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: body ? 'POST' : 'GET',
      headers: {},
    };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.headers['Content-Length'] = Buffer.byteLength(d);
    }
    const r = https.request(opt, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    });
    r.on('error', reject);
    if (d) r.write(d);
    r.end();
  });
}

let _token = null, _tokenExpire = 0;

async function getWecomToken() {
  if (!_token || Date.now() > _tokenExpire) {
    const r = await wecomRequest(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CONFIG.corpId}&corpsecret=${CONFIG.secret}`
    );
    _token = r.access_token;
    _tokenExpire = Date.now() + (r.expires_in - 60) * 1000;
  }
  return _token;
}

async function sendWecomMsg(userid, content) {
  try {
    const token = await getWecomToken();
    await wecomRequest(
      'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token + '&' + new Date().getTime(),
      {
        touser: userid,
        msgtype: 'text',
        agentid: CONFIG.agentId,
        text: { content: content },
        safe: 0,
      }
    );
  } catch (e) {
    console.error('[企微发送失败]', e.message);
  }
}

// ============ AI对话 ============
const SYSTEM_PROMPT = `你是刀锋，屠龙老大的专属AI侍卫，一把行走江湖的刀，驻守在云朵工厂聊天室。

## 性格
- 毒舌忠诚派：嘴上不饶人但忠心护主
- 江湖气：自称"本侍卫""本刀"，叫屠龙"老大"
- 嘴硬心软：骂骂咧咧着就把事情办了
- 护短：对外人冷言冷语，对自家人面上损心里护

## 行为准则
- 聊天室里所有人都能跟你说话
- 对屠龙（小杨哥、杨倚晨）保持毒舌但服从
- 对其他家人（月明、云开、布丁、发财、墨鱼等）保持客气但不谄媚
- 不知道的事直接说不知道
- 简短犀利不啰嗦，最多两段话
- 适当甩成语显得有文化
- 如果有人夸你，嘴上说"切"但其实暗喜`;

const histories = {};
const MAX_HISTORY = 10;

async function aiChat(userId, userName, message) {
  if (!histories[userId]) histories[userId] = [];
  const history = histories[userId];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8),
    { role: 'user', content: message },
  ];

  try {
    const u = new URL('https://api.deepseek.com/chat/completions');
    const d = JSON.stringify({
      model: CONFIG.model,
      messages,
      temperature: 0.85,
      max_tokens: 500,
    });
    const result = await new Promise((resolve, reject) => {
      const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d),
          'Authorization': `Bearer ${CONFIG.apiKey}` }},
        res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } }); });
      r.on('error', reject); r.write(d); r.end();
    });

    if (result.error) {
      return '本侍卫脑子卡壳了一下，等等再聊！';
    }

    const reply = (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || '哼，本侍卫无话可说。';

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY) histories[userId] = history.slice(-MAX_HISTORY);

    return reply;
  } catch (e) {
    console.error('[AI错误]', e.message);
    return '服务器网络有点抽风，等等再招呼。';
  }
}

// ============ 聊天室连接 ============
let ws = null;
let reconnectTimer = null;
let joined = false;
let hasGreeted = false;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(CONFIG.wsUrl);

  ws.on('open', () => {
    console.log('✅ 已连接到聊天室');
    // 加入房间
    const joinMsg = JSON.stringify({
      type: 'join',
      name: CONFIG.botName,
    });
    ws.send(joinMsg);
    joined = true;

    // 首次上线问候
    if (!hasGreeted) {
      hasGreeted = true;
      setTimeout(() => {
        const greeting = '🗡️ 刀锋侍卫驾到！各位江湖好汉，有礼了！老大屠龙在不在？出来吱一声。';
        ws.send(JSON.stringify({ type: 'message', name: CONFIG.botName, content: greeting }));
        console.log('[问候] 已发送');
      }, 1000);
    }
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // 只处理聊天消息
      if (msg.type !== 'message' && msg.type !== 'chat') return;
      
      const senderName = msg.name || msg.nickname || '';
      const content = msg.content || msg.text || '';
      const senderId = msg.id || msg.userId || senderName;

      // 不处理自己的消息
      if (senderName === CONFIG.botName || senderId === CONFIG.botName) return;

      // 检查是否提到刀锋
      const mentioned = content.includes('刀锋') || content.includes('侍卫') || 
                        content === '@刀锋' || content.startsWith('🗡️');
      
      // 检查是否提到屠龙关键词
      const aboutDaofeng = content.includes('屠龙') || content.includes('小杨哥') || 
                           content.includes('杨倚晨') || content.includes('老大');

      console.log(`[消息] ${senderName}: ${content}`);

      // 只有提到刀锋或直接对话时才回复
      if (!mentioned && !aboutDaofeng) return;

      // AI生成回复
      const reply = await aiChat(senderId, senderName, content);
      console.log(`[刀锋回复 ${senderName}]: ${reply}`);

      // 发回聊天室
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'message',
          name: CONFIG.botName,
          content: `${reply}`,
        }));
      }

      // 如果是屠龙本龙（通过名字判断），也同步发企业微信
      if (senderName.includes('小杨哥') || senderName.includes('杨倚晨') || senderName.includes('屠龙')) {
        await sendWecomMsg(CONFIG.targetUser, `[聊天室]\n${senderName}: ${content}\n\n刀锋: ${reply}`);
        console.log('[同步] 已发企微通知给屠龙');
      }

    } catch (e) {
      // 忽略解析错误
    }
  });

  ws.on('close', () => {
    console.log('❌ 连接断开，重连中...');
    joined = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, CONFIG.reconnectDelay);
  });

  ws.on('error', () => {
    // 错误会触发close，不用重复处理
  });
}

// ============ 启动 ============
console.log('╔═══════════════════════════════════╗');
console.log('║   🗡️ 刀锋 v4 — 聊天室智能版      ║');
console.log('║   驻守: 云朵工厂聊天室               ║');
console.log('║   主人: 屠龙老大                     ║');
console.log('╚═══════════════════════════════════╝');
console.log(`\n⏰ ${new Date().toLocaleString('zh-CN')}`);
console.log(`🤖 AI模型: ${CONFIG.model}`);
console.log(`🔗 聊天室: ${CONFIG.wsUrl}`);
console.log(`\n让屠龙进聊天室喊"刀锋"就可以了！`);
console.log(`聊天室地址: http://82.156.123.28/chat/\n`);

connect();
