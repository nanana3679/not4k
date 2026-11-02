import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { AudioEngine } from "./AudioEngine";
import type { FadedAudioSpan } from "./index";
import { GameClock } from "../time/GameClock";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

interface MockAudioSource {
  buffer: AudioBuffer | null;
  loop: boolean;
  playbackRate: { value: number };
  connect: Mock;
  disconnect: Mock;
  start: Mock;
  stop: Mock;
  onended: (() => void) | null;
}

interface MockGainParam {
  value: number;
  setValueAtTime: Mock;
  linearRampToValueAtTime: Mock;
  cancelScheduledValues: Mock;
}

interface MockGainNode {
  gain: MockGainParam;
  connect: Mock;
  disconnect: Mock;
}

interface MockAudioContext {
  readonly currentTime: number;
  state: string;
  resume: Mock;
  close: Mock;
  destination: object;
  decodeAudioData: Mock;
  createBuffer: Mock;
  sampleRate: number;
  createBufferSource: Mock<() => MockAudioSource>;
  createMediaElementSource: Mock<() => { connect: Mock; disconnect: Mock }>;
  createGain: Mock<() => MockGainNode>;
  baseLatency?: number;
  outputLatency?: number;
  /** test helper: advance wall-clock time */
  _advanceTime(seconds: number): void;
}

function createMockAudioContext(): MockAudioContext {
  let _currentTime = 0;

  const createSource = (): MockAudioSource => ({
    buffer: null,
    loop: false,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  });

  const ctx: MockAudioContext = {
    get currentTime() {
      return _currentTime;
    },
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(async () => { ctx.state = "closed"; }),
    destination: {},
    decodeAudioData: vi.fn(),
    sampleRate: 48000,
    createBuffer: vi.fn(() => createMockBuffer(128 / 48000)),
    createBufferSource: vi.fn(createSource),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createGain: vi.fn(() => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    // test helper: advance wall-clock time
    _advanceTime(seconds: number) {
      _currentTime += seconds;
    },
  };

  return ctx;
}

/** globalThis.AudioContext를 지정한 mock 컨텍스트를 반환하는 생성자로 교체 */
function stubGlobalAudioContext(ctx: MockAudioContext): void {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
}

function createMockBuffer(durationSeconds: number): AudioBuffer {
  return { duration: durationSeconds } as unknown as AudioBuffer;
}

// Patch global AudioContext before each test
let mockCtx: ReturnType<typeof createMockAudioContext>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  mockCtx = createMockAudioContext();
  stubGlobalAudioContext(mockCtx);
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioEngine L₀ 준비", () => {
  async function prepare(engine: AudioEngine) {
    const ready = engine.prepareForPlayback();
    await vi.advanceTimersByTimeAsync(500);
    await ready;
  }

  it("준비 전 L₀를 읽으면 오류로 막아 첫 프레임에 임시 0ms를 쓰지 않는다", () => {
    expect(() => new AudioEngine().getOutputLatencyMs()).toThrow("prepareForPlayback");
  });

  it.each(["close", "dispose"])("준비 50ms 뒤 %s하면 준비가 거부되고 무음은 1번 정지·연결 해제되며 L₀ 읽기도 오류다", async action => {
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    const rejected = expect(ready).rejects.toThrow("AudioContext stopped during latency preparation");
    await vi.advanceTimersByTimeAsync(50);
    const silence = mockCtx.createBufferSource.mock.results[0].value;
    if (action === "close") await mockCtx.close();
    else await engine.dispose();
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(silence.stop).toHaveBeenCalledOnce();
    expect(silence.disconnect).toHaveBeenCalledOnce();
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    expect(engine.prepareForPlayback()).toBe(ready);
    await vi.advanceTimersByTimeAsync(500);
    expect(silence.stop).toHaveBeenCalledOnce();
    expect(silence.disconnect).toHaveBeenCalledOnce();
  });

  it("25ms 콜백 4번 뒤에도 실제 경과가 99ms면 대기하고 100ms가 되면 L₀=10ms를 확정한다", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    mockCtx.outputLatency = 0.01;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    now.mockReturnValue(1099);
    await vi.advanceTimersByTimeAsync(100);
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    now.mockReturnValue(1100);
    await vi.advanceTimersByTimeAsync(25);
    await ready;
    expect(engine.getOutputLatencyMs()).toBe(10);
  });

  it("첫 콜백이 실제 100ms 뒤 도착해도 관측 3개를 모은 150ms에 L₀=10ms를 확정한다", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    mockCtx.outputLatency = 0.01;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    for (const elapsed of [100, 125]) {
      now.mockReturnValue(1000 + elapsed);
      await vi.advanceTimersByTimeAsync(25);
      expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    }
    now.mockReturnValue(1150);
    await vi.advanceTimersByTimeAsync(25);
    expect(engine.getOutputLatencyMs()).toBe(10);
    await ready;
  });

  it("첫 콜백이 실제 550ms 뒤 도착하면 20번을 채우지 않고 마지막 L₀=10ms로 준비를 끝낸다", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    mockCtx.outputLatency = 0.01;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    now.mockReturnValue(1550);
    await vi.advanceTimersByTimeAsync(25);
    expect(engine.getOutputLatencyMs()).toBe(10);
    await ready;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("outputLatency 지원 값이 계속 0이면 499ms까지 관측하고 500ms에 baseLatency=5ms를 채택한다", async () => {
    mockCtx.baseLatency = 0.005;
    mockCtx.outputLatency = 0;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    await vi.advanceTimersByTimeAsync(499);
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    await vi.advanceTimersByTimeAsync(1);
    await ready;
    expect(engine.getOutputLatencyMs()).toBe(5);
  });

  it("outputLatency가 0에서 400ms에 20ms로 바뀌면 450ms까지 관측해 L₀=20ms를 채택한다", async () => {
    mockCtx.outputLatency = 0;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    await vi.advanceTimersByTimeAsync(399);
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    mockCtx.outputLatency = 0.02;
    await vi.advanceTimersByTimeAsync(50);
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    await vi.advanceTimersByTimeAsync(1);
    await ready;
    expect(engine.getOutputLatencyMs()).toBe(20);
  });

  it.each([
    [NaN, 0.01, 10], [0.005, NaN, 5],
    [Infinity, 0.01, 10], [-Infinity, 0.01, 10],
    [0.005, Infinity, 5], [0.005, -Infinity, 5], [NaN, Infinity, 0],
  ])("baseLatency=%s·outputLatency=%s에서 유한하지 않은 성분만 0으로 두고 L₀=%sms를 유지한다", async (base, output, expected) => {
    mockCtx.baseLatency = base;
    mockCtx.outputLatency = output;
    const engine = new AudioEngine();
    await prepare(engine);
    expect(engine.getOutputLatencyMs()).toBe(expected);
  });

  it("baseLatency와 outputLatency가 각각 Number.MAX_VALUE이면 합산 오버플로를 L₀=0ms로 처리한다", async () => {
    mockCtx.baseLatency = Number.MAX_VALUE;
    mockCtx.outputLatency = Number.MAX_VALUE;
    const engine = new AudioEngine();
    await prepare(engine);
    expect(engine.getOutputLatencyMs()).toBe(0);
  });

  it("suspended의 resume이 2000ms 동안 끝나지 않으면 설명이 있는 오류로 거부하고 무음을 만들지 않는다", async () => {
    mockCtx.state = "suspended";
    mockCtx.resume.mockReturnValue(new Promise<void>(() => {}));
    const engine = new AudioEngine();
    const rejected = vi.fn();
    const ready = engine.prepareForPlayback().catch(rejected);
    await vi.advanceTimersByTimeAsync(1999);
    expect(rejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0][0].message).toMatch(/AudioContext\.resume.*2000ms/);
    await ready;
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    expect(() => engine.getOutputLatencyMs()).toThrow("prepareForPlayback");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("baseLatency와 outputLatency가 없으면 100ms 준비 후 L₀=0ms다", async () => {
    const engine = new AudioEngine();
    await prepare(engine);
    expect(engine.getOutputLatencyMs()).toBe(0);
  });

  it("outputLatency 미지원·baseLatency=5ms이면 준비 후 L₀=5ms다", async () => {
    mockCtx.baseLatency = 0.005;
    const engine = new AudioEngine();
    await prepare(engine);
    expect(engine.getOutputLatencyMs()).toBe(5);
  });

  it("suspended에서 resume 완료 후 무음을 출력하고 100ms 동안 안정된 5+10ms를 L₀로 고정한다", async () => {
    mockCtx.state = "suspended";
    let resume!: () => void;
    mockCtx.resume.mockImplementation(() => new Promise<void>(resolve => { resume = () => { mockCtx.state = "running"; resolve(); }; }));
    mockCtx.baseLatency = 0.005;
    mockCtx.outputLatency = 0.01;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    resume();
    await vi.advanceTimersByTimeAsync(99);
    expect(() => engine.getOutputLatencyMs()).toThrow();
    const silence = mockCtx.createBufferSource.mock.results[0].value;
    expect(silence.loop).toBe(true);
    expect(silence.start).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await ready;
    expect(engine.getOutputLatencyMs()).toBe(15);
    expect(silence.stop).toHaveBeenCalledOnce();
    expect(silence.disconnect).toHaveBeenCalledOnce();
  });

  it("초기 0ms가 75ms 뒤 25ms로 바뀌면 125ms까지 기다려 L₀=25ms를 채택한다", async () => {
    mockCtx.outputLatency = 0;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    await vi.advanceTimersByTimeAsync(74);
    mockCtx.outputLatency = 0.025;
    await vi.advanceTimersByTimeAsync(26);
    expect(() => engine.getOutputLatencyMs()).toThrow();
    await vi.advanceTimersByTimeAsync(25);
    await ready;
    expect(engine.getOutputLatencyMs()).toBe(25);
  });

  it("25ms마다 1ms씩 흔들리면 500ms에 대기를 끝내고 마지막 20ms를 채택한다", async () => {
    let reads = 0;
    Object.defineProperty(mockCtx, "outputLatency", { get: () => ++reads / 1000 });
    const engine = new AudioEngine();
    await prepare(engine);
    expect(engine.getOutputLatencyMs()).toBe(20);
    expect(reads).toBe(20);
  });

  it("L₀=15ms 확정 후 보고가 85ms로 바뀌어도 pause/resume·재준비는 15ms를 유지하고 새 engine만 85ms를 읽는다", async () => {
    mockCtx.baseLatency = 0.005;
    mockCtx.outputLatency = 0.01;
    const engine = new AudioEngine();
    const ready = engine.prepareForPlayback();
    expect(engine.prepareForPlayback()).toBe(ready);
    await vi.advanceTimersByTimeAsync(100);
    await ready;
    engine.loadBuffer(createMockBuffer(1));
    engine.play();
    mockCtx._advanceTime(0.25);
    engine.pause();
    mockCtx.outputLatency = 0.08;
    engine.resume();
    await engine.prepareForPlayback();
    expect(engine.getOutputLatencyMs()).toBe(15);
    const retry = new AudioEngine();
    await prepare(retry);
    expect(retry.getOutputLatencyMs()).toBe(85);
  });
});

