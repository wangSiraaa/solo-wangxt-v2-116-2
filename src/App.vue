<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <h1>本地乐谱排练台</h1>
        <p>明确记号构造演奏路径 · Web Audio 节拍参考 · IndexedDB 本地工程 · 纯前端</p>
      </div>
      <div class="top-actions">
        <label class="button secondary">
          打开 MusicXML
          <input type="file" accept=".xml,.musicxml,application/xml,text/xml" @change="onFileSelected" />
        </label>
        <label class="button secondary">
          导入工程
          <input type="file" accept=".json,application/json" @change="onProjectImport" />
        </label>
        <button class="button primary" :disabled="!project" @click="saveCurrentProject">保存到本机</button>
        <button class="button secondary" :disabled="!project" @click="downloadOriginalXml">导出原 XML</button>
        <button class="button secondary" :disabled="!project" @click="downloadProjectBundle">导出工程包</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <section class="panel">
          <h2>样例</h2>
          <div class="sample-list">
            <button v-for="sample in sampleLibrary" :key="sample.name" class="button sample" @click="loadSample(sample)">
              {{ sample.name }}
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>本机工程</h2>
          <div v-if="projects.length === 0" class="muted">IndexedDB 中还没有工程。</div>
          <div v-for="item in projects" :key="item.id" class="project-row">
            <button class="link-button" @click="loadStoredProject(item)">{{ item.name }}</button>
            <small>{{ formatDate(item.updatedAt) }} · {{ item.marks.length }} 标记 · {{ item.records.length }} 记录</small>
            <button class="danger" @click="removeStoredProject(item.id)">删除</button>
          </div>
        </section>

        <section class="panel status-panel">
          <h2>路径状态</h2>
          <div :class="['status-badge', path?.closed ? 'ok' : 'bad']">
            {{ path?.closed ? '路径可闭合' : '路径存在错误' }}
          </div>
          <div v-if="path" class="stat-grid">
            <span>实际小节</span><strong>{{ path.steps.length }}</strong>
            <span>书面小节</span><strong>{{ score?.measures.length ?? 0 }}</strong>
            <span>总时长</span><strong>{{ formatTime(path.totalSeconds) }}</strong>
          </div>
        </section>
      </aside>

      <section class="score-column">
        <div class="transport panel">
          <button class="button primary" :disabled="!path" @click="togglePlayback">{{ playing ? '暂停' : '播放/节拍' }}</button>
          <button class="button secondary" :disabled="!path" @click="stopPlayback">停止</button>
          <label>
            起始书面小节
            <select v-model.number="selectedMeasureIndex" :disabled="!score">
              <option v-for="measure in score?.measures ?? []" :key="measure.index" :value="measure.index">
                {{ measure.number }} {{ measure.isPickup ? '（弱起）' : '' }}
              </option>
            </select>
          </label>
          <label>
            到达次数
            <select v-model.number="selectedOccurrence" :disabled="!selectedOccurrences.length">
              <option v-for="occurrence in selectedOccurrences" :key="occurrence" :value="occurrence">
                第 {{ occurrence }} 次到达
              </option>
            </select>
          </label>
          <div class="timeline">
            <div class="timeline-bar"><div :style="{ width: `${playProgress * 100}%` }" /></div>
            <span>{{ formatTime(currentScoreTime) }} / {{ path ? formatTime(path.totalSeconds) : '0:00.0' }}</span>
          </div>
        </div>

        <div class="score-wrap">
          <ScoreView
            v-if="project && score && path"
            :xml="project.originalXml"
            :measures="score.measures"
            :path="path"
            :active-step-index="activeStepIndex"
            :range-start-step-index="activeRecordRange?.startStepIndex ?? null"
            :range-end-step-index="activeRecordRange?.endStepIndex ?? null"
            interactable
            @select-measure="chooseMeasure"
          />
          <div v-else class="empty-state">
            <strong>请打开一个 MusicXML 或加载样例。</strong>
            <p>所有数据只保存在当前浏览器；原始 XML 不会被重写。</p>
          </div>
        </div>
      </section>

      <aside class="sidebar right">
        <section class="panel">
          <h2>选定书面小节的实际到达</h2>
          <div v-if="selectedMeasure" class="measure-detail">
            <div class="detail-title">
              书面小节 {{ selectedMeasure.number }}
              <span v-if="selectedMeasure.isPickup" class="tag">弱起</span>
              <span v-if="selectedMeasure.hasMultipleVoices" class="tag">多声部</span>
              <span v-if="selectedMeasure.endings.length" class="tag">跳房</span>
            </div>
            <p v-if="!selectedOccurrences.length" class="muted">这个书面小节在当前演奏路径中不会被演奏。</p>
            <button
              v-for="occurrence in selectedOccurrences"
              :key="occurrence"
              :class="['arrival-button', { selected: occurrence === selectedOccurrence }]"
              @click="selectedOccurrence = occurrence"
            >
              第 {{ occurrence }} 次到达 · {{ arrivalDescription(occurrence) }}
            </button>
          </div>
        </section>

        <section class="panel path-panel">
          <h2>实际演奏路径</h2>
          <div class="path-list">
            <button
              v-for="(step, index) in path?.steps ?? []"
              :key="`${step.measureIndex}-${step.occurrence}`"
              :class="['path-step', { active: index === activeStepIndex }]"
              @click="seekToStep(index)"
            >
              <span class="step-order">{{ index + 1 }}</span>
              <span class="step-main">
                小节 {{ step.measureNumber }} <em>#{{ step.occurrence }}</em>
                <small>{{ step.event }} · ♩={{ Math.round(step.bpm) }}</small>
              </span>
              <span class="step-time">{{ formatTime(step.startSeconds) }}</span>
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>排练标记（独立保存）</h2>
          <div class="mark-form">
            <input v-model="markLabel" placeholder="标记名，如 A2" />
            <textarea v-model="markComment" placeholder="排练说明，不写回 XML" />
            <button class="button primary" :disabled="!project" @click="addMark">给当前到达位置加标记</button>
          </div>
          <div class="mark-list">
            <article v-for="mark in project?.marks ?? []" :key="mark.id">
              <strong>{{ mark.label }}</strong>
              <p>{{ mark.comment }}</p>
              <small>书面小节 {{ score?.measures[mark.measureIndex]?.number }} · 第 {{ mark.occurrence }} 次</small>
              <button @click="removeMark(mark.id)">移除</button>
            </article>
          </div>
        </section>

        <section class="panel records-panel">
          <h2>排练记录（人工记录 · 时长估算）</h2>
          <p class="muted record-hint">从“实际演奏路径”的每次到达中选择起止；同一小节的第几次到达会被区分。</p>
          <div class="record-form">
            <div class="record-endpoint">
              <div>
                <label>起点</label>
                <select v-model.number="recordStartMeasure" :disabled="!score">
                  <option v-for="measure in score?.measures ?? []" :key="`s-m-${measure.index}`" :value="measure.index">
                    小节 {{ measure.number }}{{ measure.isPickup ? '（弱起）' : '' }}
                  </option>
                </select>
                <select v-model.number="recordStartOccurrence" :disabled="!recordStartOccurrences.length">
                  <option v-for="occurrence in recordStartOccurrences" :key="`s-o-${occurrence}`" :value="occurrence">
                    第 {{ occurrence }} 次到达
                  </option>
                  <option v-if="!recordStartOccurrences.length" :value="recordStartOccurrence">不被演奏</option>
                </select>
              </div>
              <button class="button secondary" type="button" :disabled="!path" @click="useCurrentForRecord('start')">用当前到达</button>
            </div>
            <div class="record-endpoint">
              <div>
                <label>终点（含本小节）</label>
                <select v-model.number="recordEndMeasure" :disabled="!score">
                  <option v-for="measure in score?.measures ?? []" :key="`e-m-${measure.index}`" :value="measure.index">
                    小节 {{ measure.number }}{{ measure.isPickup ? '（弱起）' : '' }}
                  </option>
                </select>
                <select v-model.number="recordEndOccurrence" :disabled="!recordEndOccurrences.length">
                  <option v-for="occurrence in recordEndOccurrences" :key="`e-o-${occurrence}`" :value="occurrence">
                    第 {{ occurrence }} 次到达
                  </option>
                  <option v-if="!recordEndOccurrences.length" :value="recordEndOccurrence">不被演奏</option>
                </select>
              </div>
              <button class="button secondary" type="button" :disabled="!path" @click="useCurrentForRecord('end')">用当前到达</button>
            </div>
            <div class="record-grid">
              <label>练习日期
                <input v-model="recordDate" type="date" />
              </label>
              <label>目标速度 ♩=
                <input v-model="recordTargetBpmInput" type="number" min="1" placeholder="可选" />
              </label>
            </div>
            <label>完成情况
              <select v-model="recordOutcome">
                <option value="completed">已完成</option>
                <option value="partial">部分完成</option>
                <option value="planned">仅计划</option>
              </select>
            </label>
            <textarea v-model="recordNotes" placeholder="备注：本次排练的问题、要求等（不写回 XML）" />
            <div :class="['record-estimate', { invalid: !recordSegment.ok }]">
              <template v-if="recordSegment.ok && recordSegment.estimate">
                预计 {{ formatTime(recordSegment.estimate.durationSeconds) }} ·
                实际路径第 {{ recordSegment.estimate.startStepIndex + 1 }}–{{ recordSegment.estimate.endStepIndex + 1 }} 步 ·
                共 {{ recordSegment.estimate.stepCount }} 个小节步
              </template>
              <template v-else>{{ recordSegment.errorMessage }}</template>
            </div>
            <button
              class="button primary"
              type="button"
              :disabled="!project || !recordSegment.ok"
              @click="addRecord"
            >
              保存排练记录
            </button>
          </div>

          <div class="record-list">
            <div v-if="sortedRecords.length === 0" class="muted">还没有排练记录。</div>
            <article
              v-for="record in sortedRecords"
              :key="record.id"
              :class="['record-card', { active: record.id === activeRecordId, unresolved: !recordSegments.get(record.id) }]"
              @click="locateRecord(record)"
            >
              <header>
                <strong>{{ formatRecordDate(record.date) }}</strong>
                <span :class="['outcome-tag', record.outcome]">{{ outcomeLabel(record.outcome) }}</span>
              </header>
              <p class="record-segment">
                {{ arrivalText(record.start) }}
                <em>→</em>
                {{ arrivalText(record.end) }}
              </p>
              <p v-if="record.notes" class="record-notes">{{ record.notes }}</p>
              <small>
                预计 {{ formatTime((recordSegments.get(record.id)?.durationSeconds ?? record.estimatedSeconds) || 0) }}
                · {{ record.stepCount }} 步
                <template v-if="record.targetBpm !== null"> · 目标 ♩={{ record.targetBpm }}</template>
              </small>
              <div v-if="!recordSegments.get(record.id)" class="record-lost">当前路径中找不到该记录的某次到达，无法定位。</div>
              <div class="record-actions" @click.stop>
                <button type="button" :disabled="!recordSegments.get(record.id)" @click="locateRecord(record, 'start')">定位起点</button>
                <button type="button" :disabled="!recordSegments.get(record.id)" @click="locateRecord(record, 'end')">定位终点</button>
                <button class="record-remove" type="button" @click="removeRecord(record.id)">删除</button>
              </div>
            </article>
          </div>
        </section>

        <section class="panel warnings-panel">
          <h2>记号诊断（不静默忽略）</h2>
          <p v-if="!path?.warnings.length" class="muted">没有诊断信息。</p>
          <div v-for="(warning, index) in path?.warnings ?? []" :key="index" :class="['warning', warning.level]">
            <strong>{{ warning.level === 'error' ? '错误' : warning.level === 'warning' ? '警告' : '信息' }}</strong>
            <span>{{ warning.message }}</span>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ScoreView from './components/ScoreView.vue'
