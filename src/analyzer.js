'use strict';

const fs = require('fs');
const path = require('path');

const EMOTION_CATEGORIES = {
  anger: {
    label: '愤怒',
    keywords: [
      '怒', '愤', '气死', '气愤', '愤怒', '暴怒', '怒火', '可恶', '混蛋',
      '骗子', '欺骗', '隐瞒', '黑心', '无耻', '卑鄙', '追究', '严惩',
      '追责', '法办', '判刑', '坐牢', '枪毙', '死罪', '天理难容',
      '不可原谅', '忍无可忍', '太可恶', '太黑了', '草菅人命',
      '官商勾结', '沆瀣一气', '岂有此理', '荒唐', '荒谬', '离谱',
      '太过分', '太过分了', '没法接受', '不能忍', '不买账', '抗议',
      '强烈抗议', '谴责', '强烈谴责', '要求', '严查', '彻查', '深查',
      '还我公道', '还我真相', '血债血偿', '必须负责', '给个说法',
      '凭什么', '谁给你的权力', '无法无天', '丧尽天良', '缺德'
    ]
  },
  worry: {
    label: '担忧',
    keywords: [
      '担心', '害怕', '忧虑', '忧心', '焦虑', '不安', '恐惧', '慌',
      '恐慌', '惶恐', '担心自己', '担心家人', '会不会', '安全吗',
      '有危险', '会不会扩散', '会不会影响', '能跑吗', '要跑吗',
      '还能住吗', '还能吃吗', '还能喝吗', '会不会更多', '还会发生吗',
      '可怕', '太可怕', '恐怖', '吓人', '心慌', '揪心', '心痛',
      '崩溃', '绝望', '无助', '不敢', '不敢出门', '不敢去', '提心吊胆',
      '后怕', '谁知道', '万一', '危险', '风险', '隐患', '还有多少',
      '会不会更大', '会不会蔓延', '二次伤害', '次生灾害', '后遗症'
    ]
  },
  verify: {
    label: '求证',
    keywords: [
      '真的吗', '是真的吗', '确定吗', '消息确认了吗', '可靠吗',
      '来源呢', '出处', '官方通报呢', '通报在哪', '证据呢',
      '有没有官方', '核实', '确认', '经核实', '权威', '权威发布',
      '官方回应', '官方说法', '最新消息', '最新通报', '进展如何',
      '有后续吗', '后续呢', '到底怎么回事', '真相是什么', '事实是什么',
      '具体情况', '到底怎样', '求证', '辟谣', '是真的假的',
      '求真相', '求告知', '谁知道内情', '知情人', '内部消息',
      '请公布', '请说明', '请回应', '何时通报', '什么时候公布',
      '数据准确吗', '数字对吗', '统计', '口径', '口径一致吗'
    ]
  },
  onlook: {
    label: '围观',
    keywords: [
      '路过', '吃瓜', '围观', '前排', '马克', 'mark', '收藏',
      '关注', '持续关注', '蹲后续', '蹲一个', '等后续', '看戏',
      '搬板凳', '小板凳', '插眼', '留名', '打卡', '来了来了',
      '又来了', '精彩', '好戏', '坐等', '等着看', '看看怎么说',
      '笑死', '搞笑', '段子', '梗', '表情包', '笑哭', '哈哈哈',
      '666', '厉害了', '长见识', '涨知识', '离谱但好笑',
      '已阅', '知道了', '就这样吧', '无语', '佛系', '随便吧',
      '吃瓜群众', '围观群众', '前排吃瓜', '出售瓜子', '卖花生'
    ]
  }
};

