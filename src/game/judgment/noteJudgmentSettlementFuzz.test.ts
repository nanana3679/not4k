import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { validateChart } from "../../shared/validation";
import { InputTimeline } from "../input/InputTimeline";
import { drainPlaySessionInputs } from "../screens/playSessionInput";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import type { JudgmentInput, NoteJudgmentEvent } from "./NoteJudgmentCore";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
import { body, point } from "./noteJudgmentTestHarness";

/**
 * 결정적 퍼즈: seed마다 맞닿은 단일 레인 롱노트 체인과 경계 근처 입력을 만들고
 * 실제 NoteJudgmentSession으로 끝까지 재생해 점수 정산 불변식을 확인한다.
 * Math.random은 쓰지 않는다. 실패하면 생성기와 seed 번호로 같은 차트·입력을 다시 만들 수 있다.
 *
 * 판정 모델(RFD 0020 등록 키 / RFD 0032 hold 수)과 무관한 성질만 본다. 정산 예외가 없을 것, 끝까지 재생하면 모든 점수 항목을
 * 정확히 한 번씩 정산할 것, holdOnly 끝에 release 판정을 내지 않을 것. 현재 엔진이 어기는 seed는 아래 래칫에 정확한 목록으로
 * 고정한다. 결함을 고쳐도, 새 결함이 생겨도 목록이 달라져 테스트가 실패하므로 그때 목록과 주석을 함께 갱신한다.
 */
const SEEDS = 3000;
const SWAP_SEEDS = 3000;
const SHORT_SEEDS = 1500;
const OBSERVED_SEEDS = 1500;
/** 짧은·중간 바디 생성기의 seed 수. PR #188 3차 수정(cafaa68)의 지연 승계 회귀(4차 리뷰 HIGH-1)가 seed 6202에서 드러났던 범위다. */
const SHORT_MID_SEEDS = 6500;
const START = 1000;
const LATE_FIRST_HEAD = 30;
const KEYS = ["A", "B", "C", "D"] as const;
/** 일반 생성기의 구간 길이(ms). */
const GENERAL_LENGTHS = [60, 100, 200, 500, 1000] as const;
/** 짧은 바디 생성기의 구간 길이(ms). 뒤 바디의 E−Good이 S보다 앞서는 짧은 체인(RFD 0020 §2.14)을 자주 만든다. */
const SHORT_LENGTHS = [20, 40, 60, 100, 200] as const;
/** 짧은·중간 바디 생성기의 구간 길이(ms). 짧은 바디 생성기에 80·120을 더해 뒤 E−Good이 경계 근처에 오는 체인을 늘린다. */
const SHORT_MID_LENGTHS = [20, 40, 60, 80, 100, 120, 200] as const;
/** 관측 지연 변형에서 batch마다 고르는 최대 지연(ms). */
const MAX_OBSERVED_DELAY = 15;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, values: readonly T[]): T => values[Math.floor(rng() * values.length)];
/** lo~hi ms를 5ms 단위로 고른다. */
const offset = (rng: () => number, lo: number, hi: number) => lo + Math.round(rng() * (hi - lo) / 5) * 5;
/** 관측 지연 PRNG. 차트·입력을 만드는 seed의 PRNG와 겹치지 않는 별도 수열이다. */
const delayRngFor = (seed: number) => mulberry32(seed + 0x9e3779b9);

/** 2~4개 구간을 맞닿게 잇는다. 각 구간은 head 없음·single·double과 길이(lengths 중)·unit 수·holdOnly를 무작위로 고른다. */
function chartFor(rng: () => number, lengths: readonly number[] = GENERAL_LENGTHS): NoteEntity[] {
  const notes: NoteEntity[] = [];
  const segments = 2 + Math.floor(rng() * 3);
  let at = START;
  for (let i = 0; i < segments; i++) {
    const head = pick(rng, ["none", "single", "single", "double"] as const);
    const end = at + pick(rng, lengths);
    if (head !== "none") notes.push(point(at, head));
    notes.push(body(at, end, rng() < 0.5 ? "long" : "doubleLong", rng() < 0.2));
    at = end;
  }
  return notes;
}

/** 첫 시작은 START에 필요한 키 수만큼 누르고, 이후 각 경계·끝 ±100ms(5ms 단위)에 교대·떼기·누르기를 넣는다. */
function inputsFor(rng: () => number, notes: readonly NoteEntity[]) {
  const first = notes[0];
  const firstKeys = first.type === "double" || first.type === "doubleLong" ? ["A", "B"] : ["A"];
  const times = [...new Set(notes.flatMap(note => "endBeat" in note ? [note.beat.n, note.endBeat.n] : [note.beat.n]))]
    .filter(time => time > START).sort((a, b) => a - b);
  const actions: { at: number; key: string; type: "up" | "down" }[] = [];
  for (const time of times) {
    const pattern = rng();
    if (pattern < 0.45) {
      actions.push({ at: time + offset(rng, -100, 100), key: pick(rng, KEYS), type: "up" });
      actions.push({ at: time + offset(rng, -100, 100), key: pick(rng, KEYS), type: "down" });
    } else if (pattern < 0.65) actions.push({ at: time + offset(rng, -100, 100), key: pick(rng, KEYS), type: "up" });
    else if (pattern < 0.8) actions.push({ at: time + offset(rng, -100, 100), key: pick(rng, KEYS), type: "down" });
  }
  // 첫 head 입력(START) 뒤의 입력만 남긴다. 첫 head 직후(START~START+30)의 이른 up도 생성한다.
  const ordered = actions.filter(action => action.at > START).sort((a, b) => a.at - b.at);
  const held = new Set(firstKeys);
  const batches = new Map<number, JudgmentInput[]>();
  for (const action of ordered) {
    // 고른 키가 이미 그 상태면 같은 종류가 가능한 다른 키로 바꿔 키별 down/up 인과관계를 지킨다.
    const eligible = KEYS.filter(key => action.type === "up" ? held.has(key) : !held.has(key));
    if (eligible.length === 0) continue;
    const key = eligible.includes(action.key as typeof KEYS[number]) ? action.key : pick(rng, eligible);
    if (action.type === "up") held.delete(key); else held.add(key);
    const batch = batches.get(action.at) ?? [];
    batch.push({ key, lane: 1, type: action.type });
    batches.set(action.at, batch);
  }
  return { firstKeys, batches: [...batches].sort((a, b) => a[0] - b[0]) };
}

