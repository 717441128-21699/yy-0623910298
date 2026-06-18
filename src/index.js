#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { runAnalysis } = require('./analyzer');
const { formatReport, formatBriefUpdate } = require('./report');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('');
  console.log('═'.repeat(52));
  console.log('  CrisisPulse · 舆情危机快速分析工具');
  console.log('═'.repeat(52));
  console.log('');

  const eventName = await question('  请输入事件名称: ');
  if (!eventName.trim()) {
    console.log('  事件名称不能为空，退出。');
    rl.close();
    return;
  }

  const timeRange = await question('  时间范围 (如 2025-06-01~2025-06-15，可留空): ');
  const filePath = await question('  评论文件路径: ');

  if (!filePath.trim()) {
    console.log('  文件路径不能为空，退出。');
    rl.close();
    return;
  }

  let result;
  try {
    result = runAnalysis(eventName.trim(), timeRange.trim(), filePath.trim(), []);
  } catch (err) {
    console.log(`  错误: ${err.message}`);
    rl.close();
    return;
  }

  console.log('');
  console.log(formatReport(result));

  const supplementaryFacts = [];

  while (true) {
    console.log('');
    const fact = await question('  补充事实 (直接回车退出): ');
    if (!fact.trim()) {
      break;
    }
    supplementaryFacts.push(fact.trim());

    try {
      const updated = runAnalysis(
        eventName.trim(),
        timeRange.trim(),
        filePath.trim(),
        supplementaryFacts
      );
      console.log(formatBriefUpdate(updated));
    } catch (err) {
      console.log(`  错误: ${err.message}`);
    }
  }

  console.log('');
  console.log('  分析结束。报告可直接复制至日报。');
  console.log('');
  rl.close();
}

main().catch(err => {
  console.error('  运行出错:', err.message);
  rl.close();
  process.exit(1);
});
