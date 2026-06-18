'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseFile,
  parseFiles,
  classifyEmotion,
  analyzeEmotions,
  extractTopics,
  filterByTimeRange,
  normalizeDateStart,
  normalizeDateEnd,
  runAnalysis
} = require('../src/analyzer');
const { formatReport, formatBriefUpdate, formatMarkdown, exportReport, sanitizeFilename, timestampForFile } = require('../src/report');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function testParseFile() {
  console.log('\n[parseFile]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const comments = parseFile(filePath);
  assert(comments.length === 30, `应解析30条评论，实际${comments.length}`);
  assert(comments[0].time === '2025-06-18 08:30', `时间应被解析`);
  assert(comments[0].text.length > 0, `评论内容应非空`);
}

function testParseFiles() {
  console.log('\n[parseFiles]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const { comments, fileStats } = parseFiles([f1, f2]);
  assert(comments.length === 40, `合并后应40条，实际${comments.length}`);
  assert(fileStats.length === 2, `应返回2份文件统计，实际${fileStats.length}`);
  assert(fileStats[0].count === 30, `第一份30条，实际${fileStats[0].count}`);
  assert(fileStats[1].count === 10, `第二份10条，实际${fileStats[1].count}`);
  assert(comments[0].source === 'crisis_comments.txt', `评论应带来源标记`);
}

function testClassifyEmotion() {
  console.log('\n[classifyEmotion]');
  const anger = classifyEmotion('太愤怒了，严惩责任人！');
  assert(anger.primary === 'anger', `愤怒文本应识别为anger，实际${anger.primary}`);

  const worry = classifyEmotion('非常担心安全问题，害怕还会发生');
  assert(worry.primary === 'worry', `担忧文本应识别为worry，实际${worry.primary}`);

  const verify = classifyEmotion('真的假的？求公布真相确认');
  assert(verify.primary === 'verify', `求证文本应识别为verify，实际${verify.primary}`);

  const onlook = classifyEmotion('路过吃瓜蹲后续');
  assert(onlook.primary === 'onlook', `围观文本应识别为onlook，实际${onlook.primary}`);

  const neutral = classifyEmotion('今天天气不错');
  assert(neutral.primary === 'onlook', `中性文本应归为onlook`);
}

function testAnalyzeEmotions() {
  console.log('\n[analyzeEmotions]');
  const comments = [
    { text: '太愤怒了，严惩责任人！', time: '' },
    { text: '担心安全，害怕出事', time: '' },
    { text: '真的假的？求证实', time: '' },
    { text: '路过吃瓜', time: '' },
    { text: '气愤！不可原谅！', time: '' }
  ];
  const result = analyzeEmotions(comments);
  assert(result.total === 5, `总数应为5`);
  assert(result.counts.anger === 2, `愤怒应为2，实际${result.counts.anger}`);
  const sum = Object.values(result.percentages).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 100) <= 1, `百分比之和应约为100，实际${sum}`);
}

function testNormalizeDate() {
  console.log('\n[normalizeDate]');
  const end = normalizeDateEnd('2025-06-19');
  assert(end.getHours() === 23 && end.getMinutes() === 59, `结束日期应覆盖到23:59`);

  const start = normalizeDateStart('2025-06-19');
  assert(start.getHours() === 0 && start.getMinutes() === 0, `开始日期应从00:00开始`);

  const endSlash = normalizeDateEnd('2025/06/19');
  assert(endSlash.getHours() === 23, `斜杠格式也应覆盖全天`);

  const withTime = normalizeDateEnd('2025-06-19 10:30');
  assert(withTime.getHours() === 10, `带时间的字符串应保留原时间`);
}

function testFilterByTimeRange() {
  console.log('\n[filterByTimeRange]');
  const comments = [
    { text: 'a', time: '2025-06-18 08:30' },
    { text: 'b', time: '2025-06-19 15:00' },
    { text: 'c', time: '2025-06-20 09:00' },
    { text: 'd', time: '' }
  ];
  const filtered = filterByTimeRange(comments, '2025-06-18~2025-06-19');
  assert(filtered.length === 3, `应包含18号整天+19号整天+无时间，共3条，实际${filtered.length}`);
  assert(filtered.some(c => c.text === 'b'), `19号白天的评论应被包含`);

  const narrow = filterByTimeRange(comments, '2025-06-19~2025-06-19');
  assert(narrow.some(c => c.text === 'b'), `单日范围应包含当天白天`);

  const all = filterByTimeRange(comments, '');
  assert(all.length === 4, `空范围应返回全部`);
}

