'use strict';

const fs = require('fs');
const path = require('path');
const { exportReport, timestampForFile } = require('./report');

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

function parseFiles(filePaths) {
  const fileStats = [];
  const allComments = [];
  for (const fp of filePaths) {
    const resolved = path.resolve(fp.trim());
    const comments = parseFile(resolved);
    const baseName = path.basename(resolved);
    fileStats.push({ path: resolved, name: baseName, count: comments.length });
    for (const c of comments) {
      allComments.push({ ...c, source: baseName });
    }
  }
  return { comments: allComments, fileStats };
}

function normalizeDateEnd(dateStr) {
  const s = dateStr.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('/').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(s);
}

function normalizeDateStart(dateStr) {
  const s = dateStr.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('/').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return new Date(s);
}

function parseCommentTime(timeStr) {
  if (!timeStr) return NaN;
  const s = timeStr.trim();
  const dashMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dashMatch) {
    const [, y, m, d, hh = 0, mm = 0, ss = 0] = dashMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
  }
  const slashMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (slashMatch) {
    const [, y, m, d, hh = 0, mm = 0, ss = 0] = slashMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
  }
  const t = new Date(s);
  return isNaN(t.getTime()) ? NaN : t.getTime();
}

function filterByTimeRange(comments, timeRange) {
  if (!timeRange || timeRange.trim() === '') return comments;
  const parts = timeRange.split('~').map(s => s.trim());
  if (parts.length !== 2) return comments;
  const startMs = normalizeDateStart(parts[0]).getTime();
  const endMs = normalizeDateEnd(parts[1]).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return comments;
  return comments.filter(c => {
    if (!c.time) return true;
    const t = parseCommentTime(c.time);
    return !isNaN(t) && t >= startMs && t <= endMs;
  });
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

function extractTopics(comments, supplementaryFacts) {
  const facts = supplementaryFacts || [];
  const topicHits = {};
  for (const tp of TOPIC_PATTERNS) {
    topicHits[tp.id] = { ...tp, hits: [], score: 0, addressed: false, matchingFacts: [] };
  }
  for (const f of facts) {
    for (const tp of TOPIC_PATTERNS) {
      if (tp.pattern.test(f)) {
        topicHits[tp.id].addressed = true;
        if (!topicHits[tp.id].matchingFacts.includes(f)) {
          topicHits[tp.id].matchingFacts.push(f);
        }
      }
    }
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
  for (const id of Object.keys(topicHits)) {
    if (topicHits[id].addressed) {
      topicHits[id].score = Math.max(0, topicHits[id].score * 0.25);
    }
  }
  const activeTopics = Object.values(topicHits)
    .filter(t => t.hits.length > 0)
    .sort((a, b) => {
      if (a.addressed !== b.addressed) return a.addressed ? 1 : -1;
      return b.score - a.score;
    });
  return activeTopics;
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
  const unaddressed = topics.filter(t => !t.addressed);
  const addressed = topics.filter(t => t.addressed);

  const MAX_UNADDRESSED = 5;
  const MAX_ADDRESSED = 2;

  const displayList = [];
  for (let i = 0; i < Math.min(unaddressed.length, MAX_UNADDRESSED); i++) {
    displayList.push(unaddressed[i]);
  }
  for (let i = 0; i < Math.min(addressed.length, MAX_ADDRESSED); i++) {
    displayList.push(addressed[i]);
  }

  let displayedCount = 0;
  for (const t of displayList) {
    let prefix = `${displayedCount + 1}. `;
    if (t.addressed) {
      prefix = `${displayedCount + 1}. ✓ `;
    }
    let line = `${prefix}${t.question}`;
    const emotionDist = {};
    for (const h of t.hits) {
      if (h.emotion) {
        emotionDist[h.emotion] = (emotionDist[h.emotion] || 0) + 1;
      }
    }
    const topEmoEntries = Object.entries(emotionDist).sort((a, b) => b[1] - a[1]);
    const topEmo = topEmoEntries.length > 0 ? topEmoEntries[0] : null;
    if (topEmo) {
      line += `（主要情绪：${EMOTION_CATEGORIES[topEmo[0]].label}，${t.hits.length}条相关）`;
    } else if (t.hits.length > 0) {
      line += `（${t.hits.length}条相关）`;
    }
    if (t.addressed) {
      line += ` [已回应]`;
    }
    const sampleIdx = t.hits.findIndex(h => h.text.length > 10) || 0;
    const sample = t.hits[sampleIdx] || t.hits[0];
    if (sample) {
      const displayText = sample.text.length > 40 ? sample.text.substring(0, 40) + '…' : sample.text;
      line += `\n      代表："${displayText}"`;
    }
    if (t.addressed && t.matchingFacts && t.matchingFacts.length > 0) {
      for (const f of t.matchingFacts) {
        const shortFact = f.length > 40 ? f.substring(0, 40) + '…' : f;
        line += `\n      ▶ 已澄清：${shortFact}`;
      }
    }
    lines.push(line);
    displayedCount++;
  }
  const remaining = topics.length - displayList.length;
  if (remaining > 0) {
    lines.push(`…另有 ${remaining} 个次要质疑点。`);
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
  const facts = supplementaryFacts || [];
  const hasFacts = facts.length > 0;

  const unaddressed = topics.filter(t => !t.addressed);
  const addressed = topics.filter(t => t.addressed);

  if (angerRatio >= 30) {
    lines.push('【紧急】公众愤怒情绪强烈，首要任务是回应最尖锐质疑以降温。');
  } else if (worryRatio >= 30) {
    lines.push('【重点】公众以担忧为主，优先释放安全信息和安置措施。');
  } else if (verifyRatio >= 30) {
    lines.push('【重点】求证声音集中，优先补齐事实信息、消除信息真空。');
  } else {
    lines.push('【一般】情绪尚可控，按质疑热度依次回应即可。');
  }

  let priorityRank = 1;
  for (const t of unaddressed.slice(0, 3)) {
    const emoDist = {};
    for (const h of t.hits) {
      if (h.emotion) {
        emoDist[h.emotion] = (emoDist[h.emotion] || 0) + 1;
      }
    }
    const topEmoEntries = Object.entries(emoDist).sort((a, b) => b[1] - a[1]);
    const topEmoKey = topEmoEntries.length > 0 ? topEmoEntries[0] : null;
    const rankLabel = priorityRank === 1 ? '第一优先' : priorityRank === 2 ? '第二优先' : '第三优先';
    let advice = '';
    if (topEmoKey && topEmoKey[0] === 'anger') {
      advice = '——直接承认问题或给出调查结论，缓解对立。';
    } else if (topEmoKey && topEmoKey[0] === 'verify') {
      advice = '——尽快公布权威数据或官方核实结果。';
    } else if (topEmoKey && topEmoKey[0] === 'worry') {
      advice = '——明确安全措施和后续保障，安抚受影响群体。';
    }
    lines.push(`→ ${rankLabel}：回应"${t.question}"${advice}`);
    priorityRank++;
  }

  if (hasFacts) {
    if (addressed.length > 0) {
      const addressedLabels = addressed.slice(0, 3).map(t => `"${t.question}"`).join('、');
      lines.push(`✓ 已覆盖：${addressedLabels}${addressed.length > 3 ? ` 等${addressed.length}项` : ''}，可暂不作为重点。`);
    }

    const neededCategories = new Set();
    for (const t of unaddressed) {
      for (const [emo, w] of Object.entries(t.emotionWeight || {})) {
        if (w >= 1.5) {
          if (emo === 'verify') neededCategories.add('权威事实与数据');
          if (emo === 'worry') neededCategories.add('安全保障与安抚信息');
          if (emo === 'anger') neededCategories.add('问责与处理进展');
        }
      }
    }
    if (unaddressed.length > 0 && neededCategories.size > 0) {
      const hint = Array.from(neededCategories).join('、');
      lines.push(`▶ 下一步建议补充：${hint}，以覆盖剩余质疑。`);
    } else if (unaddressed.length === 0) {
      lines.push('✓ 所有主要质疑均已回应，可转入持续监测。');
    }
  } else {
    if (angerRatio > 20 && verifyRatio > 15) {
      lines.push('→ 建议优先解释事实误差和统计口径差异，降低信任损耗。');
    }
    if (worryRatio > 20) {
      lines.push('→ 建议同步发布受影响群体安置和善后措施，降低恐慌蔓延。');
    }
  }

  if (angerRatio > 40) {
    lines.push('⚠ 愤怒占比超40%，建议不要使用"正在调查中"等模糊措辞，给出具体时间节点。');
  }

  return lines;
}

function getBucketKey(timeMs, intervalHours) {
  const d = new Date(timeMs);
  if (intervalHours >= 24) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:00`;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function determineInterval(comments) {
  const timed = comments.filter(c => c.time);
  if (timed.length < 2) return 24;
  const times = timed.map(c => parseCommentTime(c.time)).filter(t => !isNaN(t)).sort((a, b) => a - b);
  if (times.length < 2) return 24;
  const spanHours = (times[times.length - 1] - times[0]) / (1000 * 60 * 60);
  if (spanHours <= 36) return 1;
  if (spanHours <= 14 * 24) return 6;
  return 24;
}

function analyzeTrend(comments) {
  const timed = comments.filter(c => c.time).map(c => ({
    ...c,
    timeMs: parseCommentTime(c.time)
  })).filter(c => !isNaN(c.timeMs));

  if (timed.length < 5) {
    return { available: false, summary: '带时间戳的评论不足，无法判断趋势。' };
  }

  const intervalHours = determineInterval(timed);
  const buckets = {};
  for (const c of timed) {
    const key = getBucketKey(c.timeMs, intervalHours);
    if (!buckets[key]) {
      buckets[key] = { key, counts: { anger: 0, worry: 0, verify: 0, onlook: 0 }, total: 0, topicHits: {} };
    }
    const emos = classifyEmotion(c.text);
    buckets[key].counts[emos.primary]++;
    buckets[key].total++;
    for (const tp of TOPIC_PATTERNS) {
      if (tp.pattern.test(c.text)) {
        buckets[key].topicHits[tp.id] = (buckets[key].topicHits[tp.id] || 0) + 1;
      }
    }
  }

  const keys = Object.keys(buckets).sort();
  if (keys.length < 2) {
    return { available: false, summary: '时间区间不足，无法判断趋势。', intervalHours };
  }

  const mid = Math.floor(keys.length / 2);
  const firstHalf = keys.slice(0, mid);
  const secondHalf = keys.slice(mid);

  const sumSlice = (slice) => {
    const agg = { anger: 0, worry: 0, verify: 0, onlook: 0, total: 0 };
    for (const k of slice) {
      const b = buckets[k];
      for (const e of Object.keys(agg)) {
        if (e === 'total') agg.total += b.total;
        else agg[e] += b.counts[e];
      }
    }
    return agg;
  };

  const first = sumSlice(firstHalf);
  const second = sumSlice(secondHalf);

  function pct(obj, key) {
    return obj.total > 0 ? (obj[key] / obj.total) * 100 : 0;
  }

  const risingEmotions = [];
  const fallingEmotions = [];
  for (const emo of ['anger', 'worry', 'verify', 'onlook']) {
    const diff = pct(second, emo) - pct(first, emo);
    if (diff >= 8) {
      risingEmotions.push({ emotion: emo, diff: Math.round(diff) });
    } else if (diff <= -8) {
      fallingEmotions.push({ emotion: emo, diff: Math.round(diff) });
    }
  }

  const topicRising = [];
  for (const tp of TOPIC_PATTERNS) {
    let firstCount = 0, secondCount = 0;
    for (const k of firstHalf) firstCount += buckets[k].topicHits[tp.id] || 0;
    for (const k of secondHalf) secondCount += buckets[k].topicHits[tp.id] || 0;
    const firstTotal = first.total || 1;
    const secondTotal = second.total || 1;
    const firstRate = firstCount / firstTotal;
    const secondRate = secondCount / secondTotal;
    const diff = secondRate - firstRate;
    if (diff >= 0.05 && secondCount >= 2) {
      topicRising.push({ topic: tp.id, question: tp.question, diffPct: Math.round(diff * 100) });
    }
  }

  const summaryParts = [];
  if (risingEmotions.length > 0) {
    const labels = risingEmotions.map(r => `${EMOTION_CATEGORIES[r.emotion].label}(+${r.diff}%)`).join('、');
    summaryParts.push(`后半段${labels}明显上升`);
  }
  if (topicRising.length > 0) {
    const topRising = topicRising.sort((a, b) => b.diffPct - a.diffPct).slice(0, 2);
    const labels = topRising.map(r => `"${r.question}"(+${r.diffPct}%)`).join('、');
    summaryParts.push(`质疑点${labels}升温`);
  }
  if (fallingEmotions.length > 0 && risingEmotions.length === 0 && topicRising.length === 0) {
    const labels = fallingEmotions.map(r => `${EMOTION_CATEGORIES[r.emotion].label}(${r.diff}%)`).join('、');
    summaryParts.push(`${labels}有所回落，整体情绪趋缓`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push('各情绪和质疑比例相对稳定，无明显升温信号');
  }

  const summary = summaryParts.join('，') + '。';

  return {
    available: true,
    intervalHours,
    bucketCount: keys.length,
    summary,
    risingEmotions,
    fallingEmotions,
    topicRising: topicRising.sort((a, b) => b.diffPct - a.diffPct),
    firstHalf,
    secondHalf
  };
}

function runAnalysis(eventName, timeRange, filePaths, supplementaryFacts) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const { comments: rawComments, fileStats } = parseFiles(paths);
  let comments = rawComments;
  if (timeRange) {
    comments = filterByTimeRange(comments, timeRange);
  }
  const emotionAnalysis = analyzeEmotions(comments);
  const topics = extractTopics(comments, supplementaryFacts);
  const trend = analyzeTrend(comments);
  const emotionOverview = generateEmotionOverview(emotionAnalysis);
  const doubts = generateDoubts(topics, supplementaryFacts);
  const priority = generatePriority(topics, emotionAnalysis, supplementaryFacts);

  const unaddressed = topics.filter(t => !t.addressed);
  const topEmotion = Object.entries(emotionAnalysis.percentages)
    .sort((a, b) => b[1] - a[1])[0];
  const firstPriority = priority.find(l => l.includes('第一优先')) || priority[0];

  return {
    eventName,
    timeRange,
    commentCount: comments.length,
    fileStats,
    emotionOverview,
    doubts,
    priority,
    emotionAnalysis,
    topics,
    trend,
    supplementaryFacts: supplementaryFacts || [],
    summary: {
      topEmotionLabel: EMOTION_CATEGORIES[topEmotion[0]].label,
      topEmotionRatio: topEmotion[1],
      firstPriority: firstPriority ? firstPriority.replace(/^[→\s]*/, '') : '',
      unaddressedCount: unaddressed.length,
      trendSummary: trend.summary
    }
  };
}

function parseBatchConfig(configPath) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`批量配置文件不存在: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
  const events = [];
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    const [name, timeRange, ...fileParts] = parts;
    const filePaths = fileParts
      .join('|').split(/[,;]/).map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
        if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
        return s;
      });
    if (name && filePaths.length > 0) {
      events.push({ name, timeRange, filePaths });
    }
  }
  return events;
}

