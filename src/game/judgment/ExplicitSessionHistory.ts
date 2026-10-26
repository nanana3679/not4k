import type { ExplicitHeldKey, ExplicitJudgmentInput, ExplicitObservedInputBatch } from "./ExplicitJudgmentState";

export type ExplicitSessionOperation =
  | { readonly kind: "advance"; readonly atMs: number }
  | { readonly kind: "batch"; readonly atMs: number; readonly inputs: readonly ExplicitJudgmentInput[] }
  | { readonly kind: "observedBatches"; readonly observedAtMs: number; readonly groups: readonly ExplicitObservedInputBatch[] }
  | { readonly kind: "resume"; readonly atMs: number; readonly heldKeys: readonly ExplicitHeldKey[] | undefined;
      readonly playbackStartMs: number }
  | { readonly kind: "syncHeldKeys"; readonly atMs: number; readonly heldKeys: readonly ExplicitHeldKey[] };

interface ObservedOperation {
  /** 보정 raw/core 시각과 별개인 실제 곡 관측 시각. */
  readonly observedSongTimeMs: number;
  readonly operation: ExplicitSessionOperation;
}

const copyInputs = (inputs: readonly ExplicitJudgmentInput[]) => Object.freeze(inputs.map(input => Object.freeze({ ...input })));

function copyOperation(operation: ExplicitSessionOperation): ExplicitSessionOperation {
  switch (operation.kind) {
    case "batch": return Object.freeze({ ...operation, inputs: copyInputs(operation.inputs) });
    case "observedBatches": return Object.freeze({ ...operation, groups: Object.freeze(operation.groups.map(group =>
      Object.freeze({ rawAtMs: group.rawAtMs, inputs: copyInputs(group.inputs) }))) });
    case "resume": return Object.freeze({ ...operation,
      heldKeys: operation.heldKeys && Object.freeze(operation.heldKeys.map(key => Object.freeze({ ...key }))) });
    case "syncHeldKeys": return Object.freeze({ ...operation,
      heldKeys: Object.freeze(operation.heldKeys.map(key => Object.freeze({ ...key }))) });
    case "advance": return Object.freeze({ ...operation });
  }
}

/** 한 플레이 분기의 입력·진행·재개 기록. 프레임마다 전체 이력을 복사하지 않는다. */
export class ExplicitSessionHistory {
  private readonly entries: ObservedOperation[] = [];
  private observedThrough: number;

  constructor(private readonly startTimeMs = -Infinity) { this.observedThrough = startTimeMs; }

  get latestSongTimeMs(): number { return this.observedThrough; }

  validateObservation(observedSongTimeMs: number): void {
    if (!Number.isFinite(observedSongTimeMs) || observedSongTimeMs < this.observedThrough) {
      throw new RangeError("곡 관측 시각은 유한하고 이전 관측 시각 이상이어야 합니다");
    }
  }

  append(operation: ExplicitSessionOperation, observedSongTimeMs: number): void {
    this.validateObservation(observedSongTimeMs);
    this.entries.push(Object.freeze({ observedSongTimeMs, operation: copyOperation(operation) }));
    this.observedThrough = observedSongTimeMs;
  }

  /** 상태를 바꾸지 않는 재구성 경계도 다음 관측의 하한으로 보존한다. */
  observeThrough(observedSongTimeMs: number): void {
    this.validateObservation(observedSongTimeMs);
    this.observedThrough = observedSongTimeMs;
  }

  *prefixThrough(songTimeMs: number): Iterable<ObservedOperation> {
    if (!Number.isFinite(songTimeMs) || songTimeMs < this.startTimeMs || songTimeMs > this.observedThrough) {
      throw new RangeError("복원 시각은 플레이 시작부터 마지막 곡 관측 사이여야 합니다");
    }
    for (const entry of this.entries) {
      if (entry.observedSongTimeMs > songTimeMs) break;
      yield entry;
    }
  }
}
