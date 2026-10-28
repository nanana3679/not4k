import { describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { DocumentNoteEntity } from '../../shared';
import { toggleNoteGrace } from './noteProperties';

describe('G 속성 토글의 명시·구형 경계', () => {
  it.each(['tap', 'release'] as const)('더블 %s의 G 토글은 전체 수량 2를 유지하고 Grace만 켰다가 제거한다', type => {
    const note: DocumentNoteEntity = type === 'tap' ? { type, kind: 'double', lane: 1, beat: beat(2) } : { type, count: 2, lane: 1, beat: beat(2) };
    const on = toggleNoteGrace(note)!;
    expect(on).toEqual({ ...note, grace: true });
    expect(toggleNoteGrace(on)).toEqual(note);
  });
  it('새 Body·Sustain의 G 토글은 no-op이고 grace·holdOnly를 만들지 않는다', () => {
    expect(toggleNoteGrace({ type: 'body', holdCount: 2, lane: 1, beat: beat(0), endBeat: beat(4) })).toBeNull();
    expect(toggleNoteGrace({ type: 'tick', count: 2, lane: 1, beat: beat(2) })).toBeNull();
  });
  it('구형 doubleLong의 G 토글은 holdOnly만 바꾸고 구형 type과 실제 길이를 보존한다', () => {
    const note: DocumentNoteEntity = { type: 'doubleLong', lane: 1, beat: beat(0), endBeat: beat(4), holdOnly: false };
    expect(toggleNoteGrace(note)).toEqual({ ...note, holdOnly: true });
    expect(note.holdOnly).toBe(false);
  });
});