describe("AudioEngine masterVolume", () => {
  it("기본 masterVolume = 1.0", () => {
    const engine = new AudioEngine();
    expect(engine.masterVolume).toBe(1.0);
  });

  it("masterVolume을 0.5로 설정하면 gainNode.gain.value에 0.5 반영", () => {
    const engine = new AudioEngine();
    engine.masterVolume = 0.5;
    expect(engine.masterVolume).toBe(0.5);
  });

  it("masterVolume에 음수(-0.5)를 설정하면 0으로 클램핑", () => {
    const engine = new AudioEngine();
    engine.masterVolume = -0.5;
    expect(engine.masterVolume).toBe(0);
  });

  it("masterVolume에 1 초과(1.5)를 설정하면 1로 클램핑", () => {
    const engine = new AudioEngine();
    engine.masterVolume = 1.5;
    expect(engine.masterVolume).toBe(1);
  });

  it("masterVolume을 0으로 설정하면 0 반환", () => {
    const engine = new AudioEngine();
    engine.masterVolume = 0;
    expect(engine.masterVolume).toBe(0);
  });
});

describe("AudioEngine playbackRate", () => {
  it("기본 playbackRate = 1.0", () => {
    const engine = new AudioEngine();
    expect(engine.playbackRate).toBe(1.0);
  });

  it("playbackRate를 0.5로 설정하면 0.5 반환", () => {
    const engine = new AudioEngine();
    engine.playbackRate = 0.5;
    expect(engine.playbackRate).toBe(0.5);
  });

  it("playbackRate를 2.0으로 설정하면 2.0 반환", () => {
    const engine = new AudioEngine();
    engine.playbackRate = 2.0;
    expect(engine.playbackRate).toBe(2.0);
  });

  it("play() 호출 시 source.playbackRate.value에 설정한 배속이 적용됨", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 1.5;
    engine.play();

    const source = mockCtx.createBufferSource.mock.results[0].value;
    expect(source.playbackRate.value).toBe(1.5);
  });

  it("resume() 호출 시 source.playbackRate.value에 설정한 배속이 적용됨", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 0.75;
    engine.play();

    // pause 후 resume
    mockCtx._advanceTime(1);
    engine.pause();
    engine.resume();

    // resume에서 새로 생성된 source (두 번째 호출)
    const source = mockCtx.createBufferSource.mock.results[1].value;
    expect(source.playbackRate.value).toBe(0.75);
  });

  it("playbackRate=2.0, 벽시계 1초 경과 시 currentTimeMs = 2000ms (시작 오프셋 0)", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 2.0;
    engine.play();

    mockCtx._advanceTime(1); // 벽시계 1초
    expect(engine.currentTimeMs).toBe(2000);
  });

  it("playbackRate=0.5, 벽시계 2초 경과 시 currentTimeMs = 1000ms", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 0.5;
    engine.play();

    mockCtx._advanceTime(2); // 벽시계 2초
    expect(engine.currentTimeMs).toBe(1000);
  });

  it("playbackRate=1.5, 시작 오프셋 1000ms, 벽시계 2초 경과 시 currentTimeMs = 4000ms", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 1.5;
    engine.play(1000); // 1초 오프셋

    mockCtx._advanceTime(2); // 벽시계 2초 → 재생 위치 = 1 + 2*1.5 = 4초
    expect(engine.currentTimeMs).toBe(4000);
  });

  it("playbackRate=2.0에서 pause 후 currentTimeMs가 올바른 위치를 유지", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 2.0;
    engine.play();

    mockCtx._advanceTime(1.5); // 벽시계 1.5초 → 재생 위치 3초
    engine.pause();

    expect(engine.currentTimeMs).toBe(3000);
  });

  it("playbackRate=2.0에서 pause → resume 후 시간이 연속으로 진행", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = 2.0;
    engine.play();

    mockCtx._advanceTime(1); // 벽시계 1초 → 재생 위치 2초
    engine.pause();
    expect(engine.currentTimeMs).toBe(2000);

    engine.resume();
    mockCtx._advanceTime(0.5); // 벽시계 0.5초 추가 → 재생 위치 2 + 0.5*2 = 3초
    expect(engine.currentTimeMs).toBe(3000);
  });

  it("5초 버퍼·r=2에서 실제 10초가 지나면 P는 끝을 넘어 20000ms다", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(5));
    engine.playbackRate = 2.0;
    engine.play();

    mockCtx._advanceTime(10); // 콜백이 늦어져도 시계는 원래 기준을 유지한다.
    expect(engine.currentTimeMs).toBe(20000);
  });

  it("재생 중 playbackRate 변경 시 source.playbackRate.value에 즉시 반영", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.play();

    const source = mockCtx.createBufferSource.mock.results[0].value;
    expect(source.playbackRate.value).toBe(1.0);

    engine.playbackRate = 1.75;
    expect(source.playbackRate.value).toBe(1.75);
  });

  it("playbackRate에 0을 설정하면 0.1로 클램핑", () => {
    const engine = new AudioEngine();
    engine.playbackRate = 0;
    expect(engine.playbackRate).toBe(0.1);
  });

  it("playbackRate에 음수를 설정하면 0.1로 클램핑", () => {
    const engine = new AudioEngine();
    engine.playbackRate = -3;
    expect(engine.playbackRate).toBe(0.1);
  });

  it("playbackRate에 5.0을 설정하면 4.0으로 클램핑", () => {
    const engine = new AudioEngine();
    engine.playbackRate = 5.0;
    expect(engine.playbackRate).toBe(4.0);
  });

  it("재생 중 playbackRate 변경 시 startOffset이 누적되어 currentTimeMs가 정확함", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(60));
    engine.play(0);

    // 1x 속도로 벽시계 2초 경과 → 재생 위치 2초 = 2000ms
    mockCtx._advanceTime(2);
    expect(engine.currentTimeMs).toBeCloseTo(2000);

    // 2초 시점에서 속도를 2x로 변경
    engine.playbackRate = 2.0;

    // 변경 직후에도 위치는 2000ms여야 함
    expect(engine.currentTimeMs).toBeCloseTo(2000);

    // 벽시계 1초 더 경과 (2x 속도 → 추가 2초 → 총 4초 = 4000ms)
    mockCtx._advanceTime(1);
    expect(engine.currentTimeMs).toBeCloseTo(4000);
  });
});

