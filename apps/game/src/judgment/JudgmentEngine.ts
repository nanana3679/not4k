/**
 * JudgmentEngine — 4키 리듬 게임 판정 엔진
 *
 * 플레이어 입력을 노트와 매칭하여 판정을 생성하고, 콤보를 추적한다.
 */

import type { NoteEntity, RangeNote } from "@not4k/shared";
import { JudgmentGrade, JUDGMENT_WINDOWS } from "@not4k/shared";
import { NoteType } from "@not4k/shared";
import type { Lane } from "@not4k/shared";

/**
 * 판정 결과
 */
export interface JudgmentResult {
  /** 노트 인덱스 (notes 배열 기준) */
  noteIndex: number;
  /** 판정 등급 */
  grade: JudgmentGrade;
  /** 더블 노트의 경우 서브 판정 (0 또는 1) */
  subIndex?: number;
  /** 타이밍 차이 (ms, 양수 = 늦음, 음수 = 빠름) */
  deltaMs: number;
}

/**
 * 판정 엔진 콜백
 */
export interface JudgmentCallbacks {
  /** 판정이 생성되었을 때 호출 */
  onJudgment: (result: JudgmentResult) => void;
  /** 콤보가 갱신되었을 때 호출 */
  onComboUpdate: (combo: number, maxCombo: number) => void;
}

/**
 * 노트 처리 상태
 */
enum NoteState {
  /** 아직 처리되지 않음 */
  UNPROCESSED = "unprocessed",
  /** 헤드 판정 완료 (포인트 노트는 여기서 종료) */
  HEAD_JUDGED = "headJudged",
  /** 바디 활성 중 (롱노트만) */
  BODY_ACTIVE = "bodyActive",
  /** 바디 실패 (홀드 끊김) */
  BODY_FAILED = "bodyFailed",
  /** 완전히 처리 완료 */
  COMPLETE = "complete",
}

/**
 * 더블 노트 처리 상태
 */
interface DoubleNoteState {
  /** 첫 번째 입력을 받았는지 */
  firstInputReceived: boolean;
  /** 첫 번째 입력에 사용된 키 */
  firstKeyCode?: string;
  /** 첫 번째 입력의 판정 */
  firstGrade?: JudgmentGrade;
  /** 첫 번째 입력의 타이밍 차이 */
  firstDeltaMs?: number;
}

/**
 * 레인별 홀드 상태
 */
interface LaneHoldState {
  /** 현재 키가 눌린 상태인지 */
  isHeld: boolean;
  /** 마지막으로 모든 키가 떼어진 시간 (grace period 체크용) */
  lastReleaseTimeMs: number | null;
  /** 현재 눌린 키들 */
  heldKeys: Set<string>;
}

/**
 * 판정 엔진
 */
export class JudgmentEngine {
  private readonly notes: readonly NoteEntity[];
  private readonly noteTimesMs: ReadonlyMap<number, number>;
  private readonly noteEndTimesMs: ReadonlyMap<number, number>;
  private readonly callbacks: JudgmentCallbacks;

  /** 노트별 처리 상태 */
  private readonly noteStates: Map<number, NoteState> = new Map();
  /** 더블 노트별 처리 상태 */
  private readonly doubleNoteStates: Map<number, DoubleNoteState> = new Map();
  /** 레인별 트릴 교대 추적 (마지막으로 누른 키) */
  private readonly trillAlternation: Map<Lane, string | null> = new Map();
  /** 레인별 홀드 상태 */
  private readonly laneHoldStates: Map<Lane, LaneHoldState> = new Map();

  private currentCombo = 0;
  private maxComboValue = 0;


