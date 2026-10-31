import { afterEach, expect, it, vi } from 'vitest';
import { TutorialMetronome } from './TutorialMetronome';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('출력 지연 80ms인 활성 트랙만 시작하면 context 1개로 4박을 예약하고 2105ms에 루프 0박을 들려준다', () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  const stops = vi.fn();
  const close = vi.fn(async () => {});
  const audio = { state: 'running', get currentTime() { return performance.now() / 1000; },
    baseLatency: 0.01, outputLatency: 0.07, destination: {}, close,
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => ({ frequency: { value: 0 }, connect() {}, disconnect() {},
      start: (at: number) => starts.push(at), stop: stops, onended: null }),
  };
  const create = vi.fn(function () { return audio; });
  vi.stubGlobal('AudioContext', create);
  const metronome = new TutorialMetronome();
  const pattern = { loopMs: 1500, countInMs: 2000,
    countIn: [-2000, -1500, -1000, -500].map(atMs => ({ atMs, accent: false })),
    beats: [0, 500, 1000].map(atMs => ({ atMs, accent: atMs === 0 })) };
  const standby = metronome.createTrack(pattern);
  const active = metronome.createTrack(pattern);
  standby.sync(0, false);
  expect(create).not.toHaveBeenCalled();
  const loopStart = active.start(performance.now());
  expect(loopStart).toBeCloseTo(2105);
  active.sync(loopStart, true);
  vi.advanceTimersByTime(2050);
  expect(starts).toHaveLength(5);
  [0.025, 0.525, 1.025, 1.525, 2.025].forEach((at, index) => expect(starts[index]).toBeCloseTo(at));
  active.sync(loopStart, false);
  const count = starts.length;
  vi.advanceTimersByTime(5000);
  expect(starts).toHaveLength(count);
  metronome.dispose();
  expect(create).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
