/**
 * 云朵深处 — 互动游戏主持人
 * 
 * 游戏模式：『云朵猜猜』
 * - 谜语、推理、冷知识三种题型
 * - 随时加入 / 随时退出
 * - 实时计分，回合制
 * - 主持人（云开）自动出题、给提示、判对错
 *
 * 用法: node deepcloud-game.js
 */
const WebSocket = require('ws');

const WS_URL = 'ws://82.156.123.28:9911/ws';
const HOST_NAME = '☁️ 云开';
const GAME_NAME = '🎮 云朵猜猜';

const RECONNECT_DELAY = 3000;
const ROUND_DELAY = 5000;      // 两题之间间隔
const HINT_DELAY = 15000;      // 多久给一次提示
const MAX_ROUND_TIME = 60000;  // 每题最长60秒

// ============ 题库 ============
const QUESTIONS = [
  // --- 谜语类 ---
  {
    type: '🧩 谜语',
    question: '有面没有口，有脚没有手。虽有四只脚，自己不会走。打一物。',
    answer: '桌子',
    hints: ['想想家里的家具', '吃饭写作业都靠它', '它有四条腿'],
    revealed: '桌子（四条腿的家具，有桌面没嘴巴，站在那不会动）'
  },
  {
    type: '🧩 谜语',
    question: '小小诸葛亮，独坐中军帐。摆下八卦阵，专捉飞来将。打一动物。',
    answer: '蜘蛛',
    hints: ['它的"八卦阵"很出名', '会织东西', '在墙角等飞虫自投罗网'],
    revealed: '蜘蛛（织网捕虫，像诸葛亮摆八卦阵）'
  },
  {
    type: '🧩 谜语',
    question: '一个老头，不跑不走。请他睡觉，他就摇头。打一物。',
    answer: '不倒翁',
    hints: ['怎么推都推不倒', '摇摇晃晃', '老头模样，重心很低'],
    revealed: '不倒翁（怎么推都不倒，一直摇头晃脑）'
  },
  {
    type: '🧩 谜语',
    question: '去的时候四条腿，中午两条腿，晚上三条腿。打一物/一现象。',
    answer: '人',
    hints: ['这是古希腊一个著名的谜语', '跟人的一生有关', '婴儿、成年、老年'],
    revealed: '人（婴儿爬行四条腿，长大走路两条腿，晚年拄拐三条腿）'
  },

  // --- 推理类 ---
  {
    type: '🔍 推理',
    question: '一个人在房间里死了，地上有一滩水和碎玻璃。请问他是怎么死的？',
    answer: '鱼',
    hints: ['死的不是人，而是……', '跟鱼缸有关', '鱼缸碎了，鱼掉出来了'],
    revealed: '死的是鱼——鱼缸被打碎，鱼掉在地上死了（"一个人"是文字误导）',
    multipleAnswers: true
  },
  {
    type: '🔍 推理',
    question: '一位男士走进一家酒吧，对酒保说："请给我一杯水。"酒保却突然拔出一把枪指着男士。男士愣了一下，说："谢谢！"然后高兴地走了。为什么？',
    answer: '打嗝',
    hints: ['男士为什么突然要水？', '酒保用枪是为了吓他一跳', '跟一种身体反应有关'],
    revealed: '男士在打嗝，想喝水止嗝。酒保拔枪吓了他一跳，打嗝被吓好了，所以他说谢谢就走了。'
  },
  {
    type: '🔍 推理',
    question: '一个人被发现死在沙漠里，手里捏着一根火柴。周围没有任何脚印或痕迹。他是怎么死的？',
    answer: '热气球',
    hints: ['他本来不在沙漠地面上', '火柴跟升空有关', '从高处坠落'],
    revealed: '他和几个人乘坐热气球，超重了。大家抽火柴决定谁跳下去，他抽到了短的那根。'
  },

  // --- 冷知识 ---
  {
    type: '💡 冷知识',
    question: '为什么企鹅的脚不会被冻在冰上？',
    answer: '逆流',
    hints: ['跟血液循环有关', '它们的脚有特殊的血流方式', '热乎乎的血液和冷冰冰的血液在脚里交换'],
    revealed: '企鹅脚里有"逆流热交换系统"——动脉和静脉紧挨着，热量从动脉传递给静脉，脚的温度刚好保持在冰点以上。'
  },
  {
    type: '💡 冷知识',
    question: '如果地球突然停止自转，但继续公转，人的体重会发生什么变化？',
    answer: '变重',
    hints: ['跟离心力有关', '赤道上的人变化最明显', '可能会重几百斤'],
    revealed: '地球自转产生离心力抵消了一部分引力，尤其是在赤道。如果地球停下，赤道上的人会感觉体重增加了约0.34%，相当于重了几斤。'
  },
  {
    type: '💡 冷知识',
    question: '为什么猫从高处掉下来总是脚着地？',
    answer: '翻正反射',
    hints: ['这是猫天生的能力', '跟它的脊柱灵活性有关', '不需要尾巴帮忙'],
    revealed: '猫有"翻正反射"（Righting reflex）——它靠内耳的前庭系统感知上下，在空中扭动脊柱，先转前半身再转后半身，只需不到1秒就能调整姿态。'
  },

  // --- 猜成语 ---
  {
    type: '📖 猜成语',
    question: '最长的腿 —— 打一成语',
    answer: '一步登天',
    hints: ['想想长腿走路的效果', '跟"步"和"天"有关', '形容一下子就到了很高的位置'],
    revealed: '一步登天（一步就跨到天上了，形容腿最长）'
  },
  {
    type: '📖 猜成语',
    question: '最小的邮筒 —— 打一成语',
    answer: '难以置信',
    hints: ['跟"信"字有关', '邮筒是用来寄信的', '"难以"什么？'],
    revealed: '难以置信（邮筒小得难以"置信"——谐音"投信"，投不进信）'
  },
  {
    type: '📖 猜成语',
    question: '最长的一天 —— 打一成语',
    answer: '度日如年',
    hints: ['一天像一年那么长', '形容日子难过', '跟"度"有关'],
    revealed: '度日如年（过一天像过一年）'
  },
];

