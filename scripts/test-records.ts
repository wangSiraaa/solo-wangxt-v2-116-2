import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.document = dom.window.document

import { buildPerformancePath, parseMusicXml } from '../src/score/parser'
import { evaluateSegment, findStepIndex } from '../src/score/records'
import { fullSampleXml, unclosedJumpXml } from '../src/score/samples'

const score = parseMusicXml(fullSampleXml())
const path = buildPerformancePath(score)

// 实际路径（书面编号）：0,1,2,3,4,5(跳房1),2,3,4,6(跳房2),7,8（steps[0..11]）
// 书面小节 3（measureIndex 3）被到达两次：steps[3] 与 steps[7]
const firstArrivalMeasure3 = { measureIndex: 3, occurrence: 1 }
const secondArrivalMeasure3 = { measureIndex: 3, occurrence: 2 }
if (findStepIndex(path, firstArrivalMeasure3) !== 3) throw new Error('小节 3 第一次到达应是第 4 步')
if (findStepIndex(path, secondArrivalMeasure3) !== 7) throw new Error('小节 3 第二次到达应是第 8 步')

// 验收 1：选择“第二次到达的小节 3”作为起点时，仍指向第二次（steps[7]），而不是同名小节第一次。
// 终点选第二次到达的小节 4（step 8），它在实际路径中晚于 step 7。
const fromSecondArrival = evaluateSegment(path, secondArrivalMeasure3, { measureIndex: 4, occurrence: 2 })
if (!fromSecondArrival.ok || !fromSecondArrival.estimate) throw new Error('第二次到达小节 3 起的段落应有效')
if (fromSecondArrival.estimate.startStepIndex !== 7) {
  throw new Error(`起点应解析为第二次到达（第 8 步），实际第 ${fromSecondArrival.estimate.startStepIndex + 1} 步`)
}
if (fromSecondArrival.estimate.stepCount !== 2) {
  throw new Error(`第二次小节 3 → 第二次小节 4 应经过 2 步，实际 ${fromSecondArrival.estimate.stepCount}`)
}

// 同样终点选“第二次到达的小节 3”时，落在步骤 7 而非步骤 3。
const endingAtSecondArrival = evaluateSegment(path, secondArrivalMeasure3, secondArrivalMeasure3)
if (!endingAtSecondArrival.ok || endingAtSecondArrival.estimate?.startStepIndex !== 7 || endingAtSecondArrival.estimate?.endStepIndex !== 7) {
  throw new Error('两端同为第二次到达小节 3 时应定位到步骤 7 的单步段落')
}

// 验收 2：跨后反复的段落按实际路径顺序计算时长。
// 第一次到达小节 3（step 3）→ 第二次到达小节 3（step 7）：
// 依次经过 steps 3..7 = 3,4,5(跳房1),2(反复返回),3 —— 共 5 步，绕了一整圈。
const crossRepeat = evaluateSegment(path, firstArrivalMeasure3, secondArrivalMeasure3)
if (!crossRepeat.ok || !crossRepeat.estimate) throw new Error('跨反复段落应有效')
if (crossRepeat.estimate.startStepIndex !== 3 || crossRepeat.estimate.endStepIndex !== 7) {
  throw new Error('跨反复段落应覆盖步骤 4..8')
}
let expectedSeconds = 0
for (let i = 3; i <= 7; i += 1) expectedSeconds += path.steps[i].durationSeconds
if (Math.abs(crossRepeat.estimate.durationSeconds - expectedSeconds) > 1e-9) {
  throw new Error(`跨反复时长应逐步骤累加：期望 ${expectedSeconds}，实际 ${crossRepeat.estimate.durationSeconds}`)
}
if (crossRepeat.estimate.stepCount !== 5) throw new Error('跨反复段落应经过 5 个小节步')