/**
 * 2→1 감소 + 연결 head 교대 집중 차트: double head START + doubleLong [START,경계] → single head 경계 +
 * 뒤 바디 60~1000ms(holdOnly 35%). 40%는 뒤에 headless 또는 double head doubleLong 증가 구간을 잇는다.
 */
function swapChartFor(rng: () => number): NoteEntity[] {
  const boundary = START + pick(rng, [60, 100, 200, 500, 1000]);
  const end = boundary + pick(rng, [60, 80, 100, 150, 200, 500, 1000]);
  const notes = [point(START, "double"), body(START, boundary, "doubleLong"), point(boundary), body(boundary, end, "long", rng() < 0.35)];
  const tail = rng();
  if (tail < 0.4) {
    if (tail < 0.2) notes.push(point(end, "double"));
    notes.push(body(end, end + pick(rng, [100, 500]), "doubleLong"));
  }
  return notes;
}

/**
 * A·B로 double head를 정박에 치고, 한 키를 경계 −60~+80ms에 떼고 C로 연결 head를 경계 −40~+115ms에 친다.
 * 남은 키는 경계 근처(−60~+150ms)나 뒤 바디 끝에서 떼거나 끝까지 유지한다. 증가 구간이 있으면 D(double head면 E도)를
 * 누르고 끝 근처에서 뗀다. 키별 down/up 순서가 어긋나는 입력은 버린다.
 */
function swapInputsFor(rng: () => number, notes: readonly NoteEntity[]) {
  const boundary = notes[2].beat.n;
  const end = (notes[3] as { endBeat: { n: number } }).endBeat.n;
  const last = notes.at(-1) as { endBeat: { n: number } };
  const increase = notes.length > 4;
  const doubleHeadIncrease = notes.length > 5;
  const [swapKey, restKey] = rng() < 0.5 ? ["A", "B"] : ["B", "A"];
  const actions: { at: number; key: string; type: "up" | "down" }[] = [
    { at: boundary + offset(rng, -60, 80), key: swapKey, type: "up" },
    { at: boundary + offset(rng, -40, 115), key: "C", type: "down" },
  ];
  const rest = rng();
  if (rest < 0.6) actions.push({ at: boundary + offset(rng, -60, 150), key: restKey, type: "up" });
  else if (rest < 0.8) actions.push({ at: end + offset(rng, -60, 80), key: restKey, type: "up" });
  if (increase) {
    actions.push({ at: end + offset(rng, -40, 115), key: "D", type: "down" });
    if (doubleHeadIncrease) {
      actions.push({ at: end + offset(rng, -60, 80), key: "C", type: "up" });
      actions.push({ at: end + offset(rng, -40, 115), key: "E", type: "down" });
    }
  }
  for (const key of ["C", "D", "E"]) if (rng() < 0.85) actions.push({ at: last.endBeat.n + offset(rng, -60, 80), key, type: "up" });
  const held = new Set(["A", "B"]);
  const batches = new Map<number, JudgmentInput[]>();
  for (const action of actions.filter(action => action.at > START).sort((a, b) => a.at - b.at)) {
    if (action.type === "up" ? !held.has(action.key) : held.has(action.key)) continue;
    if (action.type === "up") held.delete(action.key); else held.add(action.key);
    const batch = batches.get(action.at) ?? [];
    batch.push({ key: action.key, lane: 1, type: action.type });
    batches.set(action.at, batch);
  }
  return { firstKeys: ["A", "B"], batches: [...batches].sort((a, b) => a[0] - b[0]) };
}

type CompiledChart = ReturnType<typeof compileJudgmentChart>;

/** 끝까지 재생한 뒤에도 정산하지 않은 점수 항목을 결함 범주로 나눈다. 같은 항목의 중복 정산은 세션 예외로 잡힌다. */
interface Unsettled {
  /** head 있는 2→1 감소 경계에서 연결 head가 Miss일 때 남은 앞 double의 감소 release(#182). */
  headMissDecrease: string[];
  /** head 있는 2→1 감소 경계에서 연결 head를 쳤는데도 남은 앞 double의 감소 release(#181). */
  headHitDecrease: string[];
  /** 그 밖의 미정산 항목. */
  other: string[];
}

/**
 * 차트를 끝까지 재생한다. delays가 없으면 각 batch를 raw 시각 그대로 processBatch로 넣는다. delays가 있으면 batch마다
 * 0~MAX_OBSERVED_DELAY ms 늦게 관측한 것으로 보고, 실제 플레이처럼 관측 시각까지 먼저 진행한 뒤 같은 batch를
 * drainPlaySessionInputs로 전달한다(core 시각보다 과거인 raw만 processObservedBatch). 관측 시각은 줄지 않는다.
 */
function play(notes: readonly NoteEntity[], firstKeys: readonly string[], batches: readonly [number, JudgmentInput[]][], firstAt: number, delays?: () => number) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n); });
  const compiled = compileJudgmentChart(notes, starts, ends);
  const session = new NoteJudgmentSession(compiled);
  const timeline = new InputTimeline();
  const deliver = (rawAt: number, inputs: readonly JudgmentInput[]) => {
    if (!delays) { session.processBatch(rawAt, inputs); return; }
    const observedAt = rawAt + Math.floor(delays() * (MAX_OBSERVED_DELAY + 1));
    if (observedAt > session.core.time) session.advance(observedAt);
    timeline.enqueueMany(inputs.map(input => ({ ...input, inputAt: rawAt })));
    drainPlaySessionInputs(timeline, session, session.core.time);
  };
  let error: string | undefined;
  try {
    deliver(firstAt, firstKeys.map(key => ({ key, lane: 1, type: "down" as const })));
    for (const [at, inputs] of batches) deliver(at, inputs);
    session.finalize();
  } catch (caught) {
    error = (caught as Error).message;
  }
  return {
    error, state: session.score.getState(), events: session.events,
    unsettled: unsettledItems(compiled, session.events),
    holdOnlyViolation: holdOnlyViolation(notes, compiled, session.events),
  };
}