const TOPIC_PATTERNS = [
  {
    id: 'casualty_accuracy',
    pattern: /伤亡|死亡|遇难|失踪|受伤|人数|数字|统计|数据|准确|失实|少报|瞒报|漏报|缩水/,
    question: '伤亡数字是否准确',
    emotionWeight: { anger: 2, worry: 1.5, verify: 1 }
  },
  {
    id: 'notification_delay',
    pattern: /通报|发布|公布|说明|回应|太慢|迟了|拖延|滞后|延迟|多久|什么时候|连夜|凌晨/,
    question: '通报是否太慢',
    emotionWeight: { anger: 1.5, verify: 2, worry: 1 }
  },
  {
    id: 'suspect_protected',
    pattern: /涉事|责任人|负责人|官员|领导|保护|包庇|纵容|袒护|护短|免职|处分|惩罚|处罚|追究|问责|撤职/,
    question: '涉事人员是否被保护',
    emotionWeight: { anger: 2.5, verify: 1.5, worry: 0.5 }
  },
  {
    id: 'cover_up',
    pattern: /隐瞒|掩盖|封口|删帖|撤稿|禁言|封锁|屏蔽|和谐|压制|压下来|捂|捂住|不准说/,
    question: '是否存在信息隐瞒',
    emotionWeight: { anger: 2.5, verify: 2 }
  },
  {
    id: 'rescue_adequacy',
    pattern: /救援|救助|抢险|救灾|应急|反应|出动|到位|及时|迟缓|不力|措施|行动|扑救|搜救/,
    question: '救援是否及时充分',
    emotionWeight: { anger: 1.5, worry: 2, verify: 1 }
  },
  {
    id: 'compensation',
    pattern: /赔偿|补偿|安置|善后|抚恤|赔偿金|损失|追偿|理赔|救助金/,
    question: '赔偿和善后是否到位',
    emotionWeight: { anger: 1.5, worry: 2 }
  },
  {
    id: 'root_cause',
    pattern: /原因|起因|根源|为什么|怎么会|为何|到底为什么|根本原因|深层|制度|监管|漏洞/,
    question: '事件根本原因是什么',
    emotionWeight: { verify: 2, anger: 1, worry: 1 }
  },
  {
    id: 'recurrence_prevention',
    pattern: /再发|复发|还会|预防|防范|整改|杜绝|避免|类似|同样的|吸取教训|举一反三/,
    question: '如何防止类似事件再次发生',
    emotionWeight: { worry: 2, verify: 1.5 }
  },
  {
    id: 'victims_care',
    pattern: /受害者|受害人|受影响|家属|遇难者|幸存者|受灾|受伤者|安置|心理|疏导/,
    question: '受影响群体是否得到妥善安置',
    emotionWeight: { worry: 2.5, anger: 1 }
  },
  {
    id: 'media_freedom',
    pattern: /采访|报道|记者|媒体|新闻|直播|知情权|透明|公开|信息自由/,
    question: '媒体采访和信息透明度是否充分',
    emotionWeight: { verify: 2, anger: 1 }
  }
];

function parseFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`文件不存在: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const comments = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const sepIndex = trimmed.indexOf('|');
    if (sepIndex > 0) {
      comments.push({
        text: trimmed.substring(sepIndex + 1).trim(),
        time: trimmed.substring(0, sepIndex).trim()
      });
    } else {
      comments.push({ text: trimmed, time: '' });
    }
  }
  return comments;
}

function classifyEmotion(text) {
  const scores = {};
  for (const [key, cat] of Object.entries(EMOTION_CATEGORIES)) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) {
        score += 1;
        if (text.includes('太') && (kw.length <= 2)) score += 0.5;
        if (text.includes('非常') || text.includes('极其')) score += 0.5;
      }
    }
    scores[key] = score;
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) {
    scores.onlook = 1;
    return { primary: 'onlook', scores, normalized: { anger: 0, worry: 0, verify: 0, onlook: 1 } };
  }
  const normalized = {};
  for (const k of Object.keys(scores)) {
    normalized[k] = scores[k] / total;
  }
  let primary = 'onlook';
  let maxScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > maxScore) { maxScore = v; primary = k; }
  }
  return { primary, scores, normalized };
}

function analyzeEmotions(comments) {
  const counts = { anger: 0, worry: 0, verify: 0, onlook: 0 };
  const taggedComments = [];
  for (const c of comments) {
    const result = classifyEmotion(c.text);
    counts[result.primary]++;
    taggedComments.push({ ...c, emotion: result.primary, emotionScores: result.scores, emotionNormalized: result.normalized });
  }
  const total = comments.length || 1;
  const percentages = {};
  for (const k of Object.keys(counts)) {
    percentages[k] = Math.round((counts[k] / total) * 100);
  }
  return { counts, percentages, total, taggedComments };
}

function extractTopics(comments) {
  const topicHits = {};
  for (const tp of TOPIC_PATTERNS) {
    topicHits[tp.id] = { ...tp, hits: [], score: 0 };
  }
  for (const c of comments) {
    for (const tp of TOPIC_PATTERNS) {
      if (tp.pattern.test(c.text)) {
        const emotionResult = classifyEmotion(c.text);
        let weight = 1;
        for (const [emo, w] of Object.entries(tp.emotionWeight)) {
          weight += (emotionResult.normalized[emo] || 0) * w;
        }
        topicHits[tp.id].hits.push({ text: c.text, emotion: emotionResult.primary, weight });
        topicHits[tp.id].score += weight;
      }
    }
  }
  const activeTopics = Object.values(topicHits)
    .filter(t => t.hits.length > 0)
    .sort((a, b) => b.score - a.score);
  return activeTopics;
}

function filterByTimeRange(comments, timeRange) {
  if (!timeRange || timeRange.trim() === '') return comments;
  const parts = timeRange.split('~').map(s => s.trim());
  if (parts.length !== 2) return comments;
  const start = new Date(parts[0]);
  const end = new Date(parts[1]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return comments;
  return comments.filter(c => {
    if (!c.time) return true;
    const t = new Date(c.time);
    return !isNaN(t.getTime()) && t >= start && t <= end;
  });
}

function generateEmotionOverview(analysis) {
  const { percentages, counts, total } = analysis;
  const sorted = Object.entries(percentages).sort((a, b) => b[1] - a[1]);
  const lines = [];
  const top = sorted[0];
  const topLabel = EMOTION_CATEGORIES[top[0]].label;
  if (top[1] >= 50) {
    lines.push(`情绪以${topLabel}为主导（${top[1]}%），占绝对多数。`);
  } else if (top[1] >= 30) {
    const second = sorted[1];
    const secondLabel = EMOTION_CATEGORIES[second[0]].label;
    lines.push(`${topLabel}声音最多（${top[1]}%），其次是${secondLabel}（${second[1]}%）。`);
  } else {
    const labels = sorted.slice(0, 3).map(([k, v]) => `${EMOTION_CATEGORIES[k].label}${v}%`).join('、');
    lines.push(`情绪分布较分散：${labels}，无明显主导。`);
  }
  if (counts.anger > 0 && counts.anger / total > 0.2) {
    lines.push(`愤怒声音占比较高，需注意对立情绪蔓延。`);
  }
  if (counts.worry > 0 && counts.worry / total > 0.25) {
    lines.push(`担忧声音突出，公众对自身安全存疑。`);
  }
  if (counts.verify > 0 && counts.verify / total > 0.2) {
    lines.push(`求证需求旺盛，信息真空期明显。`);
  }
  if (lines.length === 0) {
    lines.push(`评论以围观为主，尚未形成强烈情绪指向。`);
  }
  return lines.join('');
}

function generateDoubts(topics, supplementaryFacts) {
  if (topics.length === 0) {
    return ['未识别出明确质疑焦点，评论可能较为分散。'];
  }
  const lines = [];
  let displayTopics = topics.slice();
  if (supplementaryFacts && supplementaryFacts.length > 0) {
    displayTopics.sort((a, b) => {
      const aMatch = supplementaryFacts.some(f => a.pattern.test(f)) ? 1 : 0;
      const bMatch = supplementaryFacts.some(f => b.pattern.test(f)) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return b.score - a.score;
    });
  }
  const shown = Math.min(displayTopics.length, 6);
  for (let i = 0; i < shown; i++) {
    const t = displayTopics[i];
    let line = `${i + 1}. ${t.question}`;
    const emotionDist = {};
    for (const h of t.hits) {
      emotionDist[h.emotion] = (emotionDist[h.emotion] || 0) + 1;
    }
    const topEmo = Object.entries(emotionDist).sort((a, b) => b[1] - a[1])[0];
    if (topEmo) {
      line += `（主要情绪：${EMOTION_CATEGORIES[topEmo[0]].label}，${t.hits.length}条相关）`;
    }
    const sampleIdx = t.hits.findIndex(h => h.text.length > 10) || 0;
    const sample = t.hits[sampleIdx] || t.hits[0];
    if (sample) {
      const displayText = sample.text.length > 40 ? sample.text.substring(0, 40) + '…' : sample.text;
      line += `\n   代表："${displayText}"`;
    }
    if (supplementaryFacts && supplementaryFacts.length > 0) {
      const factMatch = supplementaryFacts.find(f =>
        t.pattern.test(f)
      );
      if (factMatch) {
        const shortFact = factMatch.length > 35 ? factMatch.substring(0, 35) + '…' : factMatch;
        line += `\n   ▶ 已有补充事实：${shortFact}`;
      }
    }
    lines.push(line);
  }
  if (displayTopics.length > 6) {
    lines.push(`…另有 ${displayTopics.length - 6} 个次要质疑点。`);
  }
  return lines;
}

function generatePriority(topics, emotionAnalysis, supplementaryFacts) {
  if (topics.length === 0) {
    return ['当前无明确优先建议，建议持续监测。'];
  }
  const lines = [];
  const angerRatio = emotionAnalysis.percentages.anger || 0;
  const worryRatio = emotionAnalysis.percentages.worry || 0;
  const verifyRatio = emotionAnalysis.percentages.verify || 0;
  const factCovered = supplementaryFacts && supplementaryFacts.length > 0;

  const topTopic = topics[0];
  const topEmo = topTopic.hits.length > 0
    ? topTopic.hits.reduce((acc, h) => { acc[h.emotion] = (acc[h.emotion] || 0) + 1; return acc; }, {})
    : {};
  const topEmoKey = Object.entries(topEmo).sort((a, b) => b[1] - a[1])[0];

  if (angerRatio >= 30) {
    lines.push('【紧急】公众愤怒情绪强烈，首要任务是回应最尖锐质疑以降温。');
  } else if (worryRatio >= 30) {
    lines.push('【重点】公众以担忧为主，优先释放安全信息和安置措施。');
  } else if (verifyRatio >= 30) {
    lines.push('【重点】求证声音集中，优先补齐事实信息、消除信息真空。');
  } else {
    lines.push('【一般】情绪尚可控，按质疑热度依次回应即可。');
  }

  if (topTopic) {
    if (topEmoKey && topEmoKey[0] === 'anger') {
      lines.push(`→ 第一优先：回应"${topTopic.question}"——直接承认问题或给出调查结论，缓解对立。`);
    } else if (topEmoKey && topEmoKey[0] === 'verify') {
      lines.push(`→ 第一优先：回应"${topTopic.question}"——尽快公布权威数据或官方核实结果。`);
    } else if (topEmoKey && topEmoKey[0] === 'worry') {
      lines.push(`→ 第一优先：回应"${topTopic.question}"——明确安全措施和后续保障，安抚受影响群体。`);
    } else {
      lines.push(`→ 第一优先：回应"${topTopic.question}"。`);
    }
  }

  if (topics.length > 1) {
    const second = topics[1];
    lines.push(`→ 第二优先：回应"${second.question}"。`);
  }

  if (!factCovered) {
    if (angerRatio > 20 && verifyRatio > 15) {
      lines.push('→ 建议优先解释事实误差和统计口径差异，降低信任损耗。');
    }
    if (worryRatio > 20) {
      lines.push('→ 建议同步发布受影响群体安置和善后措施，降低恐慌蔓延。');
    }
  } else {
    lines.push('→ 已纳入补充事实，以上建议已调整。可继续输入事实以进一步校准。');
  }

  if (angerRatio > 40) {
    lines.push('⚠ 愤怒占比超40%，建议不要使用"正在调查中"等模糊措辞，给出具体时间节点。');
  }

  return lines;
}

function runAnalysis(eventName, timeRange, filePath, supplementaryFacts) {
  let comments = parseFile(filePath);
  if (timeRange) {
    comments = filterByTimeRange(comments, timeRange);
  }
  const emotionAnalysis = analyzeEmotions(comments);
  const topics = extractTopics(comments);
  const emotionOverview = generateEmotionOverview(emotionAnalysis);
  const doubts = generateDoubts(topics, supplementaryFacts);
  const priority = generatePriority(topics, emotionAnalysis, supplementaryFacts);
  return {
    eventName,
    timeRange,
    commentCount: comments.length,
    emotionOverview,
    doubts,
    priority,
    emotionAnalysis,
    topics
  };
}

module.exports = {
  parseFile,
  classifyEmotion,
  analyzeEmotions,
  extractTopics,
  filterByTimeRange,
  generateEmotionOverview,
  generateDoubts,
  generatePriority,
  runAnalysis,
  EMOTION_CATEGORIES,
  TOPIC_PATTERNS
};
