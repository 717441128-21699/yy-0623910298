'use strict';

const DIVIDER = '─'.repeat(52);
const DOUBLE_DIVIDER = '═'.repeat(52);

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

  lines.push(DOUBLE_DIVIDER);
  lines.push('  提示: 输入补充事实可重新生成建议 (输入事实后回车，直接回车结束)');
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

module.exports = { formatReport, formatBriefUpdate };