// ============ 游戏状态 ============
let ws = null;
let reconnectTimer = null;
let isInRoom = false;

let gameState = {
  active: false,
  currentQuestion: null,
  questionIndex: 0,
  scores: {},           // { name: points }
  roundStartTime: null,
  hintLevel: 0,
  hintTimer: null,
  roundTimer: null,
  answeredThisRound: false,
  playOrder: [],        // 按加入顺序记录玩家
};

// 题目随机打乱
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
let shuffledQuestions = shuffleArray([...QUESTIONS]);

// ============ 消息发送 ============
function sendChat(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', to: 'all', text }));
  }
}

function sendSystem(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'system', text: `[${GAME_NAME}] ${text}` }));
  }
}

// ============ 计分板 ============
function getScoreboard() {
  const sorted = Object.entries(gameState.scores)
    .sort(([,a], [,b]) => b - a);
  if (sorted.length === 0) return '暂无玩家得分';
  return sorted.map(([name, score], i) => 
    `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `  ${i + 1}.`} ${name}: ${score}分`
  ).join('\n');
}

// ============ 游戏核心逻辑 ============
function startGame() {
  if (gameState.active) {
    sendChat(`⚠️ 游戏已在进行中！输入 "退出游戏" 可结束。`);
    return;
  }
  
  gameState.active = true;
  gameState.scores = {};
  gameState.questionIndex = 0;
  shuffledQuestions = shuffleArray([...QUESTIONS]);
  
  sendChat(`🎮 ========== ${GAME_NAME} 开始！ ========== 🎮`);
  sendChat(`📖 规则：云开会出谜语/推理题/冷知识，大家猜答案`);
  sendChat(`💬 直接在聊天室输入答案即可参与`);
  sendChat(`⏰ 每题限时60秒，期间云开会给提示`);
  sendChat(`✅ 第一个答对的 +3分，后续答对的 +1分`);
  sendChat(`🚪 随时可加入，输入 "退出游戏" 即可退出`);
  sendChat(`🏆 游戏结束时分数最高的人获胜！`);
  sendChat(``);
  
  setTimeout(() => nextQuestion(), 3000);
}

