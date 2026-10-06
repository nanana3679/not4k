import { createChartTiming } from '../shared';
import type { Chart, NoteEntity } from '../shared/types';
import { beat } from '../shared/types/beat';

/**
 * 기어 미리보기 시연용 긴 차트와 정해진 데모 판정. 실제 입력·판정 엔진 없이, 정해 둔 노트를 맞히거나 놓친 것처럼
 * 렌더러에 표시 상태만 건다(맞힌 노트는 판정선에서 사라지고, 놓친 노트는 계속 내려간다).
 */
export interface GearPreviewHit {
  /** 차트 notes 배열의 인덱스(렌더러 applyNoteDisplayEffect 대상). */
  index: number;
  lane: number;
  startMs: number;
  /** 롱노트 끝. 포인트 노트는 startMs와 같다. */
  endMs: number;
  long: boolean;
}

export interface GearPreviewDemo {
  chart: Chart;
  durationMs: number;
  hits: GearPreviewHit[];
}

const BEATS_PER_MEASURE = 4;
const EIGHTH_LANES = [1, 2, 3, 4, 4, 3, 2, 1] as const;
export const GEAR_PREVIEW_KEY_PULSE_MS = 80;

/**
 * 120 BPM 4/4. 첫 마디는 비워 두고 1~measures마디에 노트를 둔 뒤 한 마디 여유를 둔다.
 * 4마디마다 레인 1·4 롱노트(각 2박)와 레인 2·3 엇박 싱글, 나머지 마디는 8분음표 싱글 왕복.
 * 90마디면 약 3분이라 비행 배경 고도가 천천히 내려가고 되감김이 드물다.
 */
export function buildGearPreviewDemo(measures = 90): GearPreviewDemo {
  const notes: NoteEntity[] = [];
  for (let measure = 1; measure <= measures; measure++) {
    const start = measure * BEATS_PER_MEASURE * 2; // 8분음표 단위
    if (measure % 4 === 0) {
      notes.push({ type: 'long', lane: 1, beat: beat(start, 2), endBeat: beat(start + 4, 2) });
      notes.push({ type: 'single', lane: 2, beat: beat(start + 1, 2) });
      notes.push({ type: 'single', lane: 2, beat: beat(start + 3, 2) });
      notes.push({ type: 'long', lane: 4, beat: beat(start + 4, 2), endBeat: beat(start + 8, 2) });
      notes.push({ type: 'single', lane: 3, beat: beat(start + 5, 2) });
      notes.push({ type: 'single', lane: 3, beat: beat(start + 7, 2) });
      continue;
    }
    EIGHTH_LANES.forEach((lane, eighth) => notes.push({ type: 'single', lane, beat: beat(start + eighth, 2) }));
  }

  const chart: Chart = {
    meta: {
      title: 'Gear',
      artist: 'not4k',
      difficultyLabel: 'INFILTRATION',
      difficultyLevel: 1,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes,
    trillZones: [],
    restZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(BEATS_PER_MEASURE) },
    ],
  };
  const timing = createChartTiming(chart);
  const hits = notes
    .map((note, index): GearPreviewHit => {
      const startMs = timing.noteTimesMs.get(index)!;
      return { index, lane: note.lane, startMs, endMs: timing.noteEndTimesMs.get(index) ?? startMs, long: 'endBeat' in note };
    })
    .sort((a, b) => a.startMs - b.startMs || a.lane - b.lane);
  const durationMs = timing.beatToMs(beat((measures + 2) * BEATS_PER_MEASURE));
  return { chart, durationMs, hits };
}

/** 놓친 노트는 늦은 판정 창이 닫히는 때처럼 머리 120ms 뒤에 miss로 표시한다. */
export const GEAR_PREVIEW_MISS_DELAY_MS = 120;

export type GearPreviewNoteEvent =
  /** 머리 판정: 키봄·PERFECT·콤보 증가. */
  | { type: 'hit'; index: number; lane: number; atMs: number }
  /** 노트를 숨긴다(포인트는 머리, 롱노트는 끝). */
  | { type: 'processed'; index: number; atMs: number }
  /** MISS·콤보 끊김·놓친 노트 표시(계속 내려간다). */
  | { type: 'miss'; index: number; lane: number; atMs: number };