function runBatchAnalysis(events, outputDir) {
  const dir = outputDir || process.cwd();
  const results = [];
  const errors = [];
  for (const ev of events) {
    try {
      const result = runAnalysis(ev.name, ev.timeRange, ev.filePaths, []);
      const baseInfo = exportReport(result, 'txt', dir);
      const mdInfo = exportReport(result, 'md', dir);
      results.push({
        event: ev.name,
        result,
        files: [baseInfo, mdInfo]
      });
    } catch (e) {
      errors.push({ event: ev.name, error: e.message });
    }
  }
  return { results, errors, outputDir: dir };
}

function generateBatchSummary(batchResult) {
  const { results, errors, outputDir } = batchResult;
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  const DOUBLE = '═'.repeat(72);
  const SINGLE = '─'.repeat(72);

  lines.push(DOUBLE);
  lines.push(`  舆情日报汇总 · ${results.length} 个事件`);
  lines.push(`  生成时间: ${now}`);
  lines.push(`  输出目录: ${outputDir}`);
  lines.push(DOUBLE);
  lines.push('');

  if (results.length > 0) {
    lines.push(SINGLE);
    lines.push(`  ${pad('事件', 24)}${pad('评论', 8)}${pad('最高情绪', 10)}${pad('第一优先', 30)}`);
    lines.push(SINGLE);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const s = r.result.summary;
      lines.push(`  ${pad(r.event, 24)}${pad(String(r.result.commentCount), 8)}${pad(`${s.topEmotionLabel}${s.topEmotionRatio}%`, 10)}${pad(s.firstPriority, 30)}`);
    }
    lines.push('');

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const s = r.result.summary;
      lines.push(`${i + 1}. ${r.event}`);
      lines.push(`   评论: ${r.result.commentCount} 条`);
      lines.push(`   最高情绪: ${s.topEmotionLabel} (${s.topEmotionRatio}%)`);
      lines.push(`   第一优先: ${s.firstPriority}`);
      lines.push(`   趋势: ${s.trendSummary}`);
      lines.push(`   文件: ${r.files.map(f => f.filename).join(' / ')}`);
      lines.push('');
    }
  }

  if (errors.length > 0) {
    lines.push(SINGLE);
    lines.push(`  以下事件分析失败 (${errors.length} 个):`);
    lines.push(SINGLE);
    for (const e of errors) {
      lines.push(`  ✗ ${e.event}: ${e.error}`);
    }
    lines.push('');
  }

  lines.push(DOUBLE);
  lines.push(`  *由 CrisisPulse v1.2 于 ${now} 批量生成*`);
  lines.push(DOUBLE);

  return lines.join('\n');

  function pad(str, len) {
    const s = String(str || '');
    if (s.length >= len) return s.slice(0, len - 1) + '…';
    return s + ' '.repeat(len - s.length);
  }
}