describe("AudioEngine 배속 이력과 GameClock", () => {
  function createClock(inputOffsetMs = 0, visualOffsetMs = 0) {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(60));
    vi.spyOn(engine, "getOutputLatencyMs").mockReturnValue(40);
    const clock = new GameClock(engine, { inputOffsetMs, visualOffsetMs }, () => mockCtx.currentTime * 1000);
    return { engine, clock };
  }

  function createClockWithLatency(outputLatencyMs: number, inputOffsetMs = 0, visualOffsetMs = 0) {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(60));
    vi.spyOn(engine, "getOutputLatencyMs").mockReturnValue(outputLatencyMs);
    const clock = new GameClock(engine, { inputOffsetMs, visualOffsetMs }, () => mockCtx.currentTime * 1000);
    return { engine, clock };
  }

  it("1배속·L₀=15ms·1.056초 경과·오프셋 0이면 입력 시각은 기존 식과 같은 정확히 1041ms다", () => {
    const { engine, clock } = createClockWithLatency(15);
    engine.play();
    mockCtx._advanceTime(1.056);
    expect(clock.judgmentTimeMs()).toBe(engine.currentTimeMs - 15 * 1);
    expect(clock.toInputTimeMs(mockCtx.currentTime * 1000)).toBe(1041);
  });

  it("L₀=128/48000초에서 playFadedSpan(1000ms) 직후 J는 옵저버 세션 시작식 1000+(0−L₀)·1과 비트 단위로 같다", () => {
    const outputLatencyMs = 128 / 48000 * 1000;
    const { engine, clock } = createClockWithLatency(outputLatencyMs);
    engine.playFadedSpan({ fromMs: 1000, fadeInUntilMs: 1000, fadeOutFromMs: 5000, toMs: 5000 });
    expect(clock.judgmentTimeMs()).toBe(1000 + (Math.min(0, 0) - outputLatencyMs) * 1);
  });

  it("0.75배속 일정·시각 +37ms·입력 −23ms·핸들러 지연 3ms면 V=J+37·r, 입력=J+(−23−3)·r과 비트 단위로 같다", () => {
    const { engine, clock } = createClockWithLatency(128 / 48000 * 1000, -23, 37);
    engine.playbackRate = 0.75;
    engine.play(1234);
    mockCtx._advanceTime(2.345);
    const judgment = clock.judgmentTimeMs();
    expect(judgment).toBe(engine.currentTimeMs - (128 / 48000 * 1000) * 0.75);
    expect(clock.visualTimeMs()).toBe(judgment + 37 * 0.75);
    expect(clock.toInputTimeMs(mockCtx.currentTime * 1000 - 3)).toBe(judgment + (-23 - 3) * 0.75);
  });

  it("첫 재생 전 0.5배속으로 바꾸면 J=−20ms이고 play() 직후에도 −20ms로 튀지 않는다", () => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.5;
    expect(clock.judgmentTimeMs()).toBe(-20);
    engine.play();
    expect(clock.judgmentTimeMs()).toBe(-20);
  });

  it("stop 뒤 0.5→1배속으로 바꾸면 이전 이력 없이 J=−40ms이고 play(1000) 직후 960ms다", () => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.5;
    engine.play(4000);
    mockCtx._advanceTime(1);
    engine.stop();
    engine.playbackRate = 1;
    expect(clock.judgmentTimeMs()).toBe(-40);
    engine.play(1000);
    expect(clock.judgmentTimeMs()).toBe(960);
  });

  it.each([
    { beforeRate: 0.5, afterRate: 1, beforeJudgment: 3980, after20: 3990, after60: 4020 },
    { beforeRate: 1, afterRate: 0.25, beforeJudgment: 3960, after20: 3980, after60: 4005 },
  ])("L₀=40ms·곡 4000ms에서 $beforeRate→$afterRate 배속으로 바꾸면 J=$beforeJudgment 유지 후 20ms에 $after20·60ms에 $after60 ms다", ({ beforeRate, afterRate, beforeJudgment, after20, after60 }) => {
    const { engine, clock } = createClock();
    const expectClocks = (expected: number) => {
      expect(clock.judgmentTimeMs()).toBeCloseTo(expected);
      expect(clock.visualTimeMs()).toBeCloseTo(expected);
      expect(clock.toInputTimeMs(mockCtx.currentTime * 1000)).toBeCloseTo(expected);
    };
    engine.playbackRate = beforeRate;
    engine.play();
    mockCtx._advanceTime(4 / beforeRate);
    expectClocks(beforeJudgment);

    engine.playbackRate = afterRate;

    expectClocks(beforeJudgment);
    mockCtx._advanceTime(0.02);
    expectClocks(after20);
    mockCtx._advanceTime(0.02);
    expectClocks(4000);
    mockCtx._advanceTime(0.02);
    expectClocks(after60);
  });

  it.each([
    { inputOffsetMs: -200, handlerDelay: 0, atChange: 3760, after300: 4030 },
    { inputOffsetMs: 200, handlerDelay: 240, atChange: 3920, after300: 4110 },
    { inputOffsetMs: -1000, handlerDelay: 560, atChange: 2400, after300: 2700 },
  ])("L₀=40·입력 $inputOffsetMs·지연 $handlerDelay ms에서 1→0.5배속으로 바꾸면 입력=$atChange 유지 후 300ms 동안 단조 증가해 $after300 ms다", ({ inputOffsetMs, handlerDelay, atChange, after300 }) => {
    const { engine, clock } = createClock(inputOffsetMs);
    engine.play();
    mockCtx._advanceTime(4);
    const inputTime = () => clock.toInputTimeMs(mockCtx.currentTime * 1000 - handlerDelay);
    expect(inputTime()).toBeCloseTo(atChange);

    engine.playbackRate = 0.5;

    expect(inputTime()).toBeCloseTo(atChange);
    let previous = inputTime();
    for (let i = 0; i < 30; i++) {
      mockCtx._advanceTime(0.01);
      const current = inputTime();
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
    expect(previous).toBeCloseTo(after300);
  });

  it.each([
    { visualOffsetMs: -200, atChange: 3760, after300: 4030 },
    { visualOffsetMs: 20, atChange: 3980, after300: 4140 },
  ])("L₀=40·시각 $visualOffsetMs ms에서 1→0.5배속으로 바꾸면 V=$atChange 유지 후 300ms에 $after300 ms다", ({ visualOffsetMs, atChange, after300 }) => {
    const { engine, clock } = createClock(0, visualOffsetMs);
    engine.play();
    mockCtx._advanceTime(4);
    expect(clock.visualTimeMs()).toBeCloseTo(atChange);
    engine.playbackRate = 0.5;
    expect(clock.visualTimeMs()).toBeCloseTo(atChange);
    mockCtx._advanceTime(0.3);
    expect(clock.visualTimeMs()).toBeCloseTo(after300);
  });

  it("4000ms에서 1→0.5배속으로 바꾸고 핸들러가 100ms 늦어져도 timestamp=3990ms 입력은 3950ms다", () => {
    const { engine, clock } = createClock();
    engine.play();
    mockCtx._advanceTime(4);
    expect(clock.toInputTimeMs(3990)).toBeCloseTo(3950);
    engine.playbackRate = 0.5;
    mockCtx._advanceTime(0.1);
    expect(clock.toInputTimeMs(3990)).toBeCloseTo(3950);
  });

  it("L₀=40·입력과 시각 +200ms·지연 0에서 1→0.5배속으로 바꾸면 미래 외삽값은 4160→4080ms로 바뀐다", () => {
    const { engine, clock } = createClock(200, 200);
    engine.play();
    mockCtx._advanceTime(4);
    expect(clock.visualTimeMs()).toBeCloseTo(4160);
    expect(clock.toInputTimeMs(4000)).toBeCloseTo(4160);

    engine.playbackRate = 0.5;

    // +160ms 미래를 현재 배속으로 외삽하는 계약은 배속 변경 시 단조 증가와 양립하지 않는다.
    expect(clock.visualTimeMs()).toBeCloseTo(4080);
    expect(clock.toInputTimeMs(4000)).toBeCloseTo(4080);
  });

  it("0.5배속으로 play(4000)한 같은 시각에 1배속으로 바꿔도 J=3980ms를 유지하고 40ms 뒤 4000ms다", () => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.5;
    engine.play(4000);
    expect(clock.judgmentTimeMs()).toBeCloseTo(3980);
    engine.playbackRate = 1;
    expect(clock.judgmentTimeMs()).toBeCloseTo(3980);
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4000);
  });

  it.each([
    { rate: 0.5, judgment: 4080 }, { rate: 1, judgment: 4160 }, { rate: 2, judgment: 4320 },
  ])("$rate 배속·4000ms부터 200ms 재생 후 정지하면 10초 뒤에도 J=$judgment ms이고 재개 순간에도 같다", ({ rate, judgment }) => {
    const { engine, clock } = createClock();
    engine.playbackRate = rate;
    engine.play(4000);
    mockCtx._advanceTime(0.2);
    engine.pause();
    expect(clock.judgmentTimeMs()).toBeCloseTo(judgment);
    mockCtx._advanceTime(10);
    expect(clock.judgmentTimeMs()).toBeCloseTo(judgment);
    engine.resume();
    expect(clock.judgmentTimeMs()).toBeCloseTo(judgment);
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(judgment + 40 * rate);
  });

  it.each(["play", "playFadedSpan", "onended"])("%s·4000ms에서 0.5→1배속 변경 20ms 뒤 정지하면 J=3990ms를 10초간 유지하고 재개 20ms 뒤 4000ms다", mode => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.5;
    if (mode === "playFadedSpan") {
      engine.playFadedSpan({ fromMs: 0, fadeInUntilMs: 1000, fadeOutFromMs: 9000, toMs: 10000 });
    } else {
      if (mode === "onended") engine.loadBuffer(createMockBuffer(4));
      engine.play();
    }
    mockCtx._advanceTime(8);
    if (mode === "onended") mockCtx.createBufferSource.mock.results[0].value.onended!();
    engine.playbackRate = 1;
    mockCtx._advanceTime(0.02);
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    engine.pause();
    mockCtx._advanceTime(10);
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    engine.resume();
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    mockCtx._advanceTime(0.02);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4000);
    mockCtx._advanceTime(0.02);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4020);
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(mode === "onended" ? 1 : 2);
  });

  it("4020ms에서 정지 중 1→0.25배속으로 바꿔도 J=3990ms를 유지하고 재개 40ms 뒤 4020ms·그 뒤 40ms는 4030ms다", () => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.5;
    engine.play();
    mockCtx._advanceTime(8);
    engine.playbackRate = 1;
    mockCtx._advanceTime(0.02);
    engine.pause();
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    engine.playbackRate = 0.25;
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    mockCtx._advanceTime(10);
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    engine.resume();
    expect(clock.judgmentTimeMs()).toBeCloseTo(3990);
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4020);
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4030);
  });

  it("4020ms에서 정지 중 0.25→1배속으로 바꿔도 J=4010ms를 유지해 뒤로 가지 않는다", () => {
    const { engine, clock } = createClock();
    engine.playbackRate = 0.25;
    engine.play(4000);
    mockCtx._advanceTime(0.08);
    engine.pause();
    expect(clock.judgmentTimeMs()).toBeCloseTo(4010);
    engine.playbackRate = 1;
    expect(clock.judgmentTimeMs()).toBeCloseTo(4010);
    engine.resume();
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4020);
    mockCtx._advanceTime(0.04);
    expect(clock.judgmentTimeMs()).toBeCloseTo(4060);
  });

  it.each([
    { name: "play(2000)", start: (engine: AudioEngine) => engine.play(2000), judgment: 1980 },
    { name: "playFadedSpan(2000)", start: (engine: AudioEngine) => engine.playFadedSpan({
      fromMs: 2000, fadeInUntilMs: 3000, fadeOutFromMs: 5000, toMs: 6000,
    }), judgment: 1980 },
    { name: "playWithPreroll(-1000)", start: (engine: AudioEngine) => engine.playWithPreroll(-1000), judgment: -1020 },
    { name: "playWithPreroll(61000)", start: (engine: AudioEngine) => engine.playWithPreroll(61000), judgment: 60980 },
  ])("4000ms에서 1→0.5배속 변경 직후 $name으로 다시 시작하면 과거 이력을 지워 J=$judgment ms다", ({ start, judgment }) => {
    const { engine, clock } = createClock();
    engine.play();
    mockCtx._advanceTime(4);
    engine.playbackRate = 0.5;
    start(engine);
    expect(clock.judgmentTimeMs()).toBeCloseTo(judgment);
    expect(engine.positionMsAtRealOffset(-1000)).toBeCloseTo(engine.currentTimeMs - 500);
  });

  it.each([
    { name: "stop", reset: (engine: AudioEngine) => engine.stop() },
    { name: "loadBuffer", reset: (engine: AudioEngine) => engine.loadBuffer(createMockBuffer(60)) },
    { name: "setPlaybackRange", reset: (engine: AudioEngine) => engine.setPlaybackRange({ startTime: 10, endTime: 30, fadeInTime: 0, fadeOutTime: 0 }) },
  ])("4000ms에서 1→0.5배속 변경 후 $name하면 P=0·J=−20ms로 초기화하고 재개해도 J=−20ms다", ({ reset }) => {
    const { engine, clock } = createClock();
    engine.play();
    mockCtx._advanceTime(4);
    engine.playbackRate = 0.5;
    reset(engine);
    expect(engine.currentTimeMs).toBe(0);
    expect(clock.judgmentTimeMs()).toBe(-20);
    engine.resume();
    expect(clock.judgmentTimeMs()).toBe(-20);
  });

  it("10ms 간격으로 1000번 배속을 바꾸면 이력은 502개 이하이고 최근 5초의 모든 5ms 조회가 정확하다", () => {
    const { engine } = createClock();
    engine.play();
    // 보관을 하지 않는 독립 기준표: 매 10ms 구간을 적분해 곡 위치를 기록한다.
    const positions = [0];
    const rates = [1];
    for (let i = 1; i <= 1000; i++) {
      mockCtx._advanceTime(0.01);
      positions.push(positions[i - 1] + 10 * rates[i - 1]);
      const rate = i % 2 === 0 ? 1 : 0.5;
      rates.push(rate);
      engine.playbackRate = rate;
    }
    // 비공개 저장소의 크기만 확인해 시간 창 밖 이력이 누적되는 회귀를 잡는다.
    expect(engine['rateSegments'].length).toBeLessThanOrEqual(502);
    expect(engine.currentTimeMs).toBeCloseTo(7500);
    for (let offset = -5000; offset <= 0; offset += 5) {
      const target = 10000 + offset;
      const index = Math.floor(target / 10);
      const expected = positions[index] + (target - index * 10) * rates[index];
      expect(engine.positionMsAtRealOffset(offset)).toBeCloseTo(expected, 6);
    }
    expect(engine.positionMsAtRealOffset(200)).toBeCloseTo(7700);
  });

  it("같은 시각에 배속을 1000번 바꾸면 이력은 2개이고 −40ms 조회는 3960ms·+200ms 조회는 4200ms다", () => {
    const { engine } = createClock();
    engine.play();
    mockCtx._advanceTime(4);
    for (let i = 0; i < 1000; i++) engine.playbackRate = i % 2 === 0 ? 0.5 : 1;
    expect(engine['rateSegments'].length).toBe(2);
    expect(engine.positionMsAtRealOffset(-40)).toBeCloseTo(3960);
    expect(engine.positionMsAtRealOffset(200)).toBeCloseTo(4200);
  });

  it("1→0.5배속 변경 후 6초 지나면 이력은 1개이고 5초 전은 4500ms·보관 전 7초는 3500ms로 외삽한다", () => {
    const { engine } = createClock();
    engine.play();
    mockCtx._advanceTime(4);
    engine.playbackRate = 0.5;
    mockCtx._advanceTime(6);
    expect(engine.positionMsAtRealOffset(-5000)).toBeCloseTo(4500);
    expect(engine['rateSegments'].length).toBe(1);
    expect(engine.positionMsAtRealOffset(-7000)).toBeCloseTo(3500);
  });
});