  constructor(
    notes: readonly NoteEntity[],
    noteTimesMs: ReadonlyMap<number, number>,
    noteEndTimesMs: ReadonlyMap<number, number>,
    callbacks: JudgmentCallbacks,
  ) {
    this.notes = notes;
    this.noteTimesMs = noteTimesMs;
    this.noteEndTimesMs = noteEndTimesMs;
    this.callbacks = callbacks;

    // 모든 노트를 UNPROCESSED로 초기화
    for (let i = 0; i < notes.length; i++) {
      this.noteStates.set(i, NoteState.UNPROCESSED);
    }

    // 레인 홀드 상태 초기화
    for (const lane of [1, 2, 3, 4] as Lane[]) {
      this.laneHoldStates.set(lane, {
        isHeld: false,
        lastReleaseTimeMs: null,
        heldKeys: new Set(),
      });
      this.trillAlternation.set(lane, null);
    }
  }

  get combo(): number {
    return this.currentCombo;
  }

  get maxCombo(): number {
    return this.maxComboValue;
  }

  /**
   * 레인 키 프레스 처리
   */
  onLanePress(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 홀드 상태 업데이트
    holdState.heldKeys.add(keyCode);
    holdState.isHeld = true;

    // 해당 레인에서 가장 빠른 미처리 노트 찾기
    const targetNoteIndex = this.findEarliestUnprocessedNote(lane, timestampMs);

    if (targetNoteIndex === null) {
      // Bad 윈도우 내에 노트가 없으면 무시
      return;
    }

    const note = this.notes[targetNoteIndex];
    const noteTime = this.noteTimesMs.get(targetNoteIndex);
    if (noteTime === undefined) return;

    const deltaMs = timestampMs - noteTime;

    // 노트 타입에 따른 처리
    if (note.type === NoteType.SINGLE) {
      this.processSingleNoteInput(targetNoteIndex, deltaMs, keyCode);
    } else if (note.type === NoteType.DOUBLE) {
      this.processDoubleNoteInput(targetNoteIndex, deltaMs, keyCode);
    } else if (note.type === NoteType.TRILL) {
      this.processTrillNoteInput(targetNoteIndex, deltaMs, keyCode, lane);
    } else if (
      note.type === NoteType.SINGLE_LONG ||
      note.type === NoteType.DOUBLE_LONG ||
      note.type === NoteType.TRILL_LONG
    ) {
      this.processLongNoteHeadInput(targetNoteIndex, deltaMs, keyCode, lane);
    }
  }

  /**
   * 레인 키 릴리스 처리
   */
  onLaneRelease(lane: Lane, timestampMs: number, keyCode: string): void {
    const holdState = this.laneHoldStates.get(lane);
    if (!holdState) return;

    // 특정 키만 제거
    holdState.heldKeys.delete(keyCode);

    // 모든 키가 떼어졌을 때만 레인 릴리스 상태로 전환
    if (holdState.heldKeys.size === 0) {
      holdState.isHeld = false;
      holdState.lastReleaseTimeMs = timestampMs;
    }
  }

