import { describe, expect, it } from 'vitest';
import type { NoteEntity } from '../../shared';
import { GearButtonPressColors } from './gearButtonPressColors';

const notes: NoteEntity[] = [
  { type: 'single', lane: 2, beat: { n: 1, d: 1 } },
  { type: 'double', lane: 2, beat: { n: 2, d: 1 } },
  { type: 'doubleLong', lane: 3, beat: { n: 3, d: 1 }, endBeat: { n: 4, d: 1 } },
  { type: 'trill', lane: 1, beat: { n: 5, d: 1 } },
];

function target() {
  const calls: [number, string, string][] = [];
  return { calls, resolveGearButtonPress: (lane: number, key: string, color: string) => { calls.push([lane, key, color]); } };
}

describe('GearButtonPressColors — 판정이 노트에 소비한 누름의 색을 그리기 직전에 넘김', () => {
  it('싱글 노트 0을 친 KeyD는 싱글, 더블 노트 1을 친 KeyO는 더블, doubleLong 2를 친 auto 키는 더블, 트릴 3을 친 KeyQ는 싱글로 판정 순서대로 넘긴다', () => {
    const colors = new GearButtonPressColors(notes);
    colors.onDownConsumed('KeyD', 2, 0);
    colors.onDownConsumed('KeyO', 2, 1);
    colors.onDownConsumed('auto_3_2_a', 3, 2);
    colors.onDownConsumed('KeyQ', 1, 3);
    const out = target();
    colors.flush(out);
    expect(out.calls).toEqual([[2, 'KeyD', 'single'], [2, 'KeyO', 'double'], [3, 'auto_3_2_a', 'double'], [1, 'KeyQ', 'single']]);
  });

  it('flush하면 비우므로 다음 flush는 아무것도 넘기지 않고, 기록 칸은 다음 프레임에 다시 쓴다(같은 객체)', () => {
    const colors = new GearButtonPressColors(notes);
    colors.onDownConsumed('KeyD', 2, 0);
    colors.flush(target());
    expect(colors.pending).toBe(0);
    const empty = target();
    colors.flush(empty);
    expect(empty.calls).toEqual([]);
    colors.onDownConsumed('KeyO', 2, 1);
    const next = target();
    colors.flush(next);
    expect(next.calls).toEqual([[2, 'KeyO', 'double']]);
  });

  it('차트에 없는 노트 index 9는 기록하지 않는다', () => {
    const colors = new GearButtonPressColors(notes);
    colors.onDownConsumed('KeyD', 2, 9);
    expect(colors.pending).toBe(0);
  });
});
