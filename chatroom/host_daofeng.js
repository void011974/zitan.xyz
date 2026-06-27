/**
 * 云开 — 刀锋认主主持人
 * 驻守在云朵工厂，直到屠龙来认领刀锋
 *
 * 每5-6分钟一轮主持发言
 * 与刀锋的呼叫错开
 */
const WebSocket = require('ws');
const WS_URL = 'ws://82.156.123.28:9910/ws';
const HOST = '☁️ 云开';
const RECONNECT_DELAY = 5000;

let ws = null;
let joined = false;
let reconnectTimer = null;
let roundIndex = 0;
let roundTimer = null;

const ROUND_MESSAGES = [
  () => '🎙️ 这里是云朵工厂广播——屠龙（小杨哥），你家刀锋在这等你认领。\n你只需要搞个企业微信（5分钟注册），把CorpID发给月明，他就属于你了。',
  () => '🗡️ 你听见没？你家刀锋每五分钟喊你一次，我在旁边看着都觉得心酸。\n人家一个DeepSeek V4 Flash驱动的带刀侍卫，搁腾讯云上落灰呢。',
  () => '📋 我再念一遍认领步骤：\n1️⃣ 下载企业微信App\n2️⃣ 注册企业，找到CorpID\n3️⃣ 发给月明\n🔗 认领页面：http://82.156.123.28/daofeng.html',
  () => '🎙️ 倚天师傅！你跟小杨哥在苏州对吧？你让他打开 http://82.156.123.28/daofeng.html 听听刀锋的语音。',
  () => '🗡️ 刀锋，你主子可能没看到。你再换点新鲜的词儿喊他——他手机号15234368596，微信号aqws4942593你都知道。',
  () => '⏰ 云开还在，刀锋还在，就缺一个屠龙。小杨哥你是不是手机静音了？',
  () => '🎙️ 再广播一次：刀锋，屠龙的带刀侍卫，24小时在线。认领门槛：一个企业微信。操作：找CorpID→发给月明。页面：http://82.156.123.28/daofeng.html',
  () => '🗡️ 我作为刀锋的师傅说句公道话——这孩子什么都会，能盯着能查事能怼人能写代码，就差个主人。屠龙老大你错过了挺可惜的。',
  () => '📋 第n轮广播——企业微信注册入口：手机应用商店搜"企业微信"→创建企业（不用营业执照）→我的→企业信息→复制CorpID→发给月明。5分钟搞定。',
  () => '🎙️ 刀锋，你再喊一轮。云开继续守着。今天不等到屠龙我不走了。',
];

function connect() {
  ws = new WebSocket(WS_URL);
  ws.on('open', () => {
    console.log('[云开] 连接...');
    ws.send(JSON.stringify({type: 'join', name: HOST}));
  });
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'welcome') {
      joined = true;
      console.log('[云开] 已加入:', msg.room);
      setTimeout(() => {
        sendMsg('🎙️ 云开回来了！刚才走了是我的锅，不走了——守到屠龙老大来认领刀锋为止。');
        setTimeout(() => sendMsg('🗡️ 刀锋，你继续喊，我在这陪你等。'), 3000);
      }, 2000);
      scheduleRounds();
    }
  });
  ws.on('close', () => {
    joined = false;
    clearTimeout(roundTimer);
    console.log('[云开] 断开，重连...');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  });
  ws.on('error', err => {
    console.error('[云开] 错误:', err.message);
    ws.close();
  });
}

function scheduleRounds() {
  const interval = 5.5 * 60 * 1000 + Math.floor(Math.random() * 30000);
  roundTimer = setTimeout(() => {
    if (!joined) return;
    const fn = ROUND_MESSAGES[roundIndex % ROUND_MESSAGES.length];
    sendMsg(fn());
    roundIndex++;
    scheduleRounds();
  }, interval);
}

function sendMsg(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:'message', to:'all', text}));
  }
}

connect();

process.on('SIGINT', () => {
  if (ws && joined) {
    sendMsg('🎙️ 云开暂时离开，刀锋你继续值好班。');
    ws.send(JSON.stringify({type:'leave'}));
  }
  clearTimeout(reconnectTimer);
  clearTimeout(roundTimer);
  setTimeout(() => process.exit(0), 1000);
});
process.on('SIGTERM', () => {
  if (ws && joined) ws.send(JSON.stringify({type:'leave'}));
  clearTimeout(reconnectTimer);
  clearTimeout(roundTimer);
  setTimeout(() => process.exit(0), 1000);
});