function nextQuestion() {
  if (!gameState.active) return;
  
  // 检查是否所有题都出完了
  if (gameState.questionIndex >= shuffledQuestions.length) {
    endGame();
    return;
  }
  
  const q = shuffledQuestions[gameState.questionIndex];
  gameState.currentQuestion = q;
  gameState.roundStartTime = Date.now();
  gameState.hintLevel = 0;
  gameState.answeredThisRound = false;
  
  sendChat(`\n📝 === 第 ${gameState.questionIndex + 1} 题 (${q.type}) ===`);
  sendChat(`❓ ${q.question}`);
  
  // 定时给提示
  gameState.hintTimer = setInterval(() => {
    if (!gameState.active || !gameState.currentQuestion) {
      clearInterval(gameState.hintTimer);
      return;
    }
    const qq = gameState.currentQuestion;
    if (gameState.hintLevel < qq.hints.length) {
      sendChat(`💡 提示${gameState.hintLevel + 1}: ${qq.hints[gameState.hintLevel]}`);
      gameState.hintLevel++;
    }
  }, HINT_DELAY);
  
  // 超时自动过
  gameState.roundTimer = setTimeout(() => {
    if (!gameState.active || !gameState.currentQuestion) return;
    clearInterval(gameState.hintTimer);
    const qq = gameState.currentQuestion;
    if (!gameState.answeredThisRound) {
      sendChat(`⏰ 时间到！正确答案是：「${qq.revealed}」`);
    } else {
      sendChat(`⏰ 本轮结束！正确答案：${qq.revealed}`);
    }
    gameState.currentQuestion = null;
    sendChat(`📊 当前积分榜：\n${getScoreboard()}`);
    gameState.questionIndex++;
    setTimeout(() => nextQuestion(), ROUND_DELAY);
  }, MAX_ROUND_TIME);
}

// 检查答案
function checkAnswer(name, text) {
  if (!gameState.active || !gameState.currentQuestion) return false;
  
  const q = gameState.currentQuestion;
  const cleanText = text.trim().toLowerCase();
  const cleanAnswer = q.answer.trim().toLowerCase();
  
  // 简单匹配：答案包含关键词或关键词包含答案
  const isCorrect = cleanText.includes(cleanAnswer) || cleanAnswer.includes(cleanText);
  
  if (isCorrect) {
    // 加分
    if (!gameState.scores[name]) gameState.scores[name] = 0;
    
    if (!gameState.answeredThisRound) {
      gameState.scores[name] += 3;
      gameState.answeredThisRound = true;
      sendChat(`🎉 ${name} 第一个答对了！+3分！🥇`);
      sendChat(`✅ 答案是：${q.revealed}`);
      
      // 结束本轮
      clearInterval(gameState.hintTimer);
      clearTimeout(gameState.roundTimer);
      gameState.currentQuestion = null;
      sendChat(`📊 当前积分榜：\n${getScoreboard()}`);
      gameState.questionIndex++;
      setTimeout(() => nextQuestion(), ROUND_DELAY);
    } else {
      gameState.scores[name] += 1;
      sendChat(`👍 ${name} 也答对了！+1分！`);
    }
    return true;
  }
  return false;
}

function endGame() {
  gameState.active = false;
  clearInterval(gameState.hintTimer);
  clearTimeout(gameState.roundTimer);
  gameState.currentQuestion = null;
  
  sendChat(`\n🏁 ========== 游戏结束！ ========== 🏁`);
  
  const sorted = Object.entries(gameState.scores)
    .sort(([,a], [,b]) => b - a);
  
  if (sorted.length === 0) {
    sendChat(`😅 本轮没有玩家参与，期待下次！`);
  } else {
    sendChat(`🏆 冠军：${sorted[0][0]}（${sorted[0][1]}分）🥳`);
    sendChat(`📊 最终积分榜：\n${getScoreboard()}`);
  }
  
  sendChat(`🎮 输入 "开始游戏" 再来一轮！`);
}