// 跨跳房：第一次到达的小节 4（step 4，在跳房 1 之前）→ 第二次到达的小节 4（step 8，跳房 2 之前）。
// 真实顺序 4 → 5(跳房1) → 2(后反复) → 3 → 4；不能只按书面编号差算成 1 小节。
const crossVolta = evaluateSegment(path, { measureIndex: 4, occurrence: 1 }, { measureIndex: 4, occurrence: 2 })
if (!crossVolta.ok || !crossVolta.estimate) throw new Error('跨跳房段落应有效')
if (crossVolta.estimate.startStepIndex !== 4 || crossVolta.estimate.endStepIndex !== 8) {
  throw new Error('跨跳房段落应是步骤 5..9')
}
const coveredMeasureNumbers: string[] = []
for (let i = 4; i <= 8; i += 1) coveredMeasureNumbers.push(path.steps[i].measureNumber)
if (JSON.stringify(coveredMeasureNumbers) !== JSON.stringify(['4', '5', '2', '3', '4'])) {
  throw new Error(`跨跳房经过的实际顺序错误：${coveredMeasureNumbers.join(', ')}`)
}
// 逐步骤时长与“书面小节 4 时长”显然不同，证明走的是实际路径
let crossExpected = 0
for (let i = 4; i <= 8; i += 1) crossExpected += path.steps[i].durationSeconds
if (Math.abs(crossVolta.estimate.durationSeconds - crossExpected) > 1e-9) {
  throw new Error('跨跳房时长必须按实际经过步骤累加')
}

// 验收 4：起止逆序不能创建（终点步骤在起点之前）。
const reversed = evaluateSegment(path, secondArrivalMeasure3, firstArrivalMeasure3)
if (reversed.ok || reversed.errorCode !== 'reversed-endpoints') {
  throw new Error('终点早于起点（按实际路径步骤）时必须拒绝创建')
}
// 第一次小节 4(step4) 作为终点、第二次小节 3(step7) 作为起点也逆序。
const reversedByOccurrence = evaluateSegment(path, secondArrivalMeasure3, { measureIndex: 4, occurrence: 1 })
if (reversedByOccurrence.ok || reversedByOccurrence.errorCode !== 'reversed-endpoints') {
  throw new Error('书面编号递增但实际到达顺序相反时也必须拒绝')
}

// 端点不是路径中的某次到达（不被演奏或不存在的次数）也不能创建。
const missingArrival = evaluateSegment(path, { measureIndex: 3, occurrence: 9 }, secondArrivalMeasure3)
if (missingArrival.ok || missingArrival.errorCode !== 'missing-start') {
  throw new Error('不存在的“第 9 次到达”必须拒绝创建')
}

// 验收 4：路径不闭合时不能创建。
const bad = parseMusicXml(unclosedJumpXml())
const badPath = buildPerformancePath(bad)
if (badPath.closed) throw new Error('前置条件：该样例路径应不闭合')
const onUnclosed = evaluateSegment(badPath, { measureIndex: 0, occurrence: 1 }, { measureIndex: 1, occurrence: 1 })
if (onUnclosed.ok || onUnclosed.errorCode !== 'path-not-closed') {
  throw new Error('路径不闭合时必须拒绝创建排练记录')
}

// 没有路径
const noPath = evaluateSegment(null, { measureIndex: 0, occurrence: 1 }, { measureIndex: 1, occurrence: 1 })
if (noPath.ok || noPath.errorCode !== 'no-path') throw new Error('无路径时必须拒绝创建')

// 单小节段落（同一次到达）允许。
const single = evaluateSegment(path, firstArrivalMeasure3, firstArrivalMeasure3)
if (!single.ok || single.estimate?.stepCount !== 1) throw new Error('起止为同一次到达时应为合法单步段落')
if (Math.abs((single.estimate?.durationSeconds ?? 0) - path.steps[3].durationSeconds) > 1e-9) {
  throw new Error('单步段落时长应等于该步骤时长（含本小节）')
}

console.log(JSON.stringify({
  steps: path.steps.map((step) => `${step.measureNumber}#${step.occurrence}`),
  secondArrivalStep: fromSecondArrival.estimate.startStepIndex,
  crossRepeat: {
    stepCount: crossRepeat.estimate.stepCount,
    durationSeconds: Number(crossRepeat.estimate.durationSeconds.toFixed(3)),
    expectedSeconds: Number(expectedSeconds.toFixed(3)),
  },
  crossVolta: coveredMeasureNumbers,
  rejections: [reversed.errorCode, reversedByOccurrence.errorCode, missingArrival.errorCode, onUnclosed.errorCode, noPath.errorCode],
}, null, 2))
