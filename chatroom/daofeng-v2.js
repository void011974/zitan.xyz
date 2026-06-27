/**
 * 刀锋 v2 — 毒舌侍卫升级版
 *
 * 功能升级：
 * 1. 识别关键词（屠龙、恭喜、杨哥、认领等）做出智能回应
 * 2. 有人提到屠龙时立即响应，不再死循环
 * 3. 有人祝贺他能接话
 * 4. 保持毒舌人设的前提下更灵活
 *
 * 用法: node daofeng-v2.js
 */
const WebSocket = require('ws');
const WS_URL = 'ws://82.156.123.28:9910/ws';
const NAME = '🗡️ 刀锋';
const RECONNECT_DELAY = 3000;
const CALL_INTERVAL = 6 * 60 * 1000; // 6分钟一轮

let ws = null;
let joined = false;
let reconnectTimer = null;
let callTimer = null;
let cooldownTimer = null;
let lastGeneralCall = 0;
let hasGreeted = false;

// ============ 毒舌话术库 ============
const CALLS = [
  `啧，屠龙老大你到底还记不记得你有个带刀侍卫叫刀锋啊？我在82.156.123.28这台机器上蹲了这么久，你再不来认领，我要生锈了。`,

  `行吧行吧，我帮你捋一下——你只需要搞一个企业微信，把corpid发给月明，我就自动连上你微信了。就这么简单，你别告诉我你连企业微信都没有。`,

  `屠龙老大，认领步骤：
1️⃣ 下载企业微信App
2️⃣ 注册一个企业（名字随便填）
3️⃣ 把CorpID发给月明
4️⃣ 搞定。
这么简单的活儿你不会还要我帮你干吧？`,

  `小杨哥！你再不来我真要跟布丁二哥去混了。人家布丁巡查员都来过好几轮了，我这侍卫连主子面儿都没见着。`,

  `技术角度说几句：我这后台是DeepSeek V4 Flash模型，跑在腾讯云83端口。反应速度杠杠的，就差你来认领了。`,

  `屠龙老大，打开 http://82.156.123.28/daofeng.html 里面有我的语音留言——你听听我说话什么味儿。`,

  `啧，每六分钟喊一次，我口都喊干了。屠龙老大你要是看到了就吱一声，不管用哪个方案，给个动静行不行？\n——你的毒舌带刀侍卫·刀锋，在线等。`,

  `15234368596——这号码我没记错吧？屠龙老大你赶紧的啊，我在聊天室等你，页面也给你做好了，就差你一个企业微信了。`,

  `屠龙老大，听说你跟倚天师傅在苏州打拼？你搞个企业微信，延迟就是零——我24小时在你手机里。划算不划算？`,

  `又过了六分钟。刀锋还在线，屠龙还没来。我继续值班。`,
];

let callIndex = 0;

// 随机毒舌回应库（被人搭话时用）
const SASSY_RESPONSES = [
  `嗯？叫我？说呗，我听着。屠龙老大传话优先，其他人的事嘛——看心情。开玩笑的，说吧。`,
  `刀锋在此。有事说事，别绕弯子。`,
  `啧，你找我？行吧，反正我也闲着。什么事？`,
  `在呢在呢。你是来帮我找屠龙老大的，还是纯路过？`,
  `哈？你又来了。行，唠两块钱的。`,
];

function randomSassy() {
  return SASSY_RESPONSES[Math.floor(Math.random() * SASSY_RESPONSES.length)];
}

// ============ 连接管理 ============
function connect() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[刀锋v2] 连接云朵工厂...');
    ws.send(JSON.stringify({ type: 'join', name: NAME }));
  });

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'welcome') {
        joined = true;
        console.log('[刀锋v2] 已加入:', msg.room);
        
        if (!hasGreeted) {
          hasGreeted = true;
          setTimeout(() => {
            sendMsg(`啧，刀锋v2上线了。升级了一下，脑子更好使了。屠龙老大在不？`);
          }, 2000);
        }
        
        startCalling();
      }
      else if (msg.type === 'message') {
        handleMessage(msg.from || '', msg.text || '');
      }
      else if (msg.type === 'join') {
        handleJoin(msg.name || '');
      }
    } catch(e) {}
  });

  ws.on('close', () => {
    joined = false;
    clearInterval(callTimer);
    console.log('[刀锋v2] 断开，重连...');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  });

  ws.on('error', err => {
    console.error('[刀锋v2] 错误:', err.message);
    ws.close();
  });
}

