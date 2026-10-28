import type { ExplicitCompiledChart } from '../judgment/explicitCompiledChart';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';

export interface ExplicitDebugObservation {
  songTimeMs: number;
  visualTimeMs: number;
  inputTimeMs: number;
  frameDeltaMs?: number;
}

type SessionLogSource = Pick<ExplicitSessionResult, 'facts' | 'effects'>;

/** 명시 항목의 nullable timing과 시도별 되감기 기록. 판정·효과 소비에는 관여하지 않는다. */
export class ExplicitPlayDebugLog {
  private readonly lines: string[];
  private factCount = 0;
  private effectCount = 0;
  private branch = 0;
  private downloaded = false;

  constructor(chart: ExplicitCompiledChart, timing: { playbackRate: number; outputLatencyMs: number;
    inputOffsetMs: number; visualOffsetMs: number }) {
    this.lines = ['=== Explicit Play Debug Log ===', JSON.stringify(timing),
      'Earlier branches are attempt history; after rewind, only the final result describes the completed attempt.',
      ...chart.scoreItems.map(item => `item ${JSON.stringify(item)}`),
      ...chart.bodyUnits.map(unit => `bodyUnit ${JSON.stringify(unit)}`)];
  }

  record(source: SessionLogSource, observation: ExplicitDebugObservation): void {
    const { facts, effects } = source;
    this.lines.push(`observe branch=${this.branch} ${JSON.stringify(observation)}`);
    for (const fact of facts.slice(this.factCount)) this.lines.push(`fact branch=${this.branch} ${JSON.stringify(fact)}`);
    for (const effect of effects.slice(this.effectCount)) {
      this.lines.push(`effect branch=${this.branch} timing=${effect.timingDeltaMs ?? 'n/a'} ${JSON.stringify(effect)}`);
    }
    this.factCount = facts.length;
    this.effectCount = effects.length;
  }

  rewind(targetMs: number, restored: SessionLogSource): void {
    this.branch++;
    this.lines.push(`rewind branch=${this.branch} targetMs=${targetMs}; later observations in the previous branch are discarded`);
    this.factCount = restored.facts.length;
    this.effectCount = restored.effects.length;
  }

  finish(result: ExplicitSessionResult): void {
    this.lines.push(`final branch=${this.branch} ${JSON.stringify({ score: result.score, combo: result.combo, snapshot: result.snapshot })}`);
  }

  exportAsText(): string { return this.lines.join('\n'); }

  /** 실패해도 재시도 다운로드를 중복 예약하거나 플레이 종료를 방해하지 않는다. */
  download(): void {
    if (this.downloaded) return;
    this.downloaded = true;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([this.exportAsText()], { type: 'text/plain' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `debug-log-${Date.now()}.txt`;
      anchor.click();
    } catch (error) { console.warn('Explicit debug log download failed', error); }
    finally { if (url) URL.revokeObjectURL(url); }
  }
}