/** maintenanceMiss는 점수 항목을 정산하지 않는다(무득점 Miss). 나머지 이벤트의 itemId가 정산한 항목이다. */
const settledIds = (events: readonly NoteJudgmentEvent[]) => events
  .filter(event => event.kind !== "maintenanceMiss" && event.itemId !== undefined).map(event => event.itemId!);

function unsettledItems(compiled: CompiledChart, events: readonly NoteJudgmentEvent[]): Unsettled {
  const settled = new Set(settledIds(events));
  const result: Unsettled = { headMissDecrease: [], headHitDecrease: [], other: [] };
  for (const item of compiled.scoreItems) {
    if (settled.has(item.itemId)) continue;
    const headIndex = item.kind === "release" && item.successorIndex !== undefined ? compiled.notes[item.successorIndex]?.headIndex : undefined;
    if (headIndex === undefined) { result.other.push(item.itemId); continue; }
    const headMissed = events.some(event => event.kind === "head" && event.noteIndex === headIndex && event.grade === "miss");
    (headMissed ? result.headMissDecrease : result.headHitDecrease).push(item.itemId);
  }
  return result;
}

/** holdOnly 끝에 release 판정을 내거나, 점수 항목을 두 번 정산하거나, holdOnly 항목을 정산하지 않고 끝났는지. */
function holdOnlyViolation(notes: readonly NoteEntity[], compiled: CompiledChart, events: readonly NoteJudgmentEvent[]): boolean {
  const holdOnlyNotes = new Set(notes.flatMap((note, index) => ("holdOnly" in note && note.holdOnly ? [index] : [])));
  const holdOnlyItems = compiled.scoreItems.filter(item => holdOnlyNotes.has(item.noteIndex)).map(item => item.itemId);
  const ids = settledIds(events);
  const settled = new Set(ids);
  return events.some(event => event.kind === "release" && holdOnlyNotes.has(event.noteIndex)) ||
    ids.length !== settled.size || holdOnlyItems.some(itemId => !settled.has(itemId));
}

const afterFirstHead = (events: readonly NoteJudgmentEvent[], firstAt: number) => events
  .filter(event => !(event.kind === "head" && event.inputAt === firstAt))
  .map(event => [event.kind, event.noteIndex, event.unitIndex, event.grade, event.deltaMs, event.confirmedAt]);

interface FuzzRun { seed: number; onTime: ReturnType<typeof play>; late?: ReturnType<typeof play> }
const cached = new Map<string, FuzzRun[]>();
/** seed 1~count를 한 번만 재생해 이름별로 캐시한다. build가 undefined를 돌려주는 seed(유효하지 않은 차트)는 건너뛴다. */
function collect(name: string, count: number, build: (seed: number) => FuzzRun | undefined): FuzzRun[] {
  const hit = cached.get(name);
  if (hit) return hit;
  const all: FuzzRun[] = [];
  for (let seed = 1; seed <= count; seed++) {
    const run = build(seed);
    if (run) all.push(run);
  }
  cached.set(name, all);
  return all;
}

const isValid = (notes: NoteEntity[]) => validateChart({ notes, trillZones: [], events: [] }).length === 0;

const runs = () => collect("general", SEEDS, seed => {
  const rng = mulberry32(seed);
  const notes = chartFor(rng);
  if (!isValid(notes)) return undefined;
  const { firstKeys, batches } = inputsFor(rng, notes);
  // 첫 head를 늦춘 재생은 모든 입력이 늦은 첫 head 뒤에 있을 때만 비교할 수 있다.
  const comparable = batches.every(([at]) => at > START + LATE_FIRST_HEAD);
  return {
    seed,
    onTime: play(notes, firstKeys, batches, START),
    late: comparable ? play(notes, firstKeys, batches, START + LATE_FIRST_HEAD) : undefined,
  };
});

const swapRuns = () => collect("swap", SWAP_SEEDS, seed => {
  const rng = mulberry32(seed);
  const notes = swapChartFor(rng);
  if (!isValid(notes)) return undefined;
  const { firstKeys, batches } = swapInputsFor(rng, notes);
  return { seed, onTime: play(notes, firstKeys, batches, START) };
});

const shortRuns = () => collect("short", SHORT_SEEDS, seed => {
  const rng = mulberry32(seed);
  const notes = chartFor(rng, SHORT_LENGTHS);
  if (!isValid(notes)) return undefined;
  const { firstKeys, batches } = inputsFor(rng, notes);
  return { seed, onTime: play(notes, firstKeys, batches, START) };
});

/** 짧은 바디 생성기에 80·120ms 구간을 더한 생성기. 기존 생성기의 seed 재현성을 지키려고 이름을 따로 둔다. */
const shortMidRuns = () => collect("shortMid", SHORT_MID_SEEDS, seed => {
  const rng = mulberry32(seed);
  const notes = chartFor(rng, SHORT_MID_LENGTHS);
  if (!isValid(notes)) return undefined;
  const { firstKeys, batches } = inputsFor(rng, notes);
  return { seed, onTime: play(notes, firstKeys, batches, START) };
});

/** 일반·짧은 바디 생성기와 같은 차트·입력을 관측 지연으로 재생한다. */
const observedRuns = (generator: "general" | "short") => collect(`observed:${generator}`, OBSERVED_SEEDS, seed => {
  const rng = mulberry32(seed);
  const notes = chartFor(rng, generator === "short" ? SHORT_LENGTHS : GENERAL_LENGTHS);
  if (!isValid(notes)) return undefined;
  const { firstKeys, batches } = inputsFor(rng, notes);
  return { seed, onTime: play(notes, firstKeys, batches, START, delayRngFor(seed)) };
});