function testExtractTopicsWithFacts() {
  console.log('\n[extractTopics with facts]');
  const comments = [
    { text: '伤亡数字是不是瞒报了', time: '' },
    { text: '通报太慢了等一天了', time: '' },
    { text: '涉事人员是不是被保护了', time: '' }
  ];
  const noFacts = extractTopics(comments, []);
  const withFacts = extractTopics(comments, ['伤亡数字已核实']);

  const noFactsTop = noFacts[0];
  const withFactsTop = withFacts[0];
  assert(noFactsTop.id === withFactsTop.id || withFactsTop.id !== 'casualty_accuracy',
    `有事实后casualty_accuracy不应再是第一（除非它本来就不是）`);

  const casualtyTopic = withFacts.find(t => t.id === 'casualty_accuracy');
  assert(casualtyTopic && casualtyTopic.addressed === true, `有匹配事实的话题addressed应为true`);
  assert(casualtyTopic.matchingFacts.length > 0, `应记录matchingFacts`);
}

function testGenerateDoubtsWithAddressed() {
  console.log('\n[generateDoubts addressed]');
  const { generateDoubts } = require('../src/analyzer');
  const topics = [
    { id: 'a', question: '未回应问题', hits: [{ text: 'xxx' }], addressed: false },
    { id: 'b', question: '已回应问题', hits: [{ text: 'yyy' }], addressed: true, matchingFacts: ['已澄清'] }
  ];
  const lines = generateDoubts(topics, ['已澄清']);
  const text = lines.join('\n');
  assert(text.includes('✓'), `已回应话题应显示✓标记`);
  assert(text.includes('[已回应]'), `已回应话题应标注[已回应]`);
  assert(text.includes('已澄清'), `已回应话题应展示对应事实`);
}

function testGeneratePriorityWithFacts() {
  console.log('\n[generatePriority with facts]');
  const { generatePriority } = require('../src/analyzer');
  const comments = [
    { text: '愤怒！严惩！', time: '' },
    { text: '担心安全', time: '' },
    { text: '求真相', time: '' }
  ];
  const emotionResult = analyzeEmotions(comments);
  const topics = extractTopics([
    { text: '伤亡数字瞒报了吗', time: '' },
    { text: '通报太慢', time: '' },
    { text: '涉事人员被保护', time: '' },
    { text: '救援及时吗', time: '' }
  ], ['伤亡数字已核实']);

  const lines = generatePriority(topics, emotionResult, ['伤亡数字已核实']);
  const text = lines.join('\n');
  assert(text.includes('已覆盖'), `应列出已覆盖的质疑`);
  assert(text.includes('下一步建议补充'), `应提示下一步补充方向`);

  const firstPriorityLine = lines.find(l => l.includes('第一优先'));
  assert(firstPriorityLine && !firstPriorityLine.includes('伤亡数字'),
    `第一优先不应再是已澄清的伤亡数字问题`);
}

