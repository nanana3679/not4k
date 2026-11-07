/**
 * 옵저버 감속 청음 비교 Lab(RFD 0076)의 곡 위치 시계·예약 계산.
 * 오디오 장치·AudioWorklet에 닿는 코드는 observerSlowdownRig.ts에 두고, 여기에는 시험 가능한 계산만 둔다.
 */

/** ctxTime(AudioContext 시각)에 곡 위치가 songTime이고, 그 뒤로 rate 배로 흐르는 직선 구간. */
export interface SongClock {
  ctxTime: number;
  songTime: number;
  rate: number;
}

/**
 * 구간별 곡 위치 시계. 첫 구간이 시작이고, 뒤 구간은 ctxTime 순서의 재생 속도 변경이다.
 * 각 구간은 다음 구간의 ctxTime(적용 시각)까지 유효하므로 예약만 하고 아직 적용되지 않은 변경은 지금 위치를 바꾸지 않는다.
 */
export type PiecewiseClock = readonly SongClock[];

/** 구간이 시작하기 전(예약한 시작 시각 전)에는 시작 위치에 머문다. */
export function songTimeAt(clock: SongClock, ctxTime: number): number {
  return clock.songTime + Math.max(0, ctxTime - clock.ctxTime) * clock.rate;
}

export function ctxTimeOfSong(clock: SongClock, songTime: number): number {
  return clock.ctxTime + (songTime - clock.songTime) / clock.rate;
}

export function startClock(ctxTime: number, songTime: number, rate: number): PiecewiseClock {
  return [{ ctxTime, songTime, rate }];
}

/** ctxTime에 유효한 구간. 적용 시각과 같은 순간에는 새 구간을 쓴다(두 구간이 같은 위치를 가리킨다). */
function segmentAt(clock: PiecewiseClock, ctxTime: number): SongClock {
  let segment = clock[0];
  for (const candidate of clock) {
    if (candidate.ctxTime > ctxTime) break;
    segment = candidate;
  }
  return segment;
}

export function clockSongTimeAt(clock: PiecewiseClock, ctxTime: number): number {
  return songTimeAt(segmentAt(clock, ctxTime), ctxTime);
}

/** 곡 위치 songTime이 들리는 AudioContext 시각. 재생 속도가 늘 양수라 구간의 곡 위치도 ctxTime 순서로 늘어난다. */
export function clockCtxTimeOfSong(clock: PiecewiseClock, songTime: number): number {
  let segment = clock[0];
  for (const candidate of clock) {
    if (candidate.songTime > songTime) break;
    segment = candidate;
  }
  return ctxTimeOfSong(segment, songTime);
}

/**
 * applyAt부터 rate로 흐르게 바꾼다. applyAt까지는 기존 구간을 그대로 두고, applyAt 이후로 예약해 둔 구간은 버린다.
 * 새 구간은 applyAt의 곡 위치에서 시작하므로 위치가 끊기지 않는다. 시작 예약 전에 바꾸면 시작 시각·위치는 두고 배속만 바꾼다.
 */
export function changeClockRate(clock: PiecewiseClock, applyAt: number, rate: number): PiecewiseClock {
  const ctxTime = Math.max(applyAt, clock[0].ctxTime);
  const kept = clock.filter((segment) => segment.ctxTime < ctxTime);
  const songTime = kept.length > 0 ? clockSongTimeAt(kept, ctxTime) : clock[0].songTime;
  return [...kept, { ctxTime, songTime, rate }];
}

export interface ScheduledBeat {
  beat: number;
  ctxTime: number;
}

/** 창 시작이 박과 같은 곡 위치일 때 부동소수 오차로 그 박을 지나친 것으로 보지 않게 하는 여유(박 단위). */
const BEAT_EPSILON = 1e-9;

/** [fromCtx, toCtx) 동안 들릴 박 중 afterBeat 뒤이고 곡 길이 안에 있는 박과 그 AudioContext 시각. */
export function beatsToSchedule(
  clock: PiecewiseClock,
  fromCtx: number,
  toCtx: number,
  beatSeconds: number,
  durationSeconds: number,
  afterBeat: number,
): ScheduledBeat[] {
  const fromSong = clockSongTimeAt(clock, fromCtx);
  const toSong = Math.min(clockSongTimeAt(clock, toCtx), durationSeconds);
  const beats: ScheduledBeat[] = [];
  for (let beat = Math.max(Math.ceil(fromSong / beatSeconds - BEAT_EPSILON), afterBeat + 1); beat * beatSeconds < toSong; beat += 1) {
    beats.push({ beat, ctxTime: clockCtxTimeOfSong(clock, beat * beatSeconds) });
  }
  return beats;
}

/**
 * 시계가 changeAt부터 바뀌었을 때 이미 예약한 박 클릭을 나눈다.
 * changeAt 전 클릭은 두 시계가 같으므로 두고, changeAt 이후 클릭은 취소해 새 시계로 다시 예약한다.
 * 다음 예약은 남긴 마지막 박 뒤(lastBeat)부터 이어 가므로 박을 빠뜨리거나 두 번 울리지 않는다.
 */
export function splitClicksAtChange<T extends ScheduledBeat>(
  clicks: readonly T[],
  changeAt: number,
  lastBeat: number,
): { keep: T[]; cancel: T[]; lastBeat: number } {
  const keep = clicks.filter((click) => click.ctxTime < changeAt);
  const cancel = clicks.filter((click) => click.ctxTime >= changeAt);
  return {
    keep,
    cancel,
    lastBeat: cancel.length > 0 ? Math.min(...cancel.map((click) => click.beat)) - 1 : lastBeat,
  };
}

/** Web Audio가 한 번에 처리하는 프레임 수. AudioParam의 k-rate 값과 AudioWorklet의 process()는 이 경계마다 바뀐다. */
export const RENDER_QUANTUM_FRAMES = 128;

/** ctxTime 이후 첫 렌더 퀀텀 경계(이미 경계면 그대로). 예약을 경계에 맞추면 k-rate 값·process()가 그 시각에 정확히 바뀐다. */
export function renderQuantumTimeAtOrAfter(ctxTime: number, sampleRate: number): number {
  return Math.ceil(ctxTime * sampleRate / RENDER_QUANTUM_FRAMES - 1e-9) * RENDER_QUANTUM_FRAMES / sampleRate;
}

/**
 * Signalsmith 처리기의 출력 지연(초). 인자 없는 stop()은 처리기 currentTime에, start()는 currentTime + 출력 지연에
 * 변경을 예약하고 그 변경을 돌려준다. 둘을 연달아 보낸 측정마다 두 출력 시각의 차를 잰다.
 * 사이에 렌더 퀀텀이 끼면 차가 커질 뿐 작아지지 않으므로 가장 작은 값을 프레임 단위로 맞춰 쓴다.
 */
export function outputLatencyFromProbes(
  probes: readonly { stoppedOutput: number; startedOutput: number }[],
  sampleRate: number,
): number {
  if (probes.length === 0) throw new Error("Signalsmith 출력 지연 측정값이 없습니다.");
  const smallest = Math.min(...probes.map((probe) => probe.startedOutput - probe.stoppedOutput));
  return Math.round(smallest * sampleRate) / sampleRate;
}
