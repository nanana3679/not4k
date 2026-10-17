import { MAINTENANCE_GRACE_MS } from "../../shared/constants";

/** 유지 실패 기한을 계산할 바디 쪽 기준(RFD 0032 §2-2, §4-3, §8-1). */
export interface MaintenanceWindow {
  /**
   * 이 시각부터 hold 수를 요구한다. 그전의 부족은 세지 않는다. head 없는 바디는 시작 S,
   * head가 있는 바디는 head를 처리한 down 시각을 넘긴다(그 down부터 유예를 적용, §4-3).
   * head Miss는 다르다. head의 Good 기한에 `belowSince(lane, need)`로 그 몫까지 채웠는지 먼저 보고,
   * 채우지 못했으면 유예 없이 head Miss와 그 몫의 종속 0점으로 바로 정리한 뒤 줄어든 `need`로 판단한다.
   * 채웠을 때만 head의 Good 기한을 `judgedFrom`으로 넘겨 이어서 판단한다(§5-2, §5-4).
   */
  readonly judgedFrom: number;
  /** head 없는 시작·경계의 S+Good. 주면 실패 기한이 이보다 이르지 않다(§8-1, §8-2). */
  readonly refillUntil?: number;
}

/** 레인별 hold 수와 기준별 부족 시각을 읽기만 하는 view. */
export interface LaneHoldView {
  /** 레인에서 지금 눌려 있는 서로 다른 키의 수. 입력이 없던 레인은 0이다. */
  count(lane: number): number;
  /**
   * hold 수가 `need`보다 적어진 시각. `count(lane) >= need`이거나 `need <= 0`이면 `undefined`,
   * 추적을 시작한 뒤 한 번도 `need`에 도달하지 않았으면 `-Infinity`이다.
   */
  belowSince(lane: number, need: number): number | undefined;
  /**
   * 부족이 회복되지 않을 때 유지 실패를 확정할 시각. 부족이 없으면 `undefined`, 있으면
   * `max(belowSince, judgedFrom) + graceMs`이고 `refillUntil`을 주면 그보다 이르지 않다.
   * `judgedFrom`이 있으므로 한 번도 도달하지 않은 기준도 유한한 시각을 돌려준다.
   */
  failureDeadline(lane: number, need: number, window: MaintenanceWindow): number | undefined;
}

/**
 * 레인별로 서로 다른 키의 hold 수를 세고, 각 hold 수 기준(`need`) 아래로 내려간
 * 시각을 기준마다 따로 기록하는 순수 상태(RFD 0032 §2-1, §2-2).
 *
 * 차트·노트를 모르며 현재 시각도 모른다. 조회 결과는 마지막으로 받은 입력 뒤의 상태이며 지난 부족을 기억하지 않으므로,
 * 회복 전에 지난 실패 기한은 호출하는 쪽이 회복 입력을 넣기 전에 확정해야 한다.
 * 입력은 시각이 줄지 않는 순서로 받는다고 가정하며, 순서를 검사하거나 예외를 던지지 않는다. 같은 시각의 입력은 받은
 * 순서대로 반영하므로(core는 up을 down보다 먼저 넣는다) 순서에 따라 기준별 부족 시작이 달라질 수 있다.
 */
export class LaneHoldTracker implements LaneHoldView {
  private readonly graceMs: number;
  /** 눌려 있는 키 → down 때 받은 레인. up은 레인 없이 이 기록으로 키를 뺀다. */
  private readonly laneByHeldKey = new Map<string, number>();
  private readonly holdCountByLane = new Map<number, number>();
  /**
   * 레인 → (기준 need → hold 수가 need 아래로 내려간 시각).
   * 기준을 회복하면 항목을 지우고, 다시 내려가면 새 시각으로 기록한다.
   * 한 번도 도달하지 않은 기준은 항목이 없다.
   */
  private readonly belowSinceByLane = new Map<number, Map<number, number>>();

  constructor(graceMs: number = MAINTENANCE_GRACE_MS) {
    this.graceMs = graceMs;
  }

  /**
   * 키 down을 기록한다. 이미 눌린 키의 down은 같은 시각의 up 뒤 down으로 처리한다
   * (core가 `held`를 덮어쓰는 것과 같은 길이 0의 공백, 다른 레인이면 키를 옮긴다).
   */
  down(key: string, lane: number, at: number): void {
    if (this.laneByHeldKey.has(key)) this.up(key, at);
    this.laneByHeldKey.set(key, lane);
    const next = this.count(lane) + 1;
    this.holdCountByLane.set(lane, next);
    this.belowSinceByLane.get(lane)?.delete(next);
  }

  /** 키 up을 기록한다. 눌려 있지 않은 키의 up은 무시한다(core `release`의 token 없음과 같다). */
  up(key: string, at: number): void {
    const lane = this.laneByHeldKey.get(key);
    if (lane === undefined) return;
    this.laneByHeldKey.delete(key);
    const previous = this.count(lane);
    this.holdCountByLane.set(lane, previous - 1);
    let belowSinceByNeed = this.belowSinceByLane.get(lane);
    if (!belowSinceByNeed) {
      belowSinceByNeed = new Map();
      this.belowSinceByLane.set(lane, belowSinceByNeed);
    }
    belowSinceByNeed.set(previous, at);
  }

  count(lane: number): number {
    return this.holdCountByLane.get(lane) ?? 0;
  }

  belowSince(lane: number, need: number): number | undefined {
    if (need <= 0 || this.count(lane) >= need) return undefined;
    return this.belowSinceByLane.get(lane)?.get(need) ?? -Infinity;
  }

  failureDeadline(lane: number, need: number, { judgedFrom, refillUntil }: MaintenanceWindow): number | undefined {
    const since = this.belowSince(lane, need);
    if (since === undefined) return undefined;
    const deadline = Math.max(since, judgedFrom) + this.graceMs;
    return refillUntil === undefined ? deadline : Math.max(deadline, refillUntil);
  }
}
