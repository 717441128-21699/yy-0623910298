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

function formatReport(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
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

  if (result.supplementaryFacts && result.supplementaryFacts.length > 0) {
    lines.push(DIVIDER);
    lines.push('  附：已录入补充事实');
    lines.push(DIVIDER);
    for (let i = 0; i < result.supplementaryFacts.length; i++) {
      lines.push(`  ${i + 1}. ${result.supplementaryFacts[i]}`);
    }
    lines.push('');
  }

  lines.push(DOUBLE_DIVIDER);
  lines.push('  提示: 输入补充事实可重新生成建议；输入 /save txt 或 /save md 可导出报告；直接回车退出');
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
  lines.push(DOUBLE_DIVIDER);
  return lines.join('\n');
}

function formatMarkdown(result) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
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

  if (result.supplementaryFacts && result.supplementaryFacts.length > 0) {
    lines.push('## 附：已录入补充事实');
    lines.push('');
    for (let i = 0; i < result.supplementaryFacts.length; i++) {
      lines.push(`${i + 1}. ${result.supplementaryFacts[i]}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*由 CrisisPulse 于 ${now} 生成*`);

  return lines.join('\n');
}

function exportReport(result, format, outputDir) {
  const fmt = (format || 'txt').toLowerCase();
  const dir = outputDir || process.cwd();
  const now = new Date();
  const ts = timestampForFile(now);
  const safeName = sanitizeFilename(result.eventName || 'crisis_report');
  const ext = fmt === 'md' || fmt === 'markdown' ? 'md' : 'txt';
  const filename = `舆情_${safeName}_${ts}.${ext}`;
  const fullPath = path.join(dir, filename);

  let content;
  if (ext === 'md') {
    content = formatMarkdown(result);
  } else {
    content = formatReport(result);
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, 'utf-8');
  return { path: fullPath, filename, format: ext, size: content.length };
}

module.exports = {
  formatReport,
  formatBriefUpdate,
  formatMarkdown,
  exportReport,
  timestampForFile,
  sanitizeFilename
};
