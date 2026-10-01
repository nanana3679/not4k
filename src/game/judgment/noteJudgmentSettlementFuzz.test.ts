import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { validateChart } from "../../shared/validation";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import type { JudgmentInput, NoteJudgmentEvent } from "./NoteJudgmentCore";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
import { body, point } from "./noteJudgmentTestHarness";

/**
 * 결정적 퍼즈: seed마다 맞닿은 단일 레인 롱노트 체인과 경계 ±100ms 입력을 만들고
 * 실제 NoteJudgmentSession으로 끝까지 재생해 점수 정산 불변식을 확인한다.
 * Math.random은 쓰지 않는다. 실패하면 seed 번호로 같은 차트·입력을 다시 만들 수 있다.
 */
const SEEDS = 3000;
const START = 1000;
const LATE_FIRST_HEAD = 30;
const KEYS = ["A", "B", "C", "D"] as const;
/**
 * main에도 있는 별개 결함: 뒤 바디가 없는 끝 holdOnly 바디가 E+Good까지 미확정으로 남으면
 * holdOnly 대신 release 판정을 내보내 세션이 미등록 score item 예외를 던진다
 * (예: seed 337 — head 1000 + [1000,1100] → head 1100 + holdOnly [1100,1160], A up 1100).
 * 고치면 이 목록에서 빼야 테스트가 통과한다.
 */
const KNOWN_TERMINAL_HOLD_ONLY_THROWS = [337, 2578];

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

/** 2~4개 구간을 맞닿게 잇는다. 각 구간은 head 없음·single·double과 길이·unit 수·holdOnly를 무작위로 고른다. */
function chartFor(rng: () => number): NoteEntity[] {
  const notes: NoteEntity[] = [];
  const segments = 2 + Math.floor(rng() * 3);
  let at = START;
  for (let i = 0; i < segments; i++) {
    const head = pick(rng, ["none", "single", "single", "double"] as const);
    const end = at + pick(rng, [60, 100, 200, 500, 1000]);
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
  const offset = () => Math.round((rng() * 200 - 100) / 5) * 5;
  const actions: { at: number; key: string; type: "up" | "down" }[] = [];
  for (const time of times) {
    const pattern = rng();
    if (pattern < 0.45) {
      actions.push({ at: time + offset(), key: pick(rng, KEYS), type: "up" });
      actions.push({ at: time + offset(), key: pick(rng, KEYS), type: "down" });
    } else if (pattern < 0.65) actions.push({ at: time + offset(), key: pick(rng, KEYS), type: "up" });
    else if (pattern < 0.8) actions.push({ at: time + offset(), key: pick(rng, KEYS), type: "down" });
  }
  // 첫 head를 늦춘 재생과 비교할 수 있도록 첫 head 구간 이후의 입력만 남긴다.
  const ordered = actions.filter(action => action.at > START + LATE_FIRST_HEAD).sort((a, b) => a.at - b.at);
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

function play(notes: readonly NoteEntity[], firstKeys: readonly string[], batches: readonly [number, JudgmentInput[]][], firstAt: number) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n); });
  const session = new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends));
  let error: string | undefined;
  try {
    session.processBatch(firstAt, firstKeys.map(key => ({ key, lane: 1, type: "down" as const })));
    for (const [at, inputs] of batches) session.processBatch(at, inputs);
    session.finalize();
  } catch (caught) {
    error = (caught as Error).message;
  }
  return { error, state: session.score.getState(), events: session.events };
}

const afterFirstHead = (events: readonly NoteJudgmentEvent[], firstAt: number) => events
  .filter(event => !(event.kind === "head" && event.inputAt === firstAt))
  .map(event => [event.kind, event.noteIndex, event.unitIndex, event.grade, event.deltaMs, event.confirmedAt]);

let cached: { seed: number; onTime: ReturnType<typeof play>; late: ReturnType<typeof play> }[] | undefined;
function runs() {
  if (cached) return cached;
  cached = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rng = mulberry32(seed);
    const notes = chartFor(rng);
    if (validateChart({ notes, trillZones: [], events: [] }).length > 0) continue;
    const { firstKeys, batches } = inputsFor(rng, notes);
    cached.push({
      seed,
      onTime: play(notes, firstKeys, batches, START),
      late: play(notes, firstKeys, batches, START + LATE_FIRST_HEAD),
    });
  }
  return cached;
}

describe("판정 정산 퍼즈: 유효한 연결 차트의 경계 ±100ms 입력", () => {
  it(`seed 1~${SEEDS}의 유효한 차트를 끝까지 재생하면 미등록·중복 점수 정산 예외는 기존 끝 holdOnly 결함 seed ${KNOWN_TERMINAL_HOLD_ONLY_THROWS.join("·")}뿐`, () => {
    expect(runs().length).toBeGreaterThan(SEEDS / 2);
    const throwing = runs().filter(run => run.onTime.error !== undefined).map(run => run.seed);
    expect(throwing).toEqual(KNOWN_TERMINAL_HOLD_ONLY_THROWS);
  });

  it(`seed 1~${SEEDS}에서 Full Combo로 끝난 플레이는 모든 점수 항목을 정확히 한 번씩 정산함`, () => {
    const lost = runs().filter(run => run.onTime.error === undefined && run.onTime.state.isFullCombo &&
      run.onTime.state.processedNotes !== run.onTime.state.totalNotes).map(run => run.seed);
    expect(lost).toEqual([]);
  });

  it(`seed 1~${SEEDS}에서 첫 head를 ${LATE_FIRST_HEAD}ms 늦게 눌러도 첫 head 외 판정·등급·확정 시각이 정박과 같음`, () => {
    const differing = runs().filter(run => run.onTime.error === undefined &&
      JSON.stringify(afterFirstHead(run.onTime.events, START)) !== JSON.stringify(afterFirstHead(run.late.events, START + LATE_FIRST_HEAD)))
      .map(run => run.seed);
    expect(differing).toEqual([]);
  });
});
