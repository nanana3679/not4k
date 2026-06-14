import { describe, expect, it } from "vitest";
import { normalizePlaybackRange } from "./playbackRange";

describe("normalizePlaybackRange", () => {
  it("start=30,end=90,duration=120이면 60초 인게임 구간으로 정규화", () => {
    expect(normalizePlaybackRange({
      startTime: 30,
      endTime: 90,
      fadeInTime: 1,
      fadeOutTime: 2,
    }, 120)).toEqual({
      startTime: 30,
      endTime: 90,
      fadeInTime: 1,
      fadeOutTime: 2,
    });
  });

  it("end=150,duration=120이면 endTime은 120으로 클램핑", () => {
    expect(normalizePlaybackRange({
      startTime: 30,
      endTime: 150,
      fadeInTime: 0,
      fadeOutTime: 0,
    }, 120)).toEqual({
      startTime: 30,
      endTime: 120,
      fadeInTime: 0,
      fadeOutTime: 0,
    });
  });

  it("fadeIn=40초,fadeOut=40초,구간=60초이면 페이드는 각각 30초로 클램핑", () => {
    expect(normalizePlaybackRange({
      startTime: 30,
      endTime: 90,
      fadeInTime: 40,
      fadeOutTime: 40,
    }, 120)).toEqual({
      startTime: 30,
      endTime: 90,
      fadeInTime: 30,
      fadeOutTime: 30,
    });
  });

  it("endTime이 startTime 이하이면 null 반환", () => {
    expect(normalizePlaybackRange({
      startTime: 90,
      endTime: 30,
      fadeInTime: 0,
      fadeOutTime: 0,
    }, 120)).toBeNull();
  });
});
