import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { AudioEngine } from "./AudioEngine";
import type { FadedAudioSpan } from "./index";

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
