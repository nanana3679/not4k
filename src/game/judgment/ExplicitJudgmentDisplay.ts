import type { ExplicitDisplaySource, ExplicitGrade, ExplicitJudgmentDisplayState } from "./ExplicitJudgmentState";

interface Candidate {
  readonly grade: ExplicitGrade;
  readonly timingDeltaMs: number | null;
  readonly rawDeltaMs: number | null;
  readonly source: ExplicitDisplaySource;
}

// core의 기존 트릴 우선순위와 같으며 goodTrill의 GOOD◇ 표시를 보존한다.
const gradeRank: Record<ExplicitGrade, number> = { miss: -1, goodTrill: 0, good: 1, great: 2, perfect: 3 };

function precedes(candidate: Candidate, previous: Candidate): boolean {
  if (candidate.grade !== previous.grade) return gradeRank[candidate.grade] < gradeRank[previous.grade];
  const timed = candidate.timingDeltaMs !== null;
  const previousTimed = previous.timingDeltaMs !== null;
  if (timed !== previousTimed) return timed;
  if (timed && Math.abs(candidate.rawDeltaMs!) !== Math.abs(previous.rawDeltaMs!)) {
    return Math.abs(candidate.rawDeltaMs!) > Math.abs(previous.rawDeltaMs!);
  }
  return candidate.source.noteIndex < previous.source.noteIndex
    || (candidate.source.noteIndex === previous.source.noteIndex && candidate.source.ordinal < previous.source.ordinal);
}

/** confirmedAt만 묶는다. phase·호출·drain 경계는 대표 상태를 닫지 않는다. */
export class ExplicitJudgmentDisplay {
  private readonly candidateByTime = new Map<number, Candidate>();
  private latest: ExplicitJudgmentDisplayState | null = null;

  constructor(private readonly instanceId: string) {}

  get current(): ExplicitJudgmentDisplayState | null { return this.latest; }

  confirm(confirmedAt: number, candidate: Candidate): ExplicitJudgmentDisplayState | null {
    const previous = this.candidateByTime.get(confirmedAt);
    if (previous && !precedes(candidate, previous)) return null;
    this.candidateByTime.set(confirmedAt, candidate);
    const state = Object.freeze({ groupId: `${this.instanceId}:${confirmedAt}`, confirmedAt,
      grade: candidate.grade, timingDeltaMs: candidate.timingDeltaMs, source: candidate.source });
    if (!this.latest || confirmedAt >= this.latest.confirmedAt) this.latest = state;
    return state;
  }
}
