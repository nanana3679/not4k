import { describe, expect, it } from "vitest";
import { OBSERVER_FADE_REAL_TIME_MS, observerWholeSongRange, planObserverAudioSection } from "./observerRepetitionPlan";

describe("옵저버 반복 1회의 음원 재생 범위", () => {
  it("페이드는 배속과 무관한 실제 시간 3000ms", () => {
    expect(OBSERVER_FADE_REAL_TIME_MS).toBe(3000);
  });

  it("1배속·구간 10000～20000ms·음원 60000ms면 7000ms부터 페이드 인 10000ms·페이드 아웃 20000ms·23000ms까지", () => {
    expect(planObserverAudioSection({ startMs: 10000, endMs: 20000 }, 60000, 1))
      .toEqual({ fromMs: 7000, fadeInUntilMs: 10000, fadeOutFromMs: 20000, toMs: 23000 });
  });

  it("1배속 구간 시작 1000ms면 앞 준비를 무음으로 채우지 않고 0ms부터 재생", () => {
    expect(planObserverAudioSection({ startMs: 1000, endMs: 20000 }, 60000, 1))
      .toEqual({ fromMs: 0, fadeInUntilMs: 1000, fadeOutFromMs: 20000, toMs: 23000 });
  });

  it("1배속 구간 끝 59000ms·음원 60000ms면 뒤 페이드를 음원 끝 60000ms에서 멈춤", () => {
    expect(planObserverAudioSection({ startMs: 10000, endMs: 59000 }, 60000, 1))
      .toEqual({ fromMs: 7000, fadeInUntilMs: 10000, fadeOutFromMs: 59000, toMs: 60000 });
  });

  it("기본 구간은 전곡 0～60000ms이고 앞뒤 추가 재생 없이 0/0/60000/60000ms", () => {
    const range = observerWholeSongRange(60000);
    expect(range).toEqual({ startMs: 0, endMs: 60000 });
    expect(planObserverAudioSection(range, 60000, 1))
      .toEqual({ fromMs: 0, fadeInUntilMs: 0, fadeOutFromMs: 60000, toMs: 60000 });
  });

  it("0.5배속이면 실제 3000ms에 해당하는 곡 시간 1500ms씩 앞뒤로 재생해 8500～21500ms", () => {
    expect(planObserverAudioSection({ startMs: 10000, endMs: 20000 }, 60000, 0.5))
      .toEqual({ fromMs: 8500, fadeInUntilMs: 10000, fadeOutFromMs: 20000, toMs: 21500 });
  });

  it("구간 시작과 끝이 같은 10000ms여도 앞뒤 페이드만 재생하는 7000～13000ms", () => {
    expect(planObserverAudioSection({ startMs: 10000, endMs: 10000 }, 60000, 1))
      .toEqual({ fromMs: 7000, fadeInUntilMs: 10000, fadeOutFromMs: 10000, toMs: 13000 });
  });

  it.each([
    ["구간 시작이 음수 -1ms", { startMs: -1, endMs: 20000 }, 60000, 1],
    ["구간 시작 20001ms가 끝 20000ms보다 늦음", { startMs: 20001, endMs: 20000 }, 60000, 1],
    ["구간 끝 60001ms가 음원 60000ms를 넘음", { startMs: 10000, endMs: 60001 }, 60000, 1],
    ["구간 시작이 NaN", { startMs: Number.NaN, endMs: 20000 }, 60000, 1],
    ["음원 길이가 Infinity", { startMs: 10000, endMs: 20000 }, Infinity, 1],
    ["배속 0", { startMs: 10000, endMs: 20000 }, 60000, 0],
    ["배속 -1", { startMs: 10000, endMs: 20000 }, 60000, -1],
    ["배속 NaN", { startMs: 10000, endMs: 20000 }, 60000, Number.NaN],
  ])("%s이면 RangeError", (_case, range, audioDurationMs, playbackRate) => {
    expect(() => planObserverAudioSection(range, audioDurationMs, playbackRate)).toThrow(RangeError);
  });

  it.each([-1, Number.NaN, Infinity])("음원 길이 %sms로 전곡 기본 구간을 만들면 RangeError", audioDurationMs => {
    expect(() => observerWholeSongRange(audioDurationMs)).toThrow(RangeError);
  });
});