function generateBatchMarkdown(batchResult) {
  const { results, errors, outputDir } = batchResult;
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push(`# 舆情日报汇总`);
  lines.push('');
  lines.push(`> 生成时间: ${now}`);
  lines.push(`> 事件数量: ${results.length} 个`);
  lines.push(`> 输出目录: ${outputDir}`);
  lines.push('');

  if (results.length > 0) {
    lines.push('## 事件一览');
    lines.push('');
    lines.push('| # | 事件 | 评论数 | 最高情绪 | 第一优先 | 趋势 |');
    lines.push('|---|------|--------|----------|----------|------|');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const s = r.result.summary;
      lines.push(`| ${i + 1} | ${r.event} | ${r.result.commentCount} | ${s.topEmotionLabel} ${s.topEmotionRatio}% | ${s.firstPriority} | ${s.trendSummary} |`);
    }
    lines.push('');

    lines.push('## 详细清单');
    lines.push('');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const s = r.result.summary;
      lines.push(`### ${i + 1}. ${r.event}`);
      lines.push('');
      lines.push(`- 评论数: **${r.result.commentCount}**`);
      lines.push(`- 最高情绪: **${s.topEmotionLabel}** (${s.topEmotionRatio}%)`);
      lines.push(`- 第一优先: ${s.firstPriority}`);
      lines.push(`- 趋势: ${s.trendSummary}`);
      lines.push(`- 报告文件: ${r.files.map(f => `[\`${f.filename}\`](${f.filename})`).join(' / ')}`);
      lines.push('');
    }
  }

  if (errors.length > 0) {
    lines.push('## 分析失败');
    lines.push('');
    for (const e of errors) {
      lines.push(`- ❌ ${e.event}: ${e.error}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*由 CrisisPulse v1.2 于 ${now} 批量生成*`);

  return lines.join('\n');
}

function exportBatchReport(batchResult, outputDir) {
  const dir = outputDir || batchResult.outputDir || process.cwd();
  const ts = timestampForFile();
  const baseName = `舆情汇总_${ts}`;
  const txtPath = path.join(dir, `${baseName}.txt`);
  const mdPath = path.join(dir, `${baseName}.md`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(txtPath, generateBatchSummary(batchResult), 'utf-8');
  fs.writeFileSync(mdPath, generateBatchMarkdown(batchResult), 'utf-8');

  return {
    txt: { path: txtPath, filename: path.basename(txtPath) },
    md: { path: mdPath, filename: path.basename(mdPath) }
  };
}

module.exports = {
  parseFile,
  parseFiles,
  classifyEmotion,
  analyzeEmotions,
  extractTopics,
  filterByTimeRange,
  normalizeDateStart,
  normalizeDateEnd,
  parseCommentTime,
  analyzeTrend,
  generateEmotionOverview,
  generateDoubts,
  generatePriority,
  runAnalysis,
  parseBatchConfig,
  runBatchAnalysis,
  generateBatchSummary,
  generateBatchMarkdown,
  exportBatchReport,
  EMOTION_CATEGORIES,
  TOPIC_PATTERNS
};
