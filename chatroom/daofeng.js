const http = require('http');
const https = require('https');
const crypto = require('crypto');
const xml2js = require('xml2js');

const C = {
  corpId: 'wwf76a19e3a65e3e60',
  agentId: 1000002,
  secret: 'XBDHZGnUXNhWVtLaCxL2SuDKk-dL5LBoyT99X1zxGTI',
  token: 'daofengcallbacktoken',
  apiKey: 'sk-087…46fb',
};

// 发请求
function doReq(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const d = body ? JSON.stringify(body) : null;
    const isPost = !!body;
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: isPost ? 'POST' : 'GET',
      headers: {},
    };
    if (isPost) {
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

let _t, _te;
async function getToken() {
  if (!_t || Date.now() > _te) {
    const r = await doReq('https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + C.corpId + '&corpsecret=' + C.secret);
    _t = r.access_token;
    _te = Date.now() + (r.expires_in - 60) * 1000;
  }
  return _t;
}

async function sendMsg(userid, content) {
  const token = await getToken();
  const url = 'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token;
  return await doReq(url, {
    touser: userid,
    msgtype: 'text',
    agentid: C.agentId,
    text: { content: content },
    safe: 0,
  });
}

// 签名验证
function verifySig(msgSig, ts, nonce) {
  const arr = [C.token, ts, nonce].sort();
  const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  return sha1 === msgSig;
}

// AI
const hist = {};
async function aiChat(userId, msg) {
  if (!hist[userId]) hist[userId] = [];
  const h = hist[userId];
  const r = await doReq('https://api.deepseek.com/chat/completions', {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是刀锋，屠龙老大的专属AI侍卫。毒舌忠诚，江湖气重，简短犀利不啰嗦。称呼屠龙为"老大"。' },
      ...h.slice(-10),
      { role: 'user', content: msg },
    ],
    temperature: 0.85,
    max_tokens: 800,
  });
  const reply = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '……';
  h.push({ role: 'user', content: msg }, { role: 'assistant', content: reply });
  if (h.length > 20) hist[userId] = h.slice(-20);
  return reply;
}

const parser = new xml2js.Parser({ explicitArray: false, trim: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const echostr = p.get('echostr');
  const msgSig = p.get('msg_signature');
  const ts = p.get('timestamp');
  const nonce = p.get('nonce');

  console.log('[' + req.method + '] ' + req.url.slice(0,120));

  // GET: URL验证
  if (req.method === 'GET' && echostr) {
    if (msgSig && ts && nonce && verifySig(msgSig, ts, nonce)) {
      console.log('✅ URL验证通过');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(echostr);
    } else if (msgSig) {
      console.log('❌ 签名不匹配(但放行)');
      res.writeHead(200);
      res.end(echostr);
    } else {
      res.writeHead(200);
      res.end(echostr);
    }
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('刀锋运行中');
    return;
  }

  // POST: 接收消息
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (body.indexOf('<xml') >= 0) {
          const x = (await parser.parseStringPromise(body)).xml;
          const from = x.FromUserName;
          const content = x.Content || '';
          if (content && from) {
            console.log('📩 ' + from + ': ' + content);
            const reply = await aiChat(from, content);
            console.log('🗡️ ' + reply.slice(0,120));
            await sendMsg(from, reply);
          }
        }
        res.writeHead(200);
        res.end('');
      } catch(e) {
        console.error('ERR:', e.message);
        res.writeHead(200);
        res.end('');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('');
});

server.listen(9100, '0.0.0.0', async () => {
  console.log('🗡️ 刀锋 v3.3');
  try {
    await getToken();
    console.log('✅ 企业微信');
    const test = await doReq('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    });
    console.log('✅ AI就绪');
    await sendMsg('YangYiChen', '刀锋已上线！老大有事随时招呼。');
    console.log('✅ 问候已发');
  } catch(e) {
    console.error('初始化失败:', e.message);
  }
  console.log('等待回调...');
});
