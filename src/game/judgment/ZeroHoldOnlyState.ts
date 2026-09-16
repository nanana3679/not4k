import { JUDGMENT_WINDOWS } from "../../shared/constants";
import type { CompiledJudgmentChart } from "./compiledJudgmentChart";

export interface ZeroHoldKey {
  readonly key: string;
  readonly lane: number;
  /** 물리 down이 시작된 논리 시각. 생략하면 현재 관측 시각부터 held로 취급한다. */
  readonly at?: number;
}

export interface ZeroHoldSuccess {
  readonly kind: "success";
  readonly noteIndex: number;
  readonly unitIndex: number;
  readonly itemId: string;
  readonly key: string;
  readonly lane: number;
  readonly at: number;
}

export interface ZeroHoldFailure {
  readonly kind: "failure";
  readonly noteIndex: number;
  readonly unitIndex: number;
  readonly itemId: string;
  readonly lane: number;
  readonly deadline: number;
}

interface ZeroUnit {
  readonly noteIndex: number;
  readonly unitIndex: number;
  readonly lane: number;
  readonly startMs: number;
  readonly itemId: string;
  successKey?: string;
  failed: boolean;
}

/**
 * 길이 0 `holdOnly`만 담당하는 순수 관측 상태.
 * 실제 down/up 소비·release 권한과 S−Good/S/deadline sweep은 core가 소유한다.
 */
export class ZeroHoldOnlyState {
  private readonly units: ZeroUnit[];
  private readonly goodWindowMs: number;

  constructor(
    compiled: CompiledJudgmentChart,
    goodWindowMs: number = JUDGMENT_WINDOWS.GOOD,
  ) {
    this.goodWindowMs = goodWindowMs;
    this.units = compiled.units.flatMap((unit) => {
      if (unit.startMs !== unit.endMs) return [];
      const note = compiled.rawNotes[unit.noteIndex];
      if (!note || !("endBeat" in note) || !note.holdOnly) return [];
      const itemId = unit.holdOnlyItemId;
      if (!itemId) return [];
      return [{
        noteIndex: unit.noteIndex,
        unitIndex: unit.ordinal,
        lane: unit.lane,
        startMs: unit.startMs,
        itemId,
        failed: false,
      }];
    });
  }

  /**
   * S−Good 이후 현재 물리 held 상태를 관측한다.
   * S 이전부터 held였으면 core가 S에서 다시 관측해 표시하고, S 이후 down도
   * deadline 전 관측이면 그 관측 시각에 표시한다. deadline 밖 관측은 성공시키지 않는다.
   */
  observe(at: number, heldKeys: readonly ZeroHoldKey[]): readonly ZeroHoldSuccess[] {
    const keys = new Set(heldKeys.filter((entry) => entry.key.length > 0).map((entry) => `${entry.lane}\u0000${entry.key}`));
    const successes: ZeroHoldSuccess[] = [];
    for (const unit of this.units) {
      if (unit.failed || unit.successKey || at < unit.startMs || at > unit.startMs + this.goodWindowMs) continue;
      const candidate = heldKeys.find((entry) => entry.lane === unit.lane && keys.has(`${entry.lane}\u0000${entry.key}`) && !this.keyUsedByNote(unit.noteIndex, entry.key));
      if (candidate) successes.push(this.succeed(unit, candidate.key, at));
    }
    return successes;
  }

  /** 큰 시간 점프에서도 held가 시작 경계를 통과한 시각에 확정한다. */
  observeThrough(at: number, heldKeys: readonly ZeroHoldKey[]): readonly ZeroHoldSuccess[] {
    const times = [...new Set(this.units.map(unit => unit.startMs))]
      .filter(time => time <= at)
      .sort((a, b) => a - b);
    const successes: ZeroHoldSuccess[] = [];
    for (const time of times) {
      successes.push(...this.observe(time, heldKeys.filter(entry => entry.at === undefined || entry.at <= time)));
    }
    successes.push(...this.observe(at, heldKeys));
    return successes;
  }

  /** Good 창 안의 유효 early up만 성공시킨다. 이 up은 physical release 권한을 소비하지 않는다. */
  release(key: string, lane: number, at: number, heldBefore: boolean): readonly ZeroHoldSuccess[] {
    if (!heldBefore || key.length === 0) return [];
    const successes: ZeroHoldSuccess[] = [];
    for (const unit of this.units) {
      if (unit.failed || unit.successKey || unit.lane !== lane || at < unit.startMs - this.goodWindowMs || at > unit.startMs + this.goodWindowMs) continue;
      if (this.keyUsedByNote(unit.noteIndex, key)) continue;
      successes.push(this.succeed(unit, key, at));
    }
    return successes;
  }

  /** core가 deadline을 sweep한 시각을 전달하면 아직 성공하지 않은 unit을 실패 목록으로 반환한다. */
  expireBefore(at: number, inclusive = false): readonly ZeroHoldFailure[] {
    const failures: ZeroHoldFailure[] = [];
    for (const unit of this.units) {
      if (unit.failed || unit.successKey || (inclusive ? at < unit.startMs + this.goodWindowMs : at <= unit.startMs + this.goodWindowMs)) continue;
      unit.failed = true;
      failures.push({ kind: "failure", noteIndex: unit.noteIndex, unitIndex: unit.unitIndex, itemId: unit.itemId, lane: unit.lane, deadline: unit.startMs + this.goodWindowMs });
    }
    return failures;
  }

  private keyUsedByNote(noteIndex: number, key: string): boolean {
    return this.units.some((unit) => unit.noteIndex === noteIndex && unit.successKey === key);
  }

  private succeed(unit: ZeroUnit, key: string, at: number): ZeroHoldSuccess {
    unit.successKey = key;
    return { kind: "success", noteIndex: unit.noteIndex, unitIndex: unit.unitIndex, itemId: unit.itemId, key, lane: unit.lane, at };
  }
}
