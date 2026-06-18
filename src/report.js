'use strict';

const fs = require('fs');
const path = require('path');

const DIVIDER = '─'.repeat(52);
const DOUBLE_DIVIDER = '═'.repeat(52);

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function timestampForFile(d) {
  const date = d || new Date();
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function sanitizeFilename(name) {
  return (name || 'report').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

function buildFileStatsLine(fileStats, indent) {
  const padStr = indent || '';
  if (!fileStats || fileStats.length === 0) return '';
  if (fileStats.length === 1) {
    return `${padStr}数据源: ${fileStats[0].name}（${fileStats[0].count}条）`;
  }
  const lines = [`${padStr}数据源（共 ${fileStats.length} 份，合计 ${fileStats.reduce((s, f) => s + f.count, 0)} 条）:`];
  for (const f of fileStats) {
    lines.push(`${padStr}  · ${f.name}: ${f.count} 条评论`);
  }
  return lines.join('\n');
}

function buildTrendSection(result) {
  if (!result.trend) return '';
  const lines = [];
  lines.push(DIVIDER);
  lines.push('  四、趋势判断');
  lines.push(DIVIDER);
  lines.push(`  ${result.trend.summary}`);
  if (result.trend.risingEmotions && result.trend.risingEmotions.length > 0) {
    const rising = result.trend.risingEmotions.map(r => `${r.emotion} +${r.diff}%`).join(', ');
    lines.push(`  升温情绪: ${rising}`);
  }
  if (result.trend.topicRising && result.trend.topicRising.length > 0) {
    const topics = result.trend.topicRising.slice(0, 3).map(r => `"${r.question}" +${r.diffPct}%`).join(', ');
    lines.push(`  升温质疑: ${topics}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatReport(result, mode) {
  const fmtMode = mode || 'full';
  const now = new Date().toLocaleString('zh-CN', { hour12: false });

  if (fmtMode === 'brief') {
    return formatBrief(result);
  }
  if (fmtMode === 'priority') {
    return formatPriorityOnly(result);
  }

  const lines = [];

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  舆情快报 · ${result.eventName || '未命名事件'}`);
  lines.push(`  生成时间: ${now}`);
  if (result.timeRange) {
    lines.push(`  时间范围: ${result.timeRange}`);
  }
  lines.push(`  分析评论数: ${result.commentCount}`);
  const fileStatsStr = buildFileStatsLine(result.fileStats, '  ');
  if (fileStatsStr) lines.push(fileStatsStr);
  lines.push(DOUBLE_DIVIDER);
  lines.push('');

  lines.push(DIVIDER);
  lines.push('  一、情绪概览');
  lines.push(DIVIDER);
  lines.push(`  ${result.emotionOverview}`);
  const ea = result.emotionAnalysis;
  lines.push(`  [愤怒 ${ea.percentages.anger}%] [担忧 ${ea.percentages.worry}%] [求证 ${ea.percentages.verify}%] [围观 ${ea.percentages.onlook}%]`);
  lines.push('');

  lines.push(DIVIDER);
  lines.push('  二、主要质疑');
  lines.push(DIVIDER);
  for (const d of result.doubts) {
    lines.push(`  ${d}`);
  }
  lines.push('');

  lines.push(DIVIDER);
  lines.push('  三、回应优先级');
  lines.push(DIVIDER);
  for (const p of result.priority) {
    lines.push(`  ${p}`);
  }
  lines.push('');

  const trendSection = buildTrendSection(result);
  if (trendSection) lines.push(trendSection);

  if (result.supplementaryFacts && result.supplementaryFacts.length > 0) {
    lines.push(DIVIDER);
    lines.push('  附：已录入补充事实');
    lines.push(DIVIDER);
    const facts = result.supplementaryFacts;
    const tagged = facts.filter(f => typeof f !== 'string' && f.tag);
    const untagged = facts.filter(f => typeof f === 'string' || !f.tag);

    const coveredTagSet = new Set();
    for (const t of (result.topics || [])) {
      if (t.addressed && t.matchingTags) {
        for (const tag of t.matchingTags) coveredTagSet.add(tag);
      }
    }

    if (tagged.length > 0) {
      const groups = {};
      for (const f of tagged) {
        const tag = f.tag || '未分类';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(f);
      }
      for (const [tag, items] of Object.entries(groups)) {
        const status = coveredTagSet.has(tag) ? '✓' : '✗';
        lines.push(`  ${status} [${tag}]`);
        for (const f of items) {
          const marker = f.source === 'new' ? ' 🆕' : (f.source === 'history' ? ' 📜' : '');
          lines.push(`    · ${f.text}${marker}`);
        }
      }
    }
    if (untagged.length > 0) {
      lines.push(`  [未标签]`);
      for (const f of untagged) {
        const text = typeof f === 'string' ? f : f.text;
        const marker = f.source === 'new' ? ' 🆕' : (f.source === 'history' ? ' 📜' : '');
        lines.push(`    · ${text}${marker}`);
      }
    }

    if (coveredTagSet.size > 0) {
      lines.push('');
      lines.push('  标签覆盖情况:');
      for (const tag of coveredTagSet) {
        const relatedTopics = [];
        for (const t of (result.topics || [])) {
          if (t.addressed && t.matchingTags && t.matchingTags.includes(tag)) {
            relatedTopics.push(t.question);
          }
        }
        if (relatedTopics.length > 0) {
          lines.push(`    ✓ ${tag}: 已覆盖 ${relatedTopics.join('、')}`);
        }
      }
      const allTags = new Set();
      for (const f of tagged) allTags.add(f.tag);
      const uncoveredTags = Array.from(allTags).filter(t => !coveredTagSet.has(t));
      for (const tag of uncoveredTags) {
        lines.push(`    ✗ ${tag}: 暂未覆盖主要质疑`);
      }
    }
    lines.push('');
  }

  lines.push(DOUBLE_DIVIDER);
  lines.push('  命令: /facts 查看  /tag #标签  /multidiff 多时段  /loadfacts 加载  /save 导出  /quit 退出  /help 帮助');
  lines.push(DOUBLE_DIVIDER);

  return lines.join('\n');
}

function formatBrief(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  const ea = result.emotionAnalysis;

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  舆情快报 · ${result.eventName || '未命名事件'}`);
  lines.push(`  ${now} | 评论 ${result.commentCount} 条`);
  lines.push(DOUBLE_DIVIDER);
  lines.push('');
  lines.push(`  情绪: [愤怒${ea.percentages.anger}%] [担忧${ea.percentages.worry}%] [求证${ea.percentages.verify}%] [围观${ea.percentages.onlook}%]`);
  lines.push(`  ${result.emotionOverview}`);
  lines.push('');
  lines.push('  🔴 主要质疑:');
  const unaddressed = result.doubts.filter(d => !d.includes('[已回应]')).slice(0, 3);
  for (let i = 0; i < unaddressed.length; i++) {
    const clean = unaddressed[i]
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/\n\s+/g, ' / ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    lines.push(`    ${i + 1}. ${clean}`);
  }
  lines.push('');
  lines.push('  🎯 回应优先级:');
  const priorities = result.priority.filter(p => p.startsWith('→')).slice(0, 3);
  for (let i = 0; i < priorities.length; i++) {
    lines.push(`    ${priorities[i]}`);
  }
  if (result.trend && result.trend.summary) {
    lines.push('');
    lines.push(`  📈 趋势: ${result.trend.summary}`);
  }
  lines.push('');
  lines.push(DOUBLE_DIVIDER);
  return lines.join('\n');
}

function formatPriorityOnly(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  回应建议 · ${result.eventName || '未命名事件'}`);
  lines.push(`  ${now} | 评论 ${result.commentCount} 条`);
  lines.push(DOUBLE_DIVIDER);
  lines.push('');

  for (const p of result.priority) {
    lines.push(`  ${p}`);
  }
  lines.push('');

  if (result.trend && result.trend.summary) {
    lines.push(`  📈 趋势提示: ${result.trend.summary}`);
    lines.push('');
  }

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  *由 CrisisPulse 于 ${now} 生成*`);
  lines.push(DOUBLE_DIVIDER);

  return lines.join('\n');
}

function formatBriefUpdate(result) {
  const lines = [];
  lines.push('');
  lines.push(DOUBLE_DIVIDER);
  lines.push('  ▶ 更新后的舆情快报');
  lines.push(DOUBLE_DIVIDER);
  lines.push('');
  lines.push(`  分析评论数: ${result.commentCount}`);
  const fileStatsStr = buildFileStatsLine(result.fileStats, '  ');
  if (fileStatsStr) lines.push(fileStatsStr);
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  一、情绪概览');
  lines.push(DIVIDER);
  lines.push(`  ${result.emotionOverview}`);
  const ea = result.emotionAnalysis;
  lines.push(`  [愤怒 ${ea.percentages.anger}%] [担忧 ${ea.percentages.worry}%] [求证 ${ea.percentages.verify}%] [围观 ${ea.percentages.onlook}%]`);
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  二、主要质疑');
  lines.push(DIVIDER);
  for (const d of result.doubts) {
    lines.push(`  ${d}`);
  }
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  三、回应优先级');
  lines.push(DIVIDER);
  for (const p of result.priority) {
    lines.push(`  ${p}`);
  }
  lines.push('');
  const trendSection = buildTrendSection(result);
  if (trendSection) lines.push(trendSection);
  lines.push(DOUBLE_DIVIDER);
  return lines.join('\n');
}

function formatMarkdown(result, mode) {
  const fmtMode = mode || 'full';
  const now = new Date().toLocaleString('zh-CN', { hour12: false });

  if (fmtMode === 'brief') {
    return formatMarkdownBrief(result);
  }
  if (fmtMode === 'priority') {
    return formatMarkdownPriority(result);
  }

  const lines = [];

  lines.push(`# 舆情快报 · ${result.eventName || '未命名事件'}`);
  lines.push('');
  lines.push(`> 生成时间: ${now}`);
  if (result.timeRange) {
    lines.push(`> 时间范围: ${result.timeRange}`);
  }
  lines.push(`> 分析评论数: ${result.commentCount}`);
  if (result.fileStats && result.fileStats.length > 0) {
    if (result.fileStats.length === 1) {
      lines.push(`> 数据源: ${result.fileStats[0].name}（${result.fileStats[0].count}条）`);
    } else {
      const total = result.fileStats.reduce((s, f) => s + f.count, 0);
      lines.push(`> 数据源（共 ${result.fileStats.length} 份，合计 ${total} 条）:`);
      for (const f of result.fileStats) {
        lines.push(`>   · ${f.name}: ${f.count} 条`);
      }
    }
  }
  lines.push('');

  lines.push('## 一、情绪概览');
  lines.push('');
  lines.push(result.emotionOverview);
  lines.push('');
  const ea = result.emotionAnalysis;
  lines.push(`| 情绪 | 占比 |`);
  lines.push(`| ---- | ---- |`);
  lines.push(`| 愤怒 | ${ea.percentages.anger}% |`);
  lines.push(`| 担忧 | ${ea.percentages.worry}% |`);
  lines.push(`| 求证 | ${ea.percentages.verify}% |`);
  lines.push(`| 围观 | ${ea.percentages.onlook}% |`);
  lines.push('');

  lines.push('## 二、主要质疑');
  lines.push('');
  for (const d of result.doubts) {
    const formatted = d.replace(/\n\s+/g, '  \n  ');
    lines.push(`- ${formatted}`);
  }
  lines.push('');

  lines.push('## 三、回应优先级');
  lines.push('');
  for (const p of result.priority) {
    lines.push(`- ${p}`);
  }
  lines.push('');

  if (result.trend && result.trend.summary) {
    lines.push('## 四、趋势判断');
    lines.push('');
    lines.push(result.trend.summary);
    lines.push('');
    if (result.trend.risingEmotions && result.trend.risingEmotions.length > 0) {
      lines.push('**升温情绪:**');
      for (const r of result.trend.risingEmotions) {
        lines.push(`- ${r.emotion}: +${r.diff}%`);
      }
      lines.push('');
    }
    if (result.trend.topicRising && result.trend.topicRising.length > 0) {
      lines.push('**升温质疑:**');
      for (const r of result.trend.topicRising.slice(0, 5)) {
        lines.push(`- ${r.question}: +${r.diffPct}%`);
      }
      lines.push('');
    }
  }

  if (result.supplementaryFacts && result.supplementaryFacts.length > 0) {
    lines.push('## 附：已录入补充事实');
    lines.push('');
    const facts = result.supplementaryFacts;
    const tagged = facts.filter(f => typeof f !== 'string' && f.tag);
    const untagged = facts.filter(f => typeof f === 'string' || !f.tag);

    const { TOPIC_PATTERNS, FACT_TAGS } = require('./analyzer');
    const coveredTagSet = new Set();
    for (const t of (result.topics || [])) {
      if (t.addressed && t.matchingTags) {
        for (const tag of t.matchingTags) coveredTagSet.add(tag);
      }
    }

    if (tagged.length > 0) {
      const groups = {};
      for (const f of tagged) {
        const tag = f.tag || '未分类';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(f);
      }
      for (const [tag, items] of Object.entries(groups)) {
        const status = coveredTagSet.has(tag) ? '✓' : '✗';
        lines.push(`### ${status} ${tag}`);
        lines.push('');
        for (const f of items) {
          const marker = f.source === 'new' ? '🆕 ' : (f.source === 'history' ? '📜 ' : '');
          lines.push(`- ${marker}${f.text}`);
        }
        lines.push('');
      }
    }
    if (untagged.length > 0) {
      lines.push('### 未标签');
      lines.push('');
      for (const f of untagged) {
        const text = typeof f === 'string' ? f : f.text;
        lines.push(`- ${text}`);
      }
      lines.push('');
    }

    if (coveredTagSet.size > 0) {
      lines.push('### 标签覆盖情况');
      lines.push('');
      for (const tag of coveredTagSet) {
        const relatedTopics = [];
        for (const t of (result.topics || [])) {
          if (t.addressed && t.matchingTags && t.matchingTags.includes(tag)) {
            relatedTopics.push(t.question);
          }
        }
        if (relatedTopics.length > 0) {
          lines.push(`- ✅ **${tag}**: 已覆盖 ${relatedTopics.join('、')}`);
        }
      }
      const allTags = new Set();
      for (const f of tagged) allTags.add(f.tag);
      const uncoveredTags = Array.from(allTags).filter(t => !coveredTagSet.has(t));
      for (const tag of uncoveredTags) {
        lines.push(`- ⏳ **${tag}**: 暂未覆盖主要质疑`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);

  return lines.join('\n');
}

function formatMarkdownBrief(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const ea = result.emotionAnalysis;
  const lines = [];
  lines.push(`# 舆情快报 · ${result.eventName || '未命名事件'}`);
  lines.push('');
  lines.push(`> ${now} · 评论 ${result.commentCount} 条`);
  lines.push('');
  lines.push('## 情绪概览');
  lines.push(`| 愤怒 | 担忧 | 求证 | 围观 |`);
  lines.push(`| ---- | ---- | ---- | ---- |`);
  lines.push(`| ${ea.percentages.anger}% | ${ea.percentages.worry}% | ${ea.percentages.verify}% | ${ea.percentages.onlook}% |`);
  lines.push('');
  lines.push(result.emotionOverview);
  lines.push('');
  lines.push('## 主要质疑');
  lines.push('');
  const unaddressed = result.doubts.filter(d => !d.includes('[已回应]')).slice(0, 3);
  for (let i = 0; i < unaddressed.length; i++) {
    const clean = unaddressed[i]
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/\n\s+/g, ' / ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    lines.push(`${i + 1}. ${clean}`);
  }
  lines.push('');
  lines.push('## 回应优先级');
  lines.push('');
  const priorities = result.priority.filter(p => p.startsWith('→')).slice(0, 3);
  for (const p of priorities) {
    lines.push(`- ${p}`);
  }
  if (result.trend && result.trend.summary) {
    lines.push('');
    lines.push('## 趋势');
    lines.push(result.trend.summary);
  }
  lines.push('');
  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);
  return lines.join('\n');
}

function formatMarkdownPriority(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  lines.push(`# 回应建议 · ${result.eventName || '未命名事件'}`);
  lines.push('');
  lines.push(`> ${now} · 评论 ${result.commentCount} 条`);
  lines.push('');
  for (const p of result.priority) {
    lines.push(`- ${p}`);
  }
  if (result.trend && result.trend.summary) {
    lines.push('');
    lines.push(`**趋势提示**: ${result.trend.summary}`);
  }
  lines.push('');
  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);
  return lines.join('\n');
}

function formatCompareReport(compareResult, eventName) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  复盘对比 · ${eventName || '事件'}`);
  lines.push(`  ${now}`);
  lines.push(DOUBLE_DIVIDER);
  lines.push('');
  lines.push(`  前期评论: ${compareResult.commentCountBefore} 条 → 本期: ${compareResult.commentCountAfter} 条`);
  lines.push(`  ${compareResult.summary}`);
  lines.push('');

  if (compareResult.emotionChanges.length > 0) {
    lines.push(DIVIDER);
    lines.push('  情绪变化');
    lines.push(DIVIDER);
    for (const e of compareResult.emotionChanges) {
      const arrow = e.diff > 0 ? '↑' : '↓';
      lines.push(`  ${arrow} ${e.label}: ${e.before}% → ${e.after}% (${e.diff > 0 ? '+' : ''}${e.diff}%)`);
    }
    lines.push('');
  }

  if (compareResult.escalatedTopics.length > 0) {
    lines.push(DIVIDER);
    lines.push('  质疑升温');
    lines.push(DIVIDER);
    for (const t of compareResult.escalatedTopics) {
      lines.push(`  ↑ ${t.question}: ${t.beforeHits}条 → ${t.afterHits}条`);
    }
    lines.push('');
  }

  if (compareResult.newTopics.length > 0) {
    lines.push(DIVIDER);
    lines.push('  新增高频问题');
    lines.push(DIVIDER);
    for (const t of compareResult.newTopics) {
      lines.push(`  + ${t.question}（${t.hits.length}条相关）`);
    }
    lines.push('');
  }

  if (compareResult.resolvedTopics.length > 0) {
    lines.push(DIVIDER);
    lines.push('  已消退质疑');
    lines.push(DIVIDER);
    for (const t of compareResult.resolvedTopics) {
      lines.push(`  - ${t.question}`);
    }
    lines.push('');
  }

  lines.push(DOUBLE_DIVIDER);
  return lines.join('\n');
}

function formatCompareMarkdown(compareResult, eventName) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  lines.push(`# 复盘对比 · ${eventName || '事件'}`);
  lines.push('');
  lines.push(`> ${now} | 前期 ${compareResult.commentCountBefore} 条 → 本期 ${compareResult.commentCountAfter} 条`);
  lines.push('');
  lines.push(compareResult.summary);
  lines.push('');
  if (compareResult.emotionChanges.length > 0) {
    lines.push('## 情绪变化');
    lines.push('');
    lines.push('| 情绪 | 前期 | 本期 | 变化 |');
    lines.push('| ---- | ---- | ---- | ---- |');
    for (const e of compareResult.emotionChanges) {
      lines.push(`| ${e.label} | ${e.before}% | ${e.after}% | ${e.diff > 0 ? '+' : ''}${e.diff}% |`);
    }
    lines.push('');
  }
  if (compareResult.escalatedTopics.length > 0) {
    lines.push('## 质疑升温');
    lines.push('');
    for (const t of compareResult.escalatedTopics) {
      lines.push(`- **${t.question}**: ${t.beforeHits}条 → ${t.afterHits}条`);
    }
    lines.push('');
  }
  if (compareResult.newTopics.length > 0) {
    lines.push('## 新增高频问题');
    lines.push('');
    for (const t of compareResult.newTopics) {
      lines.push(`- ${t.question}（${t.hits.length}条相关）`);
    }
    lines.push('');
  }
  if (compareResult.resolvedTopics.length > 0) {
    lines.push('## 已消退质疑');
    lines.push('');
    for (const t of compareResult.resolvedTopics) {
      lines.push(`- ~~${t.question}~~`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);
  return lines.join('\n');
}

function formatMultiTimeCompare(multiResult, eventName) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push(DOUBLE_DIVIDER);
  lines.push(`  多时段复盘 · ${eventName || '事件'}`);
  lines.push(`  ${now}`);
  lines.push(DOUBLE_DIVIDER);
  lines.push('');
  lines.push(`  ${multiResult.summary}`);
  lines.push('');

  lines.push(DIVIDER);
  lines.push('  情绪变化时间线');
  lines.push(DIVIDER);
  const labels = multiResult.emotionsByTime.map(e => e.label);
  const maxLabelLen = Math.max(...labels.map(l => l.length));
  lines.push(`  ${'时段'.padEnd(maxLabelLen + 2)} | 愤怒 | 担忧 | 求证 | 围观 | 评论数`);
  lines.push(`  ${'─'.repeat(maxLabelLen + 2)}─┼──────┼──────┼──────┼──────┼────────`);
  for (const e of multiResult.emotionsByTime) {
    lines.push(`  ${e.label.padEnd(maxLabelLen + 2)} | ${String(e.anger).padStart(3)}% | ${String(e.worry).padStart(3)}% | ${String(e.verify).padStart(3)}% | ${String(e.onlook).padStart(3)}% | ${String(e.commentCount).padStart(5)}条`);
  }
  lines.push('');

  if (multiResult.risingEmotions.length > 0) {
    lines.push(DIVIDER);
    lines.push('  持续升温情绪');
    lines.push(DIVIDER);
    for (const e of multiResult.risingEmotions) {
      const trend = e.values.map(v => `${v}%`).join(' → ');
      lines.push(`  ↑ ${e.label}: ${trend} (+${e.diff}%)`);
    }
    lines.push('');
  }

  if (multiResult.risingTopics.length > 0) {
    lines.push(DIVIDER);
    lines.push('  持续升温质疑');
    lines.push(DIVIDER);
    for (const t of multiResult.risingTopics.slice(0, 5)) {
      const trend = t.heats.map(h => `${h}条`).join(' → ');
      const peak = t.peakHeat > t.lastHeat ? ` (峰值 ${t.peakLabel} ${t.peakHeat}条)` : '';
      lines.push(`  ↑ ${t.question}: ${trend}${peak}`);
    }
    lines.push('');
  }

  if (multiResult.timeline.length > 0) {
    lines.push(DIVIDER);
    lines.push('  相邻时段对比');
    lines.push(DIVIDER);
    for (const tl of multiResult.timeline) {
      lines.push(`  ${tl.fromLabel} → ${tl.toLabel}:`);
      lines.push(`    ${tl.compare.summary}`);
    }
    lines.push('');
  }

  lines.push(DOUBLE_DIVIDER);
  return lines.join('\n');
}

function formatMultiTimeMarkdown(multiResult, eventName) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push(`# 多时段复盘 · ${eventName || '事件'}`);
  lines.push('');
  lines.push(`> ${now} | ${multiResult.summary}`);
  lines.push('');

  lines.push('## 情绪变化时间线');
  lines.push('');
  lines.push('| 时段 | 愤怒 | 担忧 | 求证 | 围观 | 评论数 |');
  lines.push('| ---- | ---- | ---- | ---- | ---- | ------ |');
  for (const e of multiResult.emotionsByTime) {
    lines.push(`| ${e.label} | ${e.anger}% | ${e.worry}% | ${e.verify}% | ${e.onlook}% | ${e.commentCount}条 |`);
  }
  lines.push('');

  if (multiResult.risingEmotions.length > 0) {
    lines.push('## 持续升温情绪');
    lines.push('');
    for (const e of multiResult.risingEmotions) {
      const trend = e.values.map(v => `${v}%`).join(' → ');
      lines.push(`- **${e.label}**: ${trend} (+${e.diff}%)`);
    }
    lines.push('');
  }

  if (multiResult.risingTopics.length > 0) {
    lines.push('## 持续升温质疑');
    lines.push('');
    for (const t of multiResult.risingTopics.slice(0, 5)) {
      const trend = t.heats.map(h => `${h}条`).join(' → ');
      const peak = t.peakHeat > t.lastHeat ? ` *(${t.peakLabel} 峰值 ${t.peakHeat}条)*` : '';
      lines.push(`- **${t.question}**: ${trend}${peak}`);
    }
    lines.push('');
  }

  if (multiResult.timeline.length > 0) {
    lines.push('## 相邻时段对比');
    lines.push('');
    for (const tl of multiResult.timeline) {
      lines.push(`### ${tl.fromLabel} → ${tl.toLabel}`);
      lines.push('');
      lines.push(tl.compare.summary);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);
  return lines.join('\n');
}

function exportReport(result, format, outputDir, mode) {
  const fmt = (format || 'txt').toLowerCase();
  const exportMode = mode || 'full';
  const dir = outputDir || process.cwd();
  const now = new Date();
  const ts = timestampForFile(now);
  const safeName = sanitizeFilename(result.eventName || 'crisis_report');
  const ext = fmt === 'md' || fmt === 'markdown' ? 'md' : 'txt';

  let modeSuffix = '';
  if (exportMode === 'brief') modeSuffix = '_简版';
  if (exportMode === 'priority') modeSuffix = '_建议';

  const filename = `舆情_${safeName}${modeSuffix}_${ts}.${ext}`;
  const fullPath = path.join(dir, filename);

  let content;
  if (ext === 'md') {
    content = formatMarkdown(result, exportMode);
  } else {
    content = formatReport(result, exportMode);
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, 'utf-8');
  return { path: fullPath, filename, format: ext, mode: exportMode, size: content.length };
}

module.exports = {
  formatReport,
  formatBrief,
  formatPriorityOnly,
  formatBriefUpdate,
  formatMarkdown,
  formatMarkdownBrief,
  formatMarkdownPriority,
  formatCompareReport,
  formatCompareMarkdown,
  formatMultiTimeCompare,
  formatMultiTimeMarkdown,
  exportReport,
  timestampForFile,
  sanitizeFilename,
  buildFileStatsLine
};