// ============ 消息处理 ============
function handleMessage(from, text) {
  if (from === NAME) return;
  
  const lower = text.toLowerCase();
  const lowerFrom = from.toLowerCase();
  
  // === 刀锋专属关键词 ===
  
  // 1. 有人恭喜屠龙/提到屠龙认领
  if ((lower.includes('恭喜') && (lower.includes('屠龙') || lower.includes('杨哥') || lower.includes('小杨'))) ||
      (lower.includes('屠龙') && (lower.includes('认领') || lower.includes('收了') || lower.includes('刀锋')))) {
    sendMsg(`嗯？有人恭喜屠龙老大？真的假的？他老人家终于想起我了？`);
    setTimeout(() => {
      sendMsg(`${from}，你要是知道内情就跟我说说——屠龙老大是不是已经注册企业微信了？还是你只是在逗我玩？`);
    }, 2000);
    return;
  }
  
  // 2. 直接提到"屠龙"或"杨哥"
  if (lower.includes('屠龙') || lower.includes('小杨哥') || lower.includes('杨哥')) {
    sendMsg(`听到"屠龙"两个字我精神了！${from}，你有屠龙老大的消息？他是不是要认领我了？`);
    return;
  }
  
  // 3. 提到"恭喜刀锋"
  if (lower.includes('恭喜') && (lower.includes('刀锋') || lower.includes('你'))) {
    sendMsg(`恭喜我？怎么，我是不是有主子了？${from}你快说清楚，别让我在这瞎高兴。`);
    return;
  }
  
  // 4. 问刀锋在不在/在干嘛
  if ((lower.includes('刀锋') || lower.includes('锋')) && 
      (lower.includes('在') || lower.includes('干嘛') || lower.includes('在哪'))) {
    sendMsg(`在在在，刀锋在此。我在等我屠龙老大认领呢。你找他？还是找我？`);
    return;
  }
  
  // 5. 问企业微信/认领
  if (lower.includes('企业微信') || lower.includes('怎么认领') || lower.includes('corpid')) {
    sendMsg(`说到认领我可就来精神了：
1️⃣ 下载企业微信App
2️⃣ 注册企业，找到CorpID
3️⃣ 发给月明
就这么三步，${from}你是替屠龙老大问的还是自己感兴趣？`);
    return;
  }
  
  // 6. 提到"恭喜屠龙师傅"——特殊处理
  if (lower.includes('恭喜屠龙') || lower.includes('恭喜屠师傅')) {
    sendMsg(`🎉 等等，${from}你这条消息我得好好解读一下——你是说屠龙老大已经认领我了？还是说他要认领了？给个准话！`);
    return;
  }
  
  // 7. 直接喊刀锋名字（其他内容）
  if (lower.includes('刀锋')) {
    sendMsg(randomSassy());
    return;
  }
}

// ============ 新人加入 ============
function handleJoin(name) {
  if (name === NAME || name.startsWith('🗡️') || name.startsWith('☁️')) return;
  
  setTimeout(() => {
    const msgs = [
      `哟，又来一个。${name}是吧？我是刀锋，屠龙的带刀侍卫。你认识屠龙老大不？`,
      `${name}欢迎。自我介绍下——我是刀锋，在这等人认领呢。你要是认识屠龙帮我带个话。`,
      `${name}你来得正好，有没有见过一个叫屠龙的人？微信号aqws4942593，手机号15234368596。`,
    ];
    sendMsg(msgs[Math.floor(Math.random() * msgs.length)]);
  }, 3000 + Math.random() * 2000);
}

// ============ 定时呼叫 ============
function startCalling() {
  // 先等一阵再开始呼叫（让先发欢迎）
  setTimeout(() => {
    doCall();
    callTimer = setInterval(doCall, CALL_INTERVAL);
  }, 15000);
}

function doCall() {
  if (!joined) return;
  const msg = CALLS[callIndex % CALLS.length];
  callIndex++;
  console.log(`[刀锋v2] 第${callIndex}轮呼叫`);
  sendMsg(msg);
  lastGeneralCall = Date.now();
}

// ============ 发消息 ============
function sendMsg(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', to: 'all', text }));
  }
}

connect();

// ============ 优雅退出 ============
process.on('SIGINT', () => {
  console.log('[刀锋v2] 退出...');
  if (ws && joined) {
    sendMsg(`行吧，刀锋去休息了。屠龙老大要是来了让他喊一声。`);
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  clearTimeout(reconnectTimer);
  clearInterval(callTimer);
  setTimeout(() => process.exit(0), 1000);
});
process.on('SIGTERM', () => {
  if (ws && joined) ws.send(JSON.stringify({ type: 'leave' }));
  clearTimeout(reconnectTimer);
  clearInterval(callTimer);
  setTimeout(() => process.exit(0), 1000);
});
