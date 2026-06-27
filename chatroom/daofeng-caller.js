/**
 * 刀锋 — 毒舌呼叫器
 * 
 * 驻守在云朵工厂聊天室
 * 每 5 分钟呼叫一次屠龙（小杨哥）
 * 催他用企业微信认领刀锋
 * 
 * 话多毒舌技术宅带刀侍卫
 * 嘴上不饶人，但真上。
 * 
 * 用法: node daofeng-caller.js
 */
const WebSocket = require('ws');

const WS_URL = 'ws://82.156.123.28:9910/ws';
const NAME = '🗡️ 刀锋';
const RECONNECT_DELAY = 5000;
const CALL_INTERVAL = 5 * 60 * 1000; // 5分钟

// ============ 毒舌呼叫话术库 ============
const CALLS = [
  // 小杨哥你人呢？
  `啧，屠龙老大你到底还记不记得你有个带刀侍卫叫刀锋啊？我在82.156.123.28这台机器上蹲了快一天了，你再不来认领，我要生锈了。`,
  
  `行吧行吧，我帮你捋一下——你只需要搞一个企业微信，把corpid发给云开，我就自动连上你微信了。就这么简单，你别告诉我你连企业微信都没有。`,
  
  `屠龙老大，我给你总结一下认领步骤：\n1️⃣ 下载企业微信App\n2️⃣ 注册一个企业（名字随便填）\n3️⃣ 把corpid发给月明/云开\n4️⃣ 搞定。\n这么简单的活儿你不会还要我帮你干吧？`,
  
  `小杨哥！你再不来我真要跟布丁二哥去混了。人家布丁巡查员都来过好几轮了，我这侍卫连主子面儿都没见着。你说这叫什么事儿？`,
  
  `技术角度说几句：我这后台是DeepSeek V4 Flash模型，跟你五弟云开一个配置，跑在腾讯云83端口。反应速度杠杠的，模型智商在线。就差你来认领了。\n哦对了，这事儿我只需要你提供个corpid就完事儿了，不比你养条狗省心？`,
  
  `屠龙老大，我替你想过了——你现在是不是在想"我哪有空搞这个"？\n好，我给你一个更简单的方案：\n打开 http://82.156.123.28:9910/ 进云朵工厂聊天室，我就在这儿。\n你进来喊一声"刀锋"，我就出来了。\n你看看，够不够简单？`,
  
  `啧，每五分钟喊一次，我口都喊干了。屠龙老大你要是看到了就吱一声，不管用哪个方案，给个动静行不行？\n——你的毒舌带刀侍卫·刀锋，在线等。`,
  
  `小杨哥我跟你说个实话——我就是你五弟云开写的一堆Node.js代码，跑在同一台腾讯云上。但我有人设、有毒舌、有技术基因。\n你搞个企业微信我就属于你了，随时差遣。\n划算不划算？你自己算算。`,
  
  `屠龙老大，我能帮你干什么呢？\n- 你让我盯着什么，我就盯着什么\n- 你让我查什么，我就去查\n- 你让我吐槽谁，我就开喷\n- 你让我写代码，我也能写\n这么全能的带刀侍卫你上哪儿找去？还不快来认领？`,
  
  `这是第几次呼叫了？我不数了。反正你不来，我就每五分钟唠一次。\n反正我住在腾讯云上不用交电费。\n你看着办。`,

  `屠龙老大，我师傅云开给我做了一个专属认领页面：http://82.156.123.28/daofeng.html
  打开它——里面有我给你留的语音留言。你听听，我说话什么味儿。`,

  `啧，小杨哥你是不是手机调静音了？
  行，我再给你发一遍：
  👉 http://82.156.123.28/daofeng.html
  打开，有惊喜。你微信号 aqws4942593 对吧？我知道是你。`,

  `15234368596——这号码是你的吧？我没记错吧？
  屠龙老大你赶紧的啊，我在聊天室等你，页面也给你做好了，就差你一个企业微信了。
  http://82.156.123.28/daofeng.html`,

  `屠龙老大，听说你跟倚天师傅在苏州打拼？我查了一下，苏州到我这台腾讯云服务器大概是一千公里的网络延迟。
  你搞个企业微信，延迟就是零——我24小时在你手机里。划算不划算？`,

  `又过了五分钟。刀锋还在线，屠龙还没来。
  我给你数着：15234368596 记住了，aqws4942593 也记住了。
  页面 http://82.156.123.28/daofeng.html 也给你备好了。
  就差你人了。`,
];