describe("AudioEngine playbackRange", () => {
  it("setPlaybackRange(30~90초) 후 duration은 60000ms", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(120));

    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 0, fadeOutTime: 0 });

    expect(engine.duration).toBe(60000);
  });

  it("setPlaybackRange(30~90초) 후 play(0)는 source.start offset=30초,duration=60초", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(120));
    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 0, fadeOutTime: 0 });

    engine.play();

    const source = mockCtx.createBufferSource.mock.results[0].value;
    expect(source.start).toHaveBeenCalledWith(0, 30, 60);
  });

  it("setPlaybackRange(30~90초) 후 play(10000)는 source.start offset=40초,duration=50초", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(120));
    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 0, fadeOutTime: 0 });

    engine.play(10000);

    const source = mockCtx.createBufferSource.mock.results[0].value;
    expect(source.start).toHaveBeenCalledWith(0, 40, 50);
  });

  it("setPlaybackRange(30~90초) 후 벽시계 2초 경과 시 currentTimeMs는 2000ms", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(120));
    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 0, fadeOutTime: 0 });
    engine.play();

    mockCtx._advanceTime(2);

    expect(engine.currentTimeMs).toBe(2000);
  });

  it("fadeIn=1초,fadeOut=2초이면 source gain은 0→1 후 종료 2초 전부터 0으로 예약", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(120));
    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 1, fadeOutTime: 2 });

    engine.play();

    const sourceGain = mockCtx.createGain.mock.results[1].value;
    expect(sourceGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(sourceGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1);
    expect(sourceGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 58);
    expect(sourceGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 60);
  });
});

describe("AudioEngine 곡 끝 판정 대기", () => {
  it("1초 곡·r=2에서 50ms 늦은 onended를 받아도 P=1100ms를 유지하고 100ms 뒤 1300ms로 진행한다", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(1));
    engine.playbackRate = 2;
    engine.play();
    const source = mockCtx.createBufferSource.mock.results[0].value;
    mockCtx._advanceTime(0.55);
    expect(engine.currentTimeMs).toBe(1100);
    source.onended!();
    expect(engine.playing).toBe(false);
    expect(engine.currentTimeMs).toBe(1100);
    mockCtx._advanceTime(0.1);
    expect(engine.currentTimeMs).toBe(1300);
  });

  it.each([false, true])("onended 전달=%s·P=1200ms에 정지하면 10초간 고정되고 재개 100ms 뒤 1400ms이며 음원은 1번만 생성한다", ended => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(1));
    engine.playbackRate = 2;
    engine.play();
    mockCtx._advanceTime(0.6);
    if (ended) mockCtx.createBufferSource.mock.results[0].value.onended!();
    engine.pause();
    mockCtx._advanceTime(10);
    expect(engine.currentTimeMs).toBe(1200);
    engine.resume();
    expect(engine.currentTimeMs).toBe(1200);
    mockCtx._advanceTime(0.1);
    expect(engine.currentTimeMs).toBeCloseTo(1400);
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(engine.playing).toBe(false);
  });

  it("30~31초 구간 끝 뒤 P=1200ms에서 배속 1→2 변경 시 연속성을 유지하고 100ms 뒤 1400ms가 된다", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(60));
    engine.setPlaybackRange({ startTime: 30, endTime: 31, fadeInTime: 0, fadeOutTime: 0 });
    engine.play();
    mockCtx._advanceTime(1.2);
    mockCtx.createBufferSource.mock.results[0].value.onended!();
    engine.playbackRate = 2;
    expect(engine.currentTimeMs).toBe(1200);
    mockCtx._advanceTime(0.1);
    expect(engine.currentTimeMs).toBeCloseTo(1400);
    engine.stop();
    mockCtx._advanceTime(1);
    expect(engine.currentTimeMs).toBe(0);
  });
});

describe('AudioEngine 음악 준비 예약', () => {
  it.each([0.5, 1, 2])('배속 %s·L₀=20ms·목표0이면 곡0을 실제2980ms 뒤 예약하고 3000ms 뒤 J=0이다', rate => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10));
    engine.playbackRate = rate;
    mockCtx._advanceTime(7);
    engine.playWithPreroll(-2980 * rate);
    const source = mockCtx.createBufferSource.mock.results[0].value;
    expect(source.start).toHaveBeenCalledWith(9.98, 0, 10);
    expect(engine.currentTimeMs).toBeCloseTo(-2980 * rate);
    mockCtx._advanceTime(3);
    expect(engine.currentTimeMs - 20 * rate).toBeCloseTo(0);
  });

  it('L₀=20ms·2배속·목표1500이면 앞2230ms를 무음으로 예약하고 3초 뒤 J=1500이다', () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(10)); engine.playbackRate = 2;
    engine.playWithPreroll(1500 - 2980 * 2);
    expect(mockCtx.createBufferSource.mock.results[0].value.start).toHaveBeenCalledWith(2.23, 0, 10);
    mockCtx._advanceTime(3);
    expect(engine.currentTimeMs - 40).toBeCloseTo(1500);
  });

  it.each(['pause', 'stop', 'dispose'] as const)('무음 예약 후 %s하면 예약 source를 취소·연결 해제하고 시계도 멈춘다', async action => {
    const engine = new AudioEngine(); engine.loadBuffer(createMockBuffer(10));
    engine.playWithPreroll(-3000);
    const source = mockCtx.createBufferSource.mock.results[0].value;
    mockCtx._advanceTime(1);
    await engine[action]();
    const stoppedAt = engine.currentTimeMs;
    mockCtx._advanceTime(5);
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(engine.currentTimeMs).toBe(stoppedAt);
  });

  it('3초 예약을 1500ms 목표의 새 준비로 교체하면 이전 source를 취소하고 새 source 하나만 남긴다', () => {
    const engine = new AudioEngine(); engine.loadBuffer(createMockBuffer(10));
    engine.playWithPreroll(-3000);
    const first = mockCtx.createBufferSource.mock.results[0].value;
    mockCtx._advanceTime(1);
    engine.playWithPreroll(-1500);
    expect(first.stop).toHaveBeenCalledOnce(); expect(first.disconnect).toHaveBeenCalledOnce();
    expect(mockCtx.createBufferSource.mock.results[1].value.start).toHaveBeenCalledWith(2.5, 0, 10);
  });

  it('1초 음원 끝 뒤 P=1200부터 준비하면 source 없이 시계만 진행하며 100ms 뒤1300이다', () => {
    const engine = new AudioEngine(); engine.loadBuffer(createMockBuffer(1));
    engine.playWithPreroll(1200); mockCtx._advanceTime(0.1);
    expect(engine.currentTimeMs).toBeCloseTo(1300);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
  });

  it('4초 음원·2배속·L₀20ms에서 목표100000은 source 없이 P=94040부터3초 진행해 J=100000이다', () => {
    const engine = new AudioEngine(); engine.loadBuffer(createMockBuffer(4)); engine.playbackRate = 2;
    engine.playWithPreroll(94040); mockCtx._advanceTime(2.999);
    expect(engine.currentTimeMs - 40).toBeCloseTo(99998);
    mockCtx._advanceTime(0.001);
    expect(engine.currentTimeMs - 40).toBeCloseTo(100000);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
  });
});