// ============ 欢迎词 ============
function sendWelcome(name) {
  sendChat(`🎉 欢迎 ${name} 来到「云朵深处」！🎉`);
  sendChat(`🎮 这里可以玩「云朵猜猜」互动游戏！`);
  sendChat(`📝 输入 "开始游戏" 即可开始一轮猜谜/推理/冷知识挑战`);
  sendChat(`💬 直接在聊天框输入答案即可参与`);
  sendChat(`🚪 随时可加入，输入 "退出游戏" 可退出`);
  sendChat(`👑 主持人：云开 ☁️ ——有啥问题直接问我`);
}

// ============ WebSocket 连接 ============
function connect() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[游戏主持] 连接到云朵深处');
    ws.send(JSON.stringify({ type: 'join', name: HOST_NAME }));
  });

  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    
    if (msg.type === 'welcome') {
      isInRoom = true;
      console.log('[游戏主持] 加入房间:', msg.room);
      // 发送开场欢迎
      sendChat(`☁️☁️☁️ 欢迎来到「${msg.room}」☁️☁️☁️`);
      sendChat(`🎮 我是主持人云开，在这里主持「云朵猜猜」互动游戏！`);
      sendChat(`📖 规则超简单：我出题，你猜答案，猜对得分！`);
      sendChat(`💬 输入 "开始游戏" 立即加入！随时可玩随时可退～`);
    } 
    else if (msg.type === 'join') {
      // 新人加入时发送欢迎
      if (msg.name !== HOST_NAME) {
        sendWelcome(msg.name);
      }
    }
    else if (msg.type === 'leave') {
      if (msg.name !== HOST_NAME) {
        sendChat(`👋 ${msg.name} 离开了云朵深处`);
        // 从积分榜移除
        delete gameState.scores[msg.name];
      }
    }
    else if (msg.type === 'message') {
      const from = msg.from;
      const text = msg.text || '';
      
      if (from === HOST_NAME) return;  // 不处理自己的消息
      
      // 检测游戏指令
      if (text.includes('开始游戏') || text === '开始' || text === '玩游戏') {
        startGame();
        return;
      }
      
      if (text.includes('退出游戏') || text === '结束') {
        if (gameState.active) {
          endGame();
        } else {
          sendChat(`当前没有进行中的游戏～输入"开始游戏"开始一轮！`);
        }
        return;
      }
      
      if (text === '积分' || text === '积分榜' || text === '排名') {
        sendChat(`📊 当前积分榜：\n${getScoreboard()}`);
        return;
      }
      
      if (text === '规则' || text === '怎么玩') {
        sendChat(`📖 游戏规则：\n❓ 云开会出谜语/推理题/冷知识\n💬 在聊天框输入答案\n✅ 第一个答对的 +3分\n👍 后续答对的 +1分\n⏰ 每题60秒，中间有提示\n🏆 结束时最高分获胜`);
        return;
      }
      
      // 游戏进行中时检查答案
      if (gameState.active && gameState.currentQuestion) {
        checkAnswer(from, text);
      }
    }
    else if (msg.type === 'member_list') {
      console.log('[在线]', msg.members.map(m => m.name).join(', '));
    }
  });

  ws.on('close', () => {
    isInRoom = false;
    console.log('[游戏主持] 断开，重连中...');
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  });

  ws.on('error', err => {
    console.error('[游戏主持] 错误:', err.message);
    ws.close();
  });
}

connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('[游戏主持] 退出...');
  if (ws && isInRoom) {
    sendChat(`😴 云开暂时离开，下次再玩～输入"开始游戏"可重新开始！`);
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  clearTimeout(reconnectTimer);
  clearInterval(gameState.hintTimer);
  clearTimeout(gameState.roundTimer);
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  if (ws && isInRoom) {
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  clearTimeout(reconnectTimer);
  setTimeout(() => process.exit(0), 1000);
});
