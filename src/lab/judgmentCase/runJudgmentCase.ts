/**
 * 판정 사례를 실제 판정 엔진으로 재생한다.
 *
 * 엔진 함수는 주입받는다. 다른 워크트리의 엔진(예: 리뷰 중인 PR)을 Vite ssrLoadModule로 불러와도
 * 같은 러너로 돌릴 수 있도록, 의존하는 표면은 안정 API(compileJudgmentChart·NoteJudgmentSession·
 * validateChart)로 한정한다. 구동은 기존 프로브와 같다: 입력 시각마다 processBatch, 그 사이는
 * 16ms 프레임 advance, 마지막 노트 + Good 뒤 프레임까지 진행한 다음 finalize.
 * 세션에 bodyStates(유닛별 시작·실패·등록 키)가 있으면 batch 직전과 재생 뒤 상태도 담는다. 없는 엔진이면 null.
 */

import type { compileJudgmentChart } from "../../game/judgment/compiledJudgmentChart";
import type { NoteJudgmentSession } from "../../game/judgment/NoteJudgmentSession";
import type { validateChart } from "../../shared/validation";
import { JUDGMENT_WINDOWS } from "../../shared/constants";
import type { JudgmentCase, JudgmentCaseAction } from "./chartCase";

/** 러너가 쓰는 엔진 안정 API. 다른 워크트리 모듈도 같은 이름·모양이어야 한다. */
export interface JudgmentEngine {
  compileJudgmentChart: typeof compileJudgmentChart;
  NoteJudgmentSession: typeof NoteJudgmentSession;
  validateChart: typeof validateChart;
}

export interface JudgmentCaseRunEvent {
  kind: string;
  noteIndex: number;
  unitIndex?: number;
  itemId?: string;
  grade: string;
  deltaMs: number;
  inputAt: number | null;
  confirmedAt: number;
  key?: string;
  bodyState?: string;
  phase?: string;
}

export interface JudgmentCaseScoreItem {
  id: string;
  kind: string;
  noteIndex: number;
  unitIndex: number;
  timeMs: number;
}

/** 바디 유닛 하나의 엔진 상태(NoteJudgmentSession.bodyStates 한 항목) */
export interface JudgmentCaseUnitState {
  noteIndex: number;
  unitIndex: number;
  /** 한 번이라도 시작했는지. 엔진에서 true로만 바뀌므로 failed && !active = 시작하지 못한 유닛 */
  active: boolean;
  failed: boolean;
  complete: boolean;
  /** 이 유닛에 등록된 유지 키 */
  registeredKeys: string[];
}

export interface JudgmentCaseBatchUnitStates {
  /** 입력 batch 시각 */
  atMs: number;
  /** 그 batch를 processBatch하기 직전의 유닛 상태 */
  unitStates: JudgmentCaseUnitState[];
}

export interface JudgmentCaseCounts {
  perfect: number;
  great: number;
  good: number;
  goodTrill: number;
  miss: number;
}

export interface JudgmentCaseRun {
  events: JudgmentCaseRunEvent[];
  counts: JudgmentCaseCounts;
  achievementRate: number;
  isFullCombo: boolean;
  processedNotes: number;
  totalNotes: number;
  /** finalize까지 예외 없이 끝났는지 */
  finalized: boolean;
  scoreItems: JudgmentCaseScoreItem[];
  /** maintenanceMiss가 아닌 어떤 이벤트로도 정산되지 않은 score item */
  unsettledItems: JudgmentCaseScoreItem[];
  validationErrors: { rule: string; message: string }[];
  error: { message: string; atMs: number | null } | null;
  /** advance 프레임 간격(ms). 프레임은 0ms에서 시작하는 이 간격의 격자다 */
  frameMs: number;
  /** 재생을 마친 뒤(finalize 또는 예외 직후) 유닛 상태. 세션에 bodyStates가 없으면 null */
  unitStates: JudgmentCaseUnitState[] | null;
  /** 입력 batch마다 processBatch 직전 유닛 상태. 세션에 bodyStates가 없으면 null */
  unitStatesBeforeBatch: JudgmentCaseBatchUnitStates[] | null;
}

export interface RunJudgmentCaseOptions {
  /** advance 프레임 간격(ms). 기본 16 */
  frameMs?: number;
}

const DEFAULT_FRAME_MS = 16;

function batchesOf(actions: readonly JudgmentCaseAction[]): [number, { key: string; lane: number; type: "down" | "up" }[]][] {
  const batches: [number, { key: string; lane: number; type: "down" | "up" }[]][] = [];
  for (const action of actions) {
    const last = batches.at(-1);
    const input = { key: action.key, lane: action.lane, type: action.type };
    if (last && last[0] === action.atMs) last[1].push(input);
    else batches.push([action.atMs, [input]]);
  }
  return batches;
}

