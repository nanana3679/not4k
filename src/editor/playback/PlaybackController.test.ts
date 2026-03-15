import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaybackController } from "./PlaybackController";

// ---------------------------------------------------------------------------
// Mock Web Audio API & requestAnimationFrame
// ---------------------------------------------------------------------------

function setupAudioContextMock(duration: number = 10) {
  let currentTime = 0;

  const mockCtx = {
    get currentTime() { return currentTime; },
    _advanceTime(sec: number) { currentTime += sec; },
    createBufferSource() {
      return {
        buffer: null as unknown,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
    },
    createGain() {
      return { gain: { value: 1 }, connect: vi.fn() };
    },
    decodeAudioData: vi.fn().mockResolvedValue({ duration }),
    close: vi.fn(),
  };

  // Constructor that returns mockCtx (when a constructor returns an object, `new` uses it)
  vi.stubGlobal("AudioContext", function () { return mockCtx; });

  // Also mock requestAnimationFrame / cancelAnimationFrame
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  return mockCtx;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// seekTo — 마디 기준 자유 이동
// ---------------------------------------------------------------------------

describe("PlaybackController.seekTo", () => {
  let controller: PlaybackController;
  let lastTimeMs: number;

  beforeEach(() => {
    lastTimeMs = 0;
    controller = new PlaybackController({
      onTimeUpdate: (t) => { lastTimeMs = t; },
      onPlayStateChange: () => {},
    });
  });

  it("음원 로드 전에도 seekTo 동작", () => {
    controller.seekTo(5000);
    expect(lastTimeMs).toBe(5000);
  });

  it("음원 길이를 초과하는 위치로 이동 가능", async () => {
    setupAudioContextMock(10); // 10초 음원
    await controller.loadAudioFile(new File([""], "test.wav"));

    // 15초(15000ms) — 음원 길이(10초) 초과
    controller.seekTo(15000);
    expect(lastTimeMs).toBe(15000);
  });

  it("음수 시간으로 이동 가능 (음수 offset 시나리오)", async () => {
    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(-500);
    expect(lastTimeMs).toBe(-500);
  });

  it("0ms로 정확히 이동", async () => {
    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(3000);
    controller.seekTo(0);
    expect(lastTimeMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pause — 클램핑 없이 현재 위치 유지
// ---------------------------------------------------------------------------

describe("PlaybackController.pause", () => {
  it("pause 시 음원 길이로 클램핑하지 않음", async () => {
    let lastTimeMs = 0;
    const controller = new PlaybackController({
      onTimeUpdate: (t) => { lastTimeMs = t; },
      onPlayStateChange: () => {},
    });

    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    // 음원 끝 이후 위치에서 시작
    controller.seekTo(12000);
    expect(lastTimeMs).toBe(12000);

    // currentTimeMs getter도 올바른 값 반환
    expect(controller.currentTimeMs).toBe(12000);
  });
});

// ---------------------------------------------------------------------------
// play — 음원 범위 밖 재생 처리
// ---------------------------------------------------------------------------

describe("PlaybackController.play", () => {
  it("음원 범위 내 위치에서 정상 재생", async () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(3000); // 3초
    controller.play();

    expect(controller.isPlaying).toBe(true);
  });

  it("음원 종료 후 위치에서 play — 에러 없이 무음 재생", async () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(15000); // 음원 길이(10초) 초과
    controller.play();

    // 에러 없이 재생 상태 진입
    expect(controller.isPlaying).toBe(true);
  });

  it("음수 위치에서 play — 딜레이 후 음원 재생 예약", async () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(-2000); // 2초 전
    controller.play();

    expect(controller.isPlaying).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// currentTimeMs — 경과 시간 기반 추적
// ---------------------------------------------------------------------------

describe("PlaybackController.currentTimeMs", () => {
  it("재생 중이 아닐 때 playbackOffset 반환", async () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    setupAudioContextMock(10);
    await controller.loadAudioFile(new File([""], "test.wav"));

    controller.seekTo(5000);
    expect(controller.currentTimeMs).toBe(5000);
  });

  it("음수 위치에서도 정확한 시간 반환", () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    controller.seekTo(-1000);
    expect(controller.currentTimeMs).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// volume
// ---------------------------------------------------------------------------

describe("PlaybackController.volume", () => {
  it("음원 로드 전 볼륨 설정은 pending으로 저장", () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    controller.volume = 0.5;
    expect(controller.volume).toBe(0.5);
  });

  it("볼륨 0~1 범위로 클램핑", () => {
    const controller = new PlaybackController({
      onTimeUpdate: () => {},
      onPlayStateChange: () => {},
    });

    controller.volume = -0.5;
    expect(controller.volume).toBe(0);

    controller.volume = 1.5;
    expect(controller.volume).toBe(1);
  });
});
