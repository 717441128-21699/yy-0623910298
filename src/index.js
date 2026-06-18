#!/usr/bin/env node
'use strict';

const readline = require('readline');
const path = require('path');
const { runAnalysis } = require('./analyzer');
const { formatReport, formatBriefUpdate, exportReport } = require('./report');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function parseFilePaths(input) {
  if (!input || !input.trim()) return [];
  const trimmed = input.trim();
  let parts;
  if (trimmed.includes(',')) {
    parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  } else if (trimmed.includes(';')) {
    parts = trimmed.split(';').map(s => s.trim()).filter(Boolean);
  } else {
    parts = trimmed.split(/\s+/).filter(Boolean);
  }
  return parts.map(p => {
    if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
    if (p.startsWith("'") && p.endsWith("'")) return p.slice(1, -1);
    return p;
  });
}

async function main() {
  console.log('');
  console.log('═'.repeat(52));
  console.log('  CrisisPulse · 舆情危机快速分析工具 v1.1');
  console.log('═'.repeat(52));
  console.log('');

  const eventName = await question('  请输入事件名称: ');
  if (!eventName.trim()) {
    console.log('  事件名称不能为空，退出。');
    rl.close();
    return;
  }

  const timeRange = await question('  时间范围 (如 2025-06-01~2025-06-15，可留空): ');
  const fileInput = await question('  评论文件路径 (多文件用空格/逗号/分号分隔): ');

  const filePaths = parseFilePaths(fileInput);
  if (filePaths.length === 0) {
    console.log('  文件路径不能为空，退出。');
    rl.close();
    return;
  }

  let result;
  try {
    result = runAnalysis(eventName.trim(), timeRange.trim(), filePaths, []);
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
    const rawInput = await question('  > 补充事实 或 命令 (/save txt, /save md, /quit): ');
    const input = rawInput.trim();

    if (!input) {
      break;
    }

    const lower = input.toLowerCase();
    if (lower === '/quit' || lower === '/q' || lower === 'quit' || lower === 'exit') {
      break;
    }

    if (lower.startsWith('/save')) {
      const parts = input.split(/\s+/);
      const fmt = (parts[1] || 'txt').toLowerCase();
      const outputDir = parts[2] || process.cwd();
      try {
        const info = exportReport(result, fmt, outputDir);
        console.log(`  ✓ 已导出: ${info.filename} (${info.size} 字节)`);
        console.log(`    完整路径: ${info.path}`);
      } catch (err) {
        console.log(`  ✗ 导出失败: ${err.message}`);
      }
      continue;
    }

    if (lower === '/help' || lower === '/h' || lower === 'help') {
      console.log('  可用命令:');
      console.log('    /save [txt|md] [目录]  导出报告（默认 txt，当前目录）');
      console.log('    /quit  /q              退出程序');
      console.log('    /help  /h              显示帮助');
      console.log('    直接输入文字           作为补充事实重新生成报告');
      continue;
    }

    if (lower.startsWith('/')) {
      console.log(`  未知命令: ${input}，输入 /help 查看帮助`);
      continue;
    }

    supplementaryFacts.push(input);
    try {
      const updated = runAnalysis(
        eventName.trim(),
        timeRange.trim(),
        filePaths,
        supplementaryFacts
      );
      result = updated;
      console.log(formatBriefUpdate(updated));
    } catch (err) {
      console.log(`  错误: ${err.message}`);
    }
  }

  console.log('');
  const saveConfirm = await question('  是否导出日报？(y/n，默认n): ');
  if (saveConfirm.trim().toLowerCase() === 'y') {
    const fmtInput = await question('  导出格式 (txt/md，默认txt): ');
    const fmt = (fmtInput.trim().toLowerCase() === 'md') ? 'md' : 'txt';
    const dirInput = await question('  保存目录 (留空为当前目录): ');
    try {
      const info = exportReport(result, fmt, dirInput.trim() || process.cwd());
      console.log(`  ✓ 已导出: ${info.filename}`);
      console.log(`    路径: ${info.path}`);
    } catch (err) {
      console.log(`  ✗ 导出失败: ${err.message}`);
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
