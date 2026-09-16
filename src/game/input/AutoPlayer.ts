import type { NoteEntity } from "../../shared/types/chart";
import type { Lane } from "../../shared/constants";
import type { CompiledJudgmentChart } from "../judgment/compiledJudgmentChart";

/** AutoPlayer가 방출하는 합성 입력 한 건. 판정 엔진의 onLanePress/onLaneRelease에 그대로 먹인다. */
export interface AutoInput {
  lane: Lane;
  timeMs: number;
  key: string;
  type?: "press" | "release";
}

/** AutoEvent의 ms 범위 (차트 이벤트 type "auto"에서 파생). */
export interface AutoSectionMs {
  startMs: number;
  endMs: number;
}

/**
 * AutoEvent의 노트를 합성 입력(press/release 이벤트)으로 변환하는 순수 상태머신.
 * 키보드 대신 차트에서 입력을 만든다는 점만 빼면 InputSystem과 같은 자리(판정 엔진 입력 seam)에 선다.
 *
 * 새 세션에서는 compiled chart를 주입하고 eventsThrough(t)의 원래 timestamp를
 * InputTimeline에 전달한다. pressesAt/releasesAt은 이전 엔진 호환 테스트용 API다.
 *
 * press는 AutoEvent 안에서만 만들고, 실제로 자동으로 누른 키만 release한다.
 * 구간 안에서 시작한 홀드는 구간이 끝나도 endBeat에서 놓아야 한다.
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
  /** headed range에서 head가 채우지 못한 unit의 합성 key */
  private readonly headedRangeExtraKeys = new Map<number, string[]>();
  private readonly connectedSuccessors = new Set<number>();
  private readonly connectionExtraKeys = new Map<number, string[]>();
  private readonly compiled?: CompiledJudgmentChart;
  private readonly compiledEvents: AutoInput[] = [];
  private compiledEventCursor = 0;
  private readonly compiledHeldKeys = new Set<string>();

  constructor(
    notes: readonly NoteEntity[],
    noteTimesMs: ReadonlyMap<number, number>,
    noteEndTimesMs: ReadonlyMap<number, number>,
    autoSections: readonly AutoSectionMs[],
    compiled?: CompiledJudgmentChart,
  ) {
    this.notes = notes;
    this.noteTimesMs = noteTimesMs;
    this.noteEndTimesMs = noteEndTimesMs;
    this.autoSections = autoSections;
    this.compiled = compiled;
    for (const connection of compiled?.connections ?? []) {
      this.connectedSuccessors.add(connection.successorIndex);
      if (connection.targetUnits > connection.sourceUnits) {
        const note = notes[connection.successorIndex];
        this.connectionExtraKeys.set(connection.successorIndex, Array.from(
          { length: connection.targetUnits - connection.sourceUnits },
          (_, ordinal) => `auto_${note.lane}_${connection.successorIndex}_extra_${ordinal}`,
        ));
      }
    }

    for (let r = 0; r < notes.length; r++) {
      const rNote = notes[r];
      if (!("endBeat" in rNote)) continue;
      const rTime = noteTimesMs.get(r);
      if (rTime === undefined) continue;
      const compiledHead = compiled?.notes[r]?.headIndex;
      if (compiledHead !== undefined) {
        const head = compiledHead;
        this.rangeToHead.set(r, head);
        this.headToRange.set(head, r);
        const required = rNote.type === "doubleLong" ? 2 : 1;
        const headCount = notes[head].type === "double" ? 2 : 1;
        if (required > headCount) {
          this.headedRangeExtraKeys.set(r, Array.from({ length: required - headCount }, (_, ordinal) => `auto_${rNote.lane}_${r}_extra_${ordinal}`));
        }
        continue;
      }
      for (let h = 0; h < notes.length; h++) {
        if (h === r) continue;
        const hNote = notes[h];
        if ("endBeat" in hNote) continue;
        if (hNote.lane !== rNote.lane) continue;
        const hTime = noteTimesMs.get(h);
        if (hTime === undefined) continue;
        if (Math.abs(hTime - rTime) > 1) continue;
        this.rangeToHead.set(r, h);
        this.headToRange.set(h, r);
        break;
      }
    }
    if (compiled) this.buildCompiledEvents(compiled);
  }

  /**
   * compiled chart의 연결 graph를 키 pool로 펼친다. 연결된 unit은 같은 key를
   * 이어 쓰고, 감소에서는 초과 key만 경계에서 놓는다. holdOnly source는
   * waiver이므로 감소 경계에서도 보유 key를 유지한다.
   */
  private buildCompiledEvents(compiled: CompiledJudgmentChart): void {
    const keysByNote = new Map<number, string[]>();
    const add = (timeMs: number, noteIndex: number, key: string, type: "press" | "release") => {
      const note = this.notes[noteIndex];
      this.compiledEvents.push({ lane: note.lane as Lane, timeMs, key, type });
    };
    const rangeIndices = compiled.notes
      .filter((note) => note.units.length > 0 && !compiled.excludedNoteIndices?.has(note.noteIndex))
      .map((note) => note.noteIndex);
    const compiledNoteByIndex = new Map(compiled.notes.map((note) => [note.noteIndex, note]));
    const connectionBySuccessor = new Map(compiled.connections.map((c) => [c.successorIndex, c]));

    // 먼저 전체 graph의 key pool을 계산한다. 이벤트를 동시에 만들면 앞선 range가
    // 아직 뒤 successor의 key를 모르는 상태에서 surplus를 잘못 release할 수 있다.
    let assigned = 0;
    while (assigned < rangeIndices.length) {
      let progressed = false;
      for (const index of rangeIndices) {
        if (keysByNote.has(index)) continue;
        const note = this.notes[index];
        const compiledNote = compiledNoteByIndex.get(index);
        if (!compiledNote) continue;
        const predecessor = connectionBySuccessor.get(index);
        if (predecessor && !keysByNote.has(predecessor.predecessorIndex)) continue;
        if (!predecessor) {
          const head = compiledNote.headIndex;
          const headNote = head === undefined ? undefined : this.notes[head];
          const headCount = headNote && !("endBeat" in headNote) && headNote.type === "double" ? 2 : head !== undefined ? 1 : 0;
          const keys = head === undefined ? [] : [`auto_${this.notes[head].lane}_${head}_a`, ...(headCount === 2 ? [`auto_${this.notes[head].lane}_${head}_b`] : [])];
          for (let ordinal = keys.length; ordinal < compiledNote.units.length; ordinal++) keys.push(`auto_${note.lane}_${index}_unit_${ordinal}`);
          keysByNote.set(index, keys);
        } else {
          const previousKeys = keysByNote.get(predecessor.predecessorIndex)!;
          const previousNote = this.notes[predecessor.predecessorIndex];
          const sourceHoldOnly = "endBeat" in previousNote && previousNote.holdOnly === true;
          const head = compiledNote.headIndex;
          const headNote = head === undefined ? undefined : this.notes[head];
          const headCount = headNote && !("endBeat" in headNote) && headNote.type === "double" ? 2 : head !== undefined ? 1 : 0;
          const keys = head === undefined
            ? (sourceHoldOnly ? [...previousKeys] : previousKeys.slice(0, Math.min(compiledNote.units.length, previousKeys.length)))
            : [`auto_${this.notes[head].lane}_${head}_a`, ...(headCount === 2 ? [`auto_${this.notes[head].lane}_${head}_b`] : [])];
          if (head !== undefined && keys.length < compiledNote.units.length) {
            keys.push(...previousKeys.slice(0, compiledNote.units.length - keys.length));
          }
          if (!sourceHoldOnly) for (let ordinal = keys.length; ordinal < compiledNote.units.length; ordinal++) keys.push(`auto_${note.lane}_${index}_unit_${ordinal}`);
          keysByNote.set(index, keys);
        }
        assigned++;
        progressed = true;
      }
      if (!progressed) break;
    }

    for (const index of rangeIndices) {
      const note = this.notes[index];
      const compiledNote = compiledNoteByIndex.get(index);
      if (!compiledNote) continue;
      const count = compiledNote.units.length;
      const predecessor = connectionBySuccessor.get(index);
      let keys: string[];
      let inheritedKeys: string[] = [];
      if (predecessor) {
        const previousKeys = keysByNote.get(predecessor.predecessorIndex) ?? [];
        const predecessorNote = this.notes[predecessor.predecessorIndex];
        const sourceHoldOnly = "endBeat" in predecessorNote && predecessorNote.holdOnly === true;
        const head = compiledNote.headIndex;
        const headNote = head === undefined ? undefined : this.notes[head];
        const headCount = headNote && !("endBeat" in headNote) && headNote.type === "double" ? 2 : head !== undefined ? 1 : 0;
        const retained = head === undefined
          ? (sourceHoldOnly ? [...previousKeys] : previousKeys.slice(0, Math.min(count, previousKeys.length)))
          : [`auto_${this.notes[head].lane}_${head}_a`, ...(headCount === 2 ? [`auto_${this.notes[head].lane}_${head}_b`] : [])];
        inheritedKeys = retained;
        keys = [...retained];
        if (head !== undefined && keys.length < count) keys.push(...previousKeys.slice(0, count - keys.length));
        // holdOnly 경계 waiver는 다음 증가에서도 새 physical key를 요구하지 않는다.
        if (!sourceHoldOnly) {
          for (let ordinal = keys.length; ordinal < count; ordinal++) {
            keys.push(`auto_${note.lane}_${index}_unit_${ordinal}`);
          }
        }
      } else {
        const head = compiledNote.headIndex;
        const headNote = head === undefined ? undefined : this.notes[head];
        const headCount = headNote && !("endBeat" in headNote) && headNote.type === "double" ? 2 : head !== undefined ? 1 : 0;
        keys = [];
        if (head !== undefined) {
          const headLane = this.notes[head].lane;
          keys.push(`auto_${headLane}_${head}_a`);
          if (headCount === 2) keys.push(`auto_${headLane}_${head}_b`);
        }
        for (let ordinal = keys.length; ordinal < count; ordinal++) {
          keys.push(`auto_${note.lane}_${index}_unit_${ordinal}`);
        }
      }
      keysByNote.set(index, keys);

      const startMs = compiledNote.startMs;
      const head = compiledNote.headIndex;
      if (head === undefined) {
        for (const key of keys.filter((key) => !inheritedKeys.includes(key))) add(startMs, index, key, "press");
      } else {
        // head press is emitted once below with the point's own timestamp.
        const headTime = this.noteTimesMs.get(head);
        if (headTime !== undefined && !this.compiledEvents.some((event) => event.timeMs === headTime && event.key === keys[0] && event.type === "press")) {
          for (const key of keys.slice(0, this.notes[head].type === "double" ? 2 : 1)) add(headTime, head, key, "press");
        }
        for (const key of keys.slice(this.notes[head].type === "double" ? 2 : 1)) add(startMs, index, key, "press");
      }

      const successor = compiledNote.successorIndex === undefined ? undefined : compiledNoteByIndex.get(compiledNote.successorIndex);
      const endMs = compiledNote.endMs;
      if (endMs === undefined) continue;
      if (!successor) {
        for (const key of keys) add(endMs, index, key, "release");
      } else {
        const successorKeys = keysByNote.get(successor.noteIndex) ?? [];
        const sourceHoldOnly = "endBeat" in note && note.holdOnly === true;
        if (!sourceHoldOnly) {
          for (const key of keys) if (!successorKeys.includes(key)) add(endMs, index, key, "release");
        }
      }
    }

    // 독립 Point는 짧은 tap으로 합성한다. range head는 이미 range graph에서 처리했다.
    for (let index = 0; index < this.notes.length; index++) {
      const note = this.notes[index];
      if (compiled.excludedNoteIndices?.has(index) || "endBeat" in note || compiled.notes.some((compiledNote) => compiledNote.headIndex === index)) continue;
      const timeMs = this.noteTimesMs.get(index);
      if (timeMs === undefined) continue;
      const keys = [`auto_${note.lane}_${index}_a`, ...(note.type === "double" ? [`auto_${note.lane}_${index}_b`] : [])];
      for (const key of keys) add(timeMs, index, key, "press");
      for (const key of keys) add(timeMs + 50, index, key, "release");
    }
    // 같은 시각의 zero-H와 경계 입력은 down을 먼저 전달해 causal 순서를 보존한다.
    this.compiledEvents.sort((a, b) => a.timeMs - b.timeMs || (a.type === "press" ? -1 : 1));
  }

  /** compiled topology를 시간순으로 소비하는 입력 스트림. 이미 반환한 이벤트는 반복하지 않는다. */
  eventsThrough(songTimeMs: number): AutoInput[] {
    if (!this.compiled) {
      return [...this.pressesAt(songTimeMs).map((event) => ({ ...event, type: "press" as const })),
        ...this.releasesAt(songTimeMs).map((event) => ({ ...event, type: "release" as const }))]
        .sort((a, b) => a.timeMs - b.timeMs);
    }
    const out: AutoInput[] = [];
    while (this.compiledEventCursor < this.compiledEvents.length && this.compiledEvents[this.compiledEventCursor].timeMs <= songTimeMs) {
      const event = this.compiledEvents[this.compiledEventCursor++];
      if (event.type === "press") {
        if (!this.isAutoAt(event.timeMs)) continue;
        this.compiledHeldKeys.add(event.key);
      } else if (!this.compiledHeldKeys.delete(event.key)) {
        continue;
      }
      out.push(event);
    }
    return out;
  }

  private isAutoAt(songTimeMs: number): boolean {
    for (const s of this.autoSections) {
      if (songTimeMs >= s.startMs && songTimeMs <= s.endMs) return true;
    }
    return false;
  }

  /** 이번 틱에 만들 press 이벤트. AutoEvent 밖이면 빈 배열. */
  pressesAt(songTimeMs: number): AutoInput[] {
    const out: AutoInput[] = [];
    if (!this.isAutoAt(songTimeMs)) return out;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      const noteTime = this.noteTimesMs.get(i)!;

      // 이미 처리됐거나 아직 시점이 아니거나 너무 지난 노트는 스킵
      if (this.pressed.has(i) || songTimeMs < noteTime || songTimeMs >= noteTime + 200) continue;
      // exact Beat connection은 predecessor가 held를 상속하므로 successor에 새 down을 만들지 않는다.
      if (this.connectedSuccessors.has(i)) {
        this.pressed.add(i);
        for (const key of this.connectionExtraKeys.get(i) ?? []) out.push({ lane: note.lane as Lane, timeMs: noteTime, key });
        continue;
      }
      // 헤드가 있는 롱노트 바디는 헤드 press가 hold를 제공하므로 별도 press 안 함
      if (this.rangeToHead.has(i)) {
        this.pressed.add(i);
        const extraKeys = this.headedRangeExtraKeys.get(i) ?? [];
        for (const key of extraKeys) out.push({ lane: note.lane as Lane, timeMs: noteTime, key });
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

  /** 이번 틱에 만들 release 이벤트. AutoEvent과 무관하게 방출한다. */
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
      if (this.connectedSuccessors.has(i)) continue;
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
    for (const [rangeIndex, keys] of this.headedRangeExtraKeys) {
      if (!this.pressed.has(rangeIndex) || this.released.has(rangeIndex)) continue;
      const noteEndTime = this.noteEndTimesMs.get(rangeIndex);
      if (noteEndTime !== undefined && songTimeMs >= noteEndTime) {
        this.released.add(rangeIndex);
        const lane = this.notes[rangeIndex].lane as Lane;
        for (const key of keys) out.push({ lane, timeMs: noteEndTime, key });
      }
    }
    for (const [rangeIndex, keys] of this.connectionExtraKeys) {
      if (!this.pressed.has(rangeIndex) || this.released.has(rangeIndex)) continue;
      const noteEndTime = this.noteEndTimesMs.get(rangeIndex);
      if (noteEndTime !== undefined && songTimeMs >= noteEndTime) {
        this.released.add(rangeIndex);
        const lane = this.notes[rangeIndex].lane as Lane;
        for (const key of keys) out.push({ lane, timeMs: noteEndTime, key });
      }
    }
    return out;
  }
}
