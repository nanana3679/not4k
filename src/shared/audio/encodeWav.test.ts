import { describe, it, expect } from "vitest";
import { canEncodeWavRange, encodeWavBlob } from "./encodeWav";

// Mock AudioBuffer
function createMockAudioBuffer(
  sampleRate: number,
  numChannels: number,
  samples: Float32Array[],
): AudioBuffer {
  return {
    sampleRate,
    numberOfChannels: numChannels,
    length: samples[0].length,
    duration: samples[0].length / sampleRate,
    getChannelData: (ch: number) => samples[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("encodeWavBlob", () => {
  it("올바른 WAV Blob 생성", () => {
    const samples = [new Float32Array([0, 0.5, -0.5, 1, -1])];
    const buf = createMockAudioBuffer(44100, 1, samples);

    const blob = encodeWavBlob(buf, 0, buf.duration);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
  });

  it("WAV 헤더가 올바른 구조", async () => {
    const samples = [new Float32Array([0, 0.5, -0.5])];
    const buf = createMockAudioBuffer(44100, 1, samples);

    const blob = encodeWavBlob(buf, 0, buf.duration);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // RIFF header
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    // WAVE format
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
    // fmt chunk
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe("fmt ");
    // PCM format (1)
    expect(view.getUint16(20, true)).toBe(1);
    // 1 channel
    expect(view.getUint16(22, true)).toBe(1);
    // sample rate
    expect(view.getUint32(24, true)).toBe(44100);
    // bits per sample
    expect(view.getUint16(34, true)).toBe(16);
    // data chunk
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe("data");
  });

  it("스테레오 WAV 생성", async () => {
    const left = new Float32Array([0.5, -0.5]);
    const right = new Float32Array([0.25, -0.25]);
    const buf = createMockAudioBuffer(48000, 2, [left, right]);

    const blob = encodeWavBlob(buf, 0, buf.duration);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // 2 channels
    expect(view.getUint16(22, true)).toBe(2);
    // sample rate
    expect(view.getUint32(24, true)).toBe(48000);
    // data size: 2 samples * 2 channels * 2 bytes = 8
    expect(view.getUint32(40, true)).toBe(8);
  });

  it("부분 구간 인코딩", () => {
    // 100 samples at 100Hz = 1 second
    const samples = [new Float32Array(100).fill(0.5)];
    const buf = createMockAudioBuffer(100, 1, samples);

    // 0.2s ~ 0.5s = 30 samples
    const blob = encodeWavBlob(buf, 0.2, 0.5);
    // 44 header + 30 samples * 2 bytes = 104 bytes
    expect(blob.size).toBe(104);
  });

  it("샘플 없는 구간은 에러", () => {
    const samples = [new Float32Array([0, 0.5])];
    const buf = createMockAudioBuffer(44100, 1, samples);

    // endTime <= startTime
    expect(() => encodeWavBlob(buf, 1, 0)).toThrow("Invalid preview range");
  });

  it("샘플 값 클램핑 — -1 ~ 1 범위", async () => {
    // Values are already -1 and 1, should not exceed 16-bit range
    const samples = [new Float32Array([1, -1, 0])];
    const buf = createMockAudioBuffer(44100, 1, samples);

    const blob = encodeWavBlob(buf, 0, buf.duration);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // First sample: 1.0 * 0x7FFF = 32767
    expect(view.getInt16(44, true)).toBe(32767);
    // Second sample: -1.0 * 0x8000 = -32768
    expect(view.getInt16(46, true)).toBe(-32768);
    // Third sample: 0
    expect(view.getInt16(48, true)).toBe(0);
  });

  it("fadeInTime=0.2초이면 10Hz WAV의 첫 샘플은 0, 두 번째 샘플은 0.5", async () => {
    const samples = [new Float32Array(10).fill(1)];
    const buf = createMockAudioBuffer(10, 1, samples);

    const blob = encodeWavBlob(buf, 0, 1, { fadeInTime: 0.2, fadeOutTime: 0 });
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16383);
    expect(view.getInt16(48, true)).toBe(32767);
  });

  it("fadeOutTime=0.2초이면 10Hz WAV의 마지막 샘플은 0, 직전 샘플은 0.5", async () => {
    const samples = [new Float32Array(10).fill(1)];
    const buf = createMockAudioBuffer(10, 1, samples);

    const blob = encodeWavBlob(buf, 0, 1, { fadeInTime: 0, fadeOutTime: 0.2 });
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    expect(view.getInt16(60, true)).toBe(16383);
    expect(view.getInt16(62, true)).toBe(0);
  });
});

describe("encodeWavBlob 음원 끝을 넘은 구간", () => {
  it("10Hz 5샘플 음원을 끝이 한 샘플 넘친 0～0.6초로 인코딩하면 음원 길이로 잘라 헤더 44바이트+샘플 5개 54바이트다", () => {
    const buf = createMockAudioBuffer(10, 1, [new Float32Array(5)]);

    expect(encodeWavBlob(buf, 0, 0.6).size).toBe(54);
  });
});

describe("canEncodeWavRange", () => {
  /** 10Hz·10초(100샘플) 음원. 범위 판단은 샘플 수만 쓴다. */
  const buffer = { sampleRate: 10, length: 100 };

  it.each([
    ["0～10초는 음원 전체라 샘플 100개", 0, 10, true],
    ["끝이 한 샘플(0.1초) 넘친 9～10.1초는 잘라서 인코딩할 수 있음", 9, 10.1, true],
    ["끝이 두 샘플 넘친 9～10.2초는 음원 밖", 9, 10.2, false],
    ["시작과 끝이 같은 9～9초는 샘플 0개", 9, 9, false],
    ["음원 끝에 붙은 10～10초는 샘플 0개", 10, 10, false],
    ["한 샘플보다 짧아 같은 샘플로 내려가는 9.01～9.05초는 샘플 0개", 9.01, 9.05, false],
    ["음원 끝 뒤에서 시작하는 10～10.1초는 샘플 0개", 10, 10.1, false],
    ["끝이 시작보다 앞선 9～8초는 샘플 0개", 9, 8, false],
  ])("%s이면 startTime=%s·endTime=%s에서 %s다", (_situation, startTime, endTime, encodable) => {
    expect(canEncodeWavRange(buffer, startTime, endTime)).toBe(encodable);
  });

  it("44100Hz 149.97056689342404초 음원에서 끝이 2.8e-14초 넘친 149.97056689342406초는 같은 샘플 끝이라 인코딩할 수 있다", () => {
    expect(canEncodeWavRange({ sampleRate: 44100, length: 6613702 }, 135, 149.97056689342406)).toBe(true);
  });
});