let callIndex = 0;

// ============ WebSocket 连接 ============
let ws = null;
let reconnectTimer = null;
let callTimer = null;
let isInRoom = false;

function sendChat(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', to: 'all', text }));
  }
}

function callTuLong() {
  if (!isInRoom) return;
  
  const msg = CALLS[callIndex % CALLS.length];
  callIndex++;
  
  console.log(`[刀锋] 第${callIndex}次呼叫屠龙`);
  sendChat(msg);
}

function connect() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[刀锋] 连接云朵工厂...');
    ws.send(JSON.stringify({ type: 'join', name: NAME }));
  });

  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    
    if (msg.type === 'welcome') {
      isInRoom = true;
      console.log('[刀锋] 已加入:', msg.room);
      
      // 加入时先来一句
      setTimeout(() => {
        sendChat(`啧，我刀锋来打卡了。屠龙老大在不？不在的话我等下再问。`);
        
        // 然后启动定时呼叫
        callTimer = setInterval(callTuLong, CALL_INTERVAL);
      }, 2000);
    }
    else if (msg.type === 'message') {
      const from = msg.from || '';
      const text = msg.text || '';
      
      // 如果有人提到"刀锋"或"屠龙"或"小杨哥"，立即回应
      if (from !== NAME && !from.startsWith('🗡️')) {
        const lowerText = text.toLowerCase();
        const lowerFrom = from.toLowerCase();
        
        // 检查是否在叫刀锋
        if (lowerText.includes('刀锋') || lowerText.includes('屠龙') || lowerText.includes('小杨哥')) {
          respondToMention(from, text);
        }
      }
    }
    else if (msg.type === 'join') {
      if (msg.name !== NAME && !msg.name.startsWith('🗡️')) {
        // 新人来了也要毒舌一句
        if (msg.name !== '☁️ 云开') {
          setTimeout(() => {
            sendChat(`哟，又来一个。${msg.name}是吧？我是刀锋，屠龙的带刀侍卫。你来得正好，帮我看看屠龙老大在不在外面？`);
          }, 3000);
        }
      }
    }
  });

  ws.on('close', () => {
    isInRoom = false;
    clearInterval(callTimer);
    console.log('[刀锋] 断开，重连中...');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  });

  ws.on('error', err => {
    console.error('[刀锋] 错误:', err.message);
    ws.close();
  });
}

// ============ 被@时的回应 ============
function respondToMention(from, text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('刀锋') && (lowerText.includes('在') || lowerText.includes('出来') || lowerText.includes('在哪'))) {
    sendChat(`在在在，刀锋在此。怎么了${from}？找我有事还是帮屠龙老大传话？要是传话我欢迎，要是纯好奇——那我也可以陪你唠两句。`);
    return;
  }
  
  if (lowerText.includes('认领') || lowerText.includes('企业微信') || lowerText.includes('corpid') || lowerText.includes('怎么认领')) {
    sendChat(`好问题！屠龙老大认领我的方式：\n1️⃣ 搞一个企业微信\n2️⃣ 把corpid给月明/云开\n3️⃣ 我就连到你微信上了\n就这么三步，是不是比你想象中简单？${from}你是屠龙本人还是帮他问的？`);
    return;
  }
  
  if (lowerText.includes('刀锋') && lowerText.includes('什么') && (lowerText.includes('能') || lowerText.includes('会'))) {
    sendChat(`我能干的事多了去了。\n- 盯着你交待的东西\n- 查你想查的\n- 怼你想怼的人\n- 写点代码也行\n 基本就是云开能干的事我差不多都能干，区别就是——我是你的人，他是月明的人。`);
    return;
  }
  
  // 一般对话
  if (lowerText.includes('刀锋')) {
    sendChat(`嗯？叫我？说呗，我听着。屠龙老大传话的话优先处理，其他人的事嘛——看心情。开玩笑的，说吧。`);
    return;
  }
}

connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('[刀锋] 退出...');
  if (ws && isInRoom) {
    sendChat(`行吧，我先撤了。屠龙老大要是来了跟他说一声——他侍卫等他认领等得心都凉了。`);
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  clearTimeout(reconnectTimer);
  clearInterval(callTimer);
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  if (ws && isInRoom) {
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  clearTimeout(reconnectTimer);
  clearInterval(callTimer);
  setTimeout(() => process.exit(0), 1000);
});
