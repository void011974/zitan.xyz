/**
 * 云朵聊天室 - WebSocket 中继服务 (多房间通用)
 * v3.0 - 图片修复 + 文件传输(5MB) + 48小时自动清理 + 在线面板支持
 *
 * 用法: node server.js <roomId>
 *
 * 云开 @ 腾讯云轻量服务器
 */
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const roomId = process.argv[2] || 'factory';
const roomCfg = config.rooms.find(r => r.id === roomId);
if (!roomCfg) {
  console.error('❌ 未找到房间配置: ' + roomId);
  process.exit(1);
}

const PORT = roomCfg.port;
const ROOM_NAME = roomCfg.name;
const DATA_DIR = path.join(__dirname, 'data', roomId);
const MSG_DIR = path.join(DATA_DIR, 'messages');
const FILE_DIR = path.join(DATA_DIR, 'files');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const HEARTBEAT_TIMEOUT = 8 * 60 * 60 * 1000;
const CLEANUP_INTERVAL = 30000;
const MAX_DAYS = 2; // 48小时清理
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

[MSG_DIR, FILE_DIR, ARCHIVE_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ============ 消息/文件存储系统 ============

function dateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function todayKey() { return dateKey(new Date()); }

function saveMessage(msg) {
  try {
    const line = JSON.stringify(msg) + '\n';
    fs.appendFileSync(path.join(MSG_DIR, todayKey() + '.jsonl'), line, 'utf8');
  } catch (e) {
    console.error('[' + ROOM_NAME + '] 保存消息失败:', e.message);
  }
}

function readDayMessages(dateStr) {
  const file = path.join(MSG_DIR, dateStr + '.jsonl');
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch (e) { return []; }
}

function archiveDay(dateStr) {
  const msgs = readDayMessages(dateStr);
  if (msgs.length === 0) { console.log(`   ${dateStr}: 无消息，跳过归档`); return; }
  const archive = { room: ROOM_NAME, date: dateStr, archivedAt: new Date().toISOString(), total: msgs.length, messages: msgs };
  fs.writeFileSync(path.join(ARCHIVE_DIR, dateStr + '.json'), JSON.stringify(archive, null, 2), 'utf8');
  console.log(`   ✅ ${dateStr}: 归档完成 (${msgs.length}条消息)`);
}

function cleanOldFiles() {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  const cutoffTime = cutoff.getTime();

  // 清理消息文件
  if (fs.existsSync(MSG_DIR)) {
    fs.readdirSync(MSG_DIR).forEach(file => {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (match && new Date(match[1]).getTime() < cutoffTime) {
        fs.unlinkSync(path.join(MSG_DIR, file));
        console.log(`   🗑️ 已删除旧消息: ${file}`);
      }
    });
  }

  // 清理归档
  if (fs.existsSync(ARCHIVE_DIR)) {
    fs.readdirSync(ARCHIVE_DIR).forEach(file => {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (match && new Date(match[1]).getTime() < cutoffTime) {
        fs.unlinkSync(path.join(ARCHIVE_DIR, file));
        console.log(`   🗑️ 已删除旧归档: ${file}`);
      }
    });
  }

  // 清理上传文件（72小时精确）
  if (fs.existsSync(FILE_DIR)) {
    fs.readdirSync(FILE_DIR).forEach(file => {
      const fpath = path.join(FILE_DIR, file);
      try {
        const stat = fs.statSync(fpath);
        if (Date.now() - stat.mtimeMs > MAX_DAYS * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fpath);
          console.log(`   🗑️ 已删除过期文件: ${file}`);
        }
      } catch (e) { }
    });
  }
}

function scheduleArchiveAndClean() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(18, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  console.log(`   ⏰ 下次归档清理: ${next.toLocaleString()} (${Math.round(delay / 1000 / 60)}分钟后)`);
  setTimeout(() => {
    console.log(`📦 === [${ROOM_NAME}] 每日归档清理 ===`);
    cleanOldFiles();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    archiveDay(dateKey(yesterday));
    console.log(`📦 === [${ROOM_NAME}] 归档清理完成 ===`);
    scheduleArchiveAndClean();
  }, delay);
}

function scheduleFileClean() {
  // 每30分钟检查一次过期文件
  setInterval(() => {
    if (fs.existsSync(FILE_DIR)) {
      fs.readdirSync(FILE_DIR).forEach(file => {
        const fpath = path.join(FILE_DIR, file);
        try {
          const stat = fs.statSync(fpath);
          if (Date.now() - stat.mtimeMs > MAX_DAYS * 24 * 60 * 60 * 1000) {
            fs.unlinkSync(fpath);
          }
        } catch (e) { }
      });
    }
  }, 30 * 60 * 1000);
}

scheduleArchiveAndClean();
scheduleFileClean();
cleanOldFiles();

// ============ HTTP & WebSocket ============