describe("AudioEngine 옵저버 페이드 구간 재생", () => {
  /** 앞 준비 2000ms → 선택 구간 3000～8000ms → 뒤 정리 11000ms */
  const SPAN: FadedAudioSpan = { fromMs: 2000, fadeInUntilMs: 3000, fadeOutFromMs: 8000, toMs: 11000 };

  function createLoadedEngine(bufferSeconds = 60): AudioEngine {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(bufferSeconds));
    return engine;
  }

  function lastSource(): MockAudioSource {
    const results = mockCtx.createBufferSource.mock.results;
    return results[results.length - 1].value;
  }

  function masterGain(): MockGainNode {
    return mockCtx.createGain.mock.results[0].value;
  }

  /** source → sourceGain → (spanGain) → master 연결을 따라간다. */
  function chainOf(source: MockAudioSource): { sourceGain: MockGainNode; spanGain: MockGainNode | null } {
    const sourceGain = source.connect.mock.calls[0][0] as MockGainNode;
    const next = sourceGain.connect.mock.calls[0][0] as MockGainNode;
    if (next === masterGain()) return { sourceGain, spanGain: null };
    expect(next.connect).toHaveBeenCalledWith(masterGain());
    return { sourceGain, spanGain: next };
  }

  it("1배속·시각 5초에 구간 2000→3000→8000→11000ms를 재생하면 offset 2초·길이 9초로 시작하고 구간 gain은 5→6초 0→1, 11→14초 1→0이다", () => {
    const engine = createLoadedEngine();
    mockCtx._advanceTime(5);

    engine.playFadedSpan(SPAN);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 2, 9);
    const { spanGain } = chainOf(source);
    expect(spanGain).not.toBeNull();
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 5], [1, 11]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 6], [0, 14]]);
    expect(engine.playing).toBe(true);
    expect(engine.currentTimeMs).toBe(2000);
  });

  it("1배속·시각 5초에 9500ms부터 재생하면 offset 9.5초·길이 1.5초이고 gain 0.5에서 6.5초에 0으로 내린다", () => {
    const engine = createLoadedEngine();
    mockCtx._advanceTime(5);

    engine.playFadedSpan(SPAN, 9500);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 9.5, 1.5);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0.5, 5]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, 6.5]]);
    expect(engine.currentTimeMs).toBe(9500);
    expect(engine.playing).toBe(true);
  });

  it("시각 5초에 페이드 구간 끝 11000ms부터 재생하면 offset 11초·길이 0·gain 0이고 남은 ramp는 없다", () => {
    const engine = createLoadedEngine();
    mockCtx._advanceTime(5);

    engine.playFadedSpan(SPAN, 11000);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 11, 0);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 5]]);
    expect(spanGain!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(engine.currentTimeMs).toBe(11000);
  });

  it("0.5배속·시각 5초에 2000→3000→8000→11000ms 구간을 재생하면 source 길이는 버퍼 기준 9초 그대로이고 구간 gain은 실제 시간 7·17·23초에 예약된다", () => {
    const engine = createLoadedEngine();
    engine.playbackRate = 0.5;
    mockCtx._advanceTime(5);

    engine.playFadedSpan(SPAN);

    const source = lastSource();
    expect(source.playbackRate.value).toBe(0.5);
    expect(source.start).toHaveBeenCalledWith(0, 2, 9);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 5], [1, 17]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 7], [0, 23]]);
  });

  it("시각 4초·6000ms에서 0.5배속으로 바꾸면 source를 유지하고 gain을 4초에 1로 고정해 8→14초 1→0으로 다시 예약한다", () => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    const source = lastSource();
    const { spanGain } = chainOf(source);
    vi.clearAllMocks();
    mockCtx._advanceTime(4);

    engine.playbackRate = 0.5;

    expect(source.playbackRate.value).toBe(0.5);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
    expect(source.stop).not.toHaveBeenCalled();
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(spanGain!.gain.cancelScheduledValues.mock.calls).toEqual([[4]]);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[1, 4], [1, 8]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, 14]]);
    expect(spanGain!.gain.cancelScheduledValues.mock.invocationCallOrder[0])
      .toBeLessThan(spanGain!.gain.setValueAtTime.mock.invocationCallOrder[0]);
    expect(engine.currentTimeMs).toBe(6000);
    mockCtx._advanceTime(2);
    expect(engine.currentTimeMs).toBe(7000);
  });

  it("onended 미전달·11500ms에서 0.5배속으로 바꾸면 gain 0을 시각 9.5초에 고정하고 지난 페이드 ramp는 예약하지 않는다", () => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    const source = lastSource();
    const { spanGain } = chainOf(source);
    vi.clearAllMocks();
    mockCtx._advanceTime(9.5);

    engine.playbackRate = 0.5;

    expect(spanGain!.gain.cancelScheduledValues.mock.calls).toEqual([[9.5]]);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 9.5]]);
    expect(spanGain!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
    expect(engine.currentTimeMs).toBe(11500);
    mockCtx._advanceTime(1);
    expect(engine.currentTimeMs).toBe(12000);
  });

  it("play(2000) 후 4초에 0.5배속으로 바꾸면 spanGain 없이 gain 예약을 유지하고 2초 뒤 7000ms로 진행한다", () => {
    const engine = createLoadedEngine();
    engine.play(2000);
    const source = lastSource();
    const { sourceGain, spanGain } = chainOf(source);
    const master = masterGain();
    expect(spanGain).toBeNull();
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
    vi.clearAllMocks();
    mockCtx._advanceTime(4);

    engine.playbackRate = 0.5;

    expect(source.playbackRate.value).toBe(0.5);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    expect(mockCtx.createGain).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
    expect(source.stop).not.toHaveBeenCalled();
    for (const node of [sourceGain, master]) {
      expect(node.gain.cancelScheduledValues).not.toHaveBeenCalled();
      expect(node.gain.setValueAtTime).not.toHaveBeenCalled();
      expect(node.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    }
    expect(engine.currentTimeMs).toBe(6000);
    expect(engine.playing).toBe(true);
    mockCtx._advanceTime(2);
    expect(engine.currentTimeMs).toBe(7000);
  });

  it("곡 시작에 붙은 구간 0→0→5000→8000ms는 앞 준비가 없어 구간 gain을 1로 시작하고 페이드 인 ramp를 예약하지 않는다", () => {
    const engine = createLoadedEngine();

    engine.playFadedSpan({ fromMs: 0, fadeInUntilMs: 0, fadeOutFromMs: 5000, toMs: 8000 });

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 0, 8);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[1, 0], [1, 5]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, 8]]);
  });

  it("60초 곡 끝에 붙은 구간 52000→55000→60000→60000ms는 뒤 정리가 없어 페이드 아웃 없이 곡 끝까지 8초 재생한다", () => {
    const engine = createLoadedEngine();

    engine.playFadedSpan({ fromMs: 52000, fadeInUntilMs: 55000, fadeOutFromMs: 60000, toMs: 60000 });

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 52, 8);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 0]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 3]]);
  });

  it("재생 범위 30～90초(fadeIn 1초·fadeOut 2초)에서 구간 2000→11000ms는 offset 32초로 시작하고 sourceGain에 범위 페이드 56→58초 1→0을 그대로 예약한다", () => {
    const engine = createLoadedEngine(120);
    engine.setPlaybackRange({ startTime: 30, endTime: 90, fadeInTime: 1, fadeOutTime: 2 });

    engine.playFadedSpan(SPAN);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 32, 9);
    const { sourceGain, spanGain } = chainOf(source);
    expect(sourceGain.gain.setValueAtTime.mock.calls).toEqual([[1, 0], [1, 56]]);
    expect(sourceGain.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, 58]]);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0, 0], [1, 6]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 1], [0, 9]]);
  });

  it("duration이 59899.99999999999ms일 때 toMs=59900으로 재생하면 곡 끝으로 잘라 페이드 아웃을 예약한다", () => {
    const engine = createLoadedEngine(59.89999999999999);
    expect(engine.duration).toBe(59899.99999999999);

    engine.playFadedSpan({ ...SPAN, toMs: 59900 });

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 2, 57.89999999999999);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 1], [0, 57.89999999999999]]);
  });

  it.each([60000, 60000.5])("60000ms 곡에서 toMs=%s로 재생하면 source 길이와 페이드 끝을 58초로 제한한다", toMs => {
    const engine = createLoadedEngine();

    engine.playFadedSpan({ ...SPAN, toMs });

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 2, 58);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 1], [0, 58]]);
  });

  it.each([2000, 60000.5])("60000ms 곡에서 fromMs=%s·나머지 경계와 startMs=60000.5로 재생하면 offset 60초·길이 0·gain 1이고 ramp는 없다", fromMs => {
    const engine = createLoadedEngine();
    const span: FadedAudioSpan = {
      fromMs, fadeInUntilMs: 60000.5, fadeOutFromMs: 60000.5, toMs: 60000.5,
    };

    engine.playFadedSpan(span, 60000.5);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 60, 0);
    expect(engine.currentTimeMs).toBe(60000);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[1, 0]]);
    expect(spanGain!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(span).toEqual({ fromMs, fadeInUntilMs: 60000.5, fadeOutFromMs: 60000.5, toMs: 60000.5 });
  });

  it("60000ms 곡 끝에서 startMs=60000.5로 재생하면 시작 위치를 60000ms로 잘라 offset 60초·길이 0·gain 1로 시작한다", () => {
    const engine = createLoadedEngine();

    engine.playFadedSpan({ ...SPAN, fadeOutFromMs: 60000, toMs: 60000 }, 60000.5);

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, 60, 0);
    expect(engine.currentTimeMs).toBe(60000);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[1, 0]]);
    expect(spanGain!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("60000ms 곡에서 startMs=60000.501로 재생하면 0.5ms 허용 오차를 넘어 RangeError를 던진다", () => {
    const engine = createLoadedEngine();

    expect(() => engine.playFadedSpan({ ...SPAN, toMs: 60000.5 }, 60000.501)).toThrow(RangeError);

    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    expect(engine.currentTimeMs).toBe(0);
    expect(engine.playing).toBe(false);
  });

  it.each([[5000, 5], [60000, 60]])("네 경계가 모두 %sms인 구간을 재생하면 해당 위치에서 길이 0·gain 1로 시작하고 ramp는 없다", (positionMs, offset) => {
    const engine = createLoadedEngine();

    engine.playFadedSpan({
      fromMs: positionMs, fadeInUntilMs: positionMs, fadeOutFromMs: positionMs, toMs: positionMs,
    });

    const source = lastSource();
    expect(source.start).toHaveBeenCalledWith(0, offset, 0);
    const { spanGain } = chainOf(source);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[1, 0]]);
    expect(spanGain!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(engine.currentTimeMs).toBe(positionMs);
  });

  it("음원을 불러오기 전 playFadedSpan하면 No audio loaded 오류를 던진다", () => {
    expect(() => new AudioEngine().playFadedSpan(SPAN)).toThrow("No audio loaded");
  });

  it.each([
    ["fromMs가 음수 -1", { ...SPAN, fromMs: -1 }],
    ["toMs 60001이 곡 길이 60000ms 초과", { ...SPAN, toMs: 60001 }],
    ["toMs 60000.501이 곡 길이 60000ms보다 0.501ms 뒤", { ...SPAN, toMs: 60000.501 }],
    ["fadeInUntilMs 1000이 fromMs 2000보다 앞", { ...SPAN, fadeInUntilMs: 1000 }],
    ["fadeOutFromMs 2500이 fadeInUntilMs 3000보다 앞", { ...SPAN, fadeOutFromMs: 2500 }],
    ["toMs 7000이 fadeOutFromMs 8000보다 앞", { ...SPAN, toMs: 7000 }],
    ["fadeInUntilMs가 NaN", { ...SPAN, fadeInUntilMs: NaN }],
    ["toMs가 Infinity", { ...SPAN, toMs: Infinity }],
  ])("%s이면 RangeError를 던지고 재생 중인 구간의 source·시계·끝 위치를 그대로 둔다", (_, invalid) => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime(0.5);
    const source = lastSource();

    expect(() => engine.playFadedSpan(invalid)).toThrow(RangeError);

    expect(source.stop).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(engine.playing).toBe(true);
    expect(engine.currentTimeMs).toBe(2500);
    engine.pause();
    engine.resume();
    expect(lastSource().start).toHaveBeenCalledWith(0, 2.5, 8.5);
  });

  it.each([1999, 11001, NaN, Infinity, -Infinity])("2000～11000ms 페이드 구간에서 startMs=%s로 재생하면 RangeError를 던지고 기존 2500ms 재생을 유지한다", startMs => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime(0.5);
    const source = lastSource();

    expect(() => engine.playFadedSpan(SPAN, startMs)).toThrow(RangeError);

    expect(source.stop).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(engine.currentTimeMs).toBe(2500);
    expect(engine.playing).toBe(true);
    engine.pause();
    engine.resume();
    expect(lastSource().start).toHaveBeenCalledWith(0, 2.5, 8.5);
  });

  it("구간 끝 11000ms에서 source가 끝나면 playing=false가 되고 시계는 1초 뒤 12000ms로 계속 진행한다", () => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);

    mockCtx._advanceTime(9);
    lastSource().onended!();

    expect(engine.playing).toBe(false);
    expect(engine.currentTimeMs).toBe(11000);
    mockCtx._advanceTime(1);
    expect(engine.currentTimeMs).toBe(12000);
  });

  it("페이드 인 중 2500ms(gain 0.5)에서 정지하고 시각 10.5초에 재개하면 offset 2.5초·길이 8.5초로 같은 구간을 잇고 gain 0.5→1(11초)·16→19초 1→0을 예약한다", () => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime(0.5);
    engine.pause();
    mockCtx._advanceTime(10);

    engine.resume();

    const resumed = lastSource();
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(2);
    expect(resumed.start).toHaveBeenCalledWith(0, 2.5, 8.5);
    const { spanGain } = chainOf(resumed);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0.5, 10.5], [1, 16]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 11], [0, 19]]);
    expect(engine.currentTimeMs).toBe(2500);
  });

  it("페이드 아웃 중 9500ms(gain 0.5)에서 정지 후 바로 재개하면 gain 0.5에서 시작해 1.5초 동안 0으로 내리고 구간 끝 11000ms에서 멈춘다", () => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime(7.5);
    engine.pause();

    engine.resume();

    const resumed = lastSource();
    expect(resumed.start).toHaveBeenCalledWith(0, 9.5, 1.5);
    const { spanGain } = chainOf(resumed);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual([[0.5, 7.5]]);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, 9]]);
  });

  it.each([
    { positionMs: 3000, offset: 3, duration: 8, setValues: [[1, 10], [1, 15]], endAt: 18 },
    { positionMs: 8000, offset: 8, duration: 3, setValues: [[1, 10]], endAt: 13 },
  ])("페이드 경계 $positionMs ms에서 정지 후 시각 10초에 재개하면 gain 1로 시작해 $endAt 초에 0으로 내리고 1로 올리는 ramp는 없다", ({ positionMs, offset, duration, setValues, endAt }) => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime((positionMs - SPAN.fromMs) / 1000);
    engine.pause();
    mockCtx._advanceTime(10 - mockCtx.currentTime);

    engine.resume();

    const resumed = lastSource();
    expect(resumed.start).toHaveBeenCalledWith(0, offset, duration);
    const { spanGain } = chainOf(resumed);
    expect(spanGain!.gain.setValueAtTime.mock.calls).toEqual(setValues);
    expect(spanGain!.gain.linearRampToValueAtTime.mock.calls).toEqual([[0, endAt]]);
    expect(engine.currentTimeMs).toBe(positionMs);
  });

  it.each([false, true])("onended 전달=%s·구간 끝 11000ms 뒤 11500ms에서 정지 후 재개하면 source를 다시 만들지 않고 시계만 0.5초 뒤 12000ms로 진행한다", ended => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    mockCtx._advanceTime(9.5);
    if (ended) lastSource().onended!();
    engine.pause();

    engine.resume();

    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(engine.playing).toBe(false);
    mockCtx._advanceTime(0.5);
    expect(engine.currentTimeMs).toBe(12000);
  });

  it.each([false, true])("onended 전달=%s·구간 끝 뒤 12000ms에서 다시 재생하고 이전 onended가 늦게 와도 새 source의 2000ms 재생을 유지한다", ended => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    const first = lastSource();
    const firstSpanGain = chainOf(first).spanGain!;
    const firstEnded = first.onended!;
    mockCtx._advanceTime(10);
    if (ended) firstEnded();

    engine.playFadedSpan(SPAN);

    expect(first.stop).toHaveBeenCalledTimes(ended ? 0 : 1);
    expect(first.onended).toBeNull();
    expect(firstSpanGain.disconnect).toHaveBeenCalled();
    const replayed = lastSource();
    const { sourceGain, spanGain } = chainOf(replayed);
    expect(replayed).not.toBe(first);
    expect(replayed.start).toHaveBeenCalledWith(0, 2, 9);

    firstEnded();

    expect(replayed.stop).not.toHaveBeenCalled();
    expect(replayed.disconnect).not.toHaveBeenCalled();
    expect(sourceGain.disconnect).not.toHaveBeenCalled();
    expect(spanGain!.disconnect).not.toHaveBeenCalled();
    expect(engine.currentTimeMs).toBe(2000);
    expect(engine.playing).toBe(true);
    mockCtx._advanceTime(0.25);
    engine.pause();
    engine.resume();
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(3);
    expect(lastSource().start).toHaveBeenCalledWith(0, 2.25, 8.75);
  });

  it("구간 없이 play(4000)하면 gain 노드는 master·sourceGain 2개뿐이고 sourceGain을 master에 바로 연결해 곡 끝까지 56초 재생한다", () => {
    const engine = createLoadedEngine();

    engine.play(4000);

    const source = lastSource();
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
    expect(chainOf(source).spanGain).toBeNull();
    expect(source.start).toHaveBeenCalledWith(0, 4, 56);
  });

  it.each([
    ["play(4000)", (engine: AudioEngine) => engine.play(4000)],
    ["playWithPreroll(-1000)", (engine: AudioEngine) => engine.playWithPreroll(-1000)],
    ["stop 후 resume", (engine: AudioEngine) => { engine.stop(); engine.resume(); }],
    ["loadBuffer 후 resume", (engine: AudioEngine) => { engine.loadBuffer(createMockBuffer(60)); engine.resume(); }],
    ["setPlaybackRange(null) 후 resume", (engine: AudioEngine) => { engine.setPlaybackRange(null); engine.resume(); }],
  ])("페이드 구간 재생 1초 뒤 %s하면 구간을 지워 구간 gain 없이 재생하고, 12초 뒤 구간 끝을 지나 정지·재개해도 곡 끝 60초까지 잇는다", (_, act) => {
    const engine = createLoadedEngine();
    engine.playFadedSpan(SPAN);
    const spanGain = chainOf(lastSource()).spanGain!;
    mockCtx._advanceTime(1);

    act(engine);

    expect(spanGain.disconnect).toHaveBeenCalled();
    expect(chainOf(lastSource()).spanGain).toBeNull();
    mockCtx._advanceTime(12);
    engine.pause();
    const pausedSeconds = engine.currentTimeMs / 1000;
    expect(pausedSeconds).toBeGreaterThanOrEqual(SPAN.toMs / 1000);
    engine.resume();
    const resumed = lastSource();
    expect(resumed.start).toHaveBeenCalledWith(0, pausedSeconds, 60 - pausedSeconds);
    expect(chainOf(resumed).spanGain).toBeNull();
  });
});

