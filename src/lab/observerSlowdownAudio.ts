/**
 * 옵저버 감속 청음 비교 Lab(RFD 0076)의 순수 계산.
 * 오디오 장치·AudioWorklet에 닿는 코드는 observerSlowdownRig.ts에 두고, 여기에는 시험 가능한 계산만 둔다.
 */

/** 옵저버 감속 범위(0.25x～1.0x)에서 비교할 재생 속도. */
export const OBSERVER_SLOWDOWN_RATES = [0.25, 0.5, 0.75, 1] as const;
export type ObserverSlowdownRate = (typeof OBSERVER_SLOWDOWN_RATES)[number];

/** ctxTime(AudioContext 시각)에 곡 위치가 songTime이고, 그 뒤로 rate 배로 흐르는 직선 시계. */
export interface SongClock {
  ctxTime: number;
  songTime: number;
  rate: number;
}

/** 시계가 시작하기 전(예약한 시작 시각 전)에는 시작 위치에 머문다. */
export function songTimeAt(clock: SongClock, ctxTime: number): number {
  return clock.songTime + Math.max(0, ctxTime - clock.ctxTime) * clock.rate;
}

export function ctxTimeOfSong(clock: SongClock, songTime: number): number {
  return clock.ctxTime + (songTime - clock.songTime) / clock.rate;
}

/**
 * changeAt 시각의 곡 위치에서 새 rate로 이어지는 시계. 시작 예약 전에 바꾸면 시작 시각·위치는 그대로 두고 rate만 바꾼다.
 * 위치가 끊기지 않으므로 재생 속도 변경이 현재 위치에서 바로 적용된다(RFD 0076).
 */
export function retimeClock(clock: SongClock, changeAt: number, rate: number): SongClock {
  const ctxTime = Math.max(changeAt, clock.ctxTime);
  return { ctxTime, songTime: songTimeAt(clock, ctxTime), rate };
}

export interface ScheduledBeat {
  beat: number;
  ctxTime: number;
}

/** [fromCtx, toCtx) 동안 들릴 박 중 afterBeat 뒤이고 곡 길이 안에 있는 박과 그 AudioContext 시각. */
export function beatsToSchedule(
  clock: SongClock,
  fromCtx: number,
  toCtx: number,
  beatSeconds: number,
  durationSeconds: number,
  afterBeat: number,
): ScheduledBeat[] {
  const fromSong = songTimeAt(clock, fromCtx);
  const toSong = Math.min(songTimeAt(clock, toCtx), durationSeconds);
  const beats: ScheduledBeat[] = [];
  for (let beat = Math.max(Math.ceil(fromSong / beatSeconds), afterBeat + 1); beat * beatSeconds < toSong; beat += 1) {
    beats.push({ beat, ctxTime: ctxTimeOfSong(clock, beat * beatSeconds) });
  }
  return beats;
}

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
