import { describe, it, expect } from "vitest";
import { GameClock, type ClockAudioSource } from "./GameClock";

/** currentTimeMs와 출력 지연을 마음대로 고정할 수 있는 fake 오디오 소스. */
function fakeAudio(currentTimeMs: number, outputLatencyMs = 0): ClockAudioSource {
  return {
    currentTimeMs,
    getOutputLatencyMs: () => outputLatencyMs,
  };
}

describe("GameClock", () => {
  it("currentTime 1000ms·audioOffset 20ms면 판정 시간 1020ms", () => {
    const clock = new GameClock(fakeAudio(1000), { audioOffsetMs: 20, judgmentOffsetMs: 0 });
    expect(clock.judgmentTimeMs()).toBe(1020);
  });

  it("출력 지연 15ms면 시각 시간 = 판정 시간 + 15ms", () => {
    const clock = new GameClock(fakeAudio(1000, 15), { audioOffsetMs: 20, judgmentOffsetMs: 0 });
    expect(clock.visualTimeMs()).toBe(1035);
    // 불변: 시각 시간 − 판정 시간 === 출력 지연
    expect(clock.visualTimeMs() - clock.judgmentTimeMs()).toBe(15);
  });

  it("핸들러 지연 8ms면 입력 시간이 판정 시간보다 8ms 앞당겨짐", () => {
    // now()=1000, eventTimeStamp=992 → handlerDelay=8
    const clock = new GameClock(fakeAudio(1000), { audioOffsetMs: 20, judgmentOffsetMs: 0 }, () => 1000);
    // 판정 시간 1020 − 핸들러 지연 8 + 입력 오프셋 0 = 1012
    expect(clock.toInputTimeMs(992)).toBe(1012);
    expect(clock.judgmentTimeMs() - clock.toInputTimeMs(992)).toBe(8);
  });

  it("입력 오프셋 −5ms면 입력 시간에 −5ms 반영", () => {
    // handlerDelay=0(now=eventTimeStamp), 판정 시간 1020 − 0 + (−5) = 1015
    const clock = new GameClock(fakeAudio(1000), { audioOffsetMs: 20, judgmentOffsetMs: -5 }, () => 1000);
    expect(clock.toInputTimeMs(1000)).toBe(1015);
  });

  it("eventTimeStamp가 미래(now보다 큼)면 핸들러 지연 0으로 클램프", () => {
    // now()=1000, eventTimeStamp=1008 → now−eventTs=−8 → max(0,−8)=0
    const clock = new GameClock(fakeAudio(1000), { audioOffsetMs: 20, judgmentOffsetMs: 0 }, () => 1000);
    // 음수 보정 없이 판정 시간 그대로 = 1020
    expect(clock.toInputTimeMs(1008)).toBe(1020);
  });

  it("일시정지로 currentTimeMs가 고정이면 세 시간 모두 고정값 유지", () => {
    // 일시정지 시 audio.currentTimeMs는 변하지 않는다 → 클럭은 게임 상태를 안 들고 그 값을 읽기만 한다
    const clock = new GameClock(fakeAudio(3000, 10), { audioOffsetMs: 0, judgmentOffsetMs: 0 }, () => 5000);
    expect(clock.judgmentTimeMs()).toBe(3000);
    expect(clock.visualTimeMs()).toBe(3010);
    expect(clock.toInputTimeMs(5000)).toBe(3000);
  });
});
