/**
 * 옵저버 감속 청음 비교 Lab(RFD 0076)의 순수 계산.
 * 오디오 장치·AudioWorklet에 닿는 코드는 observerSlowdownRig.ts에 두고, 여기에는 시험 가능한 계산만 둔다.
 * 곡 위치 시계·예약 계산은 observerSlowdownClock.ts에 있다.
 */

/** 옵저버 감속 범위(0.25x～1.0x)에서 비교할 재생 속도. */
export const OBSERVER_SLOWDOWN_RATES = [0.25, 0.5, 0.75, 1] as const;
export type ObserverSlowdownRate = (typeof OBSERVER_SLOWDOWN_RATES)[number];

export const TEST_LOOP_BPM = 120;
export const TEST_LOOP_BEAT_SECONDS = 60 / TEST_LOOP_BPM;
export const TEST_LOOP_BEATS = 32;
export const TEST_LOOP_SECONDS = TEST_LOOP_BEATS * TEST_LOOP_BEAT_SECONDS;

export type TestLoopVoice = "kick" | "snare" | "hat" | "lead";

export interface TestLoopHit {
  voice: TestLoopVoice;
  time: number;
  /** lead만 가진다. */
  frequency?: number;
}

/** 네 마디(16박) 멜로디. A4(69) = 440Hz가 들어 있어 음높이 유지를 귀로 비교하기 쉽다. */
const TEST_LOOP_LEAD_MIDI = [57, 60, 64, 67, 69, 67, 64, 60, 57, 60, 62, 64, 62, 60, 59, 55];

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 생성 테스트 루프의 타악기·멜로디 시각. 킥은 매 박, 스네어는 2·4박, 하이햇은 반박 뒤, 멜로디는 매 박.
 * 매 박 킥이 있어 박 클릭과 소리가 맞는지 바로 들린다.
 */
export function testLoopHits(): TestLoopHit[] {
  const hits: TestLoopHit[] = [];
  for (let beat = 0; beat < TEST_LOOP_BEATS; beat += 1) {
    const time = beat * TEST_LOOP_BEAT_SECONDS;
    hits.push({ voice: "kick", time });
    if (beat % 2 === 1) hits.push({ voice: "snare", time });
    hits.push({ voice: "hat", time: time + TEST_LOOP_BEAT_SECONDS / 2 });
    hits.push({ voice: "lead", time, frequency: midiToFrequency(TEST_LOOP_LEAD_MIDI[beat % TEST_LOOP_LEAD_MIDI.length]) });
  }
  return hits;
}

/** HTMLAudioElement가 생성 루프를 재생할 수 있도록 16-bit PCM WAV로 만든다. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  const blockAlign = channels.length * 2;
  const view = new DataView(new ArrayBuffer(44 + frames * blockAlign));
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + frames * blockAlign, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, frames * blockAlign, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, channel[frame])) * 0x7fff), true);
      offset += 2;
    }
  }
  return view.buffer;
}

/** 첫 출력 감지 문턱(-60 dBFS). */
export const AUDIBLE_THRESHOLD = 0.001;

/** 분석 창에서 notBeforeIndex 이후 처음으로 문턱을 넘는 샘플 위치. 없으면 -1. */
export function firstAudibleIndex(samples: Float32Array, notBeforeIndex = 0, threshold = AUDIBLE_THRESHOLD): number {
  for (let index = Math.max(0, notBeforeIndex); index < samples.length; index += 1) {
    if (Math.abs(samples[index]) > threshold) return index;
  }
  return -1;
}

/** found는 since부터 첫 소리까지(초), missed는 앞선 창과 이번 창 사이를 못 봐 첫 소리를 놓쳤을 수 있음, pending은 아직 소리 없음. */
export type FirstOutputPoll = { kind: "found"; seconds: number } | { kind: "missed" } | { kind: "pending" };

/**
 * windowEnd(AudioContext 시각)에서 끝나는 분석 창 samples 하나로 since 이후 첫 출력을 찾는다.
 * 앞선 창이 coveredUntil까지 봤는데 이번 창이 그보다 늦게 시작하면 그 사이에 첫 소리가 있었을 수 있어 missed로 둔다.
 * 처음 볼 때는 coveredUntil에 since를 넘긴다.
 */
export function pollFirstOutput(
  samples: Float32Array,
  sampleRate: number,
  windowEnd: number,
  since: number,
  coveredUntil: number,
  threshold = AUDIBLE_THRESHOLD,
): FirstOutputPoll {
  const windowStart = windowEnd - samples.length / sampleRate;
  if (windowStart > coveredUntil + 1 / sampleRate) return { kind: "missed" };
  // since 전에 이미 창에 있던 소리(같은 방식을 곧바로 다시 재생한 경우의 꼬리)는 세지 않는다.
  const index = firstAudibleIndex(samples, Math.ceil((since - windowStart) * sampleRate - 1e-6), threshold);
  if (index < 0) return { kind: "pending" };
  return { kind: "found", seconds: Math.max(0, windowStart + index / sampleRate - since) };
}

/**
 * windowEnd에서 끝나는 분석 창의 마지막 quietSeconds가 모두 문턱 아래이고, 그 구간이 통째로 notBefore(입력이 끝난 시각) 뒤인지.
 * 처리 노드에 입력이 끝난 뒤 남은 소리(처리 꼬리)가 다 나왔는지 볼 때 쓴다.
 */
export function isOutputQuiet(
  samples: Float32Array,
  sampleRate: number,
  windowEnd: number,
  notBefore: number,
  quietSeconds: number,
  threshold = AUDIBLE_THRESHOLD,
): boolean {
  const quietFrames = Math.round(quietSeconds * sampleRate);
  if (windowEnd - notBefore < quietSeconds || quietFrames > samples.length) return false;
  return firstAudibleIndex(samples, samples.length - quietFrames, threshold) < 0;
}

/**
 * 넣은 작업을 넣은 순서대로 하나씩 실행한다. 앞 작업이 실패해도 다음 작업은 실행한다.
 * 음원 읽기(Signalsmith의 dropBuffers → addBuffers)가 겹쳐 두 음원이 이어 붙지 않게 한다.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** 0:42.125 형식. */
export function formatSongTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const rest = (totalMs % 60000) / 1000;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

/** 0.25x, 1.0x 형식. */
export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : rate}x`;
}

export function formatMilliseconds(seconds: number): string {
  return `${Math.round(seconds * 1000)}ms`;
}