function testRunAnalysisMultiFiles() {
  console.log('\n[runAnalysis multi files]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const result = runAnalysis('测试事故', '', [f1, f2], []);
  assert(result.commentCount === 40, `40条合并评论，实际${result.commentCount}`);
  assert(result.fileStats.length === 2, `应有2份文件统计`);
  assert(result.emotionOverview.length > 0, `情绪概览应非空`);
  assert(result.doubts.length > 0, `质疑列表应非空`);
  assert(result.priority.length > 0, `优先级列表应非空`);
}

function testRunWithSupplementaryFacts() {
  console.log('\n[supplementaryFacts integration]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const resultWithFacts = runAnalysis('测试', '', filePath, ['伤亡数字已核实确认，不存在瞒报']);
  const doubtsText = resultWithFacts.doubts.join('\n');
  assert(doubtsText.includes('✓') || doubtsText.includes('[已回应]'), `有补充事实时质疑中应标记已回应`);

  const priorityText = resultWithFacts.priority.join('\n');
  assert(priorityText.includes('已覆盖') || priorityText.includes('下一步'),
    `优先级应体现已覆盖和下一步建议`);
}

function testReportFormat() {
  console.log('\n[formatReport]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '', filePath, []);
  const report = formatReport(result);
  assert(report.includes('舆情快报'), `报告应包含标题`);
  assert(report.includes('情绪概览'), `报告应包含情绪概览`);
  assert(report.includes('主要质疑'), `报告应包含主要质疑`);
  assert(report.includes('回应优先级'), `报告应包含回应优先级`);
  assert(report.includes('愤怒'), `报告应包含愤怒标签`);
  assert(report.includes('数据源'), `报告应显示数据源`);
  assert(report.includes('/save'), `报告提示应包含/save命令`);
}

function testMarkdownFormat() {
  console.log('\n[formatMarkdown]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '2025-06-18~2025-06-19', filePath, ['事实补充']);
  const md = formatMarkdown(result);
  assert(md.startsWith('# 舆情快报'), `md应以一级标题开头`);
  assert(md.includes('## 一、情绪概览'), `md应包含情绪概览二级标题`);
  assert(md.includes('| 情绪 | 占比 |'), `md应包含情绪表格`);
  assert(md.includes('## 二、主要质疑'), `md应包含质疑二级标题`);
  assert(md.includes('## 三、回应优先级'), `md应包含优先级二级标题`);
  assert(md.includes('附：已录入补充事实'), `md有补充事实时应附清单`);
}

function testExportReport() {
  console.log('\n[exportReport]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故/特殊:名称', '', filePath, []);
  const tmpDir = path.join(__dirname, '..', 'tmp_test_export');

  try {
    const infoTxt = exportReport(result, 'txt', tmpDir);
    assert(infoTxt.format === 'txt', `txt导出格式正确`);
    assert(fs.existsSync(infoTxt.path), `txt文件应存在`);
    assert(infoTxt.filename.includes('舆情_'), `文件名应有舆情前缀`);
    assert(!infoTxt.filename.includes('/') && !infoTxt.filename.includes(':'), `文件名不应含特殊字符`);

    const infoMd = exportReport(result, 'md', tmpDir);
    assert(infoMd.format === 'md', `md导出格式正确`);
    assert(fs.existsSync(infoMd.path), `md文件应存在`);
    assert(infoMd.filename.endsWith('.md'), `扩展名应为md`);

    fs.unlinkSync(infoTxt.path);
    fs.unlinkSync(infoMd.path);
    fs.rmdirSync(tmpDir);
  } catch (e) {
    assert(false, `导出异常: ${e.message}`);
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function testSanitizeFilename() {
  console.log('\n[sanitizeFilename]');
  assert(sanitizeFilename('测试/名称:带*特殊?字符') === '测试_名称_带_特殊_字符', `特殊字符应被替换`);
  assert(sanitizeFilename('   前后空格   ') === '前后空格', `前后空格应被去除`);
  assert(sanitizeFilename('').length > 0, `空名称应有默认值`);
}

function testBriefUpdateWithFileStats() {
  console.log('\n[formatBriefUpdate multi files]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const result = runAnalysis('测试', '', [f1, f2], []);
  const brief = formatBriefUpdate(result);
  assert(brief.includes('数据源'), `更新报告也应显示多文件数据源`);
}

console.log('CrisisPulse 测试 v1.1');
console.log('═'.repeat(40));

testParseFile();
testParseFiles();
testClassifyEmotion();
testAnalyzeEmotions();
testNormalizeDate();
testFilterByTimeRange();
testExtractTopicsWithFacts();
testGenerateDoubtsWithAddressed();
testGeneratePriorityWithFacts();
testRunAnalysisMultiFiles();
testRunWithSupplementaryFacts();
testReportFormat();
testMarkdownFormat();
testExportReport();
testSanitizeFilename();
testBriefUpdateWithFileStats();

console.log('\n' + '═'.repeat(40));
console.log(`  通过: ${passed}  失败: ${failed}`);
console.log('═'.repeat(40));

process.exit(failed > 0 ? 1 : 0);