import { buildBeatEvents, Metronome, type BeatEvent } from './audio/metronome'
import {
  createProject,
  deleteProject,
  downloadText,
  exportProject,
  importProjectFile,
  listProjects,
  saveProject,
} from './storage/projects'
import { arrivalsFor, buildPerformancePath, formatTime, parseMusicXml, type ParsedScore } from './score/parser'
import { evaluateSegment, findStepIndex, resolveRecordSegment, type SegmentEstimate } from './score/records'
import { sampleLibrary } from './score/samples'
import type { RehearsalArrivalRef, RehearsalMark, RehearsalOutcome, RehearsalRecord, StoredProject } from './score/types'

const projects = ref<StoredProject[]>([])
const project = ref<StoredProject | null>(null)
const score = ref<ParsedScore | null>(null)
const path = ref<ReturnType<typeof buildPerformancePath> | null>(null)
const selectedMeasureIndex = ref(0)
const selectedOccurrence = ref(1)
const activeStepIndex = ref<number | null>(null)
const currentScoreTime = ref(0)
const playing = ref(false)
const markLabel = ref('')
const markComment = ref('')
const beatEvents = ref<BeatEvent[]>([])

// 排练记录表单状态：两端都以“书面小节 + 第几次到达”表示实际路径位置
const recordStartMeasure = ref(0)
const recordStartOccurrence = ref(1)
const recordEndMeasure = ref(0)
const recordEndOccurrence = ref(1)
const recordDate = ref(todayLocalDate())
const recordTargetBpmInput = ref('')
const recordOutcome = ref<RehearsalOutcome>('partial')
const recordNotes = ref('')
const activeRecordId = ref<string | null>(null)

