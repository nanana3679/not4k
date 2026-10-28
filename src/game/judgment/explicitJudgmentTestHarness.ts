import { beat } from "../../shared/types/beat";
import type { ChartDocument, ExplicitNoteEntity } from "../../shared/types/chart";
import type { JudgmentInput } from "./JudgmentCore";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import type { ExplicitCompiledChart } from "./explicitCompiledChart";

/** 설계 그림 JSON을 런타임 차트로 읽지 않는 독립 실행 fixture. */
export interface ExplicitReplayFixture {
  readonly id: `ENJ-${string}` | `HC${string}`;
  readonly source: string;
  readonly chart: ChartDocument;
  readonly batches: readonly ExplicitReplayBatch[];
  readonly finishAtMs: number;
  readonly windows: { readonly perfect: number; readonly great: number; readonly good: number };
  /** 사례 설정인 임시 값이며 제품 튜닝 상수가 아니다. */
  readonly maintenanceGraceMs: 20;
  readonly expected: {
    readonly scoreItemCount: number;
    readonly theoreticalWeight: number;
    readonly earnedScore: number;
    readonly scope: "whole" | "partial";
    /** 부분 단언은 새 explicit notes index로 범위를 명시한다. 바디의 무점수 실패도 포함한다. */
    readonly assertionNoteIndices?: readonly number[];
    readonly events?: {
      readonly perfect: number;
      readonly great: number;
      readonly good: number;
      readonly pointMiss: number;
      readonly releaseMiss: number;
      readonly maintenanceMiss: number;
      readonly dependentZero: number;
    };
  };
}

export interface ExplicitReplayBatch {
  readonly rawAtMs: number;
  readonly observedAtMs: number;
  readonly inputs: readonly JudgmentInput[];
}

export type ExplicitFixtureHold = readonly [key: string, downMs: number, upMs: number | null, lane?: number];

/** fixture에서만 120 BPM의 ms 좌표를 Beat로 명시한다. compiler는 ChartTiming을 사용한다. */
export const explicitFixturePoint = (atMs: number, kind: "single" | "double" | "trill" = "single", lane = 1, grace = false): ExplicitNoteEntity =>
  ({ type: "point", kind, lane, beat: beat(atMs, 500), ...(grace ? { grace: true } : {}) });
export const explicitFixtureBody = (startMs: number, endMs: number, holdCount: 1 | 2 = 1, lane = 1): ExplicitNoteEntity =>
  ({ type: "body", lane, beat: beat(startMs, 500), endBeat: beat(endMs, 500), holdCount });
export const explicitFixtureRelease = (atMs: number, count: 1 | 2 = 1, lane = 1, grace = false): ExplicitNoteEntity =>
  ({ type: "release", lane, beat: beat(atMs, 500), count, ...(grace ? { grace: true } : {}) });
export const explicitFixtureSustain = (atMs: number, count: 1 | 2 = 1, lane = 1): ExplicitNoteEntity =>
  ({ type: "sustain", lane, beat: beat(atMs, 500), count });

export function makeExplicitReplayFixture(
  id: ExplicitReplayFixture["id"], source: string, notes: ExplicitNoteEntity[],
  holds: readonly ExplicitFixtureHold[], expected: ExplicitReplayFixture["expected"],
): ExplicitReplayFixture {
  const chart: ChartDocument = { meta: { title: id, artist: "fixture", difficultyLabel: "NORMAL", difficultyLevel: 1,
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 }, notes, trillZones: [],
    events: [{ type: "bpm", beat: beat(0), bpm: 120 }] };
  const inputsByTime = new Map<number, JudgmentInput[]>();
  for (const [key, downMs, upMs, lane = 1] of holds) {
    const add = (at: number, type: "down" | "up") => {
      const inputs = inputsByTime.get(at) ?? [];
      inputs.push({ key, lane, type });
      inputsByTime.set(at, inputs);
    };
    add(downMs, "down");
    if (upMs !== null) add(upMs, "up");
  }
  const batches = [...inputsByTime].sort(([a], [b]) => a - b)
    .map(([rawAtMs, inputs]) => ({ rawAtMs, observedAtMs: rawAtMs, inputs }));
  const lastNoteMs = Math.max(0, ...notes.map(note => ("endBeat" in note ? note.endBeat.n / note.endBeat.d : note.beat.n / note.beat.d) * 500));
  return { id, source, chart, batches, expected, finishAtMs: Math.max(lastNoteMs, ...inputsByTime.keys()) + 500,
    windows: { perfect: 41, great: 82, good: 120 }, maintenanceGraceMs: 20 };
}

/** M1 실제 세션을 어댑트하는 최소 입출력 seam. 기본/가짜 판정 구현은 제공하지 않는다. */
export interface ExplicitReplaySession<Result> {
  processObservedBatch(rawAt: number, inputs: readonly JudgmentInput[], observedAt: number): void;
  advance(at: number): void;
  result(): Result;
}

/** C2는 compile까지 검증한다. 이 함수의 판정 결과 증거는 M1 실제 session factory를 넘긴 뒤에만 생긴다. */
export function replayExplicitFixture<Result>(
  fixture: ExplicitReplayFixture,
  createSession: (chart: ExplicitCompiledChart, fixture: ExplicitReplayFixture) => ExplicitReplaySession<Result>,
): { readonly compiled: ExplicitCompiledChart; readonly result: Result } {
  const compiled = compileExplicitJudgmentChart(fixture.chart);
  const session = createSession(compiled, fixture);
  for (const batch of fixture.batches) session.processObservedBatch(batch.rawAtMs, batch.inputs, batch.observedAtMs);
  session.advance(fixture.finishAtMs);
  return { compiled, result: session.result() };
}
