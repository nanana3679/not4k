import { describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument } from '../../shared';
import { isPlaybackLockedChange } from './playbackEditLock';

const chart = (): ChartDocument => ({
  meta: { title: '재생 잠금', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }],
  trillZones: [],
  restZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
});

describe('isPlaybackLockedChange', () => {
  it('같은 차트 객체를 다시 쓰면 잠긴 변경이 아니다', () => {
    const before = chart();
    expect(isPlaybackLockedChange(before, before)).toBe(false);
  });

  it('제목·난이도·재킷 경로만 바꾼 meta 쓰기는 잠긴 변경이 아니다', () => {
    const before = chart();
    const after = { ...before, meta: { ...before.meta, title: '새 제목', difficultyLabel: 'LIFTOFF', imageFile: 'songs/a/jacket.png' } };
    expect(isPlaybackLockedChange(before, after)).toBe(false);
  });

  it('오프셋을 0ms에서 10ms로 바꾸면 잠긴 변경이다', () => {
    const before = chart();
    expect(isPlaybackLockedChange(before, { ...before, meta: { ...before.meta, offsetMs: 10 } })).toBe(true);
  });

  it.each<[string, (c: ChartDocument) => ChartDocument]>([
    ['notes', c => ({ ...c, notes: [...c.notes] })],
    ['trillZones', c => ({ ...c, trillZones: [{ lane: 1, beat: beat(1), endBeat: beat(2) }] })],
    ['restZones', c => ({ ...c, restZones: [...(c.restZones ?? [])] })],
    ['events(BPM 120 → 90)', c => ({ ...c, events: [{ type: 'bpm', beat: beat(0), bpm: 90 }, c.events[1]] })],
  ])('%s 배열을 새로 만든 쓰기는 잠긴 변경이다', (_name, edit) => {
    const before = chart();
    expect(isPlaybackLockedChange(before, edit(before))).toBe(true);
  });
});
