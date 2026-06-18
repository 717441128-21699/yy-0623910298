#!/usr/bin/env node
'use strict';

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const {
  runAnalysis,
  compareAnalysis,
  getEscalationLevel,
  buildHandoverPackage,
  parseBatchConfig,
  runBatchAnalysis,
  exportBatchReport,
  generateBatchSummary,
  parseTaggedFact,
  FACT_TAGS
} = require('./analyzer');
const {
  formatReport,
  formatBriefUpdate,
  formatCompareReport,
  formatCompareMarkdown,
  exportReport
} = require('./report');

let VERSION = 'v1.3';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  VERSION = `v${pkg.version}`;
} catch (e) {}

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

function listFacts(facts) {
  if (!facts || facts.length === 0) {
    console.log('  (暂无已录入事实)');
    return;
  }
  const tagged = facts.filter(f => typeof f !== 'string' && f.tag);
  const untagged = facts.filter(f => typeof f === 'string' || !f.tag);
  if (tagged.length > 0) {
    const groups = {};
    for (const f of tagged) {
      const tag = f.tag || '未分类';
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(f);
    }
    for (const [tag, items] of Object.entries(groups)) {
      console.log(`  [${tag}]`);
      for (const f of items) {
        const idx = facts.indexOf(f) + 1;
        console.log(`    ${idx}. ${f.text}`);
      }
    }
  }
  if (untagged.length > 0) {
    console.log('  [未标签]');
    for (const f of untagged) {
      const idx = facts.indexOf(f) + 1;
      const text = typeof f === 'string' ? f : f.text;
      console.log(`    ${idx}. ${text}`);
    }
  }
  console.log(`  共 ${facts.length} 条`);
  const tagCoverage = buildTagCoverage(facts);
  if (Object.keys(tagCoverage).length > 0) {
    console.log('');
    console.log('  标签覆盖情况:');
    for (const [tag, info] of Object.entries(tagCoverage)) {
      const status = info.covered ? '✓' : '✗';
      console.log(`    ${status} ${tag}: ${info.topics.join('、') || '无关联质疑'}`);
    }
  }
}

function buildTagCoverage(facts) {
  const { TOPIC_PATTERNS, EMOTION_CATEGORIES } = require('./analyzer');
  const tagged = facts.filter(f => typeof f !== 'string' && f.tag);
  const coverage = {};
  for (const [tagName, tagPattern] of Object.entries(FACT_TAGS)) {
    const relatedTopics = [];
    let hasCoverage = false;
    for (const tp of TOPIC_PATTERNS) {
      if (tagPattern.test(tp.question) || tagPattern.test(tp.label)) {
        const isCovered = tagged.some(f => f.tag === tagName && tp.pattern.test(f.text));
        if (isCovered) {
          hasCoverage = true;
          relatedTopics.push(tp.question);
        } else {
          relatedTopics.push(tp.question);
        }
      }
    }
    if (relatedTopics.length > 0) {
      coverage[tagName] = { covered: hasCoverage, topics: relatedTopics };
    }
  }
  return coverage;
}

