import type { NoteJudgmentEvent } from "./NoteJudgmentCore";

/**
 * Applies already-confirmed judgment batches to the current combo.
 * Combo is intentionally a current state only; maximum combo is not tracked.
 */
export class ConfirmationCombo {
  private current = 0;

  get value(): number { return this.current; }

  reset(): void { this.current = 0; }

  /**
   * A maintenance failure or scored Miss dominates the whole confirmation
   * batch. `dependentZero` is bookkeeping for score only and has no combo
   * effect. Returns the resulting current combo.
   */
  applyBatch(events: readonly NoteJudgmentEvent[]): number {
    const hasMiss = events.some(event =>
      event.kind === "maintenanceMiss" ||
      (event.kind !== "dependentZero" && event.grade === "miss"),
    );
    if (hasMiss) {
      this.current = 0;
      return this.current;
    }
    this.current += events.filter(event =>
      (event.kind === "head" || event.kind === "release" || event.kind === "holdOnly") && event.grade !== "miss",
    ).length;
    return this.current;
  }
}