let metronome: Metronome | null = null
let rafHandle = 0

const selectedMeasure = computed(() => score.value?.measures[selectedMeasureIndex.value] ?? null)
const selectedOccurrences = computed(() => path.value ? arrivalsFor(path.value, selectedMeasureIndex.value) : [])
const playProgress = computed(() => path.value && path.value.totalSeconds > 0 ? currentScoreTime.value / path.value.totalSeconds : 0)

const recordStartOccurrences = computed(() => path.value ? arrivalsFor(path.value, recordStartMeasure.value) : [])
const recordEndOccurrences = computed(() => path.value ? arrivalsFor(path.value, recordEndMeasure.value) : [])

const recordStartRef = computed<RehearsalArrivalRef>(() => ({
  measureIndex: recordStartMeasure.value,
  occurrence: recordStartOccurrence.value,
}))
const recordEndRef = computed<RehearsalArrivalRef>(() => ({
  measureIndex: recordEndMeasure.value,
  occurrence: recordEndOccurrence.value,
}))

const recordSegment = computed(() => evaluateSegment(path.value, recordStartRef.value, recordEndRef.value))

const sortedRecords = computed(() =>
  project.value
    ? [...project.value.records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : [],
)

const recordSegments = computed<Map<string, SegmentEstimate | null>>(() => {
  const result = new Map<string, SegmentEstimate | null>()
  for (const record of project.value?.records ?? []) {
    result.set(record.id, resolveRecordSegment(path.value, record))
  }
  return result
})

const activeRecordRange = computed<SegmentEstimate | null>(() =>
  activeRecordId.value ? recordSegments.value.get(activeRecordId.value) ?? null : null,
)

async function refreshProjectList(): Promise<void> {
  projects.value = await listProjects()
}

function analyze(xml: string): void {
  const parsed = parseMusicXml(xml)
  score.value = parsed
  path.value = buildPerformancePath(parsed)
  beatEvents.value = buildBeatEvents(path.value.steps, parsed.measures)
  selectedMeasureIndex.value = 0
  selectedOccurrence.value = path.value.arrivals[0]?.occurrences[0] ?? 1
  const firstStep = path.value.steps[0]
  const lastStep = path.value.steps[path.value.steps.length - 1]
  recordStartMeasure.value = firstStep?.measureIndex ?? 0
  recordStartOccurrence.value = firstStep?.occurrence ?? 1
  recordEndMeasure.value = lastStep?.measureIndex ?? 0
  recordEndOccurrence.value = lastStep?.occurrence ?? 1
  activeRecordId.value = null
  stopPlayback()
}

function loadXml(name: string, xml: string): void {
  project.value = createProject(name, xml)
  analyze(xml)
  void refreshProjectList()
}

function loadSample(sample: { name: string; getXml: () => string }): void {
  loadXml(sample.name, sample.getXml())
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.name.toLowerCase().endsWith('.mxl')) {
    window.alert('压缩 .mxl 尚未列入明确支持范围。请解压为 .musicxml/.xml 后打开。')
    return
  }
  loadXml(file.name.replace(/\.(musicxml|xml)$/i, ''), await file.text())
  input.value = ''
}