async function runBatchMode() {
  console.log('');
  console.log('═'.repeat(52));
  console.log(`  CrisisPulse · 批量日报模式 ${VERSION}`);
  console.log('═'.repeat(52));
  console.log('');

  const configPath = await question('  批量配置文件路径: ');
  if (!configPath.trim()) {
    console.log('  路径不能为空，退出。');
    return;
  }

  let events;
  try {
    events = parseBatchConfig(configPath.trim());
  } catch (e) {
    console.log(`  ✗ 读取配置失败: ${e.message}`);
    return;
  }

  if (events.length === 0) {
    console.log('  ✗ 配置中未解析到有效事件。请检查格式：事件名称|时间范围|文件1,文件2');
    return;
  }

  console.log(`  ✓ 已读取 ${events.length} 个事件配置:`);
  for (const ev of events) {
    console.log(`    · ${ev.name}  [${ev.timeRange || '全部时间'}]  ${ev.filePaths.length} 份文件`);
  }
  console.log('');

  const outputDirInput = await question('  输出目录 (留空为当前目录): ');
  const outputDir = outputDirInput.trim() || process.cwd();

  console.log('');
  console.log('  正在批量分析...');
  const batchResult = runBatchAnalysis(events, outputDir);

  console.log('');
  if (batchResult.results.length > 0) {
    console.log(`  ✓ 成功分析 ${batchResult.results.length} 个事件`);
  }
  if (batchResult.errors.length > 0) {
    console.log(`  ✗ ${batchResult.errors.length} 个事件失败`);
    for (const e of batchResult.errors) {
      console.log(`    · ${e.event}: ${e.error}`);
    }
  }

  const summaryFiles = exportBatchReport(batchResult, outputDir);
  console.log('');
  console.log(`  ✓ 汇总报告已导出:`);
  console.log(`    ${summaryFiles.txt.filename}`);
  console.log(`    ${summaryFiles.md.filename}`);

  console.log('');
  const handoverInput = await question('  是否生成交班包？(y/n，默认y): ');
  if (handoverInput.trim().toLowerCase() !== 'n') {
    const pkg = buildHandoverPackage(batchResult, configPath.trim());
    console.log('');
    console.log(pkg.handoverSummary);
    console.log(`  ✓ 交班包清单已保存: ${pkg.manifestPath}`);
  }

  console.log('');
  console.log('  批量处理完成，所有文件已保存到指定目录。');
  console.log('');
}

function parseSaveCommand(input) {
  const parts = input.split(/\s+/);
  let format = 'txt';
  let mode = 'full';
  let outputDir = process.cwd();
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    if (p === 'txt' || p === 'md' || p === 'markdown') {
      format = p === 'markdown' ? 'md' : p;
    } else if (p === 'full' || p === 'brief' || p === 'priority') {
      mode = p;
    } else if (p.length > 0) {
      outputDir = parts[i];
    }
  }
  return { format, mode, outputDir };
}

