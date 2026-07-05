import { describe, it, expect } from "vitest";
import { AutoPlayer, type AutoSectionMs } from "./AutoPlayer";
import { JudgmentEngine } from "../judgment/JudgmentEngine";
import type { JudgmentResult } from "../judgment/JudgmentEngine";
import { JUDGMENT_WINDOWS } from "../../shared/constants";
import type { NoteEntity } from "../../shared/types/chart";
import type { Lane } from "../../shared/constants";

const ALWAYS_AUTO: AutoSectionMs[] = [{ startMs: 0, endMs: Number.POSITIVE_INFINITY }];

/** 호출 계약 그대로: 매 틱 presses 먹임 → engine.update → releases 먹임 (16ms 스텝) */
function runAutoPlay(
  notes: NoteEntity[],
  noteTimes: Map<number, number>,
  noteEndTimes: Map<number, number>,
  songEndMs: number,
  autoSections: AutoSectionMs[] = ALWAYS_AUTO,
) {
  const judgments: JudgmentResult[] = [];
  const engine = new JudgmentEngine(
    notes,
    noteTimes,
    noteEndTimes,
    { onJudgment: (r) => judgments.push(r), onComboUpdate: () => {} },
    JUDGMENT_WINDOWS,
    new Map([[1 as Lane, []], [2 as Lane, []], [3 as Lane, []], [4 as Lane, []]]),
  );
  const player = new AutoPlayer(notes, noteTimes, noteEndTimes, autoSections);

  const presses: { timeMs: number; key: string }[] = [];
  const releases: { timeMs: number; key: string }[] = [];
  for (let songTimeMs = 0; songTimeMs <= songEndMs; songTimeMs += 16) {
    for (const p of player.pressesAt(songTimeMs)) {
      presses.push({ timeMs: p.timeMs, key: p.key });
      engine.onLanePress(p.lane, p.timeMs, p.key);
    }
    engine.update(songTimeMs);
    for (const r of player.releasesAt(songTimeMs)) {
      releases.push({ timeMs: r.timeMs, key: r.key });
      engine.onLaneRelease(r.lane, r.timeMs, r.key);
    }
  }

  return { judgments, engine, presses, releases };
}

describe("AutoPlayer 합성 입력 시뮬레이션", () => {
  it("헤더 없는 long 노트 단독이면 Perfect 1개", () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 8, lane: 1, type: "long" } as unknown as NoteEntity];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 2000]]), 3000);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe("perfect");
  });

  it("길이 0 long 단독(headless)이면 같은 틱 press+release로 Perfect", () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 4, lane: 1, type: "long" } as unknown as NoteEntity];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 1000]]), 3000);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe("perfect");
  });

  it("길이 0 long + single 헤드 같은 beat면 바디 Perfect", () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: "single" } as unknown as NoteEntity,
      { beat: 4, endBeat: 4, lane: 1, type: "long" } as unknown as NoteEntity,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 1000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    const bodyResult = judgments.find((j) => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe("perfect");
  });

  it("doubleLong 단독이면 키별 2판정 (Perfect 2개)", () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 8, lane: 1, type: "doubleLong" } as unknown as NoteEntity];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 2000]]), 3000);
    expect(judgments).toHaveLength(2);
    expect(judgments.every((j) => j.grade === "perfect")).toBe(true);
  });

  it("double 헤드 + doubleLong 바디 같은 beat면 바디 Perfect (회귀)", () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: "double" } as unknown as NoteEntity,
      { beat: 4, endBeat: 8, lane: 1, type: "doubleLong" } as unknown as NoteEntity,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    const bodyResult = judgments.find((j) => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe("perfect");
  });

  it("single 헤드 + long 바디 같은 beat면 바디 Perfect", () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: "single" } as unknown as NoteEntity,
      { beat: 4, endBeat: 8, lane: 1, type: "long" } as unknown as NoteEntity,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    const bodyResult = judgments.find((j) => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe("perfect");
  });

  it("single + 헤드없는 long 같은 레인 연속이면 long도 Perfect", () => {
    const notes: NoteEntity[] = [
      { beat: 2, lane: 1, type: "single" } as unknown as NoteEntity,
      { beat: 4, endBeat: 8, lane: 1, type: "long" } as unknown as NoteEntity,
    ];
    const noteTimes = new Map([[0, 500], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    const longResult = judgments.find((j) => j.noteIndex === 1);
    expect(longResult?.grade).toBe("perfect");
  });
});

describe("AutoPlayer Auto 구간 게이팅", () => {
  it("Auto 구간 밖 노트(1000ms, 구간 5000-6000ms)는 press를 만들지 않는다", () => {
    const notes: NoteEntity[] = [{ beat: 4, lane: 1, type: "single" } as unknown as NoteEntity];
    const { presses } = runAutoPlay(
      notes,
      new Map([[0, 1000]]),
      new Map(),
      3000,
      [{ startMs: 5000, endMs: 6000 }],
    );
    expect(presses).toHaveLength(0);
  });

  it("구간 안(0-1100ms)에서 시작한 홀드는 구간이 끝나도 endBeat(2000ms)에서 release한다", () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 8, lane: 1, type: "long" } as unknown as NoteEntity];
    const { judgments, presses, releases } = runAutoPlay(
      notes,
      new Map([[0, 1000]]),
      new Map([[0, 2000]]),
      3000,
      [{ startMs: 0, endMs: 1100 }],
    );
    expect(presses).toHaveLength(1);
    expect(releases).toHaveLength(1);
    expect(releases[0].timeMs).toBe(2000);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe("perfect");
  });
});
