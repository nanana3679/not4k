/**
 * Waveform audio visualization utilities
 *
 * Extracts peak amplitude data from AudioBuffer for timeline rendering.
 */

/**
 * Extract peak amplitudes from an AudioBuffer
 *
 * @param audioBuffer - The decoded audio buffer
 * @param samplesPerPeak - Number of samples to analyze per peak (default: 512)
 * @returns Float32Array of peak amplitudes (0.0 to 1.0)
 */
export function getWaveformPeaks(
  audioBuffer: AudioBuffer,
  samplesPerPeak: number = 512
): Float32Array {
  const channel = audioBuffer.getChannelData(0); // Use first channel (mono or left)
  const totalSamples = channel.length;
  const peakCount = Math.ceil(totalSamples / samplesPerPeak);
  const peaks = new Float32Array(peakCount);

  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, totalSamples);

    // Find peak amplitude in this chunk
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j]);
      if (abs > peak) {
        peak = abs;
      }
    }

    peaks[i] = peak;
  }

  return peaks;
}