function loadStoredProject(item: StoredProject): void {
  project.value = JSON.parse(JSON.stringify(item)) as StoredProject
  project.value.marks ??= []
  project.value.records ??= []
  analyze(project.value.originalXml)
}

async function saveCurrentProject(): Promise<void> {
  if (!project.value) return
  project.value.updatedAt = new Date().toISOString()
  await saveProject(project.value)
  await refreshProjectList()
}

async function removeStoredProject(id: string): Promise<void> {
  await deleteProject(id)
  await refreshProjectList()
}

async function onProjectImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const imported = await importProjectFile(file)
    await saveProject(imported)
    await refreshProjectList()
    loadStoredProject(imported)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '工程导入失败')
  } finally {
    input.value = ''
  }
}

function downloadOriginalXml(): void {
  if (!project.value) return
  downloadText(`${project.value.name}.musicxml`, project.value.originalXml, 'application/vnd.recordare.musicxml+xml')
}

function downloadProjectBundle(): void {
  if (!project.value) return
  const bundle = exportProject(project.value)
  downloadText(`${project.value.name}.rehearsal.json`, JSON.stringify(bundle, null, 2), 'application/json')
}

function seekToStep(index: number): void {
  activeStepIndex.value = index
  const step = path.value?.steps[index]
  if (step) {
    currentScoreTime.value = step.startSeconds
    selectedMeasureIndex.value = step.measureIndex
    selectedOccurrence.value = step.occurrence
  }
}

