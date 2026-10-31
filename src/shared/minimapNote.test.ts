import { describe, expect, it } from 'vitest';
import { beat } from './types/beat';
import type { DocumentNoteEntity } from './types/chart';
import { minimapNoteRect } from './minimapNote';

const toY = (value: ReturnType<typeof beat>) => 600 - value.n / value.d * 10;
describe('에디터·Observer 공용 미니맵 노트', () => {
  it('L2·4박 더블 tap과 구형 double은 x15·y560·높이 1px·노란색으로 동일하게 그린다', () => {
    for (const note of [{ type: 'tap', kind: 'double' }, { type: 'double' }] as const) {
      expect(minimapNoteRect({ ...note, lane: 2, beat: beat(4) }, toY, 15)).toEqual({
        x: 15, y: 560, width: 15, height: 1, color: 0xffcc00, alpha: 1,
      });
    }
  });
  it('L3·4～8박 holdCount 2 바디와 doubleLong은 x30·y520·높이 40px·50% 불투명도로 같다', () => {
    for (const note of [{ type: 'body', holdCount: 2 }, { type: 'doubleLong' }] as const) {
      expect(minimapNoteRect({ ...note, lane: 3, beat: beat(4), endBeat: beat(8) }, toY, 15)).toEqual({
        x: 30, y: 520, width: 15, height: 40, color: 0xffee88, alpha: 0.5,
      });
    }
  });
  it('길이 0인 trill 바디는 최소 1px이고 L5 노트는 미니맵에서 제외한다', () => {
    const note: DocumentNoteEntity = { type: 'body', holdCount: 1, trill: true, lane: 1, beat: beat(4), endBeat: beat(4) };
    expect(minimapNoteRect(note, toY, 15, 800)).toEqual({ x: 800, y: 560, width: 15, height: 1, color: 0xaaaaaa, alpha: 0.5 });
    expect(minimapNoteRect({ ...note, lane: 5 }, toY, 15)).toBeNull();
  });
  it('single·trill·release·tick을 변환하면 에디터의 0x4488ff·0xffffff·0xffcc00·0x88bbff 색을 유지한다', () => {
    const notes: DocumentNoteEntity[] = [
      { type: 'single', lane: 1, beat: beat(0) },
      { type: 'tap', kind: 'trill', lane: 1, beat: beat(0) },
      { type: 'release', count: 2, lane: 1, beat: beat(0) },
      { type: 'tick', count: 1, lane: 1, beat: beat(0) },
    ];
    expect(notes.map(note => minimapNoteRect(note, toY, 15)?.color)).toEqual([0x4488ff, 0xffffff, 0xffcc00, 0x88bbff]);
  });
});
