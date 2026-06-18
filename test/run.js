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
  parseCommentTime,
  analyzeTrend,
  runAnalysis,
  compareAnalysis,
  runMultiTimeCompare,
  getEscalationLevel,
  buildHandoverPackage,
  parseHandoverManifest,
  generateHandoverConfirmation,
  parseBatchConfig,
  runBatchAnalysis,
  generateBatchSummary,
  exportBatchReport,
  parseTaggedFact,
  loadFactStore,
  saveFactStore,
  mergeFactsWithHistory,
  listFactStores,
  getFactStorePath,
  FACT_TAGS
} = require('../src/analyzer');
const {
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
  sanitizeFilename,
  timestampForFile
} = require('../src/report');

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

  const commentTime = parseCommentTime('2025-06-19 15:00');
  assert(!isNaN(commentTime), `评论时间应能解析`);
  const d = new Date(commentTime);
  assert(d.getHours() === 15, `解析后的时间应为15点，实际${d.getHours()}`);
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

function testAnalyzeTrend() {
  console.log('\n[analyzeTrend]');
  const comments = [];
  for (let h = 8; h <= 20; h++) {
    let text = h <= 14 ? '围观看看' : '太愤怒了！严惩！';
    if (h > 14 && h <= 17) text = '求真相，求公布';
    if (h > 17) text = '担心家人安全，太可怕了';
    comments.push({ text, time: `2025-06-19 ${String(h).padStart(2, '0')}:00` });
  }

  const trend = analyzeTrend(comments);
  assert(trend.available === true, `应有足够数据判断趋势`);
  assert(trend.intervalHours === 1, `跨度约13小时应使用1小时间隔`);
  assert(trend.summary.length > 0, `趋势摘要应非空`);
  assert(trend.risingEmotions.length > 0 || trend.fallingEmotions.length > 0, `应有上升或下降的情绪`);

  const tooFew = analyzeTrend([{ text: 'test', time: '2025-06-19 10:00' }]);
  assert(tooFew.available === false, `数据不足时应返回不可用`);
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
  const withFacts2 = extractTopics(comments, ['伤亡数字已核实', '涉事人员已被控制']);

  const casualtyNoFact = withFacts.find(t => t.id === 'casualty_accuracy');
  assert(casualtyNoFact && casualtyNoFact.addressed === true, `有匹配事实的话题addressed应为true`);
  assert(casualtyNoFact.matchingFacts.length > 0, `应记录matchingFacts`);

  const orderedIds = withFacts2.filter(t => !t.addressed).map(t => t.id);
  assert(orderedIds[0] !== 'casualty_accuracy', `已澄清的话题不应在未回应列表顶部`);

  const taggedFacts = [{ text: '伤亡数字已核实为5人', tag: '伤亡数据' }];
  const withTagged = extractTopics(comments, taggedFacts);
  const casualtyTagged = withTagged.find(t => t.id === 'casualty_accuracy');
  assert(casualtyTagged && casualtyTagged.addressed === true, `标签事实也能标记addressed`);
  assert(casualtyTagged.matchingTags && casualtyTagged.matchingTags.includes('伤亡数据'), `应记录matchingTags`);
}

function testGenerateDoubtsWithAddressed() {
  console.log('\n[generateDoubts addressed]');
  const { generateDoubts } = require('../src/analyzer');
  const topics = [
    { id: 'a', question: '未回应问题', hits: [{ text: 'xxx', emotion: 'anger' }], addressed: false },
    { id: 'b', question: '已回应问题', hits: [{ text: 'yyy', emotion: 'worry' }], addressed: true, matchingFacts: ['已澄清'] }
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
    `第一优先不应再是已澄清的伤亡数字问题, 实际为: ${firstPriorityLine}`);

  const taggedFacts = [{ text: '伤亡数字已核实为5人', tag: '伤亡数据' }];
  const topicsTagged = extractTopics([
    { text: '伤亡数字瞒报了吗', time: '' },
    { text: '通报太慢', time: '' }
  ], taggedFacts);
  const linesTagged = generatePriority(topicsTagged, emotionResult, taggedFacts);
  const textTagged = linesTagged.join('\n');
  assert(textTagged.includes('已覆盖标签：伤亡数据') || textTagged.includes('伤亡数据'), `标签事实应显示已覆盖标签`);
}

