import { describe, expect, it } from "vitest";
import {
  OBSERVER_SLOWDOWN_RATES,
  TEST_LOOP_SECONDS,
  beatsToSchedule,
  ctxTimeOfSong,
  encodeWav,
  firstAudibleIndex,
  formatMilliseconds,
  formatRate,
  formatSongTime,
  retimeClock,
  songTimeAt,
  testLoopHits,
} from "./observerSlowdownAudio";

describe("옵저버 감속 재생 속도", () => {
  it("비교할 재생 속도는 옵저버 범위 안의 0.25x·0.5x·0.75x·1.0x 네 개다", () => {
    expect(OBSERVER_SLOWDOWN_RATES.map(formatRate)).toEqual(["0.25x", "0.5x", "0.75x", "1.0x"]);
  });
});

describe("곡 위치 시계", () => {
  const clock = { ctxTime: 10, songTime: 2, rate: 0.5 };

  it("ctx 10초에 곡 2초·0.5배속인 시계는 ctx 12초에 곡 3초를 가리킨다", () => {
    expect(songTimeAt(clock, 12)).toBe(3);
  });

  it("예약한 시작 시각(ctx 10초) 전인 ctx 9초에는 시작 위치 곡 2초에 머문다", () => {
    expect(songTimeAt(clock, 9)).toBe(2);
  });

  it("0.5배속 시계에서 곡 4초가 들리는 시각은 ctx 14초", () => {
    expect(ctxTimeOfSong(clock, 4)).toBe(14);
  });

  it("ctx 12초에 0.5배속에서 1.0배속으로 바꾸면 곡 3초에서 끊기지 않고 이어져 ctx 13초에 곡 4초", () => {
    const changed = retimeClock(clock, 12, 1);
    expect(changed).toEqual({ ctxTime: 12, songTime: 3, rate: 1 });
    expect(songTimeAt(changed, 13)).toBe(4);
  });

  it("시작 예약(ctx 10초) 전인 ctx 9.5초에 0.25배속으로 바꾸면 시작 시각·위치는 그대로 두고 배속만 바꾼다", () => {
    expect(retimeClock(clock, 9.5, 0.25)).toEqual({ ctxTime: 10, songTime: 2, rate: 0.25 });
  });
});

describe("박 클릭 예약", () => {
  it("0.5배속으로 곡 0.9초부터 ctx 0～0.6초를 보면 곡 1.0초의 박 2만 ctx 0.2초에 예약한다", () => {
    const beats = beatsToSchedule({ ctxTime: 0, songTime: 0.9, rate: 0.5 }, 0, 0.6, 0.5, 16, -1);
    expect(beats).toHaveLength(1);
    expect(beats[0].beat).toBe(2);
    expect(beats[0].ctxTime).toBeCloseTo(0.2, 9);
  });

  it("이미 예약한 박 2(afterBeat=2)는 같은 창에서 다시 예약하지 않는다", () => {
    expect(beatsToSchedule({ ctxTime: 0, songTime: 0.9, rate: 0.5 }, 0, 0.6, 0.5, 16, 2)).toEqual([]);
  });

  it("곡 15.4초부터 1초를 보면 곡 15.5초의 박 31만 예약하고 곡 길이 16초와 같은 박 32는 예약하지 않는다", () => {
    expect(beatsToSchedule({ ctxTime: 0, songTime: 15.4, rate: 1 }, 0, 1, 0.5, 16, -1).map(({ beat }) => beat)).toEqual([31]);
  });
});

describe("생성 테스트 루프", () => {
  const hits = testLoopHits();
  const voiceCount = (voice: string) => hits.filter((hit) => hit.voice === voice).length;

  it("120 BPM 16초 루프는 박마다 킥 32개, 2·4박 스네어 16개, 반박 뒤 하이햇 32개, 박마다 멜로디 32개를 가진다", () => {
    expect(TEST_LOOP_SECONDS).toBe(16);
    expect([voiceCount("kick"), voiceCount("snare"), voiceCount("hat"), voiceCount("lead")]).toEqual([32, 16, 32, 32]);
    expect(hits.filter((hit) => hit.voice === "kick").map((hit) => hit.time).slice(0, 3)).toEqual([0, 0.5, 1]);
    expect(hits.filter((hit) => hit.voice === "snare").map((hit) => hit.time).slice(0, 2)).toEqual([0.5, 1.5]);
  });

  it("첫 박(0초)에는 킥과 A3(220Hz) 멜로디가 함께 있고 하이햇은 반박 뒤 0.25초에 온다", () => {
    expect(hits.filter((hit) => hit.time === 0)).toEqual([
      { voice: "kick", time: 0 },
      { voice: "lead", time: 0, frequency: 220 },
    ]);
    expect(hits.find((hit) => hit.voice === "hat")?.time).toBe(0.25);
  });

  it("다섯 번째 박(2초)의 멜로디는 음높이 기준음 A4 = 440Hz", () => {
    expect(hits.find((hit) => hit.voice === "lead" && hit.time === 2)?.frequency).toBe(440);
  });

  it("모든 타격 시각은 루프 길이 16초 안에 있다", () => {
    expect(hits.every((hit) => hit.time >= 0 && hit.time < TEST_LOOP_SECONDS)).toBe(true);
  });
});

describe("WAV 인코딩", () => {
  it("48000Hz 스테레오 3프레임은 헤더 44바이트 + 데이터 12바이트이고 ±1을 넘는 값은 ±32767로 잘린다", () => {
    const wav = encodeWav([new Float32Array([0, 0.25, 1.5]), new Float32Array([-1, -0.25, -2])], 48000);
    const view = new DataView(wav);
    const ascii = (offset: number) => String.fromCharCode(...new Uint8Array(wav, offset, 4));
    expect(wav.byteLength).toBe(56);
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint32(28, true), view.getUint16(32, true), view.getUint16(34, true)])
      .toEqual([2, 48000, 192000, 4, 16]);
    expect(view.getUint32(40, true)).toBe(12);
    expect(Array.from({ length: 6 }, (_, index) => view.getInt16(44 + index * 2, true))).toEqual([0, -32767, 8192, -8192, 32767, -32767]);
  });
});

describe("첫 출력 감지", () => {
  const samples = new Float32Array([0, 0.0005, 0.002, 0.5]);

  it("창 [0, 0.0005, 0.002, 0.5]에서 문턱 0.001을 처음 넘는 위치는 2", () => {
    expect(firstAudibleIndex(samples)).toBe(2);
  });

  it("호출 전 소리를 빼도록 notBeforeIndex 3을 주면 그 앞의 소리는 무시하고 3", () => {
    expect(firstAudibleIndex(samples, 3)).toBe(3);
  });

  it("모든 샘플의 크기가 문턱 0.001보다 작은 0.0009 이하이면 -1", () => {
    expect(firstAudibleIndex(new Float32Array([0, 0.0009, -0.0009]))).toBe(-1);
  });
});

describe("표시 형식", () => {
  it("62.3456초는 1:02.346, 16초는 0:16.000으로 표시한다", () => {
    expect(formatSongTime(62.3456)).toBe("1:02.346");
    expect(formatSongTime(16)).toBe("0:16.000");
  });

  it("0.1204초는 120ms로 표시한다", () => {
    expect(formatMilliseconds(0.1204)).toBe("120ms");
  });
});
