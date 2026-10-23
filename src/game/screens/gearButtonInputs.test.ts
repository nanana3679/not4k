import { describe, expect, it } from 'vitest';
import { GearButtonInputs } from './gearButtonInputs';

function target() {
  const calls: [number, string, boolean][] = [];
  return { calls, setGearButtonKey: (lane: number, key: string, pressed: boolean) => { calls.push([lane, key, pressed]); } };
}

describe('GearButtonInputs — 판정 적용 순서의 down/up을 그리기 직전에 재생', () => {
  it('레인 2 KeyD down·up과 레인 3 자동 down은 flush 전에는 표시하지 않고 flush에서 입력 순서대로 넘긴다', () => {
    const inputs = new GearButtonInputs();
    inputs.onInput({ type: 'down', key: 'KeyD', lane: 2 });
    inputs.onInput({ type: 'up', key: 'KeyD', lane: 2 });
    inputs.onInput({ type: 'down', key: 'auto_3_2_a', lane: 3 });
    const out = target();
    expect(inputs.pending).toBe(3);
    expect(out.calls).toEqual([]);
    inputs.flush(out);
    expect(out.calls).toEqual([[2, 'KeyD', true], [2, 'KeyD', false], [3, 'auto_3_2_a', true]]);
  });

  it('flush 뒤 pending은 0이고 빈 flush는 아무것도 넘기지 않으며 다음 프레임은 새 입력만 넘긴다', () => {
    const inputs = new GearButtonInputs();
    inputs.onInput({ type: 'down', key: 'KeyD', lane: 2 });
    inputs.flush(target());
    expect(inputs.pending).toBe(0);
    const empty = target();
    inputs.flush(empty);
    expect(empty.calls).toEqual([]);
    inputs.onInput({ type: 'down', key: 'KeyO', lane: 2 });
    const next = target();
    inputs.flush(next);
    expect(next.calls).toEqual([[2, 'KeyO', true]]);
  });

  it('64개 사전 할당 칸을 넘는 80개 입력도 빠짐없이 넘기고 다음 프레임은 같은 배열·기록 객체를 재사용한다', () => {
    const inputs = new GearButtonInputs();
    // 프레임마다 기록 객체를 할당하지 않는다는 비용 계약을 확인한다.
    const records = (inputs as unknown as { records: object[] }).records;
    expect(records).toHaveLength(64);
    const first = records[0];
    for (let i = 0; i < 80; i++) inputs.onInput({ type: 'down', key: `key${i}`, lane: 2 });
    const out = target();
    inputs.flush(out);
    expect(out.calls).toHaveLength(80);
    const allocated = records.slice();
    expect(records[0]).toBe(first);
    for (let i = 0; i < 80; i++) inputs.onInput({ type: 'up', key: `key${i}`, lane: 2 });
    const next = target();
    inputs.flush(next);
    expect(next.calls).toHaveLength(80);
    expect(next.calls.every(call => call[2] === false)).toBe(true);
    expect((inputs as unknown as { records: object[] }).records).toBe(records);
    for (let i = 0; i < 80; i++) expect(records[i]).toBe(allocated[i]);
  });
});
