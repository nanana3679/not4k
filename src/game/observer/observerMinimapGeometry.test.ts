import { describe, expect, it } from 'vitest';
import { dragMinimapRange, hitMinimapRange, minimapOverlay, minimapTimeToY, minimapYToTime } from './observerMinimapGeometry';

const duration = 30_000;
const height = 624;
const range = { startMs: 6000, endMs: 18000 };

describe('Observer 미니맵 좌표와 구간', () => {
  it('30초·높이 624px에서 0·12000·30000ms를 y612·372·12로 왕복 변환한다', () => {
    for (const [time, y] of [[0, 612], [12000, 372], [30000, 12]]) {
      expect(minimapTimeToY(time, duration, height)).toBe(y);
      expect(minimapYToTime(y, duration, height)).toBe(time);
    }
  });
  it('30초 미니맵 밖 y−100·800을 시간으로 바꾸면 30000·0ms로 제한한다', () => {
    expect(minimapYToTime(-100, duration, height)).toBe(30000);
    expect(minimapYToTime(800, duration, height)).toBe(0);
    expect(minimapYToTime(0, 0, 0)).toBe(0);
    expect(Number.isFinite(minimapTimeToY(0, 0, 0))).toBe(true);
  });
  it('6000～18000ms 핸들의 ±8px는 start·end이고 내부 y372는 move이며 바깥은 null이다', () => {
    expect(hitMinimapRange(30, 500, range, duration, height)).toBe('start');
    expect(hitMinimapRange(30, 244, range, duration, height)).toBe('end');
    expect(hitMinimapRange(30, 372, range, duration, height)).toBe('move');
    expect(hitMinimapRange(30, 501, range, duration, height)).toBeNull();
    expect(hitMinimapRange(-1, 372, range, duration, height)).toBeNull();
    expect(hitMinimapRange(61, 372, range, duration, height)).toBeNull();
  });
  it('A=B=12000ms로 핸들이 겹쳐도 y372의 왼쪽 x9는 start·오른쪽 x51은 end를 잡는다', () => {
    const point = { startMs: 12000, endMs: 12000 };
    expect(hitMinimapRange(9, 372, point, duration, height)).toBe('start');
    expect(hitMinimapRange(51, 372, point, duration, height)).toBe('end');
  });
  it('6000～18000ms 시작을 24000ms까지 끌면 A=B=18000ms에서 멈춘다', () => {
    expect(dragMinimapRange('start', range, 492, 132, duration, height)).toEqual({ startMs: 18000, endMs: 18000 });
    expect(dragMinimapRange('start', range, 492, 900, duration, height)).toEqual({ startMs: 0, endMs: 18000 });
  });
  it('6000～18000ms 끝을 0ms·30000ms 밖으로 끌면 B는 6000·30000ms로 제한한다', () => {
    expect(dragMinimapRange('end', range, 252, 900, duration, height)).toEqual({ startMs: 6000, endMs: 6000 });
    expect(dragMinimapRange('end', range, 252, -100, duration, height)).toEqual({ startMs: 6000, endMs: 30000 });
  });
  it('6000～18000ms 몸통을 위로 25.25px 옮기면 길이 12000ms를 유지해 7262.5～19262.5ms가 된다', () => {
    expect(dragMinimapRange('move', range, 372, 346.75, duration, height)).toEqual({ startMs: 7262.5, endMs: 19262.5 });
  });
  it('길이 12000ms인 몸통을 양끝 밖으로 끌면 0～12000ms·18000～30000ms로 제한한다', () => {
    expect(dragMinimapRange('move', range, 372, 1000, duration, height)).toEqual({ startMs: 0, endMs: 12000 });
    expect(dragMinimapRange('move', range, 372, -1000, duration, height)).toEqual({ startMs: 18000, endMs: 30000 });
  });
  it('6000～18000ms·현재 12000ms는 y252부터 높이 240px의 overlay와 y372 재생선을 만든다', () => {
    expect(minimapOverlay(range, 12000, duration, height)).toEqual({ startY: 492, endY: 252, top: 252, height: 240, playheadY: 372 });
    expect(minimapOverlay(range, -30, duration, height).playheadY).toBe(612);
    expect(minimapOverlay(range, 30120, duration, height).playheadY).toBe(12);
  });
});