/** 세션의 bodyStates를 읽는다. 이 getter가 없는 엔진(다른 워크트리)이면 null */
function readUnitStates(session: unknown): JudgmentCaseUnitState[] | null {
  const states: unknown = (session as { bodyStates?: unknown }).bodyStates;
  if (!Array.isArray(states)) return null;
  return states.map((state: Partial<JudgmentCaseUnitState>) => ({
    noteIndex: state.noteIndex ?? -1,
    unitIndex: state.unitIndex ?? 0,
    active: state.active === true,
    failed: state.failed === true,
    complete: state.complete === true,
    registeredKeys: Array.isArray(state.registeredKeys) ? [...state.registeredKeys] : [],
  }));
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export function runJudgmentCase(judgmentCase: JudgmentCase, engine: JudgmentEngine, options: RunJudgmentCaseOptions = {}): JudgmentCaseRun {
  const frameMs = options.frameMs ?? DEFAULT_FRAME_MS;
  const { chart } = judgmentCase;
  const validationErrors = engine.validateChart({
    notes: chart.notes,
    trillZones: chart.trillZones,
    restZones: chart.restZones,
    events: chart.events,
  }).map(({ rule, message }) => ({ rule, message }));

  const starts = new Map(judgmentCase.notes.map((note) => [note.index, note.startMs] as [number, number]));
  const ends = new Map(judgmentCase.notes.flatMap((note) => (note.endMs === undefined ? [] : [[note.index, note.endMs] as [number, number]])));
  let compiled: ReturnType<JudgmentEngine["compileJudgmentChart"]>;
  let session: InstanceType<JudgmentEngine["NoteJudgmentSession"]>;
  try {
    compiled = engine.compileJudgmentChart(chart.notes, starts, ends, chart.trillZones);
    session = new engine.NoteJudgmentSession(compiled);
  } catch (caught) {
    return emptyRun(validationErrors, { message: messageOf(caught), atMs: null }, frameMs);
  }
  const scoreItems = compiled.scoreItems.map((item): JudgmentCaseScoreItem => ({
    id: item.id,
    kind: item.kind,
    noteIndex: item.noteIndex,
    unitIndex: item.unitOrdinal ?? item.unitIndex ?? 0,
    timeMs: item.timeMs,
  }));

  const times = [
    ...judgmentCase.notes.flatMap((note) => (note.endMs === undefined ? [note.startMs] : [note.startMs, note.endMs])),
    ...judgmentCase.actions.map((action) => action.atMs),
  ];
  const earliest = times.length > 0 ? Math.min(...times) : 0;
  const latest = times.length > 0 ? Math.max(...times) : 0;
  let frame = Math.min(0, Math.floor(earliest / frameMs) * frameMs - frameMs);
  let currentAt: number | null = null;
  let error: JudgmentCaseRun["error"] = null;
  let finalized = false;
  const tracksUnits = readUnitStates(session) !== null;
  const unitStatesBeforeBatch: JudgmentCaseBatchUnitStates[] = [];
  try {
    for (const [at, inputs] of batchesOf(judgmentCase.actions)) {
      while (frame < at) {
        currentAt = frame;
        session.advance(frame);
        frame += frameMs;
      }
      currentAt = at;
      if (tracksUnits) unitStatesBeforeBatch.push({ atMs: at, unitStates: readUnitStates(session)! });
      session.processBatch(at, inputs);
    }
    // 게임처럼 마지막 노트 + Good을 처음 넘는 프레임까지 진행한다. 남은 정리는 finalize가 맡는다.
    const tail = latest + JUDGMENT_WINDOWS.GOOD + 1;
    for (let passed = false; !passed; frame += frameMs) {
      currentAt = frame;
      session.advance(frame);
      passed = frame > tail;
    }
    currentAt = null;
    session.finalize();
    finalized = true;
  } catch (caught) {
    error = { message: messageOf(caught), atMs: currentAt };
  }

  const events = session.events.map((event): JudgmentCaseRunEvent => ({
    kind: event.kind,
    noteIndex: event.noteIndex,
    unitIndex: event.unitIndex,
    itemId: event.itemId,
    grade: event.grade,
    deltaMs: event.deltaMs,
    inputAt: event.inputAt,
    confirmedAt: event.confirmedAt,
    key: event.key,
    bodyState: event.bodyState,
    phase: event.phase,
  }));
  const settled = new Set(events.flatMap((event) => (event.kind !== "maintenanceMiss" && event.itemId ? [event.itemId] : [])));
  const state = session.score.getState();

  return {
    events,
    counts: {
      perfect: state.judgmentCounts.perfect ?? 0,
      great: state.judgmentCounts.great ?? 0,
      good: state.judgmentCounts.good ?? 0,
      goodTrill: state.judgmentCounts.goodTrill ?? 0,
      miss: state.judgmentCounts.miss ?? 0,
    },
    achievementRate: state.achievementRate,
    isFullCombo: state.isFullCombo,
    processedNotes: state.processedNotes,
    totalNotes: state.totalNotes,
    finalized,
    scoreItems,
    unsettledItems: scoreItems.filter((item) => !settled.has(item.id)),
    validationErrors,
    error,
    frameMs,
    unitStates: readUnitStates(session),
    unitStatesBeforeBatch: tracksUnits ? unitStatesBeforeBatch : null,
  };
}

/** compile·세션 생성이 실패하면 재생 없이 검증 결과와 예외만 담는다. */
function emptyRun(validationErrors: JudgmentCaseRun["validationErrors"], error: NonNullable<JudgmentCaseRun["error"]>, frameMs: number): JudgmentCaseRun {
  return {
    events: [],
    counts: { perfect: 0, great: 0, good: 0, goodTrill: 0, miss: 0 },
    achievementRate: 0,
    isFullCombo: false,
    processedNotes: 0,
    totalNotes: 0,
    finalized: false,
    scoreItems: [],
    unsettledItems: [],
    validationErrors,
    error,
    frameMs,
    unitStates: null,
    unitStatesBeforeBatch: null,
  };
}