const throwingSeeds = (all: readonly FuzzRun[]) => all.filter(run => run.onTime.error !== undefined).map(run => run.seed);
const fullComboWithUnsettledItems = (all: readonly FuzzRun[]) => all.filter(run => run.onTime.error === undefined &&
  run.onTime.state.isFullCombo && run.onTime.state.processedNotes !== run.onTime.state.totalNotes).map(run => run.seed);
/** 예외 없이 끝났는데 점수 항목이 남은 seed를 결함 범주별로 모은다. Full Combo 여부와 관계없다. */
const unsettledSeeds = (all: readonly FuzzRun[]) => {
  const finished = all.filter(run => run.onTime.error === undefined);
  const seedsWith = (category: keyof Unsettled) => finished.filter(run => run.onTime.unsettled[category].length > 0).map(run => run.seed);
  return { "#182": seedsWith("headMissDecrease"), "#181": seedsWith("headHitDecrease"), other: seedsWith("other") };
};
const holdOnlyViolationSeeds = (all: readonly FuzzRun[]) => all.filter(run => run.onTime.holdOnlyViolation).map(run => run.seed);

/* ── 래칫 ─────────────────────────────────────────────────────────────────────────────────────────────── */

type Generator = "general" | "swap" | "short" | "shortMid" | "observedGeneral" | "observedShort";
type Ratchet = Record<Generator, number[]>;

/**
 * 정산 예외(미등록·중복 score item)를 던지는 seed.
 * - #180: 뒤 바디가 없는 끝 holdOnly unit이 E+Good까지 미확정이면 holdOnly 대신 release 판정을 내보내 미등록 score item
 *   예외를 던진다(예: 일반 seed 2578 — headless doubleLong [1000,1200] → holdOnly [1200,1260], B up 1160·A up 1170;
 *   짧은·중간 seed 2294·3296·3439·5050·5073·5087도 모두 끝 holdOnly 노트의 `n?:release:0` 예외).
 *   일반 생성기 범위를 12000까지 넓히면 #180 seed 5087·7212가 더 나온다.
 * - #199: 관측 지연 경로에서 head 있는 2→1 감소 경계의 release를 두 번 정산한다(관측 일반 seed 1457 — doubleLong [1160,1220]
 *   → head 1220 + holdOnly [1220,1720]의 `n5:release:0` 중복).
 */
const KNOWN_THROWS: Ratchet = {
  general: [2578], swap: [], short: [], shortMid: [2294, 3296, 3439, 5050, 5073, 5087], observedGeneral: [1457], observedShort: [],
};

/**
 * holdOnly 끝에 release 판정을 내거나 holdOnly 항목을 남긴 seed. 위 정산 예외 seed(#180·#199)는 예외 뒤 holdOnly 항목이
 * 남으므로 여기에도 나온다. 그 밖의 짧은·중간 seed 2375는 #180과 같은 E+Good 미확정 경로의 끝이 아닌 쪽이다
 * (single head 1000 + doubleLong holdOnly [1000,1100] → holdOnly [1100,1160] → … , A up 1065 뒤 hold 없음).
 * 끝이 아닌 unit이라 release 대신 maintenanceMiss만 내고 holdOnly 항목을 dependentZero로 정산하지 않는다.
 */
const KNOWN_HOLD_ONLY_VIOLATIONS: Ratchet = {
  general: [2578], swap: [], short: [], shortMid: [2294, 2375, 3296, 3439, 5050, 5073, 5087], observedGeneral: [1457], observedShort: [],
};

/** 정산 예외 없이 끝났는데 감소 release가 아닌 점수 항목이 남은 seed. 짧은·중간 2375는 위 #180 경로의 holdOnly 항목이다. */
const OTHER_UNSETTLED: Ratchet = { general: [], swap: [], short: [], shortMid: [2375], observedGeneral: [], observedShort: [] };

/**
 * #182: head 있는 2→1 감소 경계에서 연결 head가 Miss이면 core가 앞 double의 감소 release unit을 판정 없이 실패시켜
 * 점수 항목이 남는다. RFD 0032 §6-3은 이 감소 release를 유지하므로 퍼즈에서 빼지 않고 seed를 고정한다.
 */
