import { describe, expect, it } from "vitest";
import {
  OBSERVER_SLOWDOWN_RATES,
  TEST_LOOP_SECONDS,
  createSerialQueue,
  encodeWav,
  firstAudibleIndex,
  formatMilliseconds,
  formatRate,
  formatSongTime,
  isOutputQuiet,
  pollFirstOutput,
  testLoopHits,
} from "./observerSlowdownAudio";

describe("옵저버 감속 재생 속도", () => {
  it("비교할 재생 속도는 옵저버 범위 안의 0.25x·0.5x·0.75x·1.0x 네 개다", () => {
    expect(OBSERVER_SLOWDOWN_RATES.map(formatRate)).toEqual(["0.25x", "0.5x", "0.75x", "1.0x"]);
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

describe("분석 창 하나로 첫 출력 재기", () => {
  const sampleRate = 48000;
  /** windowEnd에서 끝나는 frames프레임 창에서 soundFrom번째 샘플부터 소리가 있다. */
  const windowWithSound = (frames: number, soundFrom: number) => {
    const samples = new Float32Array(frames);
    samples.fill(0.5, soundFrom);
    return samples;
  };

  it("ctx 1.1초에 끝나는 4800프레임(0.1초) 창에서 클릭 시각 1.0초 뒤 2400번째 샘플에 소리가 나면 첫 출력 50ms", () => {
    const poll = pollFirstOutput(windowWithSound(4800, 2400), sampleRate, 1.1, 1, 1);
    expect(poll.kind).toBe("found");
    expect(poll.kind === "found" && poll.seconds).toBeCloseTo(0.05, 9);
  });

  it("클릭 시각 1.05초 전부터 이어진 소리는 세지 않고 클릭 시각 이후 첫 샘플(0ms)로 잰다", () => {
    const poll = pollFirstOutput(windowWithSound(4800, 0), sampleRate, 1.1, 1.05, 1.05);
    expect(poll.kind === "found" && poll.seconds).toBeCloseTo(0, 9);
  });

  it("클릭 시각 이후 창에 소리가 없으면 pending", () => {
    expect(pollFirstOutput(new Float32Array(4800), sampleRate, 1.1, 1, 1)).toEqual({ kind: "pending" });
  });

  it("앞선 창이 ctx 1.0초까지 봤는데 이번 창이 1.2초에 시작하면(0.2초 놓침) 소리를 찾아도 missed", () => {
    expect(pollFirstOutput(windowWithSound(4800, 100), sampleRate, 1.3, 1, 1)).toEqual({ kind: "missed" });
  });

  it("32768프레임 창(48kHz 약 683ms)이면 클릭 시각 1.0초 뒤 첫 확인이 600ms 늦어도 창이 이어져 첫 출력 100ms를 그대로 잰다", () => {
    const windowEnd = 1.6;
    const windowStart = windowEnd - 32768 / sampleRate;
    const soundFrom = Math.round((1.1 - windowStart) * sampleRate);
    const poll = pollFirstOutput(windowWithSound(32768, soundFrom), sampleRate, windowEnd, 1, 1);
    expect(poll.kind === "found" && poll.seconds).toBeCloseTo(0.1, 4);
  });
});

describe("처리 꼬리가 끝났는지", () => {
  const sampleRate = 48000;

  it("입력이 끝난 ctx 10초 뒤 ctx 10.3초까지 마지막 0.2초 출력이 모두 문턱 아래면 끝났다", () => {
    const samples = new Float32Array(32768);
    samples.fill(0.5, 0, samples.length - 0.25 * sampleRate);
    expect(isOutputQuiet(samples, sampleRate, 10.3, 10, 0.2)).toBe(true);
  });

  it("입력이 끝난 ctx 10초 뒤 0.15초밖에 지나지 않았으면 조용해도 아직 끝나지 않았다", () => {
    expect(isOutputQuiet(new Float32Array(32768), sampleRate, 10.15, 10, 0.2)).toBe(false);
  });

  it("마지막 0.2초 안 맨 끝 샘플 하나라도 문턱을 넘으면 아직 끝나지 않았다", () => {
    const samples = new Float32Array(32768);
    samples[samples.length - 1] = 0.002;
    expect(isOutputQuiet(samples, sampleRate, 10.3, 10, 0.2)).toBe(false);
  });
});

describe("음원 읽기 직렬화", () => {
  it("먼저 넣은 읽기가 끝나기 전에 넣은 읽기는 그 뒤에 시작해 단계가 섞이지 않는다(A 시작·A 끝·B 시작·B 끝)", async () => {
    const enqueue = createSerialQueue();
    const steps: string[] = [];
    let finishFirst = () => {};
    const first = enqueue(async () => {
      steps.push("A 시작");
      await new Promise<void>((resolve) => { finishFirst = resolve; });
      steps.push("A 끝");
      return "A";
    });
    const second = enqueue(async () => {
      steps.push("B 시작");
      steps.push("B 끝");
      return "B";
    });
    await Promise.resolve();
    expect(steps).toEqual(["A 시작"]);
    finishFirst();
    expect(await Promise.all([first, second])).toEqual(["A", "B"]);
    expect(steps).toEqual(["A 시작", "A 끝", "B 시작", "B 끝"]);
  });

  it("앞선 읽기가 실패해도 뒤에 넣은 읽기는 실행된다", async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(async () => { throw new Error("디코딩 실패"); });
    const next = enqueue(async () => "다음 음원");
    await expect(failed).rejects.toThrow("디코딩 실패");
    await expect(next).resolves.toBe("다음 음원");
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
