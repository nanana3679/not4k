import { describe, expect, it } from 'vitest';
import type { NoteEntity } from '../../shared';
import { GearButtonPressColors } from './gearButtonPressColors';
import type { GearButtonColor } from '../renderer/gearButtons';

const notes: NoteEntity[] = [
  { type: 'single', lane: 2, beat: { n: 1, d: 1 } },
  { type: 'double', lane: 2, beat: { n: 2, d: 1 } },
  { type: 'doubleLong', lane: 3, beat: { n: 3, d: 1 }, endBeat: { n: 4, d: 1 } },
  { type: 'trill', lane: 1, beat: { n: 5, d: 1 } },
];

function target() {
  const calls: [number, string, boolean, GearButtonColor | undefined][] = [];
  return { calls, setGearButtonKey: (lane: number, key: string, pressed: boolean, color?: GearButtonColor) => { calls.push([lane, key, pressed, color]); } };
}

function hit(colors: GearButtonPressColors, key: string, lane: number, noteIndex: number) {
  colors.onInput({ type: 'down', key, lane });
  colors.onDownConsumed(key, lane, noteIndex);
}

describe('GearButtonPressColors — 판정 입력·소비 노트를 기록해 그리기 직전에 재생', () => {
  it('싱글·더블·doubleLong·트릴을 친 누름은 각각 single·double·double·single이고 공입력과 up은 색 없이 적용 순서대로 넘긴다', () => {
    const colors = new GearButtonPressColors(notes);
    hit(colors, 'KeyD', 2, 0);
    colors.onInput({ type: 'up', key: 'KeyD', lane: 2 });
    hit(colors, 'KeyO', 2, 1);
    hit(colors, 'auto_3_2_a', 3, 2);
    hit(colors, 'KeyQ', 1, 3);
    colors.onInput({ type: 'down', key: 'KeyA', lane: 1 });
    const out = target();
    expect(colors.pending).toBe(6);
    expect(out.calls).toEqual([]);
    colors.flush(out);
    expect(out.calls).toEqual([
      [2, 'KeyD', true, 'single'], [2, 'KeyD', false, undefined],
      [2, 'KeyO', true, 'double'], [3, 'auto_3_2_a', true, 'double'],
      [1, 'KeyQ', true, 'single'], [1, 'KeyA', true, undefined],
    ]);
  });

  it('flush 뒤 pending은 0이고 빈 flush는 아무것도 넘기지 않으며 다음 프레임은 새 입력만 넘긴다', () => {
    const colors = new GearButtonPressColors(notes);
    hit(colors, 'KeyD', 2, 0);
    colors.flush(target());
    expect(colors.pending).toBe(0);
    const empty = target();
    colors.flush(empty);
    expect(empty.calls).toEqual([]);
    hit(colors, 'KeyO', 2, 1);
    const next = target();
    colors.flush(next);
    expect(next.calls).toEqual([[2, 'KeyO', true, 'double']]);
  });

  it('64개 사전 할당 칸을 넘는 80개 입력도 빠짐없이 넘기고 다음 프레임은 같은 배열·기록 객체를 재사용하며 소비 노트는 초기화한다', () => {
    const colors = new GearButtonPressColors(notes);
    // 프레임마다 기록 객체를 할당하지 않는다는 비용 계약을 확인한다.
    const records = (colors as unknown as { records: object[] }).records;
    expect(records).toHaveLength(64);
    const first = records[0];
    for (let i = 0; i < 80; i++) hit(colors, `key${i}`, 2, 1);
    const out = target();
    colors.flush(out);
    expect(out.calls).toHaveLength(80);
    const allocated = records.slice();
    expect(records[0]).toBe(first);
    for (let i = 0; i < 80; i++) colors.onInput({ type: 'down', key: `key${i}`, lane: 2 });
    const next = target();
    colors.flush(next);
    expect(next.calls).toHaveLength(80);
    expect(next.calls.every(call => call[3] === undefined)).toBe(true);
    expect((colors as unknown as { records: object[] }).records).toBe(records);
    for (let i = 0; i < 80; i++) expect(records[i]).toBe(allocated[i]);
  });
});
