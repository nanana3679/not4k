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
 */
const SEEDS = 3000;
const SWAP_SEEDS = 3000;
const SHORT_SEEDS = 1500;
const OBSERVED_SEEDS = 1500;
const START = 1000;
const LATE_FIRST_HEAD = 30;
const KEYS = ["A", "B", "C", "D"] as const;
/** 일반 생성기의 구간 길이(ms). */
const GENERAL_LENGTHS = [60, 100, 200, 500, 1000] as const;
/** 짧은 바디 생성기의 구간 길이(ms). 뒤 바디의 E−Good이 S보다 앞서는 짧은 체인(RFD 0020 §2.14)을 자주 만든다. */
const SHORT_LENGTHS = [20, 40, 60, 100, 200] as const;
/** 관측 지연 변형에서 batch마다 고르는 최대 지연(ms). */
const MAX_OBSERVED_DELAY = 15;
// #180(뒤 바디가 없는 끝 holdOnly unit이 E+Good까지 미확정이면 holdOnly 대신 release 판정을 내보내 세션이 미등록
// score item 예외를 던지던 결함)은 고쳤다. 래칫으로 남겼던 일반 seed 2578(seed 1~3000)과 12000 범위의 5087·7212가
// 이제 예외 없이 정산되며, processBatch로 재생하는 생성기는 모두 seed 1~12000에서 정산 예외가 없다. 그 holdOnly unit의
// 결과는 RFD 0020 §2.14(NJ-A07)로 정했다. 새 정산 예외를 이슈로 남겨야 할 때만 seed 래칫을 다시 둔다.
// #199(관측 지연 경로에서 head 있는 2→1 감소 경계의 release가 두 번 정산되는 예외)는 미해결이다. 아래 지연 PRNG로는
// 일반 생성기 seed 1457만 seed 1~12000 중 예외를 던진다. #199를 고치면 이 래칫을 비운다.
const OBSERVED_THROW_RATCHET = { general: [1457], short: [] } as const;

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

/**
 * 차트를 끝까지 재생한다. delays가 없으면 각 batch를 raw 시각 그대로 processBatch로 넣는다. delays가 있으면 batch마다
 * 0~MAX_OBSERVED_DELAY ms 늦게 관측한 것으로 보고, 실제 플레이처럼 관측 시각까지 먼저 진행한 뒤 같은 batch를
 * drainPlaySessionInputs로 전달한다(core 시각보다 과거인 raw만 processObservedBatch). 관측 시각은 줄지 않는다.
 */
function play(notes: readonly NoteEntity[], firstKeys: readonly string[], batches: readonly [number, JudgmentInput[]][], firstAt: number, delays?: () => number) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n); });
  const session = new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
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
  return { error, state: session.score.getState(), events: session.events };
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

describe("판정 정산 퍼즈: 유효한 연결 차트의 경계 ±100ms 입력", () => {
  it(`seed 1~${SEEDS}의 유효한 차트를 끝까지 재생하면 미등록·중복 점수 정산 예외 없음`, () => {
    expect(runs().length).toBeGreaterThan(SEEDS / 2);
    expect(throwingSeeds(runs())).toEqual([]);
  });

  it(`seed 1~${SEEDS}에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(runs())).toEqual([]);
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
  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 up −60~+80ms·연결 head −40~+115ms 재생에서 미등록·중복 점수 정산 예외 없음`, () => {
    expect(swapRuns().length).toBeGreaterThan(SWAP_SEEDS / 2);
    expect(throwingSeeds(swapRuns())).toEqual([]);
  });

  it(`seed 1~${SWAP_SEEDS}의 double 감소·교대 재생에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(swapRuns())).toEqual([]);
  });
});

describe("판정 정산 퍼즈: 짧은 바디(20~200ms) 체인의 경계 ±100ms 입력", () => {
  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인을 끝까지 재생하면 미등록·중복 점수 정산 예외 없음`, () => {
    expect(shortRuns().length).toBeGreaterThan(SHORT_SEEDS / 2);
    expect(throwingSeeds(shortRuns())).toEqual([]);
  });

  it(`seed 1~${SHORT_SEEDS}의 20~200ms 구간 체인에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    expect(fullComboWithUnsettledItems(shortRuns())).toEqual([]);
  });
});

// 관측 경로의 결과는 raw(processBatch) 재생과 같지 않을 수 있다. 관측 시각까지 먼저 진행하는 사이 S·E와 그 ±Good 경계를
// 지나면 그 경계의 판정(승계·시작 창 마감 등)이 입력보다 먼저 정해지기 때문이다. 그래서 여기서는 예외와 Full Combo 정산만 확인한다.
describe(`판정 정산 퍼즈: batch마다 0~${MAX_OBSERVED_DELAY}ms 늦게 관측한 입력`, () => {
  it.each([
    ["일반(60~1000ms)", "general"],
    ["짧은 바디(20~200ms)", "short"],
  ] as const)(`%s 생성기 seed 1~${OBSERVED_SEEDS}의 입력을 관측 지연으로 전달하면 정산 예외는 #199 래칫 seed뿐`, (_label, generator) => {
    expect(observedRuns(generator).length).toBeGreaterThan(OBSERVED_SEEDS / 2);
    expect(throwingSeeds(observedRuns(generator))).toEqual(OBSERVED_THROW_RATCHET[generator]);
  });

  it.each([
    ["일반(60~1000ms)", "general"],
    ["짧은 바디(20~200ms)", "short"],
  ] as const)(`%s 생성기 seed 1~${OBSERVED_SEEDS}의 관측 지연 재생에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, (_label, generator) => {
    expect(fullComboWithUnsettledItems(observedRuns(generator))).toEqual([]);
  });
});
