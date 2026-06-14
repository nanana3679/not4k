/**
 * AudioBuffer 구간을 16-bit PCM WAV Blob으로 인코딩한다.
 * 외부 라이브러리 없이 순수 JS로 동작.
 */
export function encodeWavBlob(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  options: { fadeInTime?: number; fadeOutTime?: number } = {},
): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(audioBuffer.length, Math.floor(endTime * sampleRate));
  const numSamples = endSample - startSample;

  if (numSamples <= 0) {
    throw new Error('Invalid preview range: no samples');
  }

  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // --- WAV header ---
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // --- Interleaved 16-bit PCM samples ---
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  const maxFadeSamples = Math.floor(numSamples / 2);
  const fadeInSamples = clampFadeSamples(options.fadeInTime ?? 0, sampleRate, maxFadeSamples);
  const fadeOutSamples = clampFadeSamples(options.fadeOutTime ?? 0, sampleRate, maxFadeSamples);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const gain = Math.min(
      getFadeInGain(i, fadeInSamples),
      getFadeOutGain(i, numSamples, fadeOutSamples),
    );
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channels[ch][startSample + i] * gain;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function clampFadeSamples(fadeTime: number, sampleRate: number, maxFadeSamples: number): number {
  if (!Number.isFinite(fadeTime) || fadeTime <= 0) return 0;
  return Math.min(Math.floor(fadeTime * sampleRate), maxFadeSamples);
}

function getFadeInGain(sampleIndex: number, fadeInSamples: number): number {
  if (fadeInSamples <= 0) return 1;
  return Math.min(1, sampleIndex / fadeInSamples);
}

function getFadeOutGain(sampleIndex: number, numSamples: number, fadeOutSamples: number): number {
  if (fadeOutSamples <= 0) return 1;
  return Math.min(1, (numSamples - 1 - sampleIndex) / fadeOutSamples);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