  /**
   * 프레임마다 호출 — 자동 Miss 체크, 바디 홀드 체크
   */
  update(songTimeMs: number): void {
    // 자동 Miss 체크 (노트 타임 + Bad 윈도우를 지나간 미처리 노트)
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (state !== NoteState.UNPROCESSED) continue;

      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;

      const note = this.notes[i];

      // 포인트 노트 자동 Miss
      if (
        note.type === NoteType.SINGLE ||
        note.type === NoteType.TRILL
      ) {
        if (songTimeMs > noteTime + JUDGMENT_WINDOWS.BAD) {
          this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      } else if (note.type === NoteType.DOUBLE) {
        // 더블 노트 자동 Miss
        if (songTimeMs > noteTime + JUDGMENT_WINDOWS.BAD) {
          const doubleState = this.doubleNoteStates.get(i);
          if (doubleState?.firstInputReceived) {
            // 첫 번째만 받은 경우 두 번째는 Miss
            this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
          } else {
            // 아무 입력도 없으면 둘 다 Miss
            this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
            this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
          }
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      } else if (
        note.type === NoteType.SINGLE_LONG ||
        note.type === NoteType.DOUBLE_LONG ||
        note.type === NoteType.TRILL_LONG
      ) {
        // 롱노트 헤드 자동 Miss
        if (songTimeMs > noteTime + JUDGMENT_WINDOWS.BAD) {
          const doubleState = this.doubleNoteStates.get(i);
          if (note.type === NoteType.DOUBLE_LONG) {
            if (doubleState?.firstInputReceived) {
              this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
            } else {
              this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
              this.emitJudgment(i, JudgmentGrade.MISS, 1, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
            }
          } else {
            this.emitJudgment(i, JudgmentGrade.MISS, 0, noteTime + JUDGMENT_WINDOWS.BAD - noteTime);
          }
          this.noteStates.set(i, NoteState.COMPLETE);
          this.breakCombo();
        }
      }
    }

    // 바디 홀드 체크
    this.checkLongNoteBodyHold(songTimeMs);

    // 롱노트 바디 끝 판정
    this.checkLongNoteBodyEnd(songTimeMs);
  }

  /**
   * 해당 레인에서 timestampMs의 Bad 윈도우 내에 있는 가장 빠른 미처리 노트 찾기
   */
  private findEarliestUnprocessedNote(lane: Lane, timestampMs: number): number | null {
    let earliestIndex: number | null = null;
    let earliestTime = Infinity;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane !== lane) continue;

      const state = this.noteStates.get(i);
      const noteTime = this.noteTimesMs.get(i);
      if (noteTime === undefined) continue;

      // 더블 노트의 경우 첫 입력만 받은 상태도 체크
      const isDoublePartial =
        (note.type === NoteType.DOUBLE || note.type === NoteType.DOUBLE_LONG) &&
        state === NoteState.UNPROCESSED &&
        this.doubleNoteStates.get(i)?.firstInputReceived === true;

      if (state !== NoteState.UNPROCESSED && !isDoublePartial) {
        continue;
      }

      const deltaMs = timestampMs - noteTime;
      if (Math.abs(deltaMs) <= JUDGMENT_WINDOWS.BAD) {
        if (noteTime < earliestTime) {
          earliestTime = noteTime;
          earliestIndex = i;
        }
      }
    }

    return earliestIndex;
  }

