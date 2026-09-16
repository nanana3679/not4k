import type { JudgmentInput } from "../judgment/NoteJudgmentCore";

export interface TimedJudgmentInput extends JudgmentInput {
  readonly inputAt: number;
}

/** Groups raw keyboard callbacks by their converted input timestamp. */
export class InputTimeline {
  private readonly pending: TimedJudgmentInput[] = [];

  enqueue(input: TimedJudgmentInput): void {
    this.pending.push(input);
    this.pending.sort((a, b) => a.inputAt - b.inputAt);
  }

  enqueueMany(inputs: readonly TimedJudgmentInput[]): void {
    for (const input of inputs) this.pending.push(input);
    this.pending.sort((a, b) => a.inputAt - b.inputAt);
  }

  /** Flushes each timestamp once, preserving same-key input order. */
  flushThrough(at: number, consume: (inputAt: number, inputs: readonly JudgmentInput[]) => void): number {
    let flushed = 0;
    while (this.pending.length && this.pending[0].inputAt <= at) {
      const inputAt = this.pending[0].inputAt;
      const batch: JudgmentInput[] = [];
      while (this.pending.length && this.pending[0].inputAt === inputAt) {
        const { inputAt: _raw, ...input } = this.pending.shift()!;
        batch.push(input);
      }
      consume(inputAt, batch);
      flushed++;
    }
    return flushed;
  }

  get size(): number { return this.pending.length; }
  get latestTime(): number { return this.pending.at(-1)?.inputAt ?? -Infinity; }
  clear(): void { this.pending.length = 0; }
}
