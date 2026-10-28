import type { ExplicitCompiledChart, ExplicitScoreItem } from "../judgment/explicitCompiledChart";
import { DEFAULT_BINDINGS_TKL } from "./InputSystem";
import type { KeyBinding } from "./InputSystem";

export interface ExplicitAutoInput {
  readonly lane: number;
  readonly timeMs: number;
  readonly key: string;
  readonly type: "down" | "up";
}

export interface ExplicitAutoSection { readonly startMs: number; readonly endMs: number }

export interface ExplicitAutoPlayerOptions {
  /** 생략하면 전체 자동 입력, []이면 수동 입력만 사용한다. 양 끝을 포함한다. */
  readonly sections?: readonly ExplicitAutoSection[];
  /** 레인당 실제 가용 키 수를 사용한다. 합성 키의 namespace는 수동 키와 분리한다. */
  readonly bindings?: readonly KeyBinding[];
  readonly tapDurationMs?: number;
}

/**
 * 명시 배치를 유한한 물리 키의 down/up으로 펼친다. 판정·상태·정산을 주입하지 않는다.
 * 바디가 차지한 키도 같은 시각 up/down으로 재누를 수 있고, 그 up의 실제 소비는 core가 결정한다.
 */
export class ExplicitAutoPlayer {
  private readonly events: readonly ExplicitAutoInput[];
  private cursor = 0;

  constructor(chart: ExplicitCompiledChart, options: ExplicitAutoPlayerOptions = {}) {
    const sections = options.sections ?? [{ startMs: -Infinity, endMs: Infinity }];
    if (sections.some(section => Number.isNaN(section.startMs) || Number.isNaN(section.endMs) || section.startMs > section.endMs)) {
      throw new RangeError("AutoEvent 범위가 유효하지 않습니다");
    }
    const tapDuration = options.tapDurationMs ?? 50;
    if (!Number.isFinite(tapDuration) || tapDuration < 0) throw new RangeError("자동 탭 길이는 0 이상이어야 합니다");
    const keysByLane = new Map<number, string[]>();
    const laneByKey = new Map<string, number>();
    for (const binding of options.bindings ?? DEFAULT_BINDINGS_TKL) {
      if (laneByKey.has(binding.key)) throw new Error(`중복 자동 입력 바인딩: ${binding.key}`);
      laneByKey.set(binding.key, binding.lane);
      const keys = keysByLane.get(binding.lane) ?? [];
      keys.push(`explicit-auto:${binding.key}`);
      keysByLane.set(binding.lane, keys);
    }
    const isAutoAt = (at: number) => sections.some(section => section.startMs <= at && at <= section.endMs);
    const output: ExplicitAutoInput[] = [];
    const lanes = new Set([...chart.bodies.map(body => body.lane), ...chart.scoreItems.map(item => item.lane)]);
    for (const lane of lanes) {
      // tick은 입력 계획에 전혀 참여하지 않는다.
      const taps = chart.scoreItems.filter(item => item.lane === lane && item.kind === "tap" && isAutoAt(item.timeMs));
      const bodies = chart.bodies.filter(body => body.lane === lane && isAutoAt(body.startMs));
      const ownedBodies = new Set(bodies.map(body => body.source.noteIndex));
      const releases = chart.scoreItems.filter(item => item.lane === lane && item.kind === "release"
        && (isAutoAt(item.timeMs) || (item.bodyIndex !== undefined && ownedBodies.has(item.bodyIndex))));
      if (!taps.length && !bodies.length && !releases.length) continue;
      const keys = keysByLane.get(lane) ?? [];
      const required = Math.max(1, ...bodies.map(body => body.holdCount),
        ...[...taps, ...releases].map(item => item.ordinal + 1));
      if (keys.length < required) throw new Error(`레인 ${lane}: 자동 입력에 ${required}개의 서로 다른 키가 필요합니다`);
      const held = new Set<string>();
      const lastTrillKeyByZone = new Map<number, string>();
      const times = new Set([...taps, ...releases].map(item => item.timeMs));
      for (const body of bodies) { times.add(body.startMs); times.add(body.endMs); }
      const cleanupTimes = new Set<number>();
      for (const tap of taps) { times.add(tap.timeMs + tapDuration); cleanupTimes.add(tap.timeMs + tapDuration); }
      const atTimes = [...times].sort((a, b) => a - b);
      const emit = (at: number, key: string, type: "down" | "up") => {
        if (type === "down" ? held.has(key) : !held.has(key)) throw new Error("자동 입력의 물리 키 수명이 잘못되었습니다");
        if (type === "down") held.add(key); else held.delete(key);
        output.push(Object.freeze({ lane, timeMs: at, key, type }));
      };
      const fill = (at: number, count: number) => {
        if (!isAutoAt(at)) return;
        for (const key of keys) {
          if (held.size >= count) break;
          if (!held.has(key)) emit(at, key, "down");
        }
      };
      const countAt = (items: readonly ExplicitScoreItem[], at: number) => items.filter(item => item.timeMs === at).length;
      for (const at of atTimes) {
        const releaseCount = countAt(releases, at);
        // 단독 릴리즈나 hold 수보다 많은 릴리즈도 실제 down 뒤 서로 다른 키의 up으로 처리한다.
        fill(at, releaseCount);
        for (const key of [...held].slice(0, releaseCount)) emit(at, key, "up");

        const tapItems = taps.filter(item => item.timeMs === at);
        const selected = new Set<string>();
        for (const tap of tapItems) {
          const previous = tap.kind === "tap" && tap.trillZoneIndex !== undefined
            ? lastTrillKeyByZone.get(tap.trillZoneIndex) : undefined;
          const available = keys.filter(key => !selected.has(key));
          const key = available.find(key => !held.has(key) && key !== previous)
            ?? available.find(key => key !== previous) ?? available[0];
          if (held.has(key)) emit(at, key, "up");
          emit(at, key, "down");
          selected.add(key);
          if (tap.kind === "tap" && tap.trillZoneIndex !== undefined) lastTrillKeyByZone.set(tap.trillZoneIndex, key);
        }
        // 릴리즈 수는 hold 수와 별개다. 끝에서 추가 down이 금지되는 부분 구간도 미리 확보한다.
        const active = bodies.filter(body => body.startMs <= at && at < body.endMs);
        const desired = Math.max(0, ...active.map(body => Math.max(body.holdCount,
          releases.filter(item => item.kind === "release" && item.bodyIndex === body.source.noteIndex).length)));
        const starting = bodies.filter(body => body.startMs === at);
        fill(at, Math.max(desired, ...starting.map(body => body.holdCount)));
        if (cleanupTimes.has(at) || bodies.some(body => body.endMs === at)) {
          // 연결 경계는 뒤 바디에 필요한 hold를 남긴다. 범위 밖에서는 자신이 누른 키만 놓는다.
          for (const key of [...held].slice(desired)) emit(at, key, "up");
        }
      }
      const last = atTimes.at(-1);
      if (last !== undefined) for (const key of [...held]) emit(last, key, "up");
    }
    // stable sort는 같은 키의 동일 시각 up/down 인과관계를 유지한다.
    this.events = Object.freeze(output.sort((a, b) => a.timeMs - b.timeMs));
  }