const HEAD_MISS_DECREASE_RELEASE_UNSETTLED: Ratchet = {
  general: [
    1, 26, 31, 32, 44, 74, 76, 78, 82, 95, 119, 127, 140, 141, 160, 164, 166, 168, 188, 206, 225, 228, 235, 275, 278,
    287, 288, 292, 295, 315, 323, 327, 329, 336, 339, 369, 371, 382, 392, 395, 400, 406, 415, 432, 433, 453, 462, 479,
    480, 498, 499, 517, 537, 540, 554, 562, 569, 581, 605, 625, 647, 648, 649, 651, 670, 678, 723, 734, 738, 745, 746,
    751, 756, 761, 762, 768, 773, 781, 800, 827, 832, 833, 836, 847, 850, 856, 864, 884, 891, 894, 897, 902, 917, 921,
    924, 925, 932, 953, 971, 981, 1006, 1010, 1021, 1027, 1034, 1036, 1063, 1068, 1069, 1084, 1095, 1100, 1102, 1108,
    1112, 1120, 1153, 1156, 1166, 1174, 1181, 1189, 1204, 1231, 1233, 1238, 1285, 1291, 1293, 1306, 1309, 1324, 1332,
    1342, 1345, 1357, 1358, 1361, 1363, 1366, 1374, 1376, 1380, 1387, 1389, 1407, 1430, 1433, 1466, 1471, 1502, 1512,
    1517, 1535, 1536, 1537, 1538, 1562, 1567, 1586, 1595, 1603, 1610, 1620, 1623, 1634, 1644, 1675, 1684, 1720, 1725,
    1729, 1731, 1738, 1739, 1769, 1775, 1785, 1797, 1801, 1803, 1806, 1817, 1827, 1828, 1834, 1840, 1841, 1844, 1845,
    1847, 1865, 1890, 1902, 1909, 1918, 1922, 1937, 1938, 1952, 1953, 1979, 1991, 2018, 2021, 2034, 2036, 2046, 2047,
    2054, 2059, 2064, 2072, 2073, 2078, 2088, 2112, 2119, 2122, 2123, 2166, 2170, 2192, 2214, 2237, 2254, 2258, 2260,
    2283, 2300, 2313, 2321, 2322, 2328, 2337, 2338, 2343, 2377, 2380, 2384, 2395, 2417, 2430, 2441, 2443, 2465, 2466,
    2469, 2471, 2473, 2481, 2485, 2503, 2556, 2579, 2595, 2633, 2634, 2638, 2649, 2669, 2680, 2702, 2710, 2717, 2723,
    2739, 2749, 2751, 2755, 2773, 2783, 2801, 2817, 2831, 2835, 2845, 2849, 2855, 2857, 2879, 2927, 2938, 2951, 2976,
    2977,
  ],
  swap: [],
  short: [
    26, 31, 32, 66, 69, 74, 76, 78, 82, 95, 119, 140, 152, 160, 164, 166, 168, 188, 191, 192, 193, 218, 225, 228, 235,
    275, 278, 287, 288, 292, 295, 297, 323, 327, 336, 339, 345, 352, 382, 391, 392, 400, 415, 432, 433, 442, 445, 453,
    462, 480, 498, 499, 507, 517, 537, 540, 554, 562, 569, 581, 590, 595, 621, 625, 648, 651, 657, 670, 673, 678, 685,
    722, 723, 725, 734, 738, 745, 746, 751, 756, 757, 761, 762, 768, 773, 774, 781, 800, 803, 804, 827, 832, 841, 847,
    850, 856, 884, 894, 902, 904, 917, 921, 924, 925, 932, 953, 971, 1015, 1034, 1036, 1063, 1068, 1084, 1102, 1105,
    1108, 1112, 1120, 1135, 1153, 1156, 1166, 1174, 1181, 1231, 1233, 1236, 1238, 1285, 1291, 1293, 1306, 1309, 1324,
    1332, 1342, 1345, 1361, 1366, 1374, 1380, 1381, 1387, 1389, 1407, 1430, 1433, 1459, 1466, 1471,
  ],
  shortMid: [
    26, 31, 66, 74, 76, 78, 82, 95, 119, 140, 152, 160, 164, 168, 188, 191, 193, 218, 225, 228, 235, 258, 265, 275, 278,
    288, 292, 295, 297, 315, 323, 327, 336, 339, 345, 352, 391, 392, 400, 415, 433, 442, 445, 453, 462, 479, 480, 498,
    499, 507, 517, 537, 540, 554, 562, 569, 581, 590, 621, 625, 640, 648, 651, 670, 673, 678, 723, 725, 734, 738, 745,
    746, 751, 756, 757, 761, 762, 768, 773, 774, 781, 800, 803, 804, 827, 832, 847, 850, 856, 884, 894, 897, 902, 917,
    921, 924, 925, 932, 953, 971, 1010, 1015, 1034, 1036, 1063, 1077, 1084, 1102, 1108, 1112, 1120, 1135, 1153, 1156,
    1166, 1174, 1181, 1231, 1233, 1236, 1238, 1285, 1287, 1291, 1293, 1306, 1309, 1324, 1332, 1342, 1345, 1361, 1366,
    1374, 1381, 1387, 1389, 1407, 1430, 1433, 1459, 1466, 1471, 1517, 1525, 1535, 1536, 1537, 1538, 1548, 1562, 1568,
    1595, 1603, 1610, 1620, 1634, 1644, 1675, 1687, 1739, 1767, 1775, 1785, 1797, 1803, 1806, 1817, 1827, 1828, 1837,
    1840, 1841, 1845, 1847, 1865, 1890, 1902, 1918, 1922, 1923, 1938, 1953, 1972, 1979, 1991, 2017, 2018, 2021, 2034,
    2046, 2047, 2054, 2059, 2064, 2072, 2078, 2088, 2112, 2119, 2122, 2123, 2166, 2189, 2190, 2192, 2209, 2214, 2254,
    2258, 2260, 2283, 2300, 2304, 2313, 2322, 2328, 2337, 2338, 2343, 2380, 2384, 2395, 2430, 2443, 2465, 2466, 2473,
    2481, 2483, 2485, 2503, 2556, 2559, 2567, 2595, 2633, 2634, 2638, 2662, 2669, 2680, 2702, 2707, 2722, 2723, 2739,
    2749, 2751, 2776, 2783, 2794, 2835, 2849, 2855, 2857, 2860, 2879, 2906, 2927, 2951, 2977, 3004, 3032, 3040, 3049,
    3064, 3070, 3086, 3096, 3105, 3112, 3115, 3116, 3123, 3169, 3194, 3216, 3233, 3236, 3238, 3245, 3248, 3264, 3268,
    3273, 3286, 3287, 3290, 3297, 3300, 3315, 3336, 3355, 3373, 3374, 3377, 3379, 3401, 3408, 3436, 3447, 3450, 3451,
    3466, 3535, 3539, 3543, 3546, 3567, 3573, 3582, 3585, 3605, 3626, 3637, 3649, 3656, 3680, 3690, 3692, 3696, 3699,
    3700, 3713, 3714, 3739, 3740, 3751, 3753, 3798, 3807, 3810, 3812, 3825, 3837, 3871, 3892, 3912, 3915, 3918, 3931,
    3936, 3943, 3989, 3993, 4006, 4016, 4045, 4049, 4055, 4101, 4105, 4119, 4120, 4138, 4143, 4151, 4166, 4184, 4191,
    4195, 4196, 4201, 4207, 4215, 4227, 4241, 4246, 4262, 4263, 4269, 4291, 4295, 4302, 4309, 4310, 4312, 4315, 4320,
    4326, 4332, 4337, 4349, 4357, 4388, 4419, 4429, 4434, 4439, 4445, 4450, 4456, 4463, 4469, 4502, 4510, 4515, 4530,
    4544, 4561, 4571, 4574, 4576, 4578, 4579, 4591, 4595, 4606, 4640, 4665, 4683, 4697, 4700, 4707, 4708, 4716, 4722,
    4730, 4736, 4741, 4757, 4759, 4769, 4772, 4782, 4791, 4803, 4812, 4814, 4847, 4850, 4862, 4863, 4866, 4876, 4880,
    4899, 4902, 4911, 4918, 4920, 4927, 4938, 4956, 4982, 4991, 5001, 5014, 5018, 5019, 5031, 5040, 5054, 5075, 5079,
    5083, 5084, 5110, 5111, 5127, 5137, 5140, 5150, 5154, 5155, 5188, 5217, 5223, 5226, 5245, 5262, 5266, 5270, 5278,
    5280, 5323, 5332, 5334, 5343, 5358, 5359, 5374, 5380, 5381, 5393, 5411, 5432, 5465, 5466, 5470, 5478, 5487, 5488,
    5489, 5494, 5515, 5547, 5578, 5580, 5581, 5592, 5594, 5600, 5601, 5602, 5604, 5611, 5625, 5636, 5641, 5653, 5674,
    5680, 5686, 5699, 5709, 5714, 5722, 5736, 5796, 5835, 5846, 5863, 5867, 5878, 5899, 5924, 5941, 5983, 5991, 6013,
    6015, 6034, 6048, 6066, 6071, 6074, 6086, 6097, 6101, 6114, 6120, 6122, 6153, 6163, 6169, 6172, 6220, 6235, 6239,
    6268, 6280, 6291, 6295, 6312, 6313, 6319, 6377, 6380, 6384, 6396, 6397, 6409, 6412, 6438, 6443, 6445, 6452, 6456,
    6468, 6492,
  ],
  observedGeneral: [
    1, 26, 31, 32, 44, 74, 76, 78, 82, 95, 119, 127, 140, 141, 160, 164, 166, 168, 188, 199, 206, 225, 228, 235, 275,
    278, 287, 288, 292, 295, 315, 323, 327, 329, 336, 339, 369, 371, 382, 392, 395, 400, 406, 415, 432, 433, 453, 462,
    479, 480, 498, 499, 517, 537, 540, 554, 562, 569, 573, 581, 605, 625, 647, 648, 649, 651, 670, 678, 734, 738, 745,
    746, 751, 756, 761, 762, 768, 773, 781, 800, 827, 832, 833, 836, 847, 850, 856, 864, 884, 891, 894, 897, 902, 917,
    921, 924, 925, 932, 953, 971, 981, 1006, 1010, 1021, 1027, 1034, 1036, 1063, 1068, 1069, 1084, 1095, 1100, 1102,
    1108, 1112, 1120, 1153, 1156, 1166, 1174, 1181, 1189, 1204, 1231, 1233, 1238, 1285, 1291, 1293, 1306, 1309, 1324,
    1332, 1342, 1345, 1357, 1358, 1361, 1363, 1366, 1374, 1376, 1380, 1387, 1389, 1407, 1433, 1466, 1471,
  ],
  observedShort: [
    26, 31, 66, 69, 74, 76, 78, 82, 95, 119, 140, 141, 152, 160, 164, 168, 188, 191, 218, 225, 228, 235, 275, 278, 288,
    292, 295, 297, 323, 327, 336, 339, 345, 352, 382, 391, 392, 400, 415, 432, 433, 442, 445, 453, 462, 480, 498, 499,
    507, 517, 537, 540, 554, 562, 569, 581, 590, 595, 621, 625, 648, 651, 657, 670, 673, 678, 722, 723, 725, 734, 738,
    745, 751, 756, 757, 761, 762, 768, 773, 774, 781, 800, 803, 804, 827, 832, 847, 850, 856, 884, 894, 897, 902, 904,
    917, 921, 925, 932, 953, 971, 1010, 1015, 1034, 1036, 1063, 1077, 1084, 1102, 1105, 1108, 1112, 1120, 1122, 1135,
    1153, 1156, 1166, 1174, 1181, 1231, 1233, 1236, 1238, 1285, 1291, 1293, 1306, 1309, 1324, 1332, 1342, 1345, 1361,
    1366, 1374, 1380, 1381, 1387, 1389, 1407, 1430, 1433, 1459, 1466, 1471,
  ],
};