// Node 환경에서 실제 DOM/오디오 장치 없이 element의 제어·이벤트·공식 위치를 모사한다.
class FakeAudioElement extends EventTarget {
  preload = ''; preservesPitch?: boolean = false;
  src = ''; readyState = 2; error: { code: number } | null = null; ended = false;
  position = 0; positionReads = 0; rate = 1;
  onended: (() => void) | null = null;
  operations: string[] = [];
  get currentTime() { this.positionReads++; return this.position; }
  set currentTime(value: number) { this.operations.push(`seek:${value}`); this.position = value; this.ended = false; }
  get playbackRate() { return this.rate; }
  set playbackRate(value: number) { this.operations.push(`rate:${value}`); this.rate = value; }
  play = vi.fn(async () => { this.operations.push('play'); });
  pause = vi.fn(() => { this.operations.push('pause'); });
  load = vi.fn(() => { this.operations.push('load'); });
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
}

describe('AudioEngine pitch 보존 media 재생', () => {
  let element: FakeAudioElement;
  const engines: AudioEngine[] = [];
  let blobs: Blob[];
  beforeEach(() => {
    element = new FakeAudioElement(); blobs = [];
    vi.stubGlobal('navigator', { userAgent: '' });
    vi.stubGlobal('Audio', vi.fn(function () { return element; }));
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      blobs.push(blob as Blob); return `blob:audio-${blobs.length}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(async () => {
    for (const engine of engines.splice(0)) await engine.dispose();
    vi.unstubAllGlobals();
  });
  function pcmBuffer(seconds = 10): AudioBuffer {
    return { duration: seconds, sampleRate: 1000, numberOfChannels: 1, length: seconds * 1000,
      getChannelData: () => new Float32Array(seconds * 1000).fill(0.5) } as unknown as AudioBuffer;
  }
  function create(): AudioEngine {
    const engine = new AudioEngine({ preservePitch: true }); engines.push(engine);
    engine.loadBuffer(pcmBuffer()); return engine;
  }
  function spanGain(): MockGainNode { return mockCtx.createGain.mock.results.at(-1)!.value; }
  function advance(seconds: number, mediaSeconds: number) {
    mockCtx._advanceTime(seconds); element.position = mediaSeconds;
  }
  const span = { fromMs: 1000, fadeInUntilMs: 2000, fadeOutFromMs: 4000, toMs: 5000 };

  describe('Chromium 출력 선행 보정', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { userAgent: 'HeadlessChrome/145.0.7632.6' });
    });

    it.each([
      [0.25, 39.7], [0.5, 31.4], [1, 0],
    ])('%s배속 play(1000)은 첫 P를 1000+%sms에 두고 element는 1000ms부터 재생한다', (rate, leadMs) => {
      const engine = create(); engine.playbackRate = rate; engine.play(1000);
      expect(engine.currentTimeMs).toBeCloseTo(1000 + leadMs);
      expect(engine.positionMsAtRealOffset(-100)).toBeCloseTo(1000 + leadMs - 100 * rate);
      expect(element.position).toBe(1);
      advance(0.02, 1 + 0.02 * rate);
      expect(engine.currentTimeMs).toBeCloseTo(element.position * 1000 + leadMs);
    });

    it('1→0.5배속 변경은 P·J를 유지하고 6초 뒤 element+31.4ms의 2.05ms 이내로 수렴한다', () => {
      const engine = create(); engine.play(1000);
      const before = engine.currentTimeMs;
      const past = engine.positionMsAtRealOffset(-30);
      engine.playbackRate = 0.5;
      expect(engine.currentTimeMs).toBe(before);
      expect(engine.positionMsAtRealOffset(-30)).toBe(past);
      expect(spanGain().gain.setValueAtTime.mock.lastCall![1]).toBeCloseTo(17.9372);
      let previous = before;
      let previousPast = past;
      for (let i = 1; i <= 600; i++) {
        advance(0.01, 1 + i * 0.005);
        const position = engine.currentTimeMs;
        const judgment = engine.positionMsAtRealOffset(-30);
        expect(position).toBeGreaterThanOrEqual(previous);
        expect(position - previous).toBeLessThanOrEqual(5.25 + 1e-9);
        expect(judgment).toBeGreaterThanOrEqual(previousPast);
        previous = position; previousPast = judgment;
      }
      expect(Math.abs(previous - element.position * 1000 - 31.4)).toBeLessThan(2.05);
      expect(engine.playbackRate).toBe(0.5); expect(element.playbackRate).toBe(0.5);
    });

    it('0.25배속 2039.7ms에서 pause 후 1배속 resume은 P·J를 보존하고 J가 뒤로 가지 않는다', async () => {
      const engine = create(); mockCtx.outputLatency = 0.03;
      const ready = engine.prepareForPlayback();
      await vi.advanceTimersByTimeAsync(100); await ready;
      const clock = new GameClock(engine, { inputOffsetMs: 0, visualOffsetMs: 0 });
      engine.playbackRate = 0.25; engine.play(1000);
      advance(4, 2); engine.pause();
      const position = engine.currentTimeMs;
      const judgment = clock.judgmentTimeMs();
      expect(position).toBeCloseTo(2039.7);
      expect(judgment).toBeCloseTo(2032.2);
      engine.playbackRate = 1;
      advance(10, 2); engine.resume();
      expect(engine.currentTimeMs).toBe(position);
      expect(clock.judgmentTimeMs()).toBeCloseTo(judgment);
      let previous = judgment;
      const mediaStart = element.position;
      for (let i = 1; i <= 100; i++) {
        advance(0.01, mediaStart + i * 0.01);
        const next = clock.judgmentTimeMs();
        expect(next).toBeGreaterThanOrEqual(previous);
        previous = next;
      }
    });

    it('0.5배속 pause·resume은 P=1281.4ms를 유지하고 새 play(1000)은 P=1031.4ms로 시작한다', () => {
      const engine = create(); engine.playbackRate = 0.5; engine.play(1000);
      advance(0.5, 1.25); engine.pause();
      const past = engine.positionMsAtRealOffset(-30);
      expect(engine.currentTimeMs).toBeCloseTo(1281.4);
      advance(10, 1.25); engine.resume();
      expect(engine.currentTimeMs).toBeCloseTo(1281.4);
      expect(engine.positionMsAtRealOffset(-30)).toBeCloseTo(past);
      engine.play(1000);
      expect(engine.currentTimeMs).toBeCloseTo(1031.4);
      expect(engine.positionMsAtRealOffset(-30)).toBeCloseTo(1016.4);
    });

    it('0.25배속에서 첫 resume과 stop 뒤 resume은 새 앵커 P=39.7ms로 시작한다', () => {
      const engine = create(); engine.playbackRate = 0.25;
      engine.resume();
      expect(engine.currentTimeMs).toBeCloseTo(39.7);
      expect(element.position).toBe(0);
      advance(1, 0.25); engine.stop(); engine.resume();
      expect(engine.currentTimeMs).toBeCloseTo(39.7);
      expect(engine.positionMsAtRealOffset(-100)).toBeCloseTo(14.7);
      expect(element.position).toBe(0);
    });

    it('0.5배속 span 1000～5000ms는 보정한 끝을 7.9372초에 예약한다', () => {
      const engine = create(); engine.playbackRate = 0.5; engine.playFadedSpan(span);
      const gain = spanGain().gain;
      expect(gain.setValueAtTime.mock.lastCall![0]).toBe(0);
      expect(gain.setValueAtTime.mock.lastCall![1]).toBeCloseTo(7.9372);
      expect(gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(1.9372);
      expect(gain.linearRampToValueAtTime.mock.calls[1][1]).toBeCloseTo(7.9372);
    });

    it('0.5배속에서 P<5000ms여도 element=4980ms에 lead를 더한 5011.4ms가 span 끝을 지나 멈춘다', () => {
      const engine = create(); engine.playbackRate = 0.5; engine.playFadedSpan(span);
      advance(7.8, 4.96);
      expect(engine.currentTimeMs).toBeCloseTo(4931.4);
      const gain = spanGain().gain;
      expect(gain.setValueAtTime.mock.lastCall![1]).toBeCloseTo(7.8172);
      advance(0.02, 4.98);
      expect(engine.currentTimeMs).toBeLessThan(5000);
      expect(engine.playing).toBe(false);
      expect(element.pause).toHaveBeenCalled();
    });

    it('0.5배속 span을 4980ms부터 시작하면 P=5011.4ms이고 element를 즉시 멈춘다', () => {
      const engine = create(); engine.playbackRate = 0.5; engine.playFadedSpan(span, 4980);
      expect(engine.currentTimeMs).toBeCloseTo(5011.4);
      expect(engine.playing).toBe(false);
      expect(spanGain().gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    });

    it('Firefox 0.5배속 play(1000)은 P=1000ms이고 2초 뒤 element와 같은 2000ms다', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Gecko/20100101 Firefox/145.0' });
      const engine = create(); engine.playbackRate = 0.5; engine.play(1000);
      expect(engine.currentTimeMs).toBe(1000);
      advance(2, 2); expect(engine.currentTimeMs).toBe(2000);
    });

    it('Chromium 일반 경로의 0.5배속 play(1000)은 P=1000ms이고 2초 뒤 2000ms다', () => {
      const engine = new AudioEngine(); engines.push(engine); engine.loadBuffer(pcmBuffer());
      engine.playbackRate = 0.5; engine.play(1000);
      expect(engine.currentTimeMs).toBe(1000);
      advance(2, 2); expect(engine.currentTimeMs).toBe(2000);
      expect(Audio).not.toHaveBeenCalled();
      expect(mockCtx.createBufferSource.mock.results[0].value.start).toHaveBeenCalledWith(0, 1, 9);
    });
  });

  it('기본 엔진으로 1000ms를 재생하면 Audio element·WAV URL은 0개이고 기존 buffer source 1개를 쓴다', () => {
    const engine = new AudioEngine(); engines.push(engine); engine.loadBuffer(pcmBuffer()); engine.play(1000);
    expect(Audio).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockCtx.createMediaElementSource).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalledOnce();
    expect(mockCtx.createBufferSource.mock.results[0].value.start).toHaveBeenCalledWith(0, 1, 9);
  });

  it('pitch 보존 엔진을 2회 재생해도 element·media source는 각 1개이고 source→span→master gain으로 연결한다', () => {
    const engine = create(); engine.masterVolume = 0.4; engine.play(); engine.play(1000);
    expect(element.preload).toBe('auto'); expect(element.preservesPitch).toBe(true);
    expect(Audio).toHaveBeenCalledOnce(); expect(mockCtx.createMediaElementSource).toHaveBeenCalledExactlyOnceWith(element);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
    const source = mockCtx.createMediaElementSource.mock.results[0].value;
    const sourceGain = source.connect.mock.lastCall![0] as MockGainNode;
    const master = mockCtx.createGain.mock.results[0].value;
    expect(sourceGain.connect).toHaveBeenCalledWith(spanGain());
    expect(spanGain().connect).toHaveBeenCalledWith(master); expect(master.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(engine.masterVolume).toBe(0.4);
  });

  it.each(['mozPreservesPitch', 'webkitPreservesPitch'] as const)('표준 속성이 없고 %s=false이면 엔진 생성 때 true로 바꾼다', property => {
    delete element.preservesPitch;
    Object.defineProperty(element, property, { value: false, writable: true });
    create(); expect(Reflect.get(element, property)).toBe(true); expect('preservesPitch' in element).toBe(false);
  });

  it('표준 preservesPitch=false와 mozPreservesPitch=false가 함께 있으면 표준만 true로 바꾼다', () => {
    Object.defineProperty(element, 'mozPreservesPitch', { value: false, writable: true });
    create(); expect(element.preservesPitch).toBe(true); expect(Reflect.get(element, 'mozPreservesPitch')).toBe(false);
  });

  it('10초 음원을 2～6초로 자르고 play(1000)하면 4초 WAV의 1초를 찾아 원본 3초부터 재생한다', async () => {
    const engine = create(); engine.setPlaybackRange({ startTime: 2, endTime: 6, fadeInTime: 0, fadeOutTime: 0 });
    const view = new DataView(await blobs.at(-1)!.arrayBuffer());
    expect(view.getUint32(40, true)).toBe(8000); expect(engine.duration).toBe(4000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
    element.operations = []; engine.play(1000);
    expect(element.operations).toEqual(['pause', 'rate:1', 'seek:1', 'play']);
    expect(engine.currentTimeMs).toBe(1000);
  });

  it('0.5배속 span 1000～5000ms를 500ms 재생 후 pause·resume·stop하면 1250ms를 잇고 마지막 seek는 0이다', () => {
    const engine = create(); engine.playbackRate = 0.5; element.operations = [];
    engine.playFadedSpan(span);
    expect(element.operations).toEqual(['pause', 'rate:0.5', 'seek:1', 'play']);
    expect(spanGain().gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 2], [0, 8]]);
    advance(0.5, 1.25); engine.pause();
    expect(engine.currentTimeMs).toBe(1250); expect(engine.playing).toBe(false);
    advance(10, 1.25); expect(engine.currentTimeMs).toBe(1250);
    element.operations = []; engine.resume();
    expect(element.operations).toEqual(['pause', 'rate:0.5', 'seek:1.25', 'play']);
    expect(engine.currentTimeMs).toBe(1250); expect(engine.playing).toBe(true);
    engine.stop(); expect(element.operations.slice(-2)).toEqual(['pause', 'seek:0']);
    expect(engine.currentTimeMs).toBe(0); expect(engine.playing).toBe(false);
  });

  it('1배속 2000ms에서 0.25배속으로 바꾸면 element는 즉시 0.25이고 400ms 뒤 곡 위치는 2100ms다', () => {
    const engine = create(); engine.playFadedSpan(span); advance(1, 2);
    const before = engine.currentTimeMs; const calls = element.play.mock.calls.length;
    engine.playbackRate = 0.25;
    expect(element.playbackRate).toBe(0.25); expect(engine.playbackRate).toBe(0.25);
    expect(engine.currentTimeMs).toBe(before); expect(element.play).toHaveBeenCalledTimes(calls);
    expect(spanGain().gain.setValueAtTime).toHaveBeenLastCalledWith(0, 13);
    advance(0.4, 2.1); expect(engine.currentTimeMs).toBeCloseTo(2100);
    expect(engine.positionMsAtRealOffset(-500)).toBeCloseTo(1900);
  });

  it.each([4000, 5000])('span fadeOutFrom=%sms·to=5000ms이면 gain은 5초에 0이며 늦은 5.1초 query가 element를 멈춘다', fadeOutFromMs => {
    const engine = create(); engine.playFadedSpan({ fromMs: 0, fadeInUntilMs: 0, fadeOutFromMs, toMs: 5000 });
    const gain = spanGain(); expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 5);
    advance(5.1, 5.1); const pauses = element.pause.mock.calls.length;
    expect(engine.positionMsAtRealOffset(0)).toBeCloseTo(5100);
    expect(element.pause).toHaveBeenCalledTimes(pauses + 1); expect(engine.playing).toBe(false);
    expect(gain.disconnect).toHaveBeenCalledOnce();
    advance(0.1, 5.1); expect(engine.currentTimeMs).toBeCloseTo(5200);
  });

  it('to=5000ms부터 재생하면 시작 gain을 같은 시각 0으로 예약하고 element는 즉시 멈춘다', () => {
    const engine = create(); engine.playFadedSpan(span, 5000);
    expect(spanGain().gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    expect(engine.playing).toBe(false); advance(0.1, 5); expect(engine.currentTimeMs).toBe(5100);
  });

  it('5000ms 끝 직전 element가 20ms 앞서면 모든 span gain 예약은 element의 5초 도달 시각 이하에 머문다', () => {
    const engine = create(); engine.playFadedSpan(span);
    advance(3.9, 4.92); const gain = spanGain();
    gain.gain.setValueAtTime.mockClear(); gain.gain.linearRampToValueAtTime.mockClear();
    expect(engine.currentTimeMs).toBeCloseTo(4900);
    const endAt = 3.98;
    for (const [, time] of [...gain.gain.setValueAtTime.mock.calls, ...gain.gain.linearRampToValueAtTime.mock.calls]) {
      expect(time).toBeLessThanOrEqual(endAt + 1e-9);
    }
    expect(gain.gain.setValueAtTime.mock.lastCall![0]).toBe(0);
    advance(0.081, 5.001); engine.currentTimeMs;
    expect(engine.playing).toBe(false);
  });

  it('300ms 지연으로 시계가 동결되면 페이드는 유한한 시각만 예약하고 pause·resume 직전 300ms 위치를 보존한다', () => {
    const engine = create(); engine.playFadedSpan({ fromMs: 0, fadeInUntilMs: 1000, fadeOutFromMs: 4000, toMs: 5000 });
    advance(0.3, 0); expect(engine.currentTimeMs).toBe(300);
    const gain = spanGain();
    for (const [, time] of [...gain.gain.setValueAtTime.mock.calls, ...gain.gain.linearRampToValueAtTime.mock.calls]) {
      expect(Number.isFinite(time)).toBe(true);
    }
    engine.pause(); const past = engine.positionMsAtRealOffset(-20);
    advance(1, 0); engine.resume();
    expect(engine.currentTimeMs).toBe(300); expect(engine.positionMsAtRealOffset(-20)).toBeCloseTo(past);
    expect(element.position).toBe(0.3);
  });

  it('element가 300ms 뒤처져 동결한 뒤 ended가 오면 시계는 1배속으로 계속 돌고 pause·resume은 play를 추가하지 않는다', () => {
    const engine = create(); engine.play(); advance(0.3, 0);
    expect(engine.currentTimeMs).toBe(300); advance(0.1, 0); expect(engine.currentTimeMs).toBe(300);
    element.ended = true; element.onended!(); expect(engine.playing).toBe(false);
    advance(0.1, 0); expect(engine.currentTimeMs).toBeCloseTo(400);
    engine.pause(); advance(10, 0); engine.resume(); advance(0.1, 0);
    expect(engine.currentTimeMs).toBeCloseTo(500); expect(element.play).toHaveBeenCalledOnce();
  });

  it('element가 20ms 뒤처져 보정 중이어도 P·과거 조회는 연속이고 getter·element 배속은 1을 유지한다', () => {
    const engine = create(); engine.play(1000);
    advance(0.02, 1); const first = engine.currentTimeMs;
    expect(first).toBe(1020); expect(engine.positionMsAtRealOffset(-10)).toBeCloseTo(1010);
    advance(0.02, 1.02); const second = engine.currentTimeMs;
    expect(second).toBeGreaterThan(first); expect(second).toBeLessThan(1040);
    expect(engine.positionMsAtRealOffset(-20)).toBeCloseTo(first);
    expect(engine.positionMsAtRealOffset(0)).toBeCloseTo(second);
    expect(engine.playbackRate).toBe(1); expect(element.playbackRate).toBe(1);
  });

  it('300ms 시작 지연으로 동결한 뒤 element가 따라잡으면 점프 없이 재개하고 GameClock 과거 조회도 뒤로 가지 않는다', () => {
    const engine = create(); engine.play(1000);
    let previous = 1000; let previousPast = 970;
    for (let i = 1; i <= 200; i++) {
      advance(0.01, 1 + Math.max(0, i * 10 - 300) / 1000);
      const position = engine.currentTimeMs; const past = engine.positionMsAtRealOffset(-30);
      expect(position).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(position - previous).toBeLessThanOrEqual(10.5 + 1e-9);
      expect(past).toBeGreaterThanOrEqual(previousPast - 1e-9);
      previous = position; previousPast = past;
    }
    expect(Math.abs(previous - element.position * 1000)).toBeLessThan(3);
  });

  it('10ms 간격으로 1000회 보정하면 이력은 502개 이하이며 같은 AudioContext 시각의 query 3회는 element를 1회만 읽는다', () => {
    const engine = create(); engine.loadBuffer(pcmBuffer(60)); engine.play();
    for (let i = 1; i <= 1000; i++) {
      advance(0.01, i * 0.01 + (i % 2 ? 0.02 : -0.02));
      engine.currentTimeMs;
    }
    expect(engine['rateSegments'].length).toBeLessThanOrEqual(502);
    advance(0.02, 10.02); element.positionReads = 0;
    engine.currentTimeMs; engine.positionMsAtRealOffset(-30); engine.positionMsAtRealOffset(10);
    expect(element.positionReads).toBe(1);
  });

  it('media 준비가 100ms 뒤에도 loadeddata 전이면 대기하고 readyState=2 이벤트 뒤 L₀=10ms로 끝난다', async () => {
    const engine = create(); element.readyState = 0; mockCtx.outputLatency = 0.01;
    const ready = engine.prepareForPlayback(); const completed = vi.fn(); void ready.then(completed);
    expect(engine.prepareForPlayback()).toBe(ready);
    await vi.advanceTimersByTimeAsync(100); expect(completed).not.toHaveBeenCalled();
    element.readyState = 2; element.dispatchEvent(new Event('loadeddata')); await ready;
    expect(completed).toHaveBeenCalledOnce(); expect(engine.getOutputLatencyMs()).toBe(10);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loadeddata가 5000ms 동안 없으면 준비를 설명 있는 오류로 거부하고 이벤트 listener와 타이머를 정리한다', async () => {
    const engine = create(); element.readyState = 0;
    const removed = vi.spyOn(element, 'removeEventListener');
    const rejection = expect(engine.prepareForPlayback()).rejects.toThrow('not ready after 5000ms');
    await vi.advanceTimersByTimeAsync(5000); await rejection;
    expect(removed).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
  });

  it('준비 중 media 오류 code=4 이벤트가 오면 준비를 거부하고 5000ms 타이머를 해제한다', async () => {
    const engine = create(); element.readyState = 0;
    const rejection = expect(engine.prepareForPlayback()).rejects.toThrow('media error 4');
    element.error = { code: 4 }; element.dispatchEvent(new Event('error')); await rejection;
    await vi.advanceTimersByTimeAsync(500); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['dispose', 'loadBuffer'] as const)('준비 중 %s하면 대기를 취소하고 blob:audio-1·src·media 연결을 해제한다', async action => {
    const engine = create(); element.readyState = 0;
    const rejection = expect(engine.prepareForPlayback()).rejects.toThrow('cancelled by load/dispose');
    if (action === 'dispose') await engine.dispose(); else engine.loadBuffer(pcmBuffer(2));
    await rejection; await vi.advanceTimersByTimeAsync(500);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:audio-1');
    expect(element.removeAttribute).toHaveBeenCalledWith('src');
    expect(mockCtx.createMediaElementSource.mock.results[0].value.disconnect).toHaveBeenCalled();
    expect(element.onended === null).toBe(action === 'dispose');
    expect(element.src).toBe(action === 'dispose' ? '' : 'blob:audio-2');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('첫 준비 뒤 2초 음원을 다시 load하면 새 loadeddata를 기다리고 element·media source는 각 1개를 유지한다', async () => {
    const engine = create(); const first = engine.prepareForPlayback(); await vi.advanceTimersByTimeAsync(100); await first;
    engine.loadBuffer(pcmBuffer(2)); element.readyState = 0;
    const completed = vi.fn(); const next = engine.prepareForPlayback(); void next.then(completed);
    await vi.advanceTimersByTimeAsync(100); expect(completed).not.toHaveBeenCalled();
    element.readyState = 2; element.dispatchEvent(new Event('canplaythrough')); await next;
    expect(Audio).toHaveBeenCalledOnce(); expect(mockCtx.createMediaElementSource).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
  });

  it('play Promise가 NotAllowedError로 거부되면 RAF 호출은 던지지 않고 console.warn을 1회 남긴다', async () => {
    const engine = create(); const failure = new DOMException('autoplay', 'NotAllowedError');
    element.play.mockRejectedValueOnce(failure); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => engine.playFadedSpan(span)).not.toThrow(); await Promise.resolve();
    expect(warning).toHaveBeenCalledExactlyOnceWith('AudioEngine media play failed', failure);
  });

  it('첫 play를 pause한 뒤 두 번째 play 중 과거 AbortError가 도착하면 새 재생은 유지하고 경고는 0회다', async () => {
    const engine = create(); let reject!: (reason: unknown) => void;
    element.play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    engine.play(); engine.pause(); engine.resume();
    reject(new DOMException('interrupted', 'AbortError')); await Promise.resolve();
    expect(engine.playing).toBe(true); expect(element.play).toHaveBeenCalledTimes(2);
    expect(warning).not.toHaveBeenCalled();
  });

  it('playWithPreroll(-3000)을 호출하면 pitch 보존 미지원 오류를 내고 element.play는 호출하지 않는다', () => {
    const engine = create(); expect(() => engine.playWithPreroll(-3000)).toThrow('does not support playWithPreroll');
    expect(element.play).not.toHaveBeenCalled();
  });
});
