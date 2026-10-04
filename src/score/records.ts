import type { BuiltPath } from './types'
import type { RehearsalArrivalRef, RehearsalRecord } from './types'

export type SegmentErrorCode =
  | 'no-path'
  | 'path-not-closed'
  | 'missing-start'
  | 'missing-end'
  | 'reversed-endpoints'

export interface SegmentEstimate {
  startStepIndex: number
  endStepIndex: number
  /** 按实际路径顺序、逐步骤累加的预计时长（含起止小节本身） */
  durationSeconds: number
  stepCount: number
}

export interface SegmentResult {
  ok: boolean
  estimate: SegmentEstimate | null
  errorCode?: SegmentErrorCode
  errorMessage?: string
}

export function findStepIndex(path: BuiltPath, arrival: RehearsalArrivalRef): number {
  return path.steps.findIndex(
    (step) => step.measureIndex === arrival.measureIndex && step.occurrence === arrival.occurrence,
  )
}

/**
 * 校验并估算一段排练段落。
 *
 * 时长不看书面小节编号，而是在“实际演奏路径”中定位起点与终点的步骤，
 * 按步骤先后顺序逐段累加 durationSeconds；因此跨后反复、跳房、D.C./D.S./Coda
 * 的段落也会按真实经过的次数计算。
 */
export function evaluateSegment(path: BuiltPath | null, start: RehearsalArrivalRef, end: RehearsalArrivalRef): SegmentResult {
  if (!path || path.steps.length === 0) {
    return { ok: false, estimate: null, errorCode: 'no-path', errorMessage: '还没有可用于估算的演奏路径。' }
  }
  // 路径不闭合时步骤序列可能是截断/无限循环的结果，不允许据此创建记录。
  if (!path.closed) {
    return { ok: false, estimate: null, errorCode: 'path-not-closed', errorMessage: '演奏路径无法闭合，请先处理记号诊断中的错误。' }
  }
  const startStepIndex = findStepIndex(path, start)
  if (startStepIndex < 0) {
    return { ok: false, estimate: null, errorCode: 'missing-start', errorMessage: '起点不是实际演奏路径中的一次到达。' }
  }
  const endStepIndex = findStepIndex(path, end)
  if (endStepIndex < 0) {
    return { ok: false, estimate: null, errorCode: 'missing-end', errorMessage: '终点不是实际演奏路径中的一次到达。' }
  }
  // 起止逆序：必须按实际路径步骤顺序，同一位置（单小节段落）允许。
  if (endStepIndex < startStepIndex) {
    return {
      ok: false,
      estimate: null,
      errorCode: 'reversed-endpoints',
      errorMessage: '终点在实际路径中早于起点，请按实际到达顺序选择。',
    }
  }

  let durationSeconds = 0
  for (let i = startStepIndex; i <= endStepIndex; i += 1) {
    durationSeconds += path.steps[i].durationSeconds
  }
  return {
    ok: true,
    estimate: {
      startStepIndex,
      endStepIndex,
      durationSeconds,
      stepCount: endStepIndex - startStepIndex + 1,
    },
  }
}

/** 依据已保存记录的两端到达位置，在当前路径中重新定位并估算；找不到则返回 null。 */
export function resolveRecordSegment(path: BuiltPath | null, record: RehearsalRecord): SegmentEstimate | null {
  return evaluateSegment(path, record.start, record.end).estimate
}

export function arrivalKey(arrival: RehearsalArrivalRef): string {
  return `${arrival.measureIndex}-${arrival.occurrence}`
}
