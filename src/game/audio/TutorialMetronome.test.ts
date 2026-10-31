import { afterEach, expect, it, vi } from 'vitest';
import { TutorialMetronome } from './TutorialMetronome';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('출력 지연 80ms인 활성 트랙만 시작하면 context 1개로 4박을 예약하고 2305ms에 루프 0박을 들려준다', () => {
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
  expect(active.start(performance.now())).toBeNull();
  vi.advanceTimersByTime(200);
  const loopStart = active.start(performance.now())!;
  expect(loopStart).toBeCloseTo(2305);
  active.sync(loopStart, true);
  vi.advanceTimersByTime(2050);
  expect(starts).toHaveLength(5);
  [0.225, 0.725, 1.225, 1.725, 2.225].forEach((at, index) => expect(starts[index]).toBeCloseTo(at));
  active.sync(loopStart, false);
  const count = starts.length;
  vi.advanceTimersByTime(5000);
  expect(starts).toHaveLength(count);
  metronome.dispose();
  expect(create).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('시작 직후 출력 지연이 10→80ms로 바뀌면 200ms 준비 뒤 원점을 고정해 첫 클릭부터 정확히 500ms 간격으로 예약한다', () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  const audio = { state: 'running', get currentTime() { return performance.now() / 1000; },
    baseLatency: 0.01, outputLatency: 0, destination: {}, close: async () => {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => ({ frequency: { value: 0 }, connect() {}, disconnect() {},
      start: (at: number) => starts.push(at), stop() {}, onended: null }),
  };
  vi.stubGlobal('AudioContext', function () { return audio; });
  const metronome = new TutorialMetronome();
  const track = metronome.createTrack({ loopMs: 1500, countInMs: 2000,
    countIn: [-2000, -1500, -1000, -500].map(atMs => ({ atMs, accent: false })),
    beats: [0, 500, 1000].map(atMs => ({ atMs, accent: false })) });
  expect(track.start(performance.now())).toBeNull();
  vi.advanceTimersByTime(25);
  audio.outputLatency = 0.07;
  expect(track.start(performance.now())).toBeNull();
  vi.advanceTimersByTime(175);
  // rAF가 전달한 시각이 16ms 전이어도 audio 관측과 performance 관측은 같은 순간을 쓴다.
  const origin = track.start(performance.now() - 16)!;
  expect(origin).toBeCloseTo(2305);
  track.sync(origin, true);
  // 원점 확정 이후 보고값이 다시 바뀌어도 이미 시작한 클릭열은 이동하지 않는다.
  audio.outputLatency = 0.12;
  vi.advanceTimersByTime(2050);
  expect(starts).toHaveLength(5);
  [0.225, 0.725, 1.225, 1.725, 2.225].forEach((at, index) => expect(starts[index]).toBeCloseTo(at));
  expect(starts[4] * 1000 + 80).toBeCloseTo(origin);
  metronome.dispose();
});

it('유효한 출력 timestamp가 2회 연속 관측되면 200ms 전에 80ms mapping을 고정하고 500ms 간격을 유지한다', () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  let outputDelayMs = 10;
  const audio = { state: 'running', get currentTime() { return 10 + performance.now() / 1000; },
    baseLatency: 0.01, outputLatency: 0, destination: {}, close: async () => {},
    getOutputTimestamp: () => ({ contextTime: audio.currentTime - outputDelayMs / 1000, performanceTime: performance.now() }),
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => ({ frequency: { value: 0 }, connect() {}, disconnect() {},
      start: (at: number) => starts.push(at), stop() {}, onended: null }),
  };
  vi.stubGlobal('AudioContext', function () { return audio; });
  const metronome = new TutorialMetronome();
  const track = metronome.createTrack({ loopMs: 1500, countInMs: 2000,
    countIn: [-2000, -1500, -1000, -500].map(atMs => ({ atMs, accent: false })),
    beats: [0, 500, 1000].map(atMs => ({ atMs, accent: false })) });
  expect(track.start(performance.now())).toBeNull(); // 0 timestamp는 아직 유효하지 않다.
  vi.advanceTimersByTime(25);
  expect(track.start(performance.now())).toBeNull();
  expect(track.start(performance.now())).toBeNull(); // 같은 tick은 2회로 세지 않는다.
  outputDelayMs = 80;
  vi.advanceTimersByTime(25);
  const origin = track.start(performance.now())!;
  expect(origin).toBeCloseTo(2155);
  track.sync(origin, true);
  outputDelayMs = 150;
  vi.advanceTimersByTime(2050);
  [10.075, 10.575, 11.075, 11.575, 12.075].forEach((at, index) => expect(starts[index]).toBeCloseTo(at));
  expect(starts).toHaveLength(5);
  expect((starts[4] - 10) * 1000 + 80).toBeCloseTo(origin);
  metronome.dispose();
});
