import { MAINTENANCE_GRACE_MS } from "../../shared/constants";

/** 레인별 hold 수와 기준별 부족 시각을 읽기만 하는 view. */
export interface LaneHoldView {
  /** 레인에서 지금 눌려 있는 서로 다른 키의 수. 입력이 없던 레인은 0이다. */
  count(lane: number): number;
  /**
   * hold 수가 `need`보다 적어진 시각. `count(lane) >= need`이거나 `need <= 0`이면 `undefined`,
   * 추적을 시작한 뒤 한 번도 `need`에 도달하지 않았으면 `-Infinity`이다.
   */
  shortSince(lane: number, need: number): number | undefined;
  /**
   * 부족이 회복되지 않을 때 유지 실패를 확정할 시각. 부족이 없으면 `undefined`,
   * 있으면 `shortSince + graceMs`이고 `refillUntil`(head 없는 시작의 S+Good)을 주면
   * 둘 중 늦은 쪽이다(RFD 0032 §8-1).
   */
  failureDeadline(lane: number, need: number, refillUntil?: number): number | undefined;
}

/**
 * 레인별로 서로 다른 키의 hold 수를 세고, 각 hold 수 기준(`need`) 아래로 내려간
 * 시각을 기준마다 따로 기록하는 순수 상태(RFD 0032 §2-1, §2-2).
 *
 * 차트·노트를 모르며 현재 시각도 모른다. 조회 결과는 마지막으로 받은 입력 뒤의 상태이다.
 * 입력은 시각이 줄지 않는 순서로 받는다고 가정하며, 순서를 검사하거나 예외를 던지지 않는다.
 */
export class LaneHoldTracker implements LaneHoldView {
  private readonly graceMs: number;
  /** 눌려 있는 키 → down 때 받은 레인. up은 레인 없이 이 기록으로 키를 뺀다. */
  private readonly keyLanes = new Map<string, number>();
  private readonly counts = new Map<number, number>();
  /**
   * 레인 → (기준 need → hold 수가 need 아래로 내려간 시각).
   * 기준을 회복하면 항목을 지우고, 다시 내려가면 새 시각으로 기록한다.
   * 한 번도 도달하지 않은 기준은 항목이 없다.
   */
  private readonly shortStarts = new Map<number, Map<number, number>>();

  constructor(graceMs: number = MAINTENANCE_GRACE_MS) {
    this.graceMs = graceMs;
  }

  /**
   * 키 down을 기록한다. 이미 눌린 키의 down은 같은 시각의 up 뒤 down으로 처리한다
   * (core가 `held`를 덮어쓰는 것과 같은 길이 0의 공백, 다른 레인이면 키를 옮긴다).
   */
  down(key: string, lane: number, at: number): void {
    if (this.keyLanes.has(key)) this.up(key, at);
    this.keyLanes.set(key, lane);
    const next = this.count(lane) + 1;
    this.counts.set(lane, next);
    this.shortStarts.get(lane)?.delete(next);
  }

  /** 키 up을 기록한다. 눌려 있지 않은 키의 up은 무시한다(core `release`의 token 없음과 같다). */
  up(key: string, at: number): void {
    const lane = this.keyLanes.get(key);
    if (lane === undefined) return;
    this.keyLanes.delete(key);
    const previous = this.count(lane);
    this.counts.set(lane, previous - 1);
    let starts = this.shortStarts.get(lane);
    if (!starts) {
      starts = new Map();
      this.shortStarts.set(lane, starts);
    }
    starts.set(previous, at);
  }

  count(lane: number): number {
    return this.counts.get(lane) ?? 0;
  }

  shortSince(lane: number, need: number): number | undefined {
    if (need <= 0 || this.count(lane) >= need) return undefined;
    return this.shortStarts.get(lane)?.get(need) ?? -Infinity;
  }

  failureDeadline(lane: number, need: number, refillUntil?: number): number | undefined {
    const since = this.shortSince(lane, need);
    if (since === undefined) return undefined;
    const deadline = since + this.graceMs;
    return refillUntil === undefined ? deadline : Math.max(deadline, refillUntil);
  }
}
