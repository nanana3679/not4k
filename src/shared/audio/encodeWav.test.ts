import { describe, it, expect } from "vitest";
import { encodeWavBlob } from "./encodeWav";

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
});