/**
 * #181: head 있는 2→1 감소 경계에서 연결 head를 쳐도, 경계 근처 up이 연결 보정에 먼저 쓰여 앞 double의 감소 release unit이
 * release를 받지 못하면 끝이 아닌 unit이라 E+Good에 maintenanceMiss만 내고 점수 항목을 정산하지 않는다(예: 교대 seed 71 —
 * double head 1000 + doubleLong [1000,1500] → head 1500 + long [1500,1580], A up 1460·C 1490–1650·B up 1565).
 * #181은 이 경계의 감소 release를 없애는 RFD 0020 §2.13 구현으로 잡혀 있었지만, RFD 0032 §6-3은 감소 release를 유지하고
 * 경계 근처의 첫 up이 처리하게 하므로 seed를 고정한다.
 */
const HEAD_HIT_DECREASE_RELEASE_UNSETTLED: Ratchet = {
  general: [
    8, 28, 157, 199, 200, 218, 269, 297, 412, 506, 542, 553, 556, 573, 623, 681, 735, 749, 755, 770, 791, 844, 865, 1054,
    1122, 1214, 1245, 1256, 1290, 1400, 1525, 1560, 1568, 1673, 1861, 1925, 1928, 2009, 2024, 2184, 2241, 2309, 2347,
    2454, 2707, 2735, 2822, 2906, 2954, 2985,
  ],
  swap: [
    71, 73, 155, 177, 196, 213, 240, 253, 272, 285, 311, 317, 345, 348, 351, 381, 412, 424, 454, 463, 511, 521, 560, 583,
    623, 650, 657, 738, 828, 860, 900, 955, 968, 969, 1032, 1115, 1177, 1192, 1234, 1348, 1405, 1407, 1413, 1494, 1522,
    1608, 1701, 1751, 1829, 1891, 1949, 1955, 1997, 2020, 2053, 2120, 2210, 2400, 2407, 2440, 2459, 2529, 2531, 2532,
    2600, 2621, 2658, 2808, 2876, 2890, 2952, 2969,
  ],
  short: [
    8, 28, 113, 157, 199, 200, 220, 388, 389, 412, 506, 542, 545, 573, 623, 681, 713, 726, 735, 749, 755, 770, 972, 1054,
    1096, 1204, 1210, 1214, 1325, 1400,
  ],
  shortMid: [
    8, 28, 113, 157, 199, 200, 220, 287, 377, 389, 412, 432, 506, 542, 573, 623, 681, 726, 735, 755, 770, 1054, 1204,
    1210, 1214, 1325, 1400, 1525, 1684, 1726, 1731, 1740, 1765, 1844, 1925, 2009, 2036, 2073, 2237, 2377, 2579, 2817,
    2825, 2976, 2985, 3012, 3035, 3133, 3184, 3208, 3416, 3461, 3464, 3624, 3650, 3758, 3775, 3786, 3808, 3862, 3899,
    3957, 4150, 4181, 4323, 4360, 4373, 4417, 4513, 4527, 4602, 4608, 4869, 4943, 5035, 5053, 5085, 5113, 5119, 5153,
    5252, 5253, 5275, 5322, 5390, 5495, 5576, 5588, 5615, 5620, 5623, 5669, 5746, 5770, 5801, 5809, 5926, 5951, 6038,
    6062, 6144, 6185, 6275, 6408, 6420,
  ],
  observedGeneral: [
    8, 28, 157, 200, 218, 269, 297, 412, 542, 553, 556, 623, 681, 735, 749, 755, 770, 791, 844, 865, 1054, 1122, 1214,
    1256, 1290, 1400,
  ],
  observedShort: [
    8, 28, 113, 157, 166, 199, 200, 388, 389, 412, 542, 545, 573, 623, 681, 713, 726, 749, 755, 770, 972, 1054, 1096,
    1204, 1210, 1214, 1400,
  ],
};