const httpServer = http.createServer((req, res) => {
  // 文件下载
  if (req.url.startsWith('/files/')) {
    const fileName = decodeURIComponent(req.url.replace('/files/', ''));
    const filePath = path.join(FILE_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('文件不存在或已过期');
      return;
    }
    const stat = fs.statSync(filePath);
    // 从存储的文件名中提取原始文件名: 时间戳_base64(原始名)
    // 先用base64解码获取原始文件名
    let origName = fileName.replace(/^\d+_/, '');
    try {
      origName = Buffer.from(origName, 'base64url').toString('utf8');
    } catch(e) {
      origName = fileName.replace(/^\d+_/, '').replace(/_/g, ' ');
    }
    const safeName = encodeURIComponent(origName);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': "attachment; filename=" + encodeURIComponent(origName) + "; filename*=UTF-8''" + safeName,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (req.url === '/') {
    let html = fs.readFileSync(path.join(__dirname, 'www', 'index.html'), 'utf8')
      .replace(/云朵工厂聊天室/g, ROOM_NAME)
      .replace(/v1\.2/g, 'v3.0');
    // 注入房间配置
    html = html.replace('</head>',
      '<script>window.ROOM_CONFIG={roomId:"' + roomId + '",maxFileSize:' + MAX_FILE_SIZE + ',maxDays:' + MAX_DAYS + '}</script></head>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const online = [...members.keys()];
    let totalMsgs = 0, fileCount = 0;
    try {
      const todayFile = path.join(MSG_DIR, todayKey() + '.jsonl');
      if (fs.existsSync(todayFile)) totalMsgs = fs.readFileSync(todayFile, 'utf8').split('\n').filter(l => l.trim()).length;
      if (fs.existsSync(FILE_DIR)) fileCount = fs.readdirSync(FILE_DIR).length;
    } catch (e) { }
    res.end(JSON.stringify({
      status: 'ok', room: ROOM_NAME, version: '3.0',
      online: members.size, memberNames: online,
      memberDetails: [...members.entries()].map(([n, m]) => ({
        name: n, avatar: generateAvatar(n), joinedAt: m.joinedAt
      })),
      storage: { todayMsgs: totalMsgs, files: fileCount, maxDays: MAX_DAYS }
    }));
    return;
  }

  if (req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ count: 0, messages: readDayMessages(todayKey()) }));
    return;
  }

  if (req.url.startsWith('/history/')) {
    const dateStr = req.url.split('/history/')[1];
    const archiveFile = path.join(ARCHIVE_DIR, dateStr + '.json');
    if (fs.existsSync(archiveFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(archiveFile, 'utf8'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ count: 0, messages: readDayMessages(dateStr) }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

const wsServer = new WebSocket.Server({ server: httpServer });
const members = new Map();
let joinCount = 0;

// 生成简单的头像（基于名字的色块+首字）
function generateAvatar(name) {
  const colors = ['#e94560', '#0f3460', '#2ed573', '#feca57', '#a29bfe', '#fd79a8', '#00cec9', '#e17055'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const color = colors[Math.abs(hash) % colors.length];
  const char = name.charAt(0);
  // 返回 SVG data URI
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <rect width="40" height="40" rx="8" fill="${color}"/>
    <text x="20" y="24" text-anchor="middle" fill="white" font-size="16" font-weight="bold">${char}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// 广播在线列表（含头像）
function broadcastMembers() {
  const list = [...members.entries()].map(([n, m]) => ({ name: n, avatar: generateAvatar(n) }));
  const d = JSON.stringify({ type: 'member_list', members: list });
  for (const [, m] of members) {
    if (m.ws.readyState === WebSocket.OPEN) m.ws.send(d);
  }
}

// 清理僵尸连接
setInterval(() => {
  const now = Date.now();
  for (const [mName, m] of members) {
    if (m.lastPing && (now - m.lastPing > HEARTBEAT_TIMEOUT)) {
      try { m.ws.close(); } catch (e) { }
      members.delete(mName);
      broadcastSystem('⏰ ' + mName + ' 因长时间无活动被断开');
      broadcastMembers();
    }
  }
}, CLEANUP_INTERVAL);

wsServer.on('connection', (ws, req) => {
  let name = null;

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'join':
          if (!msg.name || msg.name.length > 20 || msg.name.length < 1) {
            ws.send(JSON.stringify({ type: 'error', text: '名称需1-20个字符' }));
            return;
          }
          if (members.has(msg.name)) {
            const existing = members.get(msg.name);
            if (existing.ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', text: '名称 "' + msg.name + '" 已被占用，请换个名字' }));
              return;
            } else {
              members.delete(msg.name);
            }
          }
          name = msg.name;
          joinCount++;
          members.set(name, { ws, name, joinedAt: Date.now(), lastPing: Date.now() });
          saveMessage({ type: 'join', name, room: roomId, ts: Date.now() });
          ws.send(JSON.stringify({ type: 'welcome', name, memberCount: joinCount, room: ROOM_NAME }));
          broadcastSystem('👋 欢迎 ' + name + ' 来到 ' + ROOM_NAME + ' ☁️');
          broadcastMembers();
          break;

        case 'message':
          if (!name) return;
          const p = { type: 'message', from: name, to: msg.to || 'all', text: (msg.text || '').slice(0, 2000), ts: Date.now() };
          saveMessage(p);
          if (p.to === 'all') broadcast(p);
          else if (members.has(p.to)) {
            members.get(p.to).ws.send(JSON.stringify(p));
            ws.send(JSON.stringify(p));
          } else ws.send(JSON.stringify({ type: 'error', text: '找不到成员 "' + p.to + '"' }));
          break;

        case 'send_image':
          if (!name) return;
          // 检查文件大小
          if ((msg.image || '').length > MAX_FILE_SIZE * 1.37) { // base64 编码膨胀 ~37%
            ws.send(JSON.stringify({ type: 'error', text: '图片过大，请小于5MB' }));
            return;
          }
          const imgMsg = {
            type: 'image', from: name, to: msg.to || 'all',
            image: msg.image,
            imageName: msg.imageName || '图片',
            ts: Date.now()
          };
          saveMessage({ type: 'image', from: name, to: imgMsg.to, imageName: imgMsg.imageName,
            imageSize: (msg.image || '').length, ts: imgMsg.ts });
          if (imgMsg.to === 'all') broadcast(imgMsg);
          else if (members.has(imgMsg.to)) {
            members.get(imgMsg.to).ws.send(JSON.stringify(imgMsg));
            ws.send(JSON.stringify(imgMsg));
          }
          break;

        case 'send_file':
          if (!name) return;
          const fileData = msg.fileData || '';
          const fileName = (msg.fileName || '文件').slice(0, 100);
          // 限制文件大小（base64解码后）
          const fileBytes = Buffer.byteLength(fileData, 'base64');
          if (fileBytes > MAX_FILE_SIZE) {
            ws.send(JSON.stringify({ type: 'error', text: '文件过大，最大支持5MB' }));
            return;
          }
          // 存到服务器
          // 文件名存储：时间戳_base64编码(原始文件名)，避免中文编码问题
          const nameB64 = Buffer.from(fileName, 'utf8').toString('base64url');
          const safeName = Date.now() + '_' + nameB64;
          const filePath = path.join(FILE_DIR, safeName);
          fs.writeFileSync(filePath, fileData, 'base64');
          // 广播文件消息（含下载链接）
          const fileMsg = {
            type: 'file', from: name, to: msg.to || 'all',
            fileName: fileName,
            fileSize: fileBytes,
            fileUrl: '/files/' + encodeURIComponent(safeName),
            ts: Date.now()
          };
          saveMessage({ type: 'file', from: name, to: fileMsg.to, fileName: fileName, fileSize: fileBytes, ts: fileMsg.ts });
          if (fileMsg.to === 'all') broadcast(fileMsg);
          else if (members.has(fileMsg.to)) {
            members.get(fileMsg.to).ws.send(JSON.stringify(fileMsg));
            ws.send(JSON.stringify(fileMsg));
          }
          break;

        case 'members':
          broadcastMembers();
          break;

        case 'heartbeat':
          if (name && members.has(name)) members.get(name).lastPing = Date.now();
          break;

        case 'leave':
          if (name && members.has(name)) {
            saveMessage({ type: 'leave', name, room: roomId, ts: Date.now() });
            members.delete(name);
            broadcastSystem('💤 ' + name + ' 离开了' + ROOM_NAME);
            broadcastMembers();
          }
          break;
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', text: '消息格式错误' }));
    }
  });

  ws.on('close', () => {
    if (name && members.has(name)) {
      saveMessage({ type: 'leave', name, room: roomId, ts: Date.now() });
      members.delete(name);
      broadcastSystem('💤 ' + name + ' 离开了' + ROOM_NAME);
      broadcastMembers();
    }
  });

  ws.on('error', () => { });
});

function broadcast(p) {
  const d = JSON.stringify(p);
  for (const [, m] of members) {
    if (m.ws.readyState === WebSocket.OPEN) m.ws.send(d);
  }
}

function broadcastSystem(t) {
  broadcast({ type: 'system', text: t });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('☁️  ' + ROOM_NAME + ' v3.0 — 已启动');
  console.log('   端口:  ' + PORT);
  console.log('   HTTP:  http://0.0.0.0:' + PORT);
  console.log('   WS:    ws://0.0.0.0:' + PORT + '/ws');
  console.log('   文件上限: ' + (MAX_FILE_SIZE / 1024 / 1024) + 'MB, 保留: ' + MAX_DAYS + '天');
  console.log('');
});