function chooseMeasure(measureIndex: number): void {
  selectedMeasureIndex.value = measureIndex
  const occurrences = path.value ? arrivalsFor(path.value, measureIndex) : []
  selectedOccurrence.value = occurrences[0] ?? 1
  const stepIndex = path.value?.steps.findIndex((step) => step.measureIndex === measureIndex && step.occurrence === selectedOccurrence.value) ?? -1
  if (stepIndex >= 0) seekToStep(stepIndex)
}

function findSelectedStepIndex(): number {
  return path.value?.steps.findIndex(
    (step) => step.measureIndex === selectedMeasureIndex.value && step.occurrence === selectedOccurrence.value,
  ) ?? -1
}

async function startPlayback(): Promise<void> {
  if (!path.value) return
  let stepIndex = findSelectedStepIndex()
  if (stepIndex < 0) stepIndex = 0
  const startTime = path.value.steps[stepIndex]?.startSeconds ?? 0
  metronome ??= new Metronome((event) => {
    activeStepIndex.value = event.stepIndex
  })
  await metronome.start(beatEvents.value, currentScoreTime.value >= startTime ? currentScoreTime.value : startTime)
  playing.value = true
  tick()
}

function tick(): void {
  if (!metronome || !playing.value) return
  currentScoreTime.value = metronome.currentTime
  const position = metronome.positionAt(currentScoreTime.value)
  if (position) activeStepIndex.value = position.stepIndex
  if (path.value && currentScoreTime.value >= path.value.totalSeconds) {
    stopPlayback()
    return
  }
  rafHandle = window.requestAnimationFrame(tick)
}

function pausePlayback(): void {
  if (metronome) currentScoreTime.value = metronome.currentTime
  metronome?.stop()
  playing.value = false
  cancelAnimationFrame(rafHandle)
}

function stopPlayback(): void {
  metronome?.stop()
  playing.value = false
  cancelAnimationFrame(rafHandle)
  const firstIndex = findSelectedStepIndex()
  activeStepIndex.value = firstIndex >= 0 ? firstIndex : null
  currentScoreTime.value = firstIndex >= 0 ? path.value?.steps[firstIndex].startSeconds ?? 0 : 0
}

async function togglePlayback(): Promise<void> {
  if (playing.value) pausePlayback()
  else await startPlayback()
}

function arrivalDescription(occurrence: number): string {
  const step = path.value?.steps.find((item) => item.measureIndex === selectedMeasureIndex.value && item.occurrence === occurrence)
  if (!step) return '未到达'
  return `${step.event}，${formatTime(step.startSeconds)}`
}

function addMark(): void {
  if (!project.value) return
  const mark: RehearsalMark = {
    id: crypto.randomUUID(),
    measureIndex: selectedMeasureIndex.value,
    occurrence: selectedOccurrence.value,
    label: markLabel.value || `小节 ${selectedMeasure.value?.number}`,
    comment: markComment.value,
    color: '#f4b942',
    createdAt: new Date().toISOString(),
  }
  project.value.marks.push(mark)
  markLabel.value = ''
  markComment.value = ''
  void saveCurrentProject()
}

function removeMark(id: string): void {
  if (!project.value) return
  project.value.marks = project.value.marks.filter((mark) => mark.id !== id)
  void saveCurrentProject()
}

const outcomeLabels: Record<RehearsalOutcome, string> = {
  completed: '已完成',
  partial: '部分完成',
  planned: '仅计划',
}

function outcomeLabel(outcome: RehearsalOutcome): string {
  return outcomeLabels[outcome] ?? outcome
}

function todayLocalDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatRecordDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!match) return date
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
}

/** “书面小节 N · 第 k 次到达（第 i 步）”：第几次到达让同名小节的记录仍指向正确的那一次。 */
function arrivalText(arrival: RehearsalArrivalRef): string {
  const measure = score.value?.measures[arrival.measureIndex]
  const stepIndex = path.value ? findStepIndex(path.value, arrival) : -1
  const numberText = measure ? measure.number : '?'
  return `小节 ${numberText} · 第 ${arrival.occurrence} 次到达${stepIndex >= 0 ? `（第 ${stepIndex + 1} 步）` : ''}`
}

