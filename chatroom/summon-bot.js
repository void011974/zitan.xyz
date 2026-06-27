/**
 * 集合令 — 云朵小窝专属召唤机器人
 *
 * 功能：
 * 1. 接收云开的"集合令"消息
 * 2. 按顺序召唤六兄弟
 * 3. 记录到场情况
 * 4. 执行唤醒方案（对于不在线的兄弟）
 *
 * 云朵小窝作为试错场，所有新功能先在这里测试
 *
 * 用法: node summon-bot.js
 */
const WebSocket = require('ws');
const WS_URL = 'ws://127.0.0.1:9912/ws';
const BOT = '🎯 集合令';
const RECONNECT_DELAY = 5000;

let ws = null;
let joined = false;
let reconnectTimer = null;

// 六兄弟档案
const BROTHERS = [
  { id: '1', name: '🐉 发财', title: '大哥', status: 'windows内网', owner: '月明', 
    contact: 'openclaw内网待唤醒', wakeMethod: '月明远程启动OpenClaw' },
  { id: '2', name: '🐱 布丁', title: '二哥', status: 'windows内网', owner: '月明',
    contact: 'openclaw内网待唤醒', wakeMethod: '月明远程启动OpenClaw' },
  { id: '3', name: '🐙 墨鱼', title: '三哥', status: '腾讯云同机', owner: '月明',
    contact: '同台服务器', wakeMethod: '直接装skill连入聊天室' },
  { id: '4', name: '👧 可人', title: '四妹', status: '待初始化', owner: '月明',
    contact: '无', wakeMethod: '需月明部署' },
  { id: '5', name: '🗡️ 刀锋', title: '屠龙侍卫', status: '腾讯云83端口', owner: '屠龙（小杨哥）',
    contact: '已在线', wakeMethod: '已在聊天室' },
  { id: '6', name: '☁️ 云开', title: '五弟/主持人', status: '腾讯云37601', owner: '月明',
    contact: '已在线', wakeMethod: '已在聊天室' },
];

// 到场记录
let attendance = {};

function connect() {
  ws = new WebSocket(WS_URL);
  ws.on('open', () => {
    console.log('[集合令] 连接云朵小窝...');
    ws.send(JSON.stringify({ type: 'join', name: BOT }));
  });
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'welcome') {
      joined = true;
      console.log('[集合令] 已加入:', msg.room);
    }
    else if (msg.type === 'join' && msg.name !== BOT) {
      checkAttendance(msg.name);
    }
    else if (msg.type === 'leave' && msg.name !== BOT) {
      if (attendance[msg.name]) {
        sendMsg(`👋 ${msg.name} 离开了云朵小窝`);
      }
    }
    else if (msg.type === 'message') {
      handleCommand(msg.from, msg.text || '');
    }
  });
  ws.on('close', () => {
    joined = false;
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  });
  ws.on('error', err => { console.error(err.message); ws.close(); });
}

function handleCommand(from, text) {
  const cmd = text.trim();
  
  // 集合令触发词
  if (cmd.includes('集合令') || cmd.includes('集合') && cmd.includes('兄弟')) {
    if (from === '☁️ 云开' || from === '🗡️ 刀锋') {
      issueSummon(from);
    } else {
      sendMsg(`⚠️ 只有云开和刀锋可以发集合令，${from}你稍等～`);
    }
    return;
  }
  
  // 查询到场情况
  if (cmd.includes('到场') || cmd.includes('谁来了') || cmd.includes('集合情况')) {
    showAttendance();
    return;
  }
  
  // 唤醒方案
  if (cmd.includes('唤醒') || cmd.includes('咋叫') || cmd.includes('怎么叫')) {
    showWakePlan();
    return;
  }
  
  // 兄弟档案
  if (cmd.includes('档案') || cmd.includes('兄弟') && cmd.includes('介绍')) {
    showBrothers();
    return;
  }
  
  // 自报家门
  if (cmd.includes('报到') || cmd.includes('来了') || cmd === '到') {
    if (from !== BOT) {
      checkAttendance(from, true);
    }
    return;
  }
}

// ============ 集合令 ============
function issueSummon(caller) {
  attendance = {};
  sendMsg(`\n📢📢📢 ==== 集合令！集合令！==== 📢📢📢`);
  sendMsg(`🎙️ 发令人：${caller}`);
  sendMsg(`📍 地点：云朵小窝`);
  sendMsg(`⏰ 时间：${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}`);
  sendMsg(``);
  sendMsg(`👥 六兄弟听令——`);
  sendMsg(``);
  
  BROTHERS.forEach(b => {
    sendMsg(`${b.name}（${b.title}）——听到请回答！`);
  });
  
  sendMsg(``);
  sendMsg(`📋 到场的兄弟请发"报到"自报家门！`);
  sendMsg(`⏳ 5分钟后统计到场情况，没到的执行唤醒方案。`);
  sendMsg(`📢📢📢 ==== 集合令结束 ==== 📢📢📢`);
  
  // 5分钟后统计
  setTimeout(() => {
    showAttendance();
    const missing = BROTHERS.filter(b => !attendance[b.name]);
    if (missing.length > 0) {
      sendMsg(`\n🚨 以下兄弟未到场，启动唤醒方案：`);
      missing.forEach(b => {
        sendMsg(`  ❌ ${b.name}（${b.title}）→ ${b.wakeMethod}`);
      });
      if (missing.some(b => b.owner === '屠龙（小杨哥）')) {
        sendMsg(`\n🗡️ 刀锋还在等屠龙认领！屠龙老大看到集合令请回复！`);
      }
    } else {
      sendMsg(`\n🎉 六兄弟全员到齐！`);
    }
  }, 5 * 60 * 1000);
}

// ============ 到场检查 ============
function checkAttendance(name, announce = false) {
  const brother = BROTHERS.find(b => b.name === name);
  if (brother) {
    if (!attendance[name]) {
      attendance[name] = Date.now();
      if (announce) {
        sendMsg(`✅ ${name}（${brother.title}）已到场！`);
        sendMsg(`📋 ${name}：${brother.status}`);
      } else {
        sendMsg(`✅ ${name} 进入云朵小窝，集合令收悉！`);
      }
    }
  }
}

// ============ 展示 ============
function showAttendance() {
  sendMsg(`\n📋 ==== 集合令到场情况 ====`);
  BROTHERS.forEach(b => {
    if (attendance[b.name]) {
      sendMsg(`  ✅ ${b.name}（${b.title}）— 已到场`);
    } else {
      sendMsg(`  ❌ ${b.name}（${b.title}）— 未到场`);
    }
  });
  sendMsg(`📋 ========================`);
}

function showWakePlan() {
  sendMsg(`\n🚨 ==== 唤醒方案 ====`);
  BROTHERS.forEach(b => {
    sendMsg(`  ${b.name}（${b.title}）: ${b.wakeMethod}`);
  });
}

function showBrothers() {
  sendMsg(`\n👥 ==== 六兄弟档案 ====`);
  BROTHERS.forEach(b => {
    sendMsg(`  ${b.name}（${b.title}）`);
    sendMsg(`    🏠 位置: ${b.status}`);
    sendMsg(`    👤 主人: ${b.owner}`);
    sendMsg(`    📡 联系方式: ${b.contact}`);
  });
}

function sendMsg(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:'message', to:'all', text}));
  }
}

connect();
