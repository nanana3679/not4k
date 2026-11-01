import { describe, expect, it } from "vitest";
import {
  beatsToSchedule,
  changeClockRate,
  clockCtxTimeOfSong,
  clockSongTimeAt,
  ctxTimeOfSong,
  outputLatencyFromProbes,
  renderQuantumTimeAtOrAfter,
  songTimeAt,
  splitClicksAtChange,
  startClock,
} from "./observerSlowdownClock";

describe("곡 위치 시계 한 구간", () => {
  const segment = { ctxTime: 10, songTime: 2, rate: 0.5 };

  it("ctx 10초에 곡 2초·0.5배속인 구간은 ctx 12초에 곡 3초를 가리킨다", () => {
    expect(songTimeAt(segment, 12)).toBe(3);
  });

  it("예약한 시작 시각(ctx 10초) 전인 ctx 9초에는 시작 위치 곡 2초에 머문다", () => {
    expect(songTimeAt(segment, 9)).toBe(2);
  });

  it("0.5배속 구간에서 곡 4초가 들리는 시각은 ctx 14초", () => {
    expect(ctxTimeOfSong(segment, 4)).toBe(14);
  });
});

describe("구간별 곡 위치 시계", () => {
  // ctx 2초에 곡 0초부터 0.5배속으로 시작해 ctx 3초에 1.0배속으로 바꾸기로 예약했다(곡 0.5초 지점).
  const changed = changeClockRate(startClock(2, 0, 0.5), 3, 1);

  it("ctx 3초에 0.5배속에서 1.0배속으로 바꾸면 곡 0.5초에서 끊기지 않고 이어지는 새 구간을 덧붙인다", () => {
    expect(changed).toEqual([
      { ctxTime: 2, songTime: 0, rate: 0.5 },
      { ctxTime: 3, songTime: 0.5, rate: 1 },
    ]);
  });

  it("적용 시각 ctx 3초 직전 2.999초에는 옛 0.5배속 구간을 따라 곡 0.4995초", () => {
    expect(clockSongTimeAt(changed, 2.999)).toBeCloseTo(0.4995, 9);
  });

  it("적용 시각 ctx 3초 직후 3.001초에는 새 1.0배속 구간을 따라 곡 0.501초", () => {
    expect(clockSongTimeAt(changed, 3.001)).toBeCloseTo(0.501, 9);
  });

  it("적용 시각 ctx 3초에는 두 구간이 같은 곡 0.5초를 가리킨다", () => {
    expect(clockSongTimeAt(changed, 3)).toBe(0.5);
  });

  it("곡 0.25초는 옛 구간에서 ctx 2.5초, 곡 1.5초는 새 구간에서 ctx 4초에 들린다", () => {
    expect(clockCtxTimeOfSong(changed, 0.25)).toBe(2.5);
    expect(clockCtxTimeOfSong(changed, 1.5)).toBe(4);
  });

  it("ctx 3초 변경이 적용되기 전인 ctx 2.5초에 0.25배속으로 다시 바꾸면 ctx 3초 예약 구간을 버리고 2.5초부터 0.25배속", () => {
    expect(changeClockRate(changed, 2.5, 0.25)).toEqual([
      { ctxTime: 2, songTime: 0, rate: 0.5 },
      { ctxTime: 2.5, songTime: 0.25, rate: 0.25 },
    ]);
  });

  it("같은 적용 시각 ctx 3초에 0.75배속으로 다시 바꾸면 그 시각의 구간만 바꾼다", () => {
    expect(changeClockRate(changed, 3, 0.75)).toEqual([
      { ctxTime: 2, songTime: 0, rate: 0.5 },
      { ctxTime: 3, songTime: 0.5, rate: 0.75 },
    ]);
  });

  it("시작 예약(ctx 2초) 전인 ctx 1.5초에 0.25배속으로 바꾸면 시작 시각·위치는 그대로 두고 배속만 바꾼다", () => {
    expect(changeClockRate(startClock(2, 0, 0.5), 1.5, 0.25)).toEqual([{ ctxTime: 2, songTime: 0, rate: 0.25 }]);
  });
});

