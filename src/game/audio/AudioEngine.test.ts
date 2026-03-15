import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioEngine } from "./AudioEngine";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

function createMockAudioContext() {
  let _currentTime = 0;

  const ctx: any = {
    get currentTime() {
      return _currentTime;
    },
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    decodeAudioData: vi.fn(),
    createBufferSource: vi.fn(),
    createGain: vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    // test helper: advance wall-clock time
    _advanceTime(seconds: number) {
      _currentTime += seconds;
    },
  };

  const createSource = () => {
    const source: any = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    return source;
  };

  ctx.createBufferSource.mockImplementation(createSource);

  return ctx;
}

function createMockBuffer(durationSeconds: number): AudioBuffer {
  return { duration: durationSeconds } as unknown as AudioBuffer;
}

// Patch global AudioContext before each test
let mockCtx: ReturnType<typeof createMockAudioContext>;

beforeEach(() => {
  mockCtx = createMockAudioContext();
  (globalThis as any).AudioContext = function () {
    return mockCtx;
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioEngine getOutputLatencyMs", () => {
  it("AudioContext가 없으면 0 반환", () => {
    // ctx는 constructor에서 항상 생성되므로, ctx의 속성이 없는 케이스를 테스트
    // baseLatency와 outputLatency 둘 다 undefined인 경우
    const ctxWithoutLatency = createMockAudioContext();
    delete ctxWithoutLatency.baseLatency;
    delete ctxWithoutLatency.outputLatency;
    (globalThis as any).AudioContext = function () {
      return ctxWithoutLatency;
    };
    const engine = new AudioEngine();
    expect(engine.getOutputLatencyMs()).toBe(0);
  });

  it("baseLatency만 있으면 baseLatency * 1000 반환", () => {
    const ctxWithBase = createMockAudioContext();
    ctxWithBase.baseLatency = 0.005; // 5ms
    delete ctxWithBase.outputLatency;
    (globalThis as any).AudioContext = function () {
      return ctxWithBase;
    };
    const engine = new AudioEngine();
    expect(engine.getOutputLatencyMs()).toBe(5);
  });

  it("baseLatency + outputLatency 둘 다 있으면 합산 * 1000 반환", () => {
    const ctxWithBoth = createMockAudioContext();
    ctxWithBoth.baseLatency = 0.005; // 5ms
    ctxWithBoth.outputLatency = 0.01; // 10ms
    (globalThis as any).AudioContext = function () {
      return ctxWithBoth;
    };
    const engine = new AudioEngine();
    expect(engine.getOutputLatencyMs()).toBe(15);
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

  it("currentTimeMs는 버퍼 duration을 초과하지 않음 (playbackRate=2.0, 5초 버퍼)", () => {
    const engine = new AudioEngine();
    engine.loadBuffer(createMockBuffer(5));
    engine.playbackRate = 2.0;
    engine.play();

    mockCtx._advanceTime(10); // 벽시계 10초 → 재생 위치 20초 but 버퍼는 5초
    expect(engine.currentTimeMs).toBe(5000);
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
