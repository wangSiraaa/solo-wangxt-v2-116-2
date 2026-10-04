import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.document = dom.window.document

import { arrivalsFor, buildPerformancePath, parseMusicXml, resolveSegment } from '../src/score/parser'
import { fullSampleXml, unclosedJumpXml } from '../src/score/samples'

const xml = fullSampleXml()
const score = parseMusicXml(xml)
const path = buildPerformancePath(score)

const numbers = path.steps.map((step) => step.measureNumber)
const expected = ['0', '1', '2', '3', '4', '5', '2', '3', '4', '6', '7', '8']
if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
  throw new Error(`演奏路径错误：${numbers.join(', ')}`)
}
if (!path.closed) throw new Error('样例路径应可闭合')
if (!score.measures[0].isPickup) throw new Error('第 0 小节应识别为弱起')
if (!score.measures[4].hasMultipleVoices) throw new Error('第 5 小节应识别为多声部')
if (!score.tempos.some((tempo) => tempo.measureIndex === 2 && Math.round(tempo.bpm) === 120)) {
  throw new Error('应识别第 3 小节速度改变')
}

const bad = parseMusicXml(unclosedJumpXml())
const badPath = buildPerformancePath(bad)
if (badPath.closed) throw new Error('缺少 Segno/Fine 的路径不应闭合')
if (!badPath.warnings.some((warning) => warning.code === 'missing-segno')) throw new Error('应报告缺少 Segno')

const dsAlCodaXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><words>Segno</words></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="2"><direction><direction-type><words>To Coda</words></direction-type></direction><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="3"><direction><direction-type><words>D.S. al Coda</words></direction-type></direction><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="4"><direction><direction-type><words>Coda</words></direction-type></direction><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
  </part>
</score-partwise>`
const dsScore = parseMusicXml(dsAlCodaXml)
const dsPath = buildPerformancePath(dsScore)
const dsExpected = ['1', '2', '3', '1', '2', '4']
if (JSON.stringify(dsPath.steps.map((step) => step.measureNumber)) !== JSON.stringify(dsExpected)) {
  throw new Error(`D.S. al Coda 路径错误：${dsPath.steps.map((step) => step.measureNumber).join(', ')}`)
}
if (!dsPath.closed) throw new Error('D.S. al Coda 样例路径应可闭合')

// 排练记录：按（书面小节, 第几次到达）解析路径步骤
if (JSON.stringify(arrivalsFor(path, 3)) !== JSON.stringify([1, 2])) {
  throw new Error('小节 3 应在路径中到达两次')
}
const secondArrival = resolveSegment(path, 3, 2, 3, 2)
if (!secondArrival) throw new Error('第二次到达的小节 3 应可解析')
const secondArrivalStep = path.steps[secondArrival.startStepIndex]
if (secondArrivalStep.measureIndex !== 3 || secondArrivalStep.occurrence !== 2) {
  throw new Error('选择第二次到达的小节 3 时，解析结果必须仍指向第二次到达')
}
if (secondArrival.stepCount !== 1) throw new Error('起止相同的段落应只含 1 步')

// 跨跳房段落按实际路径顺序计算时长：小节 4 第 1 次 → 小节 4 第 2 次
const acrossVolta = resolveSegment(path, 4, 1, 4, 2)
if (!acrossVolta) throw new Error('跨跳房段落应可解析')
const acrossNumbers = path.steps
  .slice(acrossVolta.startStepIndex, acrossVolta.endStepIndex + 1)
  .map((step) => step.measureNumber)
if (JSON.stringify(acrossNumbers) !== JSON.stringify(['4', '5', '2', '3', '4'])) {
  throw new Error(`跨跳房段落应按实际路径经过跳房 1 并跳过跳房 2，实际：${acrossNumbers.join(', ')}`)
}
if (Math.abs(acrossVolta.estimatedSeconds - 10) > 1e-9) {
  throw new Error(`跨跳房段落预计时长应为 10s（5 步 × 2s），实际 ${acrossVolta.estimatedSeconds}`)
}
const acrossTimeSpan = path.steps[acrossVolta.endStepIndex].endSeconds - path.steps[acrossVolta.startStepIndex].startSeconds
if (Math.abs(acrossVolta.estimatedSeconds - acrossTimeSpan) > 1e-9) {
  throw new Error('段落预计时长应与路径起止时间差一致')
}

// 起止逆序与不存在的到达都不能解析（界面据此禁止创建）
if (resolveSegment(path, 4, 2, 4, 1) !== null) throw new Error('同一小节起止逆序时不应解析成功')
if (resolveSegment(path, 6, 1, 2, 1) !== null) throw new Error('终点在起点之前时不应解析成功')
if (resolveSegment(path, 3, 3, 3, 3) !== null) throw new Error('不存在的到达次数不应解析成功')
// 路径不闭合时界面禁止创建（badPath.closed === false 已在上方断言）

console.log(JSON.stringify({
  expected,
  dsExpected,
  totalSeconds: path.totalSeconds,
  warnings: path.warnings.map((warning) => warning.code),
  badWarnings: badPath.warnings.map((warning) => warning.code),
}, null, 2))