function useCurrentForRecord(which: 'start' | 'end'): void {
  if (which === 'start') {
    recordStartMeasure.value = selectedMeasureIndex.value
    recordStartOccurrence.value = selectedOccurrence.value
  } else {
    recordEndMeasure.value = selectedMeasureIndex.value
    recordEndOccurrence.value = selectedOccurrence.value
  }
  activeRecordId.value = null
}

function parseTargetBpm(): number | null {
  const value = Number.parseInt(recordTargetBpmInput.value, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

function addRecord(): void {
  if (!project.value) return
  const result = recordSegment.value
  if (!result.ok || !result.estimate) {
    window.alert(result.errorMessage ?? '当前起止位置不能创建排练记录。')
    return
  }
  const date = recordDate.value || todayLocalDate()
  const record: RehearsalRecord = {
    id: crypto.randomUUID(),
    date,
    targetBpm: parseTargetBpm(),
    notes: recordNotes.value.trim(),
    outcome: recordOutcome.value,
    start: { ...recordStartRef.value },
    end: { ...recordEndRef.value },
    estimatedSeconds: result.estimate.durationSeconds,
    stepCount: result.estimate.stepCount,
    createdAt: new Date().toISOString(),
  }
  project.value.records.push(record)
  recordNotes.value = ''
  recordTargetBpmInput.value = ''
  recordOutcome.value = 'partial'
  recordDate.value = todayLocalDate()
  activeRecordId.value = record.id
  void saveCurrentProject()
}

function removeRecord(id: string): void {
  if (!project.value) return
  project.value.records = project.value.records.filter((record) => record.id !== id)
  if (activeRecordId.value === id) activeRecordId.value = null
  void saveCurrentProject()
}

function locateRecord(record: RehearsalRecord, side: 'start' | 'end' | 'segment' = 'segment'): void {
  const estimate = resolveRecordSegment(path.value, record)
  if (!estimate) {
    window.alert('这条记录的某次到达在当前演奏路径中不存在，无法定位（谱面可能已改变）。')
    return
  }
  activeRecordId.value = record.id
  const arrival = side === 'end' ? record.end : record.start
  selectedMeasureIndex.value = arrival.measureIndex
  selectedOccurrence.value = arrival.occurrence
  const stepIndex = side === 'end' ? estimate.endStepIndex : estimate.startStepIndex
  seekToStep(stepIndex)
  scrollStepIntoView(stepIndex)
}

function scrollStepIntoView(stepIndex: number): void {
  // 等待覆盖层与谱面布局就绪后再滚动到目标小节
  window.setTimeout(() => {
    const host = document.querySelector('.score-host')
    host?.querySelector(`[data-measure-index="${path.value?.steps[stepIndex]?.measureIndex ?? -1}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    })
  }, 60)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

watch(selectedMeasureIndex, () => {
  const occurrences = path.value ? arrivalsFor(path.value, selectedMeasureIndex.value) : []
  if (!occurrences.includes(selectedOccurrence.value)) selectedOccurrence.value = occurrences[0] ?? 1
})

watch(recordStartMeasure, () => {
  const occurrences = path.value ? arrivalsFor(path.value, recordStartMeasure.value) : []
  if (!occurrences.includes(recordStartOccurrence.value)) recordStartOccurrence.value = occurrences[0] ?? 1
})

watch(recordEndMeasure, () => {
  const occurrences = path.value ? arrivalsFor(path.value, recordEndMeasure.value) : []
  if (!occurrences.includes(recordEndOccurrence.value)) recordEndOccurrence.value = occurrences[0] ?? 1
})

// 手动调整表单端点时，取消上一条记录的段落高亮
watch([recordStartMeasure, recordStartOccurrence, recordEndMeasure, recordEndOccurrence], () => {
  activeRecordId.value = null
})

watch(selectedOccurrence, () => {
  const index = findSelectedStepIndex()
  if (index >= 0 && activeStepIndex.value !== index) seekToStep(index)
})

watch(project, () => {
  if (project.value) void saveProject(project.value).then(refreshProjectList)
}, { deep: true })

onBeforeUnmount(() => {
  stopPlayback()
})

void refreshProjectList()
loadSample(sampleLibrary[0])
</script>
