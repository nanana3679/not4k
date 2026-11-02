import { describe, expect, it } from 'vitest';
import { encodePcmWav } from './encodePcmWav';

function buffer(channels: number[][], sampleRate = 48000): AudioBuffer {
  return { sampleRate, numberOfChannels: channels.length, length: channels[0].length,
    duration: channels[0].length / sampleRate, getChannelData: (index: number) => Float32Array.from(channels[index]),
  } as AudioBuffer;
}
async function pcm(blob: Blob): Promise<number[]> {
  const view = new DataView(await blob.arrayBuffer());
  return Array.from({ length: (view.byteLength - 44) / 2 }, (_, i) => view.getInt16(44 + i * 2, true));
}

describe('encodePcmWav', () => {
  it('48000Hz·2채널·3프레임을 인코딩하면 56바이트 WAV에 PCM 16비트·192000바이트/초 헤더를 기록한다', async () => {
    const blob = encodePcmWav(buffer([[0, 0, 0], [0, 0, 0]]));
    const bytes = await blob.arrayBuffer(); const view = new DataView(bytes);
    const text = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
    expect(blob.type).toBe('audio/wav'); expect(blob.size).toBe(56);
    expect([text(0, 4), text(8, 4), text(12, 4), text(36, 4)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([view.getUint32(4, true), view.getUint32(16, true), view.getUint16(20, true)]).toEqual([48, 16, 1]);
    expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint32(28, true)]).toEqual([2, 48000, 192000]);
    expect([view.getUint16(32, true), view.getUint16(34, true), view.getUint32(40, true)]).toEqual([4, 16, 12]);
  });

  it('왼쪽 [1,0]·오른쪽 [0,-1]을 인코딩하면 [32767,0,0,-32768] 순서로 채널을 교차한다', async () => {
    expect(await pcm(encodePcmWav(buffer([[1, 0], [0, -1]])))).toEqual([32767, 0, 0, -32768]);
  });

  it('[-2,-1,-0.5,0,0.5,1,2]를 인코딩하면 [-32768,-32768,-16384,0,16384,32767,32767]로 제한·반올림한다', async () => {
    expect(await pcm(encodePcmWav(buffer([[-2, -1, -0.5, 0, 0.5, 1, 2]]))))
      .toEqual([-32768, -32768, -16384, 0, 16384, 32767, 32767]);
  });

  it('-0.5/32768·0.25를 인코딩하면 음수 중간값은 -1·양수 8191.75는 8192가 된다', async () => {
    expect(await pcm(encodePcmWav(buffer([[-0.5 / 32768, 0.25]])))).toEqual([-1, 8192]);
  });

  it('1000Hz 4프레임에서 1.4～3.4ms를 자르면 1·2번 샘플만 남고 원본 4프레임은 유지한다', async () => {
    const source = buffer([[0, 1, -1, 0.5]], 1000);
    expect(await pcm(encodePcmWav(source, 0.0014, 0.0034))).toEqual([32767, -32768]);
    expect(source.length).toBe(4);
  });

  it('1000Hz 4프레임에서 1.5～4ms를 자르면 2·3번 샘플이 남고 4～4ms는 데이터 0바이트다', async () => {
    const source = buffer([[0, 1, -1, 0.5]], 1000);
    expect(await pcm(encodePcmWav(source, 0.0015, 0.004))).toEqual([-32768, 16384]);
    expect(encodePcmWav(source, 0.004, 0.004).size).toBe(44);
  });

  it.each([[-1, 0], [0.003, 0.002], [0, 0.005], [NaN, 0.004], [0, Infinity]])(
    '4ms 음원에 범위 %s～%s초를 요청하면 RangeError로 거부한다', (start, end) => {
      expect(() => encodePcmWav(buffer([[0, 0, 0, 0]], 1000), start, end)).toThrow(RangeError);
    });
});
