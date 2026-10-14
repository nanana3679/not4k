import { describe, it, expect, vi } from "vitest";
import { GameClock } from "./GameClock";

function fakeAudio(currentTimeMs: number, outputLatencyMs = 0, playbackRate = 1) {
  return { currentTimeMs, playbackRate, getOutputLatencyMs: vi.fn(() => outputLatencyMs) };
}

describe("GameClock", () => {
  it("P=1000ms·L₀=15ms·오프셋 0이면 J와 V와 입력 시간은 985ms", () => {
    const clock = new GameClock(fakeAudio(1000, 15), { inputOffsetMs: 0, visualOffsetMs: 0 }, () => 5000);
    expect(clock.judgmentTimeMs()).toBe(985);
    expect(clock.visualTimeMs()).toBe(985);
    expect(clock.toInputTimeMs(5000)).toBe(985);
  });

  it.each([
    { rate: 0.5, judgment: 990, visual: 1005, input: 983.5 },
    { rate: 1, judgment: 980, visual: 1010, input: 967 },
    { rate: 2, judgment: 960, visual: 1020, input: 934 },
    { rate: 4, judgment: 920, visual: 1040, input: 868 },
  ])("r=$rate·P=1000·L₀=20·시각 +30·입력 −5·지연 8ms이면 J=$judgment·V=$visual·입력=$input ms", ({ rate, judgment, visual, input }) => {
    const clock = new GameClock(fakeAudio(1000, 20, rate), { inputOffsetMs: -5, visualOffsetMs: 30 }, () => 5000);
    expect(clock.judgmentTimeMs()).toBe(judgment);
    expect(clock.visualTimeMs()).toBe(visual);
    expect(clock.toInputTimeMs(4992)).toBe(input);
  });

  it("입력 +20ms·시각 −30ms이면 J=985ms는 유지하고 입력=1005ms·V=955ms로 이동한다", () => {
    const clock = new GameClock(fakeAudio(1000, 15), { inputOffsetMs: 20, visualOffsetMs: -30 }, () => 5000);
    expect(clock.judgmentTimeMs()).toBe(985);
    expect(clock.visualTimeMs()).toBe(955);
    expect(clock.toInputTimeMs(5000)).toBe(1005);
  });

  it("r=2에서 timestamp가 8ms 미래면 handlerDelay=0으로 제한해 입력=970ms를 유지한다", () => {
    const clock = new GameClock(fakeAudio(1000, 15, 2), { inputOffsetMs: 0, visualOffsetMs: 0 }, () => 5000);
    expect(clock.toInputTimeMs(5008)).toBe(970);
  });

  it("L₀=15ms로 생성 후 소스 지연이 80ms로 바뀌어도 첫 프레임과 다음 프레임은 15ms만 뺀다", () => {
    const audio = fakeAudio(1000, 15);
    const clock = new GameClock(audio, { inputOffsetMs: 0, visualOffsetMs: 0 }, () => 5000);
    audio.getOutputLatencyMs.mockReturnValue(80);
    expect(clock.judgmentTimeMs()).toBe(985);
    audio.currentTimeMs = 2000;
    expect(clock.visualTimeMs()).toBe(1985);
    expect(clock.toInputTimeMs(5000)).toBe(1985);
    expect(audio.getOutputLatencyMs).toHaveBeenCalledTimes(1);
  });

  it("P=0·L₀=20ms·r=2이면 첫 J=−40ms를 0으로 제한하지 않는다", () => {
    const clock = new GameClock(fakeAudio(0, 20, 2), { inputOffsetMs: 0, visualOffsetMs: 0 });
    expect(clock.judgmentTimeMs()).toBe(-40);
  });

  it("일시정지로 P=3000ms가 고정이면 실제 시간이 1초 지나도 J·V·현재 입력은 2990ms다", () => {
    let now = 5000;
    const clock = new GameClock(fakeAudio(3000, 10), { inputOffsetMs: 0, visualOffsetMs: 0 }, () => now);
    expect(clock.toInputTimeMs(now)).toBe(2990);
    now += 1000;
    expect(clock.judgmentTimeMs()).toBe(2990);
    expect(clock.visualTimeMs()).toBe(2990);
    expect(clock.toInputTimeMs(now)).toBe(2990);
  });
});
