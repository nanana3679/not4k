export type CorrectionUpStatus = "pending" | "absorbed" | "available";

export interface CorrectionUp {
  readonly id: string;
  readonly key: string;
  readonly upAt: number;
  readonly status: CorrectionUpStatus;
}

export interface ConnectionCorrectionsOptions {
  /** Connection/head boundary timestamp. */
  readonly boundaryAt?: number;
  readonly headWindow: number;
  readonly correctionCapacity: number;
}

/**
 * Pure ledger for provisional connection keyups.
 *
 * It deliberately has no note/unit ownership and never matches terminal
 * releases. A successful head consumes the oldest pending up anonymously;
 * the physical key remains observable only as provenance on the up record.
 */
export class ConnectionCorrections {
  private readonly boundaryAt: number;
  private readonly headWindow: number;
  private readonly correctionCapacity: number;
  private readonly records: CorrectionUp[] = [];
  private absorbedCount = 0;
  private unclaimedHeadCredits = 0;
  private headSuccessCount = 0;
  private closed = false;

  constructor(options: ConnectionCorrectionsOptions);
  constructor(headWindow: number, correctionCapacity: number, boundaryAt?: number);
  constructor(
    optionsOrHeadWindow: ConnectionCorrectionsOptions | number,
    correctionCapacity?: number,
    boundaryAt = 0,
  ) {
    if (typeof optionsOrHeadWindow === "number") {
      this.headWindow = optionsOrHeadWindow;
      this.correctionCapacity = Math.max(0, Math.floor(correctionCapacity ?? 0));
      this.boundaryAt = boundaryAt;
    } else {
      this.headWindow = Math.max(0, optionsOrHeadWindow.headWindow);
      this.correctionCapacity = Math.max(0, Math.floor(optionsOrHeadWindow.correctionCapacity));
      this.boundaryAt = optionsOrHeadWindow.boundaryAt ?? 0;
    }
  }

  /** Register one physical up; each call is independent even for equal keys. */
  up(id: string, key: string, upAt: number): CorrectionUp {
    if (this.records.some(record => record.id === id)) {
      throw new Error(`중복 correction up id: ${id}`);
    }
    const inWindow = Math.abs(upAt - this.boundaryAt) <= this.headWindow;
    if (!this.closed && inWindow && this.unclaimedHeadCredits > 0) {
      this.unclaimedHeadCredits--;
      const record = { id, key, upAt, status: "absorbed" as const };
      this.records.push(record);
      this.absorbedCount++;
      return record;
    }
    const pendingSlots = this.correctionCapacity - this.absorbedCount -
      this.records.filter(record => record.status === "pending").length - this.unclaimedHeadCredits;
    const status: CorrectionUpStatus =
      !this.closed && inWindow && pendingSlots > 0 ? "pending" : "available";
    const record = { id, key, upAt, status };
    this.records.push(record);
    return record;
  }

  /** Add successful head capacity. The oldest pending up is absorbed first. */
  headSucceeded(count = 1): readonly CorrectionUp[] {
    const absorbed: CorrectionUp[] = [];
    for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
      this.headSuccessCount = Math.min(this.correctionCapacity, this.headSuccessCount + 1);
      const pending = this.records.find(record => record.status === "pending");
      if (!pending) {
        if (this.absorbedCount + this.unclaimedHeadCredits < this.correctionCapacity) this.unclaimedHeadCredits++;
        continue;
      }
      const next = { ...pending, status: "absorbed" as const };
      this.records[this.records.indexOf(pending)] = next;
      this.absorbedCount++;
      absorbed.push(next);
    }
    return absorbed;
  }

  /** Close the logical head window; pending candidates become available. */
  headWindowClose(): readonly CorrectionUp[] {
    this.closed = true;
    const changed: CorrectionUp[] = [];
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      if (record.status !== "pending") continue;
      const next = { ...record, status: "available" as const };
      this.records[i] = next;
      changed.push(next);
    }
    return changed;
  }

  get all(): readonly CorrectionUp[] {
    return this.records;
  }

  get pending(): readonly CorrectionUp[] {
    return this.records.filter(record => record.status === "pending");
  }

  get absorbed(): readonly CorrectionUp[] {
    return this.records.filter(record => record.status === "absorbed");
  }

  get available(): readonly CorrectionUp[] {
    return this.records.filter(record => record.status === "available");
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get successfulHeads(): number {
    return this.headSuccessCount;
  }
}

export default ConnectionCorrections;
