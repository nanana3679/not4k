/**
 * Audio trimming and WAV encoding utilities for song preview generation.
 */

/**
 * Encode an AudioBuffer to a 16-bit PCM WAV Blob.
 * Preserves channel count (mono or stereo).
 */
export function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numFrames * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII string
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, headerSize - 8 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data and write as 16-bit PCM
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Trim an AudioBuffer to a specified time range using OfflineAudioContext.
 * Applies linear fade-in/out (skipped if duration < 1s).
 */
export async function trimAudioBuffer(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  fadeIn: number = 0.5,
  fadeOut: number = 0.5,
): Promise<AudioBuffer> {
  const duration = endTime - startTime;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const frameCount = Math.ceil(duration * sampleRate);

  const offlineCtx = new OfflineAudioContext(numChannels, frameCount, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  // Apply fade in/out only if duration >= 1s
  if (duration >= 1) {
    const gainNode = offlineCtx.createGain();
    gainNode.gain.setValueAtTime(0, 0);
    gainNode.gain.linearRampToValueAtTime(1, fadeIn);
    gainNode.gain.setValueAtTime(1, duration - fadeOut);
    gainNode.gain.linearRampToValueAtTime(0, duration);
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
  } else {
    source.connect(offlineCtx.destination);
  }

  source.start(0, startTime, duration);
  return offlineCtx.startRendering();
}
