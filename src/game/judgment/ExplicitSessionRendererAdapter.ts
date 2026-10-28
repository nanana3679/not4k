import type { ExplicitJudgmentEffect, ExplicitJudgmentSnapshot } from "./ExplicitJudgmentState";

export interface ExplicitSessionRendererSource {
  readonly snapshot: ExplicitJudgmentSnapshot;
  /** 소비 커서는 renderer나 adapter가 아닌 session이 소유한다. */
  drainEffects(): readonly ExplicitJudgmentEffect[];
}

export interface ExplicitSnapshotRendererPort {
  render(snapshot: ExplicitJudgmentSnapshot, visualTimeMs?: number): unknown;
}

export interface ExplicitConfirmedEffectSink {
  /** 세션이 선택한 displayUpdate와 항목별 효과를 받는다. adapter는 다시 집계하지 않는다. */
  applyConfirmedEffects(effects: readonly ExplicitJudgmentEffect[]): void;
}

/** 상태 복구와 일회성 확정 효과를 분리한다. 탭/바디 성공 수·점수·판정 규칙을 갖지 않는다. */
export class ExplicitSessionRendererAdapter {
  private port: ExplicitSnapshotRendererPort | null = null;

  constructor(private readonly source: ExplicitSessionRendererSource, private readonly sink: ExplicitConfirmedEffectSink) {}

  /** 재부착은 현재 상태만 복구하고 과거 effects를 읽거나 재생하지 않는다. */
  attach(port: ExplicitSnapshotRendererPort | null, visualTimeMs = this.source.snapshot.atMs): void {
    this.port = port;
    port?.render(this.source.snapshot, visualTimeMs);
  }

  sync(visualTimeMs = this.source.snapshot.atMs): void {
    this.port?.render(this.source.snapshot, visualTimeMs);
    const effects = this.source.drainEffects();
    if (effects.length) this.sink.applyConfirmedEffects(effects);
  }

  dispose(): void { this.port = null; }
}
