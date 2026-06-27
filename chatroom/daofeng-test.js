const http = require('http');
const https = require('https');
const crypto = require('crypto');
const xml2js = require('xml2js');

const C = {
  corpId: 'wwf76a19e3a65e3e60',
  agentId: 1000002,
  secret: 'XBDHZGnUXNhWVtLaCxL2SuDKk-dL5LBoyT99X1zxGTI',
  token: 'daofeng_callback_token',
  apiKey: 'sk-0871082b5ea04fb3a688a96d4cbb46fb',
};

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const d = body ? JSON.stringify(body) : null;
    const opt = { hostname: u.hostname, path: u.pathname + u.search, method, headers: {} };
    if (d) { opt.headers['Content-Type'] = 'application/json'; opt.headers['Content-Length'] = Buffer.byteLength(d); }
    const r = https.request(opt, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
}

function post(url, body, extraHeaders) {
  const u = new URL(url);
  const d = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), ...extraHeaders }},
      res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } }); });
    r.on('error', reject); r.write(d); r.end();
  });
}

let _t, _te;
async function gt() {
  if (!_t || Date.now() > _te) {
    const r = await req('GET', `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${C.corpId}&corpsecret=${C.secret}`);
    _t = r.access_token; _te = Date.now() + (r.expires_in - 60) * 1000;
  } return _t;
}

async function sm(u, c) {
  const t = await gt();
  return await post(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${t}`,
    { touser: u, msgtype: 'text', agentid: C.agentId, text: { content: c }, safe: 0 });
}

const hist = {};
async function ai(userId, msg) {
  if (!hist[userId]) hist[userId] = [];
  const h = hist[userId];
  const r = await post('https://api.deepseek.com/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'system', content: '你是刀锋，屠龙老大的AI侍卫。毒舌忠诚，简短犀利，江湖气重。' },
      ...h.slice(-10), { role: 'user', content: msg }],
    temperature: 0.85, max_tokens: 800,
  }, { 'Authorization': `Bearer ${C.apiKey}` });
  const reply = r.choices?.[0]?.message?.content || '……';
  h.push({ role: 'user', content: msg }, { role: 'assistant', content: reply });
  if (h.length > 20) hist[userId] = h.slice(-20);
  return reply;
}

const parser = new xml2js.Parser({ explicitArray: false, trim: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const echostr = p.get('echostr');
  console.log(`[${req.method}] ${req.url}`);

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(echostr || 'ok');
    if (echostr) console.log('✅ URL验证通过');
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (body.includes('<xml')) {
          const x = (await parser.parseStringPromise(body)).xml;
          const from = x.FromUserName;
          const content = x.Content || '';
          if (content && from) {
            console.log(`📩 ${from}: ${content}`);
            const reply = await ai(from, content);
            console.log(`🗡️ ${reply.slice(0,100)}`);
            await sm(from, reply);
          }
        }
        res.writeHead(200); res.end('');
      } catch(e) { console.error('ERR:', e.message); res.writeHead(200); res.end(''); }
    });
    return;
  }
  res.writeHead(404); res.end('');
});

server.listen(9100, '0.0.0.0', async () => {
  console.log('🗡️ 刀锋 v3.2');
  try {
    const t = await gt(); console.log('✅ 企微token:', t?.slice(0,10)+'...');
    const a = await post('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-chat', messages: [{ role: 'user', content: '回复"OK"一字' }], max_tokens: 5,
    }, { 'Authorization': `Bearer ${C.apiKey}` });
    console.log(`✅ AI: ${a.choices?.[0]?.message?.content || '?'}`);
    const r = await sm('YangYiChen', '刀锋已上线！老大有事随时招呼。');
    console.log(`✅ 问候已发`);
  } catch(e) { console.error('初始化:', e.message); }
  console.log('\n配置给屠龙:');
  console.log('URL: http://82.156.123.28/daofeng/');
  console.log('Token: daofeng_callback_token');
  console.log('EncodingAESKey: (不填)');
});
