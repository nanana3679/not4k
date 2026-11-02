import { describe, expect, it } from 'vitest';
import { MediaClockCorrection } from './MediaClockCorrection';

describe('MediaClockCorrection', () => {
  it.each([20, -20])('1배속에서 element 오차 %sms를 10ms 간격으로 6초 보정하면 2.05ms 이내로 수렴하고 위치는 감소하지 않는다', error => {
    const controller = new MediaClockCorrection();
    let position = 1000; let rate = 1;
    for (let time = 0; time <= 6000; time += 10) {
      const previous = position;
      position += time === 0 ? 0 : rate * 10;
      rate = controller.sample({ realTimeMs: time, clockPositionMs: position, mediaPositionMs: 1000 + time + error, nominalRate: 1 });
      expect(rate).toBeGreaterThanOrEqual(0.95); expect(rate).toBeLessThanOrEqual(1.05);
      expect(position).toBeGreaterThanOrEqual(previous);
    }
    expect(Math.abs(7000 + error - position)).toBeLessThan(2.05);
  });

  it.each([0.25, 0.5, 1])('%s배속에서 ±200ms 오차를 보정하면 기울기는 명목 배속의 95～105% 안에 머문다', nominalRate => {
    const controller = new MediaClockCorrection();
    for (let i = 0; i < 1000; i++) {
      const rate = controller.sample({ realTimeMs: i * 16, clockPositionMs: 1000,
        mediaPositionMs: i % 2 ? 1200 : 800, nominalRate });
      expect(rate).toBeGreaterThanOrEqual(nominalRate * 0.95);
      expect(rate).toBeLessThanOrEqual(nominalRate * 1.05);
    }
  });

  it('1배속에서 ±1ms 지터를 1000회 읽으면 기울기는 항상 1이고 2ms 경계도 보정하지 않는다', () => {
    const controller = new MediaClockCorrection();
    for (let i = 0; i < 1000; i++) {
      expect(controller.sample({ realTimeMs: i * 10, clockPositionMs: i * 10,
        mediaPositionMs: i * 10 + (i % 2 ? 1 : -1), nominalRate: 1 })).toBe(1);
    }
    expect(controller.sample({ realTimeMs: 11000, clockPositionMs: 1000, mediaPositionMs: 1002, nominalRate: 1 })).toBe(1);
  });

  it('오차 0ms 뒤 10ms 동안 20ms 지터가 한 번 오면 보정은 0.1% 미만이고 1초 뒤 1배속으로 돌아온다', () => {
    const controller = new MediaClockCorrection();
    controller.sample({ realTimeMs: 0, clockPositionMs: 0, mediaPositionMs: 0, nominalRate: 1 });
    const rate = controller.sample({ realTimeMs: 10, clockPositionMs: 10, mediaPositionMs: 30, nominalRate: 1 });
    expect(rate).toBeGreaterThanOrEqual(1); expect(rate).toBeLessThan(1.001);
    expect(controller.sample({ realTimeMs: 1010, clockPositionMs: 1010, mediaPositionMs: 1010, nominalRate: 1 })).toBe(1);
  });

  it('element가 300ms 뒤처지면 기울기 0으로 동결하고 298ms 따라잡은 뒤 위치 점프 없이 1배속으로 재개한다', () => {
    const controller = new MediaClockCorrection();
    let position = 1000;
    for (let time = 0; time < 298; time += 2) {
      const rate = controller.sample({ realTimeMs: time, clockPositionMs: position, mediaPositionMs: 700 + time, nominalRate: 1 });
      expect(rate).toBe(0); position += rate * 2;
    }
    expect(position).toBe(1000);
    const rate = controller.sample({ realTimeMs: 298, clockPositionMs: position, mediaPositionMs: 998, nominalRate: 1 });
    expect(rate).toBe(1); expect(position).toBe(1000);
    position += rate * 10;
    expect(position).toBe(1010);
  });

  it('element가 300ms 앞서면 동결하지 않고 최대 1.05배속으로 따라잡는다', () => {
    const rate = new MediaClockCorrection().sample({ realTimeMs: 0, clockPositionMs: 1000, mediaPositionMs: 1300, nominalRate: 1 });
    expect(rate).toBe(1.05);
  });

  it('300ms 지연으로 동결한 뒤 reset하고 0.25배속 새 재생을 샘플링하면 이전 지연을 버린다', () => {
    const controller = new MediaClockCorrection();
    expect(controller.sample({ realTimeMs: 500, clockPositionMs: 1000, mediaPositionMs: 700, nominalRate: 1 })).toBe(0);
    controller.reset();
    expect(controller.sample({ realTimeMs: 0, clockPositionMs: 0, mediaPositionMs: 0, nominalRate: 0.25 })).toBe(0.25);
  });
});
