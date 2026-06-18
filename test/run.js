'use strict';

const path = require('path');
const {
  parseFile,
  classifyEmotion,
  analyzeEmotions,
  extractTopics,
  filterByTimeRange,
  runAnalysis
} = require('../src/analyzer');
const { formatReport, formatBriefUpdate } = require('../src/report');

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
  assert(onlook.primary === 'onlook', `中性文本应归为onlook`);
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

function testExtractTopics() {
  console.log('\n[extractTopics]');
  const comments = [
    { text: '伤亡数字是不是瞒报了', time: '' },
    { text: '通报太慢了等一天了', time: '' },
    { text: '涉事人员是不是被保护了', time: '' }
  ];
  const topics = extractTopics(comments);
  assert(topics.length >= 2, `至少应识别2个话题，实际${topics.length}`);
  assert(topics[0].question.length > 0, `话题应有可读问题`);
}

function testFilterByTimeRange() {
  console.log('\n[filterByTimeRange]');
  const comments = [
    { text: 'a', time: '2025-06-18 10:00' },
    { text: 'b', time: '2025-06-19 10:00' },
    { text: 'c', time: '' }
  ];
  const filtered = filterByTimeRange(comments, '2025-06-18 00:00~2025-06-18 23:59');
  assert(filtered.length === 2, `应过滤出2条(含无时间的)，实际${filtered.length}`);

  const all = filterByTimeRange(comments, '');
  assert(all.length === 3, `空范围应返回全部`);
}

function testRunAnalysis() {
  console.log('\n[runAnalysis]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '', filePath, []);
  assert(result.commentCount === 30, `评论数应为30`);
  assert(result.emotionOverview.length > 0, `情绪概览应非空`);
  assert(result.doubts.length > 0, `质疑列表应非空`);
  assert(result.priority.length > 0, `优先级列表应非空`);
}

function testRunWithSupplementaryFacts() {
  console.log('\n[supplementaryFacts]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const resultNoFacts = runAnalysis('测试', '', filePath, []);
  const resultWithFacts = runAnalysis('测试', '', filePath, ['伤亡数字已核实确认，不存在瞒报']);
  assert(resultWithFacts.doubts.length > 0, `有补充事实时质疑仍应存在`);
  const hasFactLine = resultWithFacts.doubts.some(d => d.includes('已有补充事实'));
  assert(hasFactLine, `有补充事实时质疑中应标注已有事实`);
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
}

console.log('CrisisPulse 测试');
console.log('═'.repeat(40));

testParseFile();
testClassifyEmotion();
testAnalyzeEmotions();
testExtractTopics();
testFilterByTimeRange();
testRunAnalysis();
testRunWithSupplementaryFacts();
testReportFormat();

console.log('\n' + '═'.repeat(40));
console.log(`  通过: ${passed}  失败: ${failed}`);
console.log('═'.repeat(40));

process.exit(failed > 0 ? 1 : 0);
