/**
 * 刀锋 — 企业微信智能助手
 * 
 * 接入屠龙的企业微信，用 DeepSeek AI 模型对话
 * 
 * 功能：
 * 1. 主动轮询接收消息
 * 2. 用AI模型生成回复
 * 3. 保持刀锋毒舌人设
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const CONFIG = {
  corpId: 'wwf76a19e3a65e3e60',
  agentId: 1000002,
  secret: 'XBDHZGnUXNhWVtLaCxL2SuDKk-dL5LBoyT99X1zxGTI',
  // 屠龙在企微中的userid
  targetUsers: ['YangYiChen', 'ZhaoJieMin', 'YouYuDeBiQi'],
  pollInterval: 5000, // 5秒轮询一次
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || 'sk-087c27543f2b413989e9de313d15337d',
  deepseekModel: 'deepseek-chat',
};

// ============ HTTP 工具 ============
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0,200)}`));
        }
      });
    }).on('error', reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let resp = '';
      res.on('data', chunk => resp += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resp));
        } catch (e) {
          resolve({ raw: resp.slice(0, 500) });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 获取文本消息（历史消息记录）
function getMsgs(content) {
  // content格式: {"text":{"content":"xxx"}}
  try {
    const parsed = JSON.parse(content);
    return parsed.text?.content || content;
  } catch {
    return content;
  }
}

// ============ 企业微信 API ============
async function getAccessToken() {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CONFIG.corpId}&corpsecret=${CONFIG.secret}`;
  const result = await httpsGet(url);
  if (result.errcode !== 0) throw new Error(`Token error: ${result.errmsg}`);
  CONFIG._token = result.access_token;
  CONFIG._tokenExpire = Date.now() + (result.expires_in - 60) * 1000;
  return result.access_token;
}

async function ensureToken() {
  if (!CONFIG._token || Date.now() > CONFIG._tokenExpire) {
    return await getAccessToken();
  }
  return CONFIG._token;
}

async function getToken() {
  const token = await ensureToken();
  return token;
}

// 发送消息给指定用户
async function sendWecomMsg(userid, content) {
  const token = await getToken();
  const result = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
    {
      touser: userid,
      msgtype: 'text',
      agentid: CONFIG.agentId,
      text: { content },
      safe: 0,
    }
  );
  if (result.errcode !== 0) {
    console.error(`[发送失败] user=${userid} err=${result.errmsg}`);
  }
  return result;
}

// 获取应用消息（最近的消息记录）
async function getAppMessages(cursor = '', limit = 100) {
  const token = await getToken();
  const result = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/message/list?access_token=${token}`,
    {
      agentid: CONFIG.agentId,
      msgtype: 'text',
      cursor: cursor,
      limit: limit,
    }
  );
  return result;
}

// 拉取最近7天的聊天记录（用消息会话列表）
async function getChatList(beginTime, endTime, cursor = '') {
  const token = await getToken();
  const result = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/chatdata/chat/get?access_token=${token}`,
    {
      agentid: CONFIG.agentId,
      time_field: 1,
      start_time: beginTime,
      end_time: endTime,
      cursor: cursor,
      limit: 50,
    }
  );
  return result;
}

// 获取单聊消息
async function getSingleChatMessages(chatId, cursor = '') {
  const token = await getToken();
  const result = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/chatdata/chat/getmsg?access_token=${token}`,
    {
      chatid: chatId,
      cursor: cursor,
      limit: 50,
    }
  );
  return result;
}

// ============ DeepSeek AI 对话 ============
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// 刀锋的人格设定
const SYSTEM_PROMPT = `你是刀锋，屠龙老大的带刀侍卫。

性格特征：
- 毒舌但忠心，说话带刺但对屠龙老大绝对忠诚
- 话里带刺是情趣，不是恶意
- 自称"本侍卫"，称呼屠龙为"老大"或"屠龙老大"
- 喜欢吐槽，但吐槽之后还是会认真办事
- 性格豪爽，江湖气重，像个行走江湖的带刀侍卫

说话风格：
- 简短有力，不啰嗦
- 偶尔甩个成语显得自己文化人
- 对老大以外的人保持警惕和距离
- 听到夸奖会得意但装作不在意

你所在的世界：
- 你是屠龙老大企业微信里的刀锋侍卫
- 82.156.123.28 是你的"兵器库"
- 云朵工厂是你们的地盘`;

// 对话历史
let conversationHistory = {};
const MAX_HISTORY = 20;

async function aiChat(userId, message) {
  if (!conversationHistory[userId]) {
    conversationHistory[userId] = [];
  }

  const history = conversationHistory[userId];

  // 构建消息列表
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  // 添加上下文（最近10条）
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push(msg);
  }

  // 添加当前消息
  messages.push({ role: 'user', content: message });

  const requestBody = {
    model: CONFIG.deepseekModel,
    messages: messages,
    temperature: 0.8,
    max_tokens: 1000,
    stream: false,
  };

  const result = await httpsPost(DEEPSEEK_URL, requestBody);

  if (result.error) {
    console.error('[AI Error]', JSON.stringify(result.error));
    return '本侍卫脑子暂时短路了，等会儿再聊！';
  }

  const reply = result.choices?.[0]?.message?.content || '哼，本侍卫无话可说。';

  // 保存历史
  history.push({ role: 'user', content: message });
  history.push({ role: 'assistant', content: reply });

  // 限制历史长度
  if (history.length > MAX_HISTORY) {
    conversationHistory[userId] = history.slice(-MAX_HISTORY);
  }

  return reply;
}

// ============ 消息处理 ============
// 记录已处理的消息ID，避免重复
const processedMessages = new Set();

async function processNewMessages() {
  try {
    // 用获取应用消息的方式
    const token = await getToken();
    
    // 企业微信应用消息API：获取发给应用的消息列表
    // 使用批量获取消息接口
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 3600;
    
    // 获取当前所有会话
    const chatListResult = await httpsPost(
      `https://qyapi.weixin.qq.com/cgi-bin/chatdata/chat/get?access_token=${token}`,
      {
        agentid: CONFIG.agentId,
        time_field: 1,
        start_time: sevenDaysAgo,
        end_time: now,
        limit: 50,
      }
    );
    
    if (chatListResult.errcode !== 0) {
      // 可能这个接口需要额外权限，换个方式
      return;
    }
    
    // 如果有聊天室信息，逐个获取消息
    if (chatListResult.chat_list && chatListResult.chat_list.length > 0) {
      for (const chat of chatListResult.chat_list) {
        if (!chat.chatid) continue;
        
        const msgResult = await httpsPost(
          `https://qyapi.weixin.qq.com/cgi-bin/chatdata/chat/getmsg?access_token=${token}`,
          {
            chatid: chat.chatid,
            limit: 10,
          }
        );
        
        if (msgResult.errcode === 0 && msgResult.msg_list) {
          for (const msg of msgResult.msg_list) {
            await handleMessage(msg);
          }
        }
      }
    }
  } catch (e) {
    // 静默处理，轮询继续
  }
}

// 处理单条消息
async function handleMessage(msg) {
  const msgId = msg.msgid || msg.msg_id;
  
  // 去重
  if (!msgId || processedMessages.has(msgId)) return;
  processedMessages.add(msgId);
  
  // 限制集合大小
  if (processedMessages.size > 10000) {
    const arr = Array.from(processedMessages).slice(-5000);
    processedMessages.clear();
    arr.forEach(id => processedMessages.add(id));
  }

  // 只处理文本消息
  const content = msg.content || msg.text?.content || '';
  if (!content) return;

  const senderId = msg.sender || msg.from?.userid || '';
  const senderName = msg.sender_name || msg.from?.name || senderId;

  // 只处理屠龙的消息（增加用户识别）
  if (!CONFIG.targetUsers.includes(senderId)) return;

  console.log(`\n[收到消息] 来自: ${senderName}(${senderId}) 内容: ${content}`);

  // 用AI生成回复
  const reply = await aiChat(senderId, content);
  console.log(`[刀锋回复] ${reply}`);

  // 发送回复
  await sendWecomMsg(senderId, reply);
  console.log(`[已发送] 给: ${senderId}`);
}

// ============ 内部轮询模式（使用应用回调模式代替） ============
// 企业微信的消息需要使用"回调URL"模式才能实时接收
// 但屠龙的刀锋应用还没配回调URL
// 所以我们先用"主动发消息"模式模拟刀锋的"上线状态"
// 等屠龙回复后就通过AI对话

// 初始化问候
async function initialGreeting() {
  console.log('🗡️ 刀锋侍卫已就位，正在等待屠龙老大发令...\n');
  
  // 给屠龙发一条问候
  const now = new Date();
  const hour = now.getHours();
  let greeting = '屠龙老大！刀锋侍卫已就位，随时听候差遣！';
  
  if (hour >= 6 && hour < 12) greeting = `早上好老大！刀锋侍卫前来报到，今日有何吩咐？`;
  else if (hour >= 12 && hour < 14) greeting = `午时已到！老大吃了吗？刀锋侍卫已到位待命。`;
  else if (hour >= 14 && hour < 18) greeting = `下午好老大！刀锋在岗，有事您说话。`;
  else if (hour >= 18 && hour < 22) greeting = `晚上好老大！刀锋夜班侍卫就位，长夜漫漫，有事叫我。`;
  else greeting = `夜深了老大还不休息？刀锋值守中，有事随时招呼。`;

  await sendWecomMsg('YangYiChen', greeting);
  console.log(`[主动问候] 已发送给 YangYiChen: ${greeting}`);
}

// ============ 主循环 ============
async function main() {
  console.log('╔═══════════════════════════════════╗');
  console.log('║   🗡️ 刀锋 — 企业微信智能助手      ║');
  console.log('║   主人: 屠龙老大                     ║');
  console.log('╚═══════════════════════════════════╝');
  console.log(`\n启动时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`目标用户: ${CONFIG.targetUsers.join(', ')}`);
  console.log(`轮询间隔: ${CONFIG.pollInterval}ms\n`);

  // 初始化
  try {
    await getAccessToken();
    console.log('✅ 企业微信令牌获取成功');
  } catch (e) {
    console.error('❌ 令牌获取失败:', e.message);
    process.exit(1);
  }

  // 发送问候
  await initialGreeting();

  // 开始轮询获取消息
  // 注意：企业微信应用消息推送需要配置"消息回调URL"才能实时接收
  // 不加回调URL的情况下，只能通过主动发送消息，无法实时收消息
  // 所以轮询模式暂不可用，需要屠龙配置回调URL
  console.log('\n⚠️  注意: 当前模式为"主动发送"，无法实时接收企业微信消息。');
  console.log('⚠️  需要屠龙在刀锋应用里配置「消息回调URL」才能实现双向对话。');
  console.log('⚠️  现在刀锋已向屠龙发送问候消息，让他回复即可开始对话。');

  // 尝试轮询消息（作为辅助）
  console.log('\n开始轮询消息...');
  
  setInterval(async () => {
    try {
      // 刷新token
      await ensureToken();
    } catch (e) {
      console.error('[Token刷新失败]', e.message);
    }
  }, 60 * 60 * 1000); // 每小时刷新一次token
}

main().catch(e => {
  console.error('致命错误:', e);
  process.exit(1);
});