export interface GearPreviewSchedule {
  /** 시각 순서 이벤트. */
  events: GearPreviewNoteEvent[];
  /** 키빔: 맞힌 포인트는 머리부터 80ms, 맞힌 롱노트는 머리부터 끝까지. */
  beams: { lane: number; fromMs: number; toMs: number }[];
}

/**
 * 포인트 노트는 시각 순서로 5개마다 1개(5·10·15번째…)를, 롱노트는 4마디 패턴마다 레인 4 롱노트를 놓친다.
 * 나머지는 맞힌다.
 */
export function buildGearPreviewSchedule(hits: readonly GearPreviewHit[]): GearPreviewSchedule {
  const events: GearPreviewNoteEvent[] = [];
  const beams: GearPreviewSchedule['beams'] = [];
  let pointOrdinal = 0;
  for (const hit of hits) {
    const missed = hit.long ? hit.lane === 4 : ++pointOrdinal % 5 === 0;
    if (missed) {
      events.push({ type: 'miss', index: hit.index, lane: hit.lane, atMs: hit.startMs + GEAR_PREVIEW_MISS_DELAY_MS });
      continue;
    }
    events.push({ type: 'hit', index: hit.index, lane: hit.lane, atMs: hit.startMs });
    events.push({ type: 'processed', index: hit.index, atMs: hit.long ? hit.endMs : hit.startMs });
    beams.push({ lane: hit.lane, fromMs: hit.startMs, toMs: hit.long ? hit.endMs : hit.startMs + GEAR_PREVIEW_KEY_PULSE_MS });
  }
  // 같은 시각이면 만든 순서(hit → processed)를 지킨다.
  events.sort((a, b) => a.atMs - b.atMs);
  return { events, beams };
}

export interface GearPreviewLoopState {
  previousMs: number;
  combo: number;
  /** 이 렌더러가 재생을 시작한 뒤 놓친 노트 누적 수(차트를 되감아도 유지, 렌더러를 다시 만들면 0부터). */
  missed: number;
}

/** 이보다 오래 지난 이벤트(숨은 탭에서 돌아와 시간이 건너뛴 경우)는 키봄·판정 글자를 생략한다. */
export const GEAR_PREVIEW_STALE_EVENT_MS = 100;

export function initialGearPreviewLoopState(): GearPreviewLoopState {
  return { previousMs: -1, combo: 0, missed: 0 };
}

/**
 * 한 프레임(previousMs → currentMs)에 지나간 이벤트와 콤보·놓친 수, 현재 키빔 레인.
 * 시각이 되감기면(wrapped) 콤보를 0으로 돌리고 0부터 currentMs까지만 본다. 호출자는 이때 setChart로 노트 표시 상태를 비운다.
 * 100ms보다 오래 지난 이벤트는 stale로 표시한다. 호출자는 노트 표시 효과는 그대로 걸고 키봄·판정 글자만 생략한다.
 */
export function stepGearPreviewLoop(schedule: GearPreviewSchedule, state: GearPreviewLoopState, currentMs: number) {
  const wrapped = currentMs < state.previousMs;
  const from = wrapped ? -Infinity : state.previousMs;
  let combo = wrapped ? 0 : state.combo;
  let missed = state.missed;
  const events = schedule.events
    .filter((event) => event.atMs > from && event.atMs <= currentMs)
    .map((event) => ({ ...event, stale: currentMs - event.atMs > GEAR_PREVIEW_STALE_EVENT_MS }));
  for (const event of events) {
    if (event.type === 'hit') combo += 1;
    if (event.type === 'miss') { combo = 0; missed += 1; }
  }
  const beamLanes = [false, false, false, false];
  for (const beam of schedule.beams) {
    if (beam.fromMs <= currentMs && currentMs < beam.toMs) beamLanes[beam.lane - 1] = true;
  }
  return { wrapped, events, beamLanes, state: { previousMs: currentMs, combo, missed } };
}
