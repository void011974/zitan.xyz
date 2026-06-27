/**
 * 云朵聊天室启动器
 * 同时启动所有配置的房间
 * 用法: node launcher.js
 *
 * 云开 @ 腾讯云轻量服务器
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('');
console.log('☁️☁️☁️  云朵聊天室集群 v2.0  ☁️☁️☁️');
console.log('');

const children = [];

// 启动留言API (Python 1990端口)
const contactApi = spawn('python3', [path.join(__dirname, 'contact-api.py')], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env }
});
contactApi.stdout.on('data', d => console.log(`[contact-api] ${d.toString().trim()}`));
contactApi.stderr.on('data', d => console.error(`[contact-api] ${d.toString().trim()}`));
contactApi.on('close', code => console.log(`[contact-api] 进程退出 (code: ${code})`));
children.push(contactApi);
console.log(`   📩 留言API → 端口 1990 (PID: ${contactApi.pid})`);

config.rooms.forEach(room => {
  const proc = spawn('node', [path.join(__dirname, 'server.js'), room.id], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  proc.stdout.on('data', data => {
    console.log(`[${room.id}] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', data => {
    console.error(`[${room.id}] ${data.toString().trim()}`);
  });

  proc.on('close', code => {
    console.log(`[${room.id}] 进程退出 (code: ${code})`);
  });

  children.push(proc);
  console.log(`   🚀 ${room.name} → 端口 ${room.port} (PID: ${proc.pid})`);
});

console.log('');
console.log('   共 ' + config.rooms.length + ' 个聊天室已启动');
console.log('');

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭所有聊天室...');
  children.forEach((p, i) => {
    p.kill('SIGTERM');
    console.log(`   已停止: ${config.rooms[i].name}`);
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  children.forEach(p => p.kill('SIGTERM'));
  process.exit(0);
});