async function runSingleMode() {
  console.log('');
  console.log('═'.repeat(52));
  console.log(`  CrisisPulse · 舆情危机快速分析工具 ${VERSION}`);
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
  let previousResult = null;

  while (true) {
    console.log('');
    const rawInput = await question('  > 补充事实 或 命令: ');
    const input = rawInput.trim();

    if (!input) {
      break;
    }

    const lower = input.toLowerCase();
    if (lower === '/quit' || lower === '/q' || lower === 'quit' || lower === 'exit') {
      break;
    }

    if (lower === '/batch') {
      await runBatchMode();
      continue;
    }

    if (lower === '/facts' || lower === '/list') {
      listFacts(supplementaryFacts);
      continue;
    }

    if (lower.startsWith('/diff') || lower.startsWith('/compare')) {
      const parts = input.split(/\s+/);
      if (parts.length >= 2) {
        const beforePaths = parseFilePaths(parts.slice(1).join(' '));
        if (beforePaths.length === 0) {
          console.log('  请提供前期评论文件路径。');
          continue;
        }
        try {
          previousResult = runAnalysis(eventName.trim(), timeRange.trim(), beforePaths, []);
          console.log(`  ✓ 已设置对比基准 (${previousResult.commentCount} 条评论)`);
          console.log('  再次输入 /diff 即可与当前分析结果对比。');
        } catch (err) {
          console.log(`  ✗ 读取前期文件失败: ${err.message}`);
        }
        continue;
      }
      if (!previousResult) {
        console.log('  尚未设置对比基准。请先使用 /diff 前期文件路径 设置基准。');
        console.log('  用法: /diff 前期评论文件路径[,文件2,...]');
        continue;
      }
      try {
        const compareResult = compareAnalysis(previousResult, result);
        console.log(formatCompareReport(compareResult, eventName.trim()));

        const exportDiff = await question('  是否导出对比报告？(y/n，默认n): ');
        if (exportDiff.trim().toLowerCase() === 'y') {
          const dirInput = await question('  保存目录 (留空为当前目录): ');
          const dir = dirInput.trim() || process.cwd();
          const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
          const safeName = eventName.trim().replace(/[\\/:*?"<>|]/g, '_');
          const txtPath = path.join(dir, `复盘对比_${safeName}_${ts}.txt`);
          const mdPath = path.join(dir, `复盘对比_${safeName}_${ts}.md`);
          fs.writeFileSync(txtPath, formatCompareReport(compareResult, eventName.trim()), 'utf-8');
          fs.writeFileSync(mdPath, formatCompareMarkdown(compareResult, eventName.trim()), 'utf-8');
          console.log(`  ✓ 已导出: ${path.basename(txtPath)} / ${path.basename(mdPath)}`);
        }
      } catch (err) {
        console.log(`  ✗ 对比失败: ${err.message}`);
      }
      continue;
    }

    if (lower === '/undo' || lower === '/pop') {
      if (supplementaryFacts.length === 0) {
        console.log('  （事实列表为空，无法撤回）');
      } else {
        const popped = supplementaryFacts.pop();
        const poppedText = typeof popped === 'string' ? popped : popped.text;
        console.log(`  ✓ 已撤回: ${poppedText}`);
        try {
          const updated = runAnalysis(eventName.trim(), timeRange.trim(), filePaths, supplementaryFacts);
          result = updated;
          console.log(formatBriefUpdate(updated));
        } catch (err) {
          console.log(`  错误: ${err.message}`);
        }
      }
      continue;
    }

    if (lower.startsWith('/replace')) {
      const match = input.match(/^\/replace\s+(\d+)\s+(.*)$/i);
      if (!match) {
        console.log('  格式错误，应为: /replace N 新内容');
        console.log('  例: /replace 2 伤亡数字已核实为5人，数据准确');
        continue;
      }
      const idx = parseInt(match[1], 10) - 1;
      const newContent = match[2].trim();
      if (idx < 0 || idx >= supplementaryFacts.length) {
        console.log(`  索引超出范围，当前共 ${supplementaryFacts.length} 条，可输入 /facts 查看`);
        continue;
      }
      const old = supplementaryFacts[idx];
      const oldText = typeof old === 'string' ? old : old.text;
      const tagged = parseTaggedFact(newContent);
      supplementaryFacts[idx] = tagged;
      console.log(`  ✓ 已替换第 ${idx + 1} 条:`);
      console.log(`    旧: ${oldText}`);
      console.log(`    新: ${tagged.text}${tagged.tag ? ` [${tagged.tag}]` : ''}`);
      try {
        const updated = runAnalysis(eventName.trim(), timeRange.trim(), filePaths, supplementaryFacts);
        result = updated;
        console.log(formatBriefUpdate(updated));
      } catch (err) {
        console.log(`  错误: ${err.message}`);
      }
      continue;
    }

    if (lower.startsWith('/reset') || lower.startsWith('/clear')) {
      if (supplementaryFacts.length === 0) {
        console.log('  事实列表已为空。');
      } else {
        supplementaryFacts.length = 0;
        console.log('  ✓ 已清空所有补充事实。');
        try {
          const updated = runAnalysis(eventName.trim(), timeRange.trim(), filePaths, supplementaryFacts);
          result = updated;
          console.log(formatBriefUpdate(updated));
        } catch (err) {
          console.log(`  错误: ${err.message}`);
        }
      }
      continue;
    }

    if (lower.startsWith('/tag')) {
      const tagContent = input.replace(/^\/tag\s+/i, '');
      if (!tagContent.trim()) {
        console.log('  可用标签:');
        for (const [tag, pattern] of Object.entries(FACT_TAGS)) {
          console.log(`    #${tag}`);
        }
        console.log('  也可使用自定义标签: /tag #自定义标签 事实内容');
        continue;
      }
      const tagged = parseTaggedFact(tagContent.startsWith('#') ? tagContent : `#未分类 ${tagContent}`);
      supplementaryFacts.push(tagged);
      console.log(`  ✓ 已添加: ${tagged.text} [${tagged.tag}]`);
      try {
        const updated = runAnalysis(eventName.trim(), timeRange.trim(), filePaths, supplementaryFacts);
        result = updated;
        console.log(formatBriefUpdate(updated));
      } catch (err) {
        console.log(`  错误: ${err.message}`);
      }
      continue;
    }

    if (lower.startsWith('/save')) {
      const opts = parseSaveCommand(input);
      let displayMode = '完整报告';
      if (opts.mode === 'brief') displayMode = '简版快报';
      if (opts.mode === 'priority') displayMode = '仅回应建议';
      try {
        const info = exportReport(result, opts.format, opts.outputDir, opts.mode);
        console.log(`  ✓ 已导出 ${displayMode}: ${info.filename} (${info.size} 字节)`);
        console.log(`    完整路径: ${info.path}`);
      } catch (err) {
        console.log(`  ✗ 导出失败: ${err.message}`);
      }
      continue;
    }

    if (lower === '/help' || lower === '/h' || lower === 'help') {
      console.log('  可用命令:');
      console.log('    /facts  /list              查看已录入事实列表（按标签分组）');
      console.log('    /tag #标签 内容            添加带标签的补充事实');
      console.log('    /tag                       查看可用标签列表');
      console.log('    /undo   /pop               撤回最后一条事实并重新分析');
      console.log('    /replace N 新内容          替换第 N 条事实并重新分析');
      console.log('    /reset  /clear             清空所有补充事实');
      console.log('    /diff 前期文件路径         设置对比基准（如昨天的评论文件）');
      console.log('    /diff                      与当前结果对比（设置基准后）');
      console.log('    /save [txt|md] [full|brief|priority] [目录]');
      console.log('                                导出报告 (full完整, brief简版, priority仅建议)');
      console.log('    /batch                     切换到批量日报模式');
      console.log('    /quit  /q                  退出程序');
      console.log('    /help  /h                  显示帮助');
      console.log('    直接输入文字                作为补充事实重新生成报告');
      console.log('    #标签 内容                 快捷方式：直接添加带标签的事实');
      continue;
    }

    if (lower.startsWith('/')) {
      console.log(`  未知命令: ${input}，输入 /help 查看帮助`);
      continue;
    }

    const tagged = parseTaggedFact(input);
    supplementaryFacts.push(tagged);
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

    const modeInput = await question('  导出内容 (1=完整报告, 2=简版快报, 3=仅回应建议，默认1): ');
    let mode = 'full';
    if (modeInput.trim() === '2') mode = 'brief';
    if (modeInput.trim() === '3') mode = 'priority';

    const dirInput = await question('  保存目录 (留空为当前目录): ');
    try {
      const info = exportReport(result, fmt, dirInput.trim() || process.cwd(), mode);
      const modeLabel = mode === 'full' ? '完整报告' : mode === 'brief' ? '简版快报' : '回应建议';
      console.log(`  ✓ 已导出 ${modeLabel}: ${info.filename}`);
      console.log(`    路径: ${info.path}`);
    } catch (err) {
      console.log(`  ✗ 导出失败: ${err.message}`);
    }
  }

  console.log('');
  console.log('  分析结束。报告可直接复制至日报。');
  console.log('');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--batch') || argv.includes('-b')) {
    await runBatchMode();
    rl.close();
    return;
  }

  await runSingleMode();
  rl.close();
}

main().catch(err => {
  console.error('  运行出错:', err.message);
  rl.close();
  process.exit(1);
});