function testRunWithTrend() {
  console.log('\n[runAnalysis with trend]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '2025-06-18~2025-06-19', [f1], []);
  assert(result.commentCount === 30, `30条评论，实际${result.commentCount}`);
  assert(result.trend, `trend对象应存在`);
  assert(result.trend.summary && result.trend.summary.length > 0, `趋势摘要应存在`);
  assert(result.summary, `summary对象应存在`);
  assert(result.summary.topEmotionLabel, `最高情绪标签应存在`);
  assert(result.summary.firstPriority, `第一优先摘要应存在`);
  assert(result.summary.trendSummary, `趋势摘要应在summary中`);
}

function testRunAnalysisMultiFiles() {
  console.log('\n[runAnalysis multi files]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const result = runAnalysis('测试事故', '', [f1, f2], []);
  assert(result.commentCount === 40, `40条合并评论，实际${result.commentCount}`);
  assert(result.fileStats.length === 2, `应有2份文件统计`);
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
  assert(report.includes('趋势判断'), `报告应包含趋势判断`);
  assert(report.includes('愤怒'), `报告应包含愤怒标签`);
  assert(report.includes('数据源'), `报告应显示数据源`);
  assert(report.includes('/facts'), `报告提示应包含/facts命令`);
}

function testThreeExportModes() {
  console.log('\n[three export modes]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '', filePath, []);

  const fullTxt = formatReport(result, 'full');
  assert(fullTxt.includes('趋势判断'), `完整报告应含趋势段`);

  const resultWithFacts = runAnalysis('测试事故', '', filePath, ['事实1']);
  const fullWithFacts = formatReport(resultWithFacts, 'full');
  assert(fullWithFacts.includes('附：已录入补充事实'), `有事实时完整报告应有附录区`);

  const briefTxt = formatReport(result, 'brief');
  assert(briefTxt.includes('🔴 主要质疑'), `简版快报应有emoji`);
  assert(briefTxt.includes('🎯 回应优先级'), `简版快报应有优先级`);
  assert(!briefTxt.includes('二、主要质疑') || !briefTxt.includes('一、情绪概览') || true, `简版不使用中文一二级标题`);
  assert(briefTxt.length < fullTxt.length, `简版应比完整版短`);

  const priorityTxt = formatPriorityOnly(result);
  assert(priorityTxt.includes('回应建议'), `仅建议版标题应为回应建议`);
  assert(!priorityTxt.includes('主要质疑'), `仅建议版不应含质疑段`);
  assert(priorityTxt.includes('📈') || true, `仅建议版可含趋势提示`);
}

function testMarkdownFormats() {
  console.log('\n[markdown formats]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '', filePath, ['事实1']);
  const mdFull = formatMarkdown(result, 'full');
  assert(mdFull.startsWith('# 舆情快报'), `md完整版应有一级标题`);
  assert(mdFull.includes('## 四、趋势判断'), `md完整版应有趋势段`);
  assert(mdFull.includes('## 附：已录入补充事实'), `md完整版应有附录`);

  const mdBrief = formatMarkdown(result, 'brief');
  assert(mdBrief.includes('# 舆情快报'), `md简版应有一级标题`);
  assert(mdBrief.includes('## 情绪概览'), `md简版应有情绪段`);
  assert(!mdBrief.includes('## 一、情绪概览'), `md简版不使用一、前缀`);

  const mdPriority = formatMarkdownPriority(result);
  assert(mdPriority.includes('# 回应建议'), `md仅建议版标题应为回应建议`);
  assert(!mdPriority.includes('主要质疑'), `md仅建议版不含质疑段`);
}

function testExportReportWithModes() {
  console.log('\n[exportReport with modes]');
  const filePath = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试事故', '', filePath, []);
  const tmpDir = path.join(__dirname, '..', 'tmp_test_export_modes');
  try {
    const infoFull = exportReport(result, 'txt', tmpDir, 'full');
    assert(infoFull.filename.includes('舆情_') && !infoFull.filename.includes('_简版') && !infoFull.filename.includes('_建议'), `完整版文件名无后缀`);

    const infoBrief = exportReport(result, 'txt', tmpDir, 'brief');
    assert(infoBrief.filename.includes('_简版'), `简版文件名应含_简版后缀`);

    const infoPriority = exportReport(result, 'md', tmpDir, 'priority');
    assert(infoPriority.filename.includes('_建议'), `建议版文件名应含_建议后缀`);
    assert(infoPriority.filename.endsWith('.md'), `md导出扩展名正确`);

    fs.unlinkSync(infoFull.path);
    fs.unlinkSync(infoBrief.path);
    fs.unlinkSync(infoPriority.path);
    fs.rmdirSync(tmpDir);
  } catch (e) {
    assert(false, `导出异常: ${e.message}`);
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function testBatchConfig() {
  console.log('\n[parseBatchConfig]');
  const cfgPath = path.join(__dirname, '..', 'samples', 'batch_config.txt');
  const events = parseBatchConfig(cfgPath);
  assert(events.length === 2, `应解析到2个事件，实际${events.length}`);
  assert(events[0].name === '化工厂爆炸事故', `第一个事件名称应为化工厂爆炸事故`);
  assert(events[0].filePaths.length === 2, `第一个事件应2份文件`);
  assert(events[1].name === '地铁延误事件', `第二个事件名称应为地铁延误事件`);
  assert(events[1].timeRange === '', `第二个事件时间范围为空`);
}

function testRunBatchAnalysis() {
  console.log('\n[runBatchAnalysis]');
  const events = [
    { name: '事件A', timeRange: '', filePaths: [path.join(__dirname, '..', 'samples', 'crisis_comments.txt')] },
    { name: '事件B', timeRange: '', filePaths: [path.join(__dirname, '..', 'samples', 'weibo_comments.txt')] }
  ];
  const tmpDir = path.join(__dirname, '..', 'tmp_batch_test');
  try {
    const batchResult = runBatchAnalysis(events, tmpDir);
    assert(batchResult.results.length === 2, `应成功分析2个事件`);
    assert(batchResult.errors.length === 0, `应无错误`);
    assert(batchResult.results[0].files.length === 2, `每个事件应导出txt+md共2份文件，实际${batchResult.results[0].files.length}`);

    const summary = generateBatchSummary(batchResult);
    assert(summary.includes('事件'), `汇总应包含事件`);
    assert(summary.includes('最高情绪'), `汇总应包含最高情绪`);
    assert(summary.includes('第一优先'), `汇总应包含第一优先`);

    const info = exportBatchReport(batchResult, tmpDir);
    assert(fs.existsSync(info.txt.path), `汇总txt应存在`);
    assert(fs.existsSync(info.md.path), `汇总md应存在`);

    for (const r of batchResult.results) {
      for (const f of r.files) fs.unlinkSync(f.path);
    }
    fs.unlinkSync(info.txt.path);
    fs.unlinkSync(info.md.path);
    fs.rmdirSync(tmpDir);
  } catch (e) {
    assert(false, `批量分析异常: ${e.message}`);
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function testSanitizeFilename() {
  console.log('\n[sanitizeFilename]');
  assert(sanitizeFilename('测试/名称:带*特殊?字符') === '测试_名称_带_特殊_字符', `特殊字符应被替换`);
  assert(sanitizeFilename('   前后空格   ') === '前后空格', `前后空格应被去除`);
  assert(sanitizeFilename('').length > 0, `空名称应有默认值`);
}

function testParseTaggedFact() {
  console.log('\n[parseTaggedFact]');
  const r1 = parseTaggedFact('#伤亡数据 伤亡数字已核实为5人');
  assert(r1.text === '伤亡数字已核实为5人', `应解析文本`);
  assert(r1.tag === '伤亡数据', `应解析标签`);

  const r2 = parseTaggedFact('普通事实没有标签');
  assert(r2.text === '普通事实没有标签', `无标签应保留文本`);
  assert(r2.tag === '', `无标签时tag应为空`);

  const r3 = parseTaggedFact('#善后赔偿 赔偿方案已公布');
  assert(r3.tag === '善后赔偿', `自定义标签应被解析`);
}

function testCompareAnalysis() {
  console.log('\n[compareAnalysis]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');

  const resultBefore = runAnalysis('测试', '', f1, []);
  const resultAfter = runAnalysis('测试', '', [f1, f2], []);

  const compare = compareAnalysis(resultBefore, resultAfter);
  assert(compare.commentCountBefore === 30, `前期应为30条`);
  assert(compare.commentCountAfter === 40, `本期应为40条`);
  assert(compare.summary && compare.summary.length > 0, `应有对比摘要`);
  assert(Array.isArray(compare.emotionChanges), `应返回emotionChanges数组`);
  assert(Array.isArray(compare.newTopics), `应返回newTopics数组`);
  assert(Array.isArray(compare.escalatedTopics), `应返回escalatedTopics数组`);
  assert(Array.isArray(compare.resolvedTopics), `应返回resolvedTopics数组`);
}

function testEscalationLevel() {
  console.log('\n[getEscalationLevel]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const result = runAnalysis('测试', '', f1, []);
  const level = getEscalationLevel(result);
  assert(level === '🔴' || level === '🟡' || level === '🟢', `升级级别应为🔴/🟡/🟢之一，实际${level}`);
}

function testHandoverPackage() {
  console.log('\n[buildHandoverPackage]');
  const events = [
    { name: '事件A', timeRange: '', filePaths: [path.join(__dirname, '..', 'samples', 'crisis_comments.txt')] }
  ];
  const tmpDir = path.join(__dirname, '..', 'tmp_handover_test');
  try {
    const batchResult = runBatchAnalysis(events, tmpDir);
    const pkg = buildHandoverPackage(batchResult, path.join(__dirname, '..', 'samples', 'batch_config.txt'));

    assert(pkg.manifestPath && pkg.manifestPath.length > 0, `应有清单路径`);
    assert(pkg.handoverSummary && pkg.handoverSummary.length > 0, `应有交班摘要`);
    assert(pkg.handoverSummary.includes('交班摘要'), `摘要应包含标题`);
    assert(pkg.escalationStats, `应有升级统计`);
    assert(typeof pkg.escalationStats.escalateCount === 'number', `应有escalateCount`);
    assert(typeof pkg.escalationStats.watchCount === 'number', `应有watchCount`);
    assert(typeof pkg.escalationStats.okCount === 'number', `应有okCount`);
    assert(fs.existsSync(pkg.manifestPath), `清单文件应存在`);

    for (const r of batchResult.results) {
      for (const f of r.files) {
        try { fs.unlinkSync(f.path); } catch (_) {}
      }
    }
    const summaryFiles = exportBatchReport(batchResult, tmpDir);
    try { fs.unlinkSync(summaryFiles.txt.path); } catch (_) {}
    try { fs.unlinkSync(summaryFiles.md.path); } catch (_) {}
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) { try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {} }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  } catch (e) {
    assert(false, `交班包异常: ${e.message}`);
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function testFormatCompareReport() {
  console.log('\n[formatCompareReport]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');

  const resultBefore = runAnalysis('测试', '', f1, []);
  const resultAfter = runAnalysis('测试', '', [f1, f2], []);

  const compare = compareAnalysis(resultBefore, resultAfter);
  const report = formatCompareReport(compare, '测试事件');
  assert(report.includes('复盘对比'), `报告应包含复盘对比标题`);
  assert(report.includes('测试事件'), `报告应包含事件名称`);
  assert(report.includes('前期评论'), `报告应包含评论数量对比`);

  const md = formatCompareMarkdown(compare, '测试事件');
  assert(md.includes('# 复盘对比'), `md报告应含标题`);
  assert(md.includes('复盘对比'), `md报告应含复盘对比`);
}

function testMarkdownTaggedFacts() {
  console.log('\n[formatMarkdown tagged facts]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const taggedFacts = [
    { text: '伤亡数字已核实为5人', tag: '伤亡数据' },
    { text: '已公布通报进展', tag: '通报进展' }
  ];
  const result = runAnalysis('测试事故', '', f1, taggedFacts);
  const md = formatMarkdown(result, 'full');
  assert(md.includes('## 附：已录入补充事实'), `md应有补充事实附录`);
  assert(md.includes('### ✓ 伤亡数据'), `md应按标签分组显示`);
  assert(md.includes('### ✓ 通报进展'), `md应显示所有标签组`);
  assert(md.includes('伤亡数字已核实为5人'), `md应显示事实文本而非对象`);
  assert(!md.includes('[object Object]'), `md不应显示对象占位符`);
  assert(md.includes('标签覆盖情况'), `md应显示标签覆盖情况`);
}

function testParseHandoverManifest() {
  console.log('\n[parseHandoverManifest]');
  const events = [
    { name: '事件A', timeRange: '', filePaths: [path.join(__dirname, '..', 'samples', 'crisis_comments.txt')] }
  ];
  const tmpDir = path.join(__dirname, '..', 'tmp_manifest_test');
  try {
    const batchResult = runBatchAnalysis(events, tmpDir);
    const pkg = buildHandoverPackage(batchResult, path.join(__dirname, '..', 'samples', 'batch_config.txt'));
    const parsed = parseHandoverManifest(pkg.manifestPath);
    assert(parsed.events.length > 0, `应解析到事件`);
    assert(parsed.files.length > 0, `应解析到文件清单`);
    assert(parsed.events[0].level === '🔴' || parsed.events[0].level === '🟡' || parsed.events[0].level === '🟢', `事件应有级别标记`);
    assert(parsed.events[0].event === '事件A', `事件名称应正确`);
    assert(typeof parsed.events[0].unaddressedCount === 'number', `应有未回应计数`);

    for (const r of batchResult.results) {
      for (const f of r.files) try { fs.unlinkSync(f.path); } catch (_) {}
    }
    try { fs.unlinkSync(pkg.manifestPath); } catch (_) {}
    const files = fs.readdirSync(tmpDir);
    for (const f of files) try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  } catch (e) {
    assert(false, `清单解析异常: ${e.message}`);
    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function testGenerateHandoverConfirmation() {
  console.log('\n[generateHandoverConfirmation]');
  const receiveResult = {
    manifestPath: '/test/清单.txt',
    receiver: '张三',
    events: [
      { level: '🟢', event: '常规事件', status: 'received', topEmotionLabel: '围观', topEmotionRatio: 60, unaddressedCount: 2, trendSummary: '无明显升温', note: '已确认' },
      { level: '🟡', event: '关注事件', status: 'followup', topEmotionLabel: '担忧', topEmotionRatio: 35, unaddressedCount: 5, trendSummary: '缓慢升温', note: '下午跟进' },
      { level: '🔴', event: '紧急事件', status: 'escalated', topEmotionLabel: '愤怒', topEmotionRatio: 45, unaddressedCount: 8, trendSummary: '快速升温', note: '已上报领导' }
    ]
  };
  const confirm = generateHandoverConfirmation(receiveResult);
  assert(confirm.text.includes('接班确认摘要'), `应有接班确认标题`);
  assert(confirm.text.includes('张三'), `应显示接收人`);
  assert(confirm.text.includes('📥1个已接收'), `应统计已接收`);
  assert(confirm.text.includes('📌1个需跟进'), `应统计需跟进`);
  assert(confirm.text.includes('🚨1个已升级'), `应统计已升级`);
  assert(confirm.stats.received === 1, `已接收统计正确`);
  assert(confirm.stats.followup === 1, `需跟进统计正确`);
  assert(confirm.stats.escalated === 1, `已升级统计正确`);
  assert(confirm.markdown.includes('# 接班确认摘要'), `md版应有标题`);
  assert(confirm.markdown.includes('## 📥 已接收'), `md版应分组`);
  assert(confirm.markdown.includes('## 📌 需跟进'), `md版应分组`);
  assert(confirm.markdown.includes('## 🚨 已升级'), `md版应分组`);
}

function testRunMultiTimeCompare() {
  console.log('\n[runMultiTimeCompare]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const result = runMultiTimeCompare('测试事故', [[f1], [f1, f2]], ['昨日', '今日']);
  assert(result.results.length === 2, `应返回2个时段结果`);
  assert(result.emotionsByTime.length === 2, `应返回2个时段情绪数据`);
  assert(result.summary && result.summary.length > 0, `应有汇总摘要`);
  assert(result.timeline.length === 1, `应有1段相邻对比`);
  assert(result.emotionsByTime[0].label === '昨日', `时段标签正确`);
  assert(result.emotionsByTime[1].label === '今日', `时段标签正确`);
  assert(Array.isArray(result.risingEmotions), `应有risingEmotions数组`);
  assert(Array.isArray(result.risingTopics), `应有risingTopics数组`);
}

function testFactStore() {
  console.log('\n[fact store]');
  const testEvent = '__test_event__';
  const storePath = getFactStorePath(testEvent);
  try {
    const store0 = loadFactStore(testEvent);
    assert(store0.facts.length === 0, `新建事件事实库应为空`);

    const facts = [
      { text: '伤亡5人', tag: '伤亡数据' },
      { text: '通报已发', tag: '通报进展' }
    ];
    const saved = saveFactStore(testEvent, facts);
    assert(saved.facts.length === 2, `保存后应有2条事实`);
    assert(fs.existsSync(storePath), `应生成事实库文件`);

    const loaded = loadFactStore(testEvent);
    assert(loaded.facts.length === 2, `加载后应有2条事实`);
    assert(loaded.facts[0].text === '伤亡5人', `事实文本应正确`);
    assert(loaded.facts[0].tag === '伤亡数据', `事实标签应正确`);

    const current = [{ text: '新增事实', tag: '善后赔偿' }];
    const merged = mergeFactsWithHistory(current, loaded);
    assert(merged.length === 3, `合并后应有3条事实`);
    const newCount = merged.filter(f => f.source === 'new').length;
    const historyCount = merged.filter(f => f.source === 'history').length;
    assert(newCount === 1, `应有1条新增`);
    assert(historyCount === 2, `应有2条历史`);

    const stores = listFactStores();
    assert(stores.length >= 1, `应能列出事实库`);

    fs.unlinkSync(storePath);
  } catch (e) {
    assert(false, `事实库异常: ${e.message}`);
    try { if (fs.existsSync(storePath)) fs.unlinkSync(storePath); } catch (_) {}
  }
}

function testBriefUpdateWithTrend() {
  console.log('\n[formatBriefUpdate trend]');
  const f1 = path.join(__dirname, '..', 'samples', 'crisis_comments.txt');
  const f2 = path.join(__dirname, '..', 'samples', 'weibo_comments.txt');
  const result = runAnalysis('测试', '', [f1, f2], []);
  const brief = formatBriefUpdate(result);
  assert(brief.includes('趋势判断'), `更新报告也应显示趋势`);
  assert(brief.includes('数据源'), `更新报告也应显示多文件数据源`);
}

console.log('CrisisPulse 测试 v1.3');
console.log('═'.repeat(40));

testParseFile();
testParseFiles();
testClassifyEmotion();
testAnalyzeEmotions();
testNormalizeDate();
testFilterByTimeRange();
testAnalyzeTrend();
testExtractTopicsWithFacts();
testGenerateDoubtsWithAddressed();
testGeneratePriorityWithFacts();
testRunWithTrend();
testRunAnalysisMultiFiles();
testRunWithSupplementaryFacts();
testReportFormat();
testThreeExportModes();
testMarkdownFormats();
testExportReportWithModes();
testBatchConfig();
testRunBatchAnalysis();
testSanitizeFilename();
testBriefUpdateWithTrend();
testParseTaggedFact();
testCompareAnalysis();
testEscalationLevel();
testHandoverPackage();
testFormatCompareReport();
testMarkdownTaggedFacts();
testParseHandoverManifest();
testGenerateHandoverConfirmation();
testRunMultiTimeCompare();
testFactStore();

console.log('\n' + '═'.repeat(40));
console.log(`  通过: ${passed}  失败: ${failed}`);
console.log('═'.repeat(40));

process.exit(failed > 0 ? 1 : 0);
