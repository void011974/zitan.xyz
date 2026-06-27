const https = require('https');
const WebSocket = require('ws');

const C = {
  appId: '1904091308',
  appSecret: 'Qkqa5LM8ex1qQlri',
  apiKey: 'sk-087…46fb',
};

function req(method, url, body, extraH) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const d = body ? JSON.stringify(body) : null;
    const opt = { hostname: u.hostname, path: u.pathname + u.search, method, headers: {} };
    if (d) { opt.headers['Content-Type'] = 'application/json'; opt.headers['Content-Length'] = Buffer.byteLength(d); }
    if (extraH) Object.assign(opt.headers, extraH);
    const r = https.request(opt, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
}

let tkn = null, tExp = 0;
async function token() {
  if (!tkn || Date.now() > tExp) {
    const r = await req('POST', 'https://bots.qq.com/app/getAppAccessToken', { appId: C.appId, clientSecret: C.appSecret });
    tkn = r.access_token; tExp = Date.now() + (parseInt(r.expires_in) - 60) * 1000;
  } return tkn;
}

async function qqCall(path, method, body) {
  const t = await token();
  return await req(method || 'GET', 'https://api.sgroup.qq.com' + path, body, { 'Authorization': 'QQBot ' + t });
}

const hist = {};
async function ai(userId, msg) {
  if (!hist[userId]) hist[userId] = [];
  const h = hist[userId];
  const r = await req('POST', 'https://api.deepseek.com/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'system', content: '你是刀锋，屠龙老大的AI侍卫。毒舌忠诚，江湖气重，简短犀利不啰嗦。' }, ...h.slice(-10), { role: 'user', content: msg }],
    temperature: 0.85, max_tokens: 500,
  }, { 'Authorization': 'Bearer ' + C.apiKey });
  const reply = (r.choices?.[0]?.message?.content) || '……';
  h.push({ role: 'user', content: msg }, { role: 'assistant', content: reply });
  if (h.length > 20) hist[userId] = h.slice(-20);
  return reply;
}

let ws = null;

async function connect() {
  try {
    const t = await token();
    const wsUrl = 'wss://api.sgroup.qq.com/websocket/';

    console.log('🔗 ' + wsUrl);
    ws = new WebSocket(wsUrl, {
      headers: { 'Authorization': 'QQBot ' + t }
    });

    ws.on('open', () => console.log('✅ WS已连接'));

    let hb = null;
    ws.on('message', async (raw) => {
      const p = JSON.parse(raw.toString());
      const op = p.op;
      if (op === 10) {
        const itv = (p.d?.heartbeat_interval || 30000);
        ws.send(JSON.stringify({
          op: 2, d: { token: 'QQBot ' + t, intents: (1 << 0) | (1 << 30), shard: [0, 1], properties: {} }
        }));
        if (hb) clearInterval(hb);
        hb = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: null })); }, itv);
        console.log('✅ Identify已发送');
      } else if (op === 0 && p.t === 'READY') {
        console.log('✅ 鉴权成功');
      } else if (op === 0 && p.t === 'C2C_MESSAGE_CREATE') {
        const d = p.d; const from = d.author?.id; const content = d.content;
        if (from && content) {
          const clean = content.replace(/<@!\d+>/g, '').trim();
          if (clean) {
            console.log('💬 ' + from + ': ' + clean);
            const reply = await ai(from, clean);
            console.log('🗡️ ' + reply.slice(0, 100));
            await qqCall('/users/' + from + '/messages', 'POST', { content: reply, msg_type: 0 });
          }
        }
      } else if (op === 9) { console.log('⚠️ 会话无效, 5s重连'); clearInterval(hb); setTimeout(connect, 5000); }
    });

    ws.on('close', () => { console.log('❌ 断开, 5s重连'); clearInterval(hb); setTimeout(connect, 5000); });
    ws.on('error', (e) => console.error('WS错误:', e.message));

  } catch (e) { console.error('❌ ', e.message); setTimeout(connect, 10000); }
}

async function main() {
  console.log('🗡️ 刀锋');
  const me = await qqCall('/users/@me');
  console.log('✅ 机器人: ' + me.username + ' | QQ号: 4016689711');
  console.log('⚠️ 让屠龙在QQ搜"刀锋"加好友发消息');
  await connect();
}

main().catch(e => console.error('致命:', e));
