/** 범위 경계를 가장 가까운 샘플로 반올림한 little-endian 16-bit PCM WAV. 끝 샘플은 제외한다. */
export function encodePcmWav(buffer: AudioBuffer, startSeconds = 0, endSeconds = buffer.duration): Blob {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0
    || endSeconds < startSeconds || endSeconds > buffer.duration) {
    throw new RangeError('WAV range must satisfy 0 <= start <= end <= duration');
  }
  const { sampleRate, numberOfChannels, length } = buffer;
  const start = Math.min(length, Math.round(startSeconds * sampleRate));
  const end = Math.min(length, Math.round(endSeconds * sampleRate));
  const blockAlign = numberOfChannels * 2;
  const dataSize = (end - start) * blockAlign;
  if (dataSize > 0xffffffff - 36) throw new RangeError('PCM WAV exceeds the RIFF 4 GiB size limit');
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, dataSize, true);
  const channels = Array.from({ length: numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = start; frame < end; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      // 음수는 -32768, 양수는 32767까지. 절댓값을 반올림해 음수 중간값도 0에서 멀어지게 한다.
      const pcm = sample < 0 ? -Math.round(-sample * 32768) : Math.round(sample * 32767);
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