  /**
   * 싱글 노트 입력 처리
   */
  private processSingleNoteInput(noteIndex: number, deltaMs: number, _keyCode: string): void {
    const grade = this.calculateGrade(deltaMs);
    this.emitJudgment(noteIndex, grade, 0, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
  }

  /**
   * 더블 노트 입력 처리
   */
  private processDoubleNoteInput(noteIndex: number, deltaMs: number, keyCode: string): void {
    let doubleState = this.doubleNoteStates.get(noteIndex);

    if (!doubleState) {
      doubleState = { firstInputReceived: false };
      this.doubleNoteStates.set(noteIndex, doubleState);
    }

    if (!doubleState.firstInputReceived) {
      // 첫 번째 입력
      const grade = this.calculateGrade(deltaMs);
      doubleState.firstInputReceived = true;
      doubleState.firstKeyCode = keyCode;
      doubleState.firstGrade = grade;
      doubleState.firstDeltaMs = deltaMs;

      this.emitJudgment(noteIndex, grade, 0, deltaMs);

      if (this.isComboMaintaining(grade)) {
        this.incrementCombo();
      } else {
        this.breakCombo();
      }
    } else {
      // 두 번째 입력 — 다른 키여야 함
      if (keyCode === doubleState.firstKeyCode) {
        // 같은 키로 누르면 무시
        return;
      }

      const grade = this.calculateGrade(deltaMs);
      this.emitJudgment(noteIndex, grade, 1, deltaMs);
      this.noteStates.set(noteIndex, NoteState.COMPLETE);

      if (this.isComboMaintaining(grade)) {
        this.incrementCombo();
      } else {
        this.breakCombo();
      }
    }
  }

  /**
   * 트릴 노트 입력 처리
   */
  private processTrillNoteInput(
    noteIndex: number,
    deltaMs: number,
    keyCode: string,
    lane: Lane,
  ): void {
    const lastKeyCode = this.trillAlternation.get(lane);
    let grade = this.calculateGrade(deltaMs);

    // 교대 체크 (첫 트릴이 아닌 경우)
    if (lastKeyCode !== null && keyCode === lastKeyCode) {
      // 교대 실패 → Good◇ 강제
      grade = JudgmentGrade.GOOD_TRILL;
    }

    this.trillAlternation.set(lane, keyCode);

    this.emitJudgment(noteIndex, grade, 0, deltaMs);
    this.noteStates.set(noteIndex, NoteState.COMPLETE);

    if (this.isComboMaintaining(grade)) {
      this.incrementCombo();
    } else {
      this.breakCombo();
    }
  }

  /**
   * 롱노트 헤드 입력 처리
   */
  private processLongNoteHeadInput(
    noteIndex: number,
    deltaMs: number,
    keyCode: string,
    lane: Lane,
  ): void {
    const note = this.notes[noteIndex] as RangeNote;

    if (note.type === NoteType.SINGLE_LONG) {
      const grade = this.calculateGrade(deltaMs);
      this.emitJudgment(noteIndex, grade, 0, deltaMs);
      this.noteStates.set(noteIndex, NoteState.BODY_ACTIVE);

      if (this.isComboMaintaining(grade)) {
        this.incrementCombo();
      } else {
        this.breakCombo();
      }
    } else if (note.type === NoteType.DOUBLE_LONG) {
      this.processDoubleNoteInput(noteIndex, deltaMs, keyCode);

      // 두 입력이 모두 완료되었으면 BODY_ACTIVE로 전환
      const doubleState = this.doubleNoteStates.get(noteIndex);
      if (doubleState?.firstInputReceived && this.noteStates.get(noteIndex) === NoteState.COMPLETE) {
        this.noteStates.set(noteIndex, NoteState.BODY_ACTIVE);
      }
    } else if (note.type === NoteType.TRILL_LONG) {
      this.processTrillNoteInput(noteIndex, deltaMs, keyCode, lane);
      this.noteStates.set(noteIndex, NoteState.BODY_ACTIVE);
    }
  }

  /**
   * 롱노트 바디 홀드 체크
   *
   * 바디 구간 중 키를 떼도 즉시 실패하지 않는다.
   * 여러 키를 빠르게 입력할 때 의도치 않은 릴리스가 발생할 수 있으므로,
   * 판정은 바디 끝 시점(checkLongNoteBodyEnd)에서만 처리한다.
   */
  private checkLongNoteBodyHold(_songTimeMs: number): void {
    // No-op: 바디 중 릴리스에 대한 즉시 실패 판정을 하지 않음
  }

  /**
   * 롱노트 바디 끝 판정
   */
  private checkLongNoteBodyEnd(songTimeMs: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      const state = this.noteStates.get(i);
      if (state !== NoteState.BODY_ACTIVE && state !== NoteState.BODY_FAILED) {
        continue;
      }

      const note = this.notes[i] as RangeNote;
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime === undefined) continue;

      // 바디 끝 시점을 지났는지 확인
      if (songTimeMs < noteEndTime) continue;

      // 바디 실패 상태면 이미 Miss 처리됨
      if (state === NoteState.BODY_FAILED) {
        this.noteStates.set(i, NoteState.COMPLETE);
        continue;
      }

      // 다음 노트가 바로 이어지는지 확인 (sustain vs release)
      const isSustain = this.hasImmediateFollowingNote(i, note.lane, noteEndTime);

      const holdState = this.laneHoldStates.get(note.lane);
      if (!holdState) {
        this.noteStates.set(i, NoteState.COMPLETE);
        continue;
      }

      if (isSustain) {
        // Sustain 판정: 끝 시점에 눌려있으면 Perfect, 아니면 Miss
        const grade = holdState.isHeld ? JudgmentGrade.PERFECT : JudgmentGrade.MISS;
        this.emitJudgment(i, grade, undefined, 0);

        if (this.isComboMaintaining(grade)) {
          this.incrementCombo();
        } else {
          this.breakCombo();
        }
      } else {
        // Release 판정: 타이밍 기반, Good 이상이면 Perfect로 업그레이드
        const deltaMs = songTimeMs - noteEndTime;
        let grade = this.calculateGrade(deltaMs);

        if (
          grade === JudgmentGrade.GOOD ||
          grade === JudgmentGrade.GREAT ||
          grade === JudgmentGrade.PERFECT
        ) {
          grade = JudgmentGrade.PERFECT;
        }

        this.emitJudgment(i, grade, undefined, deltaMs);

        if (this.isComboMaintaining(grade)) {
          this.incrementCombo();
        } else {
          this.breakCombo();
        }
      }

      this.noteStates.set(i, NoteState.COMPLETE);
    }
  }

  /**
   * 해당 노트 바로 다음에 같은 레인의 노트가 이어지는지 확인
   */
  private hasImmediateFollowingNote(noteIndex: number, lane: Lane, endTimeMs: number): boolean {
    // 바로 다음 노트가 endTimeMs와 거의 동시에 시작하면 sustain
    const threshold = 10; // 10ms 이내면 immediate로 간주

    for (let i = noteIndex + 1; i < this.notes.length; i++) {
      const nextNote = this.notes[i];
      if (nextNote.lane !== lane) continue;

      const nextNoteTime = this.noteTimesMs.get(i);
      if (nextNoteTime === undefined) continue;

      if (Math.abs(nextNoteTime - endTimeMs) <= threshold) {
        return true;
      }

      // 다음 노트가 너무 멀면 중단
      if (nextNoteTime > endTimeMs + threshold) {
        break;
      }
    }

    return false;
  }

  /**
   * 타이밍 차이를 기반으로 판정 등급 계산
   */
  private calculateGrade(deltaMs: number): JudgmentGrade {
    const absDelta = Math.abs(deltaMs);

    if (absDelta <= JUDGMENT_WINDOWS.PERFECT) {
      return JudgmentGrade.PERFECT;
    } else if (absDelta <= JUDGMENT_WINDOWS.GREAT) {
      return JudgmentGrade.GREAT;
    } else if (absDelta <= JUDGMENT_WINDOWS.GOOD) {
      return JudgmentGrade.GOOD;
    } else if (absDelta <= JUDGMENT_WINDOWS.BAD) {
      return JudgmentGrade.BAD;
    } else {
      return JudgmentGrade.MISS;
    }
  }

  /**
   * 콤보 유지 여부 확인
   */
  private isComboMaintaining(grade: JudgmentGrade): boolean {
    return (
      grade === JudgmentGrade.PERFECT ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.GOOD ||
      grade === JudgmentGrade.GOOD_TRILL
    );
  }

  /**
   * 콤보 증가
   */
  private incrementCombo(): void {
    this.currentCombo++;
    if (this.currentCombo > this.maxComboValue) {
      this.maxComboValue = this.currentCombo;
    }
    this.callbacks.onComboUpdate(this.currentCombo, this.maxComboValue);
  }

  /**
   * 콤보 깨짐
   */
  private breakCombo(): void {
    this.currentCombo = 0;
    this.callbacks.onComboUpdate(this.currentCombo, this.maxComboValue);
  }

  /**
   * 판정 결과 발행
   */
  private emitJudgment(
    noteIndex: number,
    grade: JudgmentGrade,
    subIndex: number | undefined,
    deltaMs: number,
  ): void {
    this.callbacks.onJudgment({
      noteIndex,
      grade,
      subIndex,
      deltaMs,
    });
  }
}
