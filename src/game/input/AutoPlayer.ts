import type { NoteEntity } from "../../shared/types/chart";
import type { Lane } from "../../shared/constants";

/** AutoPlayer가 방출하는 합성 입력 한 건. 판정 엔진의 onLanePress/onLaneRelease에 그대로 먹인다. */
export interface AutoInput {
  lane: Lane;
  timeMs: number;
  key: string;
}

/** Auto 구간의 ms 범위 (차트 이벤트 type "auto"에서 파생). */
export interface AutoSectionMs {
  startMs: number;
  endMs: number;
}

/**
 * Auto 구간의 노트를 합성 입력(press/release 이벤트)으로 변환하는 순수 상태머신.
 * 키보드 대신 차트에서 입력을 만든다는 점만 빼면 InputSystem과 같은 자리(판정 엔진 입력 seam)에 선다.
 *
 * 호출 계약: 매 틱 `pressesAt(t) 먹임 → engine.update(t) → releasesAt(t) 먹임` 순서를 지킬 것.
 * (길이 0 롱노트는 press와 release가 같은 틱에 일어나는데, update가 바디를 auto-활성화하기 전에
 *  release가 들어가면 tryEndpointJudgmentOnRelease가 놓친다.)
 *
 * 게이팅 비대칭: press는 Auto 구간 안에서만 만들지만, release는 구간과 무관하게 방출한다 —
 * 구간 안에서 시작한 홀드는 구간이 끝나도 endBeat에서 놓아야 하기 때문.
 */
export class AutoPlayer {
  private readonly notes: readonly NoteEntity[];
  private readonly noteTimesMs: ReadonlyMap<number, number>;
  private readonly noteEndTimesMs: ReadonlyMap<number, number>;
  private readonly autoSections: readonly AutoSectionMs[];

  /** press를 이미 만든(또는 헤드가 대신 제공한) 노트 */
  private readonly pressed = new Set<number>();
  /** endBeat release를 이미 만든 롱노트 */
  private readonly released = new Set<number>();
  /** 포인트 노트의 예약된 release: noteIndex → 정보 */
  private readonly pendingRelease = new Map<
    number,
    { releaseMs: number; key1: string; key2: string | null }
  >();

  // 헤드-롱노트 쌍 연결: 같은 lane + 같은 시각(±1ms)에 포인트 노트(헤드)와 range 노트(롱)가 함께 있으면
  // 헤드 press가 롱 hold를 제공하고, 헤드 release 시점을 롱 endBeat로 연장한다.
  // (그러지 않으면 doubleLong 바디 auto-활성화가 헤드 키 대신 바디 키를 따로 추적하다가
  //  헤드 release 시 grace period 초과로 BODY_FAILED 처리됨)
  private readonly rangeToHead = new Map<number, number>();
  private readonly headToRange = new Map<number, number>();

  constructor(
    notes: readonly NoteEntity[],
    noteTimesMs: ReadonlyMap<number, number>,
    noteEndTimesMs: ReadonlyMap<number, number>,
    autoSections: readonly AutoSectionMs[],
  ) {
    this.notes = notes;
    this.noteTimesMs = noteTimesMs;
    this.noteEndTimesMs = noteEndTimesMs;
    this.autoSections = autoSections;

    for (let r = 0; r < notes.length; r++) {
      const rNote = notes[r];
      if (!("endBeat" in rNote)) continue;
      const rTime = noteTimesMs.get(r)!;
      for (let h = 0; h < notes.length; h++) {
        if (h === r) continue;
        const hNote = notes[h];
        if ("endBeat" in hNote) continue;
        if (hNote.lane !== rNote.lane) continue;
        const hTime = noteTimesMs.get(h)!;
        if (Math.abs(hTime - rTime) > 1) continue;
        this.rangeToHead.set(r, h);
        this.headToRange.set(h, r);
        break;
      }
    }
  }

  private isAutoAt(songTimeMs: number): boolean {
    for (const s of this.autoSections) {
      if (songTimeMs >= s.startMs && songTimeMs <= s.endMs) return true;
    }
    return false;
  }

  /** 이번 틱에 만들 press 이벤트. Auto 구간 밖이면 빈 배열. */
  pressesAt(songTimeMs: number): AutoInput[] {
    const out: AutoInput[] = [];
    if (!this.isAutoAt(songTimeMs)) return out;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      const noteTime = this.noteTimesMs.get(i)!;

      // 이미 처리됐거나 아직 시점이 아니거나 너무 지난 노트는 스킵
      if (this.pressed.has(i) || songTimeMs < noteTime || songTimeMs >= noteTime + 200) continue;
      // 헤드가 있는 롱노트 바디는 헤드 press가 hold를 제공하므로 별도 press 안 함
      if (this.rangeToHead.has(i)) {
        this.pressed.add(i);
        continue;
      }

      this.pressed.add(i);
      const lane = note.lane as Lane;
      const isDouble = note.type === "double" || note.type === "doubleLong";

      // 노트 인덱스별 유일한 가상 키코드 — 같은 레인의 다른 노트와 키 충돌 방지
      const key1 = `auto_${lane}_${i}_a`;
      const key2 = isDouble ? `auto_${lane}_${i}_b` : null;
      out.push({ lane, timeMs: noteTime, key: key1 });
      if (key2) out.push({ lane, timeMs: noteTime, key: key2 });

      if (!("endBeat" in note)) {
        // 포인트 노트: release 시점 계산
        // - 연결된 롱노트가 있으면 롱노트 endBeat까지 연장 (hold 유지)
        // - 아니면 기본 50ms 후
        const linkedRangeIdx = this.headToRange.get(i);
        const releaseMs =
          linkedRangeIdx !== undefined
            ? this.noteEndTimesMs.get(linkedRangeIdx)!
            : noteTime + 50;
        this.pendingRelease.set(i, { releaseMs, key1, key2 });
      }
    }
    return out;
  }

  /** 이번 틱에 만들 release 이벤트. Auto 구간과 무관하게 방출한다. */
  releasesAt(songTimeMs: number): AutoInput[] {
    const out: AutoInput[] = [];

    // 포인트 노트의 예약된 release
    for (const [idx, info] of this.pendingRelease) {
      if (songTimeMs >= info.releaseMs) {
        this.pendingRelease.delete(idx);
        const lane = this.notes[idx].lane as Lane;
        out.push({ lane, timeMs: info.releaseMs, key: info.key1 });
        if (info.key2) out.push({ lane, timeMs: info.releaseMs, key: info.key2 });
      }
    }

    // 롱노트 release at endBeat (헤드가 있으면 헤드의 pending release가 처리)
    for (let i = 0; i < this.notes.length; i++) {
      if (!this.pressed.has(i) || this.released.has(i)) continue;
      const note = this.notes[i];
      if (!("endBeat" in note)) continue;
      if (this.rangeToHead.has(i)) continue;
      const noteEndTime = this.noteEndTimesMs.get(i);
      if (noteEndTime !== undefined && songTimeMs >= noteEndTime) {
        this.released.add(i);
        const lane = note.lane as Lane;
        out.push({ lane, timeMs: noteEndTime, key: `auto_${lane}_${i}_a` });
        if (note.type === "doubleLong") {
          out.push({ lane, timeMs: noteEndTime, key: `auto_${lane}_${i}_b` });
        }
      }
    }
    return out;
  }
}