describe("박 클릭 예약", () => {
  it("0.5배속으로 곡 0.9초부터 ctx 0～0.6초를 보면 곡 1.0초의 박 2만 ctx 0.2초에 예약한다", () => {
    const beats = beatsToSchedule(startClock(0, 0.9, 0.5), 0, 0.6, 0.5, 16, -1);
    expect(beats).toHaveLength(1);
    expect(beats[0].beat).toBe(2);
    expect(beats[0].ctxTime).toBeCloseTo(0.2, 9);
  });

  it("이미 예약한 박 2(afterBeat=2)는 같은 창에서 다시 예약하지 않는다", () => {
    expect(beatsToSchedule(startClock(0, 0.9, 0.5), 0, 0.6, 0.5, 16, 2)).toEqual([]);
  });

  it("곡 15.4초부터 1초를 보면 곡 15.5초의 박 31만 예약하고 곡 길이 16초와 같은 박 32는 예약하지 않는다", () => {
    expect(beatsToSchedule(startClock(0, 15.4, 1), 0, 1, 0.5, 16, -1).map(({ beat }) => beat)).toEqual([31]);
  });

  it("ctx 1초에 1.0배속에서 0.5배속으로 바뀌는 시계는 박 2(곡 1초)를 ctx 1초, 박 3(곡 1.5초)을 ctx 2초에 예약한다", () => {
    const clock = changeClockRate(startClock(0, 0, 1), 1, 0.5);
    expect(beatsToSchedule(clock, 0.9, 2.1, 0.5, 16, 1)).toEqual([
      { beat: 2, ctxTime: 1 },
      { beat: 3, ctxTime: 2 },
    ]);
  });

  it("ctx 0.7초 시작 시계에서 창 시작 ctx 2.2초가 박 3(곡 1.5초)과 같으면 부동소수 오차(곡 1.5000000000000002초)가 있어도 그 박을 빠뜨리지 않는다", () => {
    const clock = startClock(0.7, 0, 1);
    expect(beatsToSchedule(clock, 0.7 + 1.5, 2.3, 0.5, 16, -1).map(({ beat }) => beat)).toEqual([3]);
  });
});

describe("속도 변경 뒤 박 클릭 다시 예약", () => {
  const clicks = [
    { beat: 3, ctxTime: 1.5 },
    { beat: 4, ctxTime: 2 },
    { beat: 5, ctxTime: 2.5 },
  ];

  it("ctx 2.2초에 속도가 바뀌면 그 전 박 3·4 클릭은 두고 박 5만 취소하며 다음 예약은 박 4 뒤부터", () => {
    const split = splitClicksAtChange(clicks, 2.2, 5);
    expect(split.keep.map(({ beat }) => beat)).toEqual([3, 4]);
    expect(split.cancel.map(({ beat }) => beat)).toEqual([5]);
    expect(split.lastBeat).toBe(4);
  });

  it("박 4와 같은 시각 ctx 2초에 속도가 바뀌면 박 4를 취소하고 새 시계로 ctx 2초에 한 번만 다시 예약한다", () => {
    const split = splitClicksAtChange(clicks, 2, 5);
    expect(split.keep.map(({ beat }) => beat)).toEqual([3]);
    expect(split.lastBeat).toBe(3);
    const clock = changeClockRate(startClock(0, 0, 1), 2, 0.5);
    const rescheduled = beatsToSchedule(clock, 1.98, 1.98 + 0.15, 0.5, 16, split.lastBeat);
    expect(rescheduled).toEqual([{ beat: 4, ctxTime: 2 }]);
  });

  it("박 5 클릭(ctx 2.5초) 직전 ctx 2.49초에 속도가 바뀌면 박 5를 새 시계로 다시 예약해 빠뜨리지 않는다", () => {
    const split = splitClicksAtChange(clicks, 2.49, 5);
    expect(split.lastBeat).toBe(4);
    const clock = changeClockRate(startClock(0, 0, 1), 2.49, 0.5);
    const rescheduled = beatsToSchedule(clock, 2.45, 2.45 + 0.15, 0.5, 16, split.lastBeat);
    expect(rescheduled.map(({ beat }) => beat)).toEqual([5]);
    expect(rescheduled[0].ctxTime).toBeCloseTo(2.51, 9);
  });

  it("예약해 둔 클릭이 없으면 마지막 박(5)을 그대로 이어 간다", () => {
    expect(splitClicksAtChange([], 3, 5)).toEqual({ keep: [], cancel: [], lastBeat: 5 });
  });
});

describe("렌더 퀀텀 경계", () => {
  it("44100Hz에서 ctx 1초는 다음 128프레임 경계인 44160프레임(약 1.0013605초)으로 올린다", () => {
    expect(renderQuantumTimeAtOrAfter(1, 44100)).toBe(44160 / 44100);
  });

  it("이미 경계인 ctx 128/48000초는 그대로 둔다", () => {
    expect(renderQuantumTimeAtOrAfter(128 / 48000, 48000)).toBe(128 / 48000);
  });
});

describe("Signalsmith 출력 지연 추정", () => {
  it("stop()·start()가 돌려준 출력 시각 차가 60ms·62.9ms(사이에 렌더 퀀텀이 낀 경우)면 작은 쪽 60ms를 44100Hz 2646프레임으로 맞춘다", () => {
    const latency = outputLatencyFromProbes([
      { stoppedOutput: 2, startedOutput: 2 + 128 / 44100 + 0.06 },
      { stoppedOutput: 1, startedOutput: 1.0600000001 },
    ], 44100);
    expect(latency).toBe(2646 / 44100);
  });

  it("측정이 하나도 없으면 오류", () => {
    expect(() => outputLatencyFromProbes([], 44100)).toThrow();
  });
});
