import type { Lane, JudgmentGrade } from "../../shared/constants";
import type { NoteEntity } from "../../shared/types";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";
import type { ConfirmedJudgmentEffects } from "./confirmedJudgmentEffects";
import type { NoteJudgmentSessionView } from "./NoteJudgmentSession";
import type { JudgmentBodyStateQuery } from "../renderer/GameNoteRenderer";

export interface SessionBodyState {
  readonly noteIndex: number;
  readonly unitIndex: number;
  readonly active: boolean;
  readonly failed: boolean;
  readonly complete: boolean;
  readonly registeredKeys: readonly string[];
}

/** The smallest renderer-facing surface used by the session adapter. */
export interface SessionRendererPort {
  showJudgment(grade: JudgmentGrade, deltaMs?: number): void;
  recordFlightJudgment(grade: JudgmentGrade): void;
  showBombEffect(lane: Lane): void;
  updateCombo(combo: number): void;
  updateAccuracy(rate: number): void;
  applyNoteDisplayEffect(noteIndex: number, effect: { body: "failed" | null; visibility: "processed" | "missed" | "doublePartial" | "unchanged" }): void;
  setJudgmentBodyStateQuery(query: JudgmentBodyStateQuery | null): void;
  recordDebug?(event: NoteJudgmentEvent, note: NoteEntity): void;
}

export interface SessionRendererAdapterOptions {
  readonly notes: readonly NoteEntity[];
  readonly connections: readonly { predecessorIndex: number; successorIndex: number }[];
  readonly bodyStates: () => readonly SessionBodyState[];
  readonly scoreAccuracy: () => number;
  readonly port: SessionRendererPort;
}

/** Applies session-confirmed effects without deciding judgment or score rules. */
export class SessionRendererAdapter {
  private readonly settledHeads = new Map<number, { success: number; settled: number; total: number; failed: boolean }>();
  private stateSnapshotAt: number | undefined;
  private readonly statesByNote = new Map<number, SessionBodyState[]>();

  constructor(private readonly options: SessionRendererAdapterOptions) {
    const successors = new Map(options.connections.map(connection => [connection.predecessorIndex, connection.successorIndex]));
    options.port.setJudgmentBodyStateQuery((noteIndex, at) => {
      // 렌더러가 보이는 노트마다 전체 차트의 상태를 복사하지 않도록
      // 같은 시각의 조회를 한 snapshot으로 공유한다.
      if (this.stateSnapshotAt !== at) {
        this.statesByNote.clear();
        for (const state of options.bodyStates()) {
          const group = this.statesByNote.get(state.noteIndex) ?? [];
          group.push(state);
          this.statesByNote.set(state.noteIndex, group);
        }
        this.stateSnapshotAt = at;
      }
      const units = this.statesByNote.get(noteIndex);
      return units?.length ? { units, successorIndex: successors.get(noteIndex) } : null;
    });
  }

  /** Starts a fresh render loop without carrying settled head state forward. */
  reset(): void {
    this.settledHeads.clear();
    this.stateSnapshotAt = undefined;
  }

  apply(view: NoteJudgmentSessionView): void {
    this.stateSnapshotAt = undefined;
    if (view.events.length !== view.effects.length) throw new Error("확정 판정과 효과의 개수가 다릅니다");
    for (let index = 0; index < view.events.length; index++) {
      this.applyEffect(view.events[index], view.effects[index]);
    }
    if (view.events.length) this.options.port.updateAccuracy(this.options.scoreAccuracy());
    this.options.port.updateCombo(view.combo);
  }

  private applyEffect(event: NoteJudgmentEvent, effect: ConfirmedJudgmentEffects): void {
    const { port, notes } = this.options;
    const note = notes[event.noteIndex];
    if (!note) return;
    if (effect.display.judgment) port.showJudgment(effect.display.judgment.grade, effect.display.judgment.deltaMs);
    if (effect.display.altitude) port.recordFlightJudgment(effect.display.altitude.grade);
    if (effect.display.bombLane !== null) port.showBombEffect(effect.display.bombLane);
    if (effect.scoreAction.type === "dependentZero") return;
    port.recordDebug?.(event, note);
    if (event.kind === "head") this.applyHeadDisplay(event, note);
  }

  private applyHeadDisplay(event: NoteJudgmentEvent, note: NoteEntity): void {
    const total = note.type === "double" ? 2 : 1;
    const state = this.settledHeads.get(event.noteIndex) ?? { success: 0, settled: 0, total, failed: false };
    state.total = total;
    state.settled++;
    if (event.grade === "miss") state.failed = true;
    else state.success++;
    this.settledHeads.set(event.noteIndex, state);
    if (total === 1) {
      this.options.port.applyNoteDisplayEffect(event.noteIndex, { body: null, visibility: event.grade === "miss" ? "missed" : "processed" });
    } else if (state.settled < total) {
      this.options.port.applyNoteDisplayEffect(event.noteIndex, { body: null, visibility: "doublePartial" });
    } else {
      this.options.port.applyNoteDisplayEffect(event.noteIndex, { body: null, visibility: state.failed ? "missed" : "processed" });
    }
  }

}
