export type WarningLevel = 'error' | 'warning' | 'info'

export interface ParseWarning {
  level: WarningLevel
  code:
    | 'no-measures'
    | 'different-measure-count'
    | 'unsupported-jump-word'
    | 'missing-back-repeat'
    | 'missing-forward-repeat'
    | 'orphan-ending'
    | 'overlapping-ending'
    | 'missing-segno'
    | 'duplicate-segno'
    | 'missing-coda'
    | 'duplicate-coda'
    | 'missing-fine'
    | 'multiple-fine'
    | 'unresolved-nav-target'
    | 'unclosed-jump'
    | 'unrecognized-direction'
    | 'time-signature-change'
    | 'unknown'
  message: string
  measureNumber?: number
  xmlPath?: string
}

export interface TimeSignature {
  numerator: number
  denominator: number
  beatUnitSeconds: number
}

export interface TempoEvent {
  measureIndex: number
  bpm: number
  label: string
  source: 'sound' | 'metronome' | 'default'
}

export type BarlineLocation = 'left' | 'right' | 'middle'

export interface RepeatInfo {
  location: BarlineLocation
  direction: 'forward' | 'backward'
  times: number
}

export interface EndingInfo {
  location: BarlineLocation
  type: 'start' | 'stop' | 'discontinue'
  numbers: number[]
}

export type NavType =
  | 'segno'
  | 'coda'
  | 'fine'
  | 'dacapo'
  | 'dalsegno'
  | 'tocoda'

export interface NavMarker {
  type: NavType
  measureIndex: number
  text: string
  alFine?: boolean
  alCoda?: boolean
  consumed: boolean
}

export interface WrittenMeasure {
  index: number
  number: string
  implicit: boolean
  durationQuarters: number
  declaredDurationQuarters: number | null
  isPickup: boolean
  hasMultipleVoices: boolean
  voiceCount: number
  partMeasureCounts: Record<string, number>
  timeSignature: TimeSignature | null
  repeats: RepeatInfo[]
  endings: EndingInfo[]
  navMarkers: NavMarker[]
  warnings: ParseWarning[]
}

export type JumpKind =
  | 'straight'
  | 'repeat-back'
  | 'volta-skip'
  | 'da-capo'
  | 'dal-segno'
  | 'to-coda'
  | 'fine-stop'
  | 'end'

export interface PathStep {
  occurrence: number
  measureIndex: number
  measureNumber: string
  iteration: number
  bpm: number
  durationSeconds: number
  startSeconds: number
  endSeconds: number
  activeEndingNumbers: number[]
  incomingJump: JumpKind
  event: string
  isPickup: boolean
}

export interface BuiltPath {
  steps: PathStep[]
  arrivals: Array<{ measureIndex: number; occurrences: number[] }>
  totalSeconds: number
  warnings: ParseWarning[]
  closed: boolean
}

export interface RehearsalMark {
  id: string
  measureIndex: number
  occurrence?: number
  label: string
  comment: string
  color: string
  createdAt: string
}

export type RehearsalOutcome = 'completed' | 'partial' | 'planned'

export interface RehearsalArrivalRef {
  measureIndex: number
  occurrence: number
}

export interface RehearsalRecord {
  id: string
  /** 练习日期，YYYY-MM-DD（人工填写） */
  date: string
  /** 目标速度 ♩=，仅记录练习目标，不参与时长估算 */
  targetBpm: number | null
  notes: string
  outcome: RehearsalOutcome
  /** 起点：实际演奏路径中的某一次到达 */
  start: RehearsalArrivalRef
  /** 终点：实际演奏路径中的某一次到达 */
  end: RehearsalArrivalRef
  /** 创建时按实际路径步骤逐段累加的预计时长（含起止小节） */
  estimatedSeconds: number
  /** 该段在实际路径中经过的步骤数 */
  stepCount: number
  createdAt: string
}

export interface StoredProject {
  id: string
  name: string
  originalXml: string
  marks: RehearsalMark[]
  records: RehearsalRecord[]
  updatedAt: string
  createdAt: string
}

export interface ProjectExport {
  format: 'local-rehearsal-project/v1'
  project: StoredProject
}
