import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function generateSilentWav(durationSeconds: number, sampleRate = 44100): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2; // PCM format
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, offset); offset += 4;
  buffer.writeUInt16LE(numChannels * bytesPerSample, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk (silence — all zeros)
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset);

  return buffer;
}

export default function globalSetup() {
  const fixturesDir = join(__dirname, 'fixtures');
  const wavPath = join(fixturesDir, 'test-audio.wav');

  if (!existsSync(fixturesDir)) {
    mkdirSync(fixturesDir, { recursive: true });
  }

  if (!existsSync(wavPath)) {
    const wav = generateSilentWav(0.5);
    writeFileSync(wavPath, wav);
  }
}