const unsettledRatchet = (generator: Generator) => ({
  "#182": HEAD_MISS_DECREASE_RELEASE_UNSETTLED[generator], "#181": HEAD_HIT_DECREASE_RELEASE_UNSETTLED[generator], other: OTHER_UNSETTLED[generator],
});
/** 래칫을 테스트명에 쓰는 요약. 비었으면 "없음", 아니면 결함 이슈와 seed를 적는다. */
const ratchetLabel = (seeds: readonly number[], issue: string) => seeds.length === 0 ? "없음" : `${issue} seed ${seeds.join("·")}뿐`;
const seedCount = (seeds: readonly number[]) => seeds.length === 0 ? "없음" : seeds.length <= 8 ? `seed ${seeds.join("·")}` : `seed ${seeds.length}개`;
/** 미정산 래칫을 테스트명에 쓰는 요약. 목록이 길면 개수만 적는다. */
const unsettledLabel = (generator: Generator) => {
  const ratchet = unsettledRatchet(generator);
  return `head Miss 뒤 감소 release(#182) ${seedCount(ratchet["#182"])}, head 뒤 감소 release(#181) ${seedCount(ratchet["#181"])}, 그 밖 ${seedCount(ratchet.other)}`;
};
const UNSETTLED_TITLE = "Full Combo가 아니어도 끝까지 재생하면 점수 항목이 남지 않아야 하며, 지금 남는 래칫은";

/* ── 테스트 ───────────────────────────────────────────────────────────────────────────────────────────── */

describe("판정 정산 퍼즈: 유효한 연결 차트의 경계 ±100ms 입력", () => {
  it(`seed 1~${SEEDS}의 유효한 차트를 끝까지 재생하면 미등록·중복 점수 정산 예외는 기존 끝 holdOnly 결함(#180) seed ${KNOWN_THROWS.general.join("·")}뿐`, () => {
    expect(runs().length).toBeGreaterThan(SEEDS / 2);
    expect(throwingSeeds(runs())).toEqual(KNOWN_THROWS.general);
  });

  it(`seed 1~${SEEDS}에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(runs())).toEqual([]);
  });

  it(`seed 1~${SEEDS}의 예외 없는 재생은 ${UNSETTLED_TITLE} ${unsettledLabel("general")}`, () => {
    expect(unsettledSeeds(runs())).toEqual(unsettledRatchet("general"));
  });

  it(`seed 1~${SEEDS}에서 holdOnly 끝 release 판정·중복 정산·holdOnly 미정산은 ${ratchetLabel(KNOWN_HOLD_ONLY_VIOLATIONS.general, "#180")}`, () => {
    expect(holdOnlyViolationSeeds(runs())).toEqual(KNOWN_HOLD_ONLY_VIOLATIONS.general);
  });

  it(`seed 1~${SEEDS}에서 모든 입력이 늦은 첫 head 뒤면 첫 head를 ${LATE_FIRST_HEAD}ms 늦게 눌러도 첫 head 외 판정·등급·확정 시각이 정박과 같음`, () => {
    const comparable = runs().filter(run => run.onTime.error === undefined && run.late !== undefined);
    expect(comparable.length).toBeGreaterThan(SEEDS / 2);
    const differing = comparable.filter(run =>
      JSON.stringify(afterFirstHead(run.onTime.events, START)) !== JSON.stringify(afterFirstHead(run.late!.events, START + LATE_FIRST_HEAD)))
      .map(run => run.seed);
    expect(differing).toEqual([]);
  });
});

describe("판정 정산 퍼즈: 2→1 감소 경계의 연결 head 교대", () => {
  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 up −60~+80ms·연결 head −40~+115ms 재생에서 미등록·중복 점수 정산 예외는 ${ratchetLabel(KNOWN_THROWS.swap, "#180")}`, () => {
    expect(swapRuns().length).toBeGreaterThan(SWAP_SEEDS / 2);
    expect(throwingSeeds(swapRuns())).toEqual(KNOWN_THROWS.swap);
  });

  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 재생에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(swapRuns())).toEqual([]);
  });

  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 재생은 ${UNSETTLED_TITLE} ${unsettledLabel("swap")}`, () => {
    expect(unsettledSeeds(swapRuns())).toEqual(unsettledRatchet("swap"));
  });

  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 재생에서 holdOnly 끝 release 판정·중복 정산·holdOnly 미정산은 ${ratchetLabel(KNOWN_HOLD_ONLY_VIOLATIONS.swap, "#180")}`, () => {
    expect(holdOnlyViolationSeeds(swapRuns())).toEqual(KNOWN_HOLD_ONLY_VIOLATIONS.swap);
  });
});

