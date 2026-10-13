import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { AudioEngine } from "./AudioEngine";

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
