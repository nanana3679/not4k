import { describe, it, expect } from 'vitest';
import { JudgmentEngine } from './JudgmentEngine';
import { JUDGMENT_WINDOWS } from '../../shared/constants';
import type { NoteEntity } from '../../shared/types/chart';
import type { Lane } from '../../shared/constants';

// PlayScreen auto-play loop을 그대로 복제해서 버그를 찾는다
function runAutoPlay(
  notes: NoteEntity[],
  noteTimes: Map<number, number>,
  noteEndTimes: Map<number, number>,
  songEndMs: number,
) {
  const judgments: any[] = [];
  const engine = new JudgmentEngine(
    notes,
    noteTimes,
    noteEndTimes,
    { onJudgment: (r) => judgments.push(r), onComboUpdate: () => {} },
    JUDGMENT_WINDOWS,
    new Map([[1 as Lane, []], [2 as Lane, []], [3 as Lane, []], [4 as Lane, []]]),
  );

  const autoPressed = new Set<number>();
  const autoReleased = new Set<number>();
  const autoPendingRelease = new Map<number, { releaseMs: number; key1: string; key2: string | null }>();

  const rangeToHead = new Map<number, number>();
  const headToRange = new Map<number, number>();
  for (let r = 0; r < notes.length; r++) {
    const rNote = notes[r];
    if (!('endBeat' in rNote)) continue;
    const rTime = noteTimes.get(r)!;
    for (let h = 0; h < notes.length; h++) {
      if (h === r) continue;
      const hNote = notes[h];
      if ('endBeat' in hNote) continue;
      if (hNote.lane !== rNote.lane) continue;
      const hTime = noteTimes.get(h)!;
      if (Math.abs(hTime - rTime) > 1) continue;
      rangeToHead.set(r, h);
      headToRange.set(h, r);
      break;
    }
  }

  for (let songTimeMs = 0; songTimeMs <= songEndMs; songTimeMs += 16) {
    // press loop
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const noteTime = noteTimes.get(i)!;
      if (autoPressed.has(i) || songTimeMs < noteTime || songTimeMs >= noteTime + 200) continue;
      if (rangeToHead.has(i)) { autoPressed.add(i); continue; }
      autoPressed.add(i);
      const lane = note.lane as 1 | 2 | 3 | 4;
      const isDouble = note.type === 'double' || note.type === 'doubleLong';
      const key1 = `auto_${lane}_${i}_a`;
      const key2 = isDouble ? `auto_${lane}_${i}_b` : null;
      engine.onLanePress(lane, noteTime, key1);
      if (key2) engine.onLanePress(lane, noteTime, key2);
      if (!('endBeat' in note)) {
        const linkedRangeIdx = headToRange.get(i);
        const releaseMs = linkedRangeIdx !== undefined ? noteEndTimes.get(linkedRangeIdx)! : noteTime + 50;
        autoPendingRelease.set(i, { releaseMs, key1, key2 });
      }
    }
    engine.update(songTimeMs);
    // pending release
    for (const [idx, info] of autoPendingRelease) {
      if (songTimeMs >= info.releaseMs) {
        autoPendingRelease.delete(idx);
        const note = notes[idx];
        const lane = note.lane as 1 | 2 | 3 | 4;
        engine.onLaneRelease(lane, info.releaseMs, info.key1);
        if (info.key2) engine.onLaneRelease(lane, info.releaseMs, info.key2);
      }
    }
    // long release
    for (let i = 0; i < notes.length; i++) {
      if (!autoPressed.has(i) || autoReleased.has(i)) continue;
      const note = notes[i];
      if (!('endBeat' in note)) continue;
      if (rangeToHead.has(i)) continue;
      const noteEndTime = noteEndTimes.get(i);
      if (noteEndTime !== undefined && songTimeMs >= noteEndTime) {
        autoReleased.add(i);
        const lane = note.lane as 1 | 2 | 3 | 4;
        const isDouble = note.type === 'doubleLong';
        engine.onLaneRelease(lane, noteEndTime, `auto_${lane}_${i}_a`);
        if (isDouble) engine.onLaneRelease(lane, noteEndTime, `auto_${lane}_${i}_b`);
      }
    }
  }

  return { judgments, engine };
}

describe('PlayScreen auto-play simulation', () => {
  it('헤더 없는 long 노트 단독', () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 8, lane: 1, type: 'long' } as any];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 2000]]), 3000);
    console.log('headless long:', judgments);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe('perfect');
  });

  it('길이 0 long 단독 (headless)', () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 4, lane: 1, type: 'long' } as any];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 1000]]), 3000);
    console.log('length-0 headless long:', judgments);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe('perfect');
  });

  it('길이 0 long + single 헤드 같은 beat', () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: 'single' } as any,
      { beat: 4, endBeat: 4, lane: 1, type: 'long' } as any,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 1000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    console.log('length-0 headed long:', judgments);
    const bodyResult = judgments.find(j => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe('perfect');
  });

  it('doubleLong 단독', () => {
    const notes: NoteEntity[] = [{ beat: 4, endBeat: 8, lane: 1, type: 'doubleLong' } as any];
    const { judgments } = runAutoPlay(notes, new Map([[0, 1000]]), new Map([[0, 2000]]), 3000);
    console.log('doubleLong:', judgments);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].grade).toBe('perfect');
  });

  it('double 헤드 + doubleLong 바디 같은 beat (회귀)', () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: 'double' } as any,
      { beat: 4, endBeat: 8, lane: 1, type: 'doubleLong' } as any,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    console.log('double+doubleLong:', judgments);
    const bodyResult = judgments.find(j => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe('perfect');
  });

  it('single 헤드 + long 바디 같은 beat', () => {
    const notes: NoteEntity[] = [
      { beat: 4, lane: 1, type: 'single' } as any,
      { beat: 4, endBeat: 8, lane: 1, type: 'long' } as any,
    ];
    const noteTimes = new Map([[0, 1000], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    console.log('single+long:', judgments);
    const bodyResult = judgments.find(j => j.noteIndex === 1);
    expect(bodyResult?.grade).toBe('perfect');
  });

  it('single + 헤드없는 long 같은 레인 연속', () => {
    const notes: NoteEntity[] = [
      { beat: 2, lane: 1, type: 'single' } as any,
      { beat: 4, endBeat: 8, lane: 1, type: 'long' } as any,
    ];
    const noteTimes = new Map([[0, 500], [1, 1000]]);
    const noteEndTimes = new Map([[1, 2000]]);
    const { judgments } = runAutoPlay(notes, noteTimes, noteEndTimes, 3000);
    console.log('single+long:', judgments);
    const longResult = judgments.find(j => j.noteIndex === 1);
    expect(longResult?.grade).toBe('perfect');
  });
});