  eventsThrough(timeMs: number): readonly ExplicitAutoInput[] {
    const start = this.cursor;
    while (this.cursor < this.events.length && this.events[this.cursor].timeMs <= timeMs) this.cursor++;
    return this.events.slice(start, this.cursor);
  }

  /** 복원 경계와 같은 시각의 입력은 재개 후 실제 판정에 남긴다. */
  eventsBefore(timeMs: number): readonly ExplicitAutoInput[] {
    const start = this.cursor;
    while (this.cursor < this.events.length && this.events[this.cursor].timeMs < timeMs) this.cursor++;
    return this.events.slice(start, this.cursor);
  }

  /** raw 시각과 곡 관측 시각은 다르므로 재구성 경계는 실제로 전달한 이벤트 수로 보관한다. */
  get processedEventCount(): number { return this.cursor; }

  /** 정적 키·트릴 계획은 그대로 두고 폐기한 입력부터 다시 전달한다. 반환값은 prefix의 현재 hold다. */
  restoreCursor(eventCount: number): readonly { lane: number; key: string }[] {
    if (!Number.isInteger(eventCount) || eventCount < 0 || eventCount > this.events.length) {
      throw new RangeError('Auto 입력 커서가 유효하지 않습니다');
    }
    this.cursor = eventCount;
    const heldByKey = new Map<string, { lane: number; key: string }>();
    for (const event of this.events.slice(0, eventCount)) {
      if (event.type === 'down') heldByKey.set(event.key, { lane: event.lane, key: event.key });
      else heldByKey.delete(event.key);
    }
    return [...heldByKey.values()];
  }
}