describe("판정 정산 퍼즈: 짧은 바디(20~200ms) 체인의 경계 ±100ms 입력", () => {
  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인을 끝까지 재생하면 미등록·중복 점수 정산 예외는 ${ratchetLabel(KNOWN_THROWS.short, "#180")}`, () => {
    expect(shortRuns().length).toBeGreaterThan(SHORT_SEEDS / 2);
    expect(throwingSeeds(shortRuns())).toEqual(KNOWN_THROWS.short);
  });

  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(shortRuns())).toEqual([]);
  });

  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인은 ${UNSETTLED_TITLE} ${unsettledLabel("short")}`, () => {
    expect(unsettledSeeds(shortRuns())).toEqual(unsettledRatchet("short"));
  });

  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인에서 holdOnly 끝 release 판정·중복 정산·holdOnly 미정산은 ${ratchetLabel(KNOWN_HOLD_ONLY_VIOLATIONS.short, "#180")}`, () => {
    expect(holdOnlyViolationSeeds(shortRuns())).toEqual(KNOWN_HOLD_ONLY_VIOLATIONS.short);
  });
});

describe("판정 정산 퍼즈: 짧은·중간 바디(20~200ms, 80·120ms 포함) 체인의 경계 ±100ms 입력", () => {
  it(`seed 1~${SHORT_MID_SEEDS}의 20~200ms(80·120ms 포함) 구간 체인을 끝까지 재생하면 미등록·중복 점수 정산 예외는 ${ratchetLabel(KNOWN_THROWS.shortMid, "#180")}`, () => {
    expect(shortMidRuns().length).toBeGreaterThan(SHORT_MID_SEEDS / 2);
    expect(throwingSeeds(shortMidRuns())).toEqual(KNOWN_THROWS.shortMid);
  });

  it(`seed 1~${SHORT_MID_SEEDS}의 20~200ms(80·120ms 포함) 구간 체인에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(shortMidRuns())).toEqual([]);
  });

  it(`seed 1~${SHORT_MID_SEEDS}의 20~200ms(80·120ms 포함) 구간 체인은 ${UNSETTLED_TITLE} ${unsettledLabel("shortMid")}`, () => {
    expect(unsettledSeeds(shortMidRuns())).toEqual(unsettledRatchet("shortMid"));
  });

  it(`seed 1~${SHORT_MID_SEEDS}의 20~200ms(80·120ms 포함) 구간 체인에서 holdOnly 끝 release 판정·중복 정산·holdOnly 미정산은 ${ratchetLabel(KNOWN_HOLD_ONLY_VIOLATIONS.shortMid, "#180")}`, () => {
    expect(holdOnlyViolationSeeds(shortMidRuns())).toEqual(KNOWN_HOLD_ONLY_VIOLATIONS.shortMid);
  });
});

// 관측 경로의 결과는 raw(processBatch) 재생과 같지 않을 수 있다. 관측 시각까지 먼저 진행하는 사이 S·E와 그 ±Good 경계를
// 지나면 그 경계의 판정(승계·시작 창 마감 등)이 입력보다 먼저 정해지기 때문이다. 그래서 여기서는 정산 성질만 확인한다.
describe(`판정 정산 퍼즈: batch마다 0~${MAX_OBSERVED_DELAY}ms 늦게 관측한 입력`, () => {
  const generators = [
    ["일반(60~1000ms)", "general", "observedGeneral"],
    ["짧은 바디(20~200ms)", "short", "observedShort"],
  ] as const;

  for (const [label, generator, ratchet] of generators) {
    it(`${label} 생성기 seed 1~${OBSERVED_SEEDS}의 입력을 관측 지연으로 전달하면 미등록·중복 점수 정산 예외는 ${ratchetLabel(KNOWN_THROWS[ratchet], "#199")}`, () => {
      expect(observedRuns(generator).length).toBeGreaterThan(OBSERVED_SEEDS / 2);
      expect(throwingSeeds(observedRuns(generator))).toEqual(KNOWN_THROWS[ratchet]);
    });

    it(`${label} 생성기 seed 1~${OBSERVED_SEEDS}의 관측 지연 재생에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
      expect(fullComboWithUnsettledItems(observedRuns(generator))).toEqual([]);
    });

    it(`${label} 생성기 seed 1~${OBSERVED_SEEDS}의 관측 지연 재생은 ${UNSETTLED_TITLE} ${unsettledLabel(ratchet)}`, () => {
      expect(unsettledSeeds(observedRuns(generator))).toEqual(unsettledRatchet(ratchet));
    });

    it(`${label} 생성기 seed 1~${OBSERVED_SEEDS}의 관측 지연 재생에서 holdOnly 끝 release 판정·중복 정산·holdOnly 미정산은 ${ratchetLabel(KNOWN_HOLD_ONLY_VIOLATIONS[ratchet], "#199")}`, () => {
      expect(holdOnlyViolationSeeds(observedRuns(generator))).toEqual(KNOWN_HOLD_ONLY_VIOLATIONS[ratchet]);
    });
  }
});
