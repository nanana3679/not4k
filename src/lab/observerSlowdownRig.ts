/**
 * 옵저버 감속 청음 비교 Lab의 오디오 배선. 결정 보조용이며 게임의 AudioEngine·GameClock은 쓰지 않는다.
 * AudioWorkletNode를 모듈 최상위에서 상속하는 라이브러리가 있어 페이지가 사용자 클릭 뒤에 동적으로 읽는다.
 * 시계·측정 계산은 observerSlowdownClock.ts·observerSlowdownAudio.ts의 순수 함수에 있다.
 */
import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
// ?url은 개발 서버와 Lab 정적 빌드(GitHub Pages 하위 경로) 모두에서 Vite base가 붙은 같은 출처 주소가 된다.
// CSP(script-src 'self')가 blob: 워크릿을 막으므로 Signalsmith도 패키지 파일을 같은 출처 주소로 읽게 한다.
import soundTouchProcessorUrl from "@soundtouchjs/audio-worklet/processor?url";
import SignalsmithStretch, { type SignalsmithStretchNode } from "signalsmith-stretch";
import signalsmithModuleUrl from "signalsmith-stretch?url";
import {
  TEST_LOOP_BEAT_SECONDS,
  TEST_LOOP_SECONDS,
  createSerialQueue,
  encodeWav,
  isOutputQuiet,
  pollFirstOutput,
  testLoopHits,
  type TestLoopHit,
} from "./observerSlowdownAudio";
import {
  beatsToSchedule,
  changeClockRate,
  clockCtxTimeOfSong,
  clockSongTimeAt,
  outputLatencyFromProbes,
  renderQuantumTimeAtOrAfter,
  splitClicksAtChange,
  startClock,
  type PiecewiseClock,
  type ScheduledBeat,
  type SongClock,
} from "./observerSlowdownClock";

export type SlowdownMethodId = "media-element" | "signalsmith" | "soundtouch";

export interface SongInfo {
  name: string;
  durationSeconds: number;
  /** 생성 테스트 루프만 박 길이를 안다. 박 클릭은 이 값이 있을 때만 쓴다. */
  beatSeconds: number | null;
}

/** 클릭부터 첫 출력까지(초). "none"은 3초 안에 소리를 찾지 못함, "missed"는 분석 창 사이를 놓쳐 잴 수 없음. */
export type FirstOutputMeasurement = number | "none" | "missed";

export interface PlayResult {
  firstOutput: FirstOutputMeasurement;
  /** 클릭 시각부터 이 방식이 첫 소리를 예약한 시각까지(초). firstOutput에 이미 들어 있다. 예약하지 않는 방식은 null. */
  scheduledLeadSeconds: number | null;
}

export interface SlowdownRig {
  /** Signalsmith 노드 latency()가 돌려준 입력 + 출력 지연(초). */
  readonly signalsmithLatencySeconds: number;
  /** Signalsmith 처리기의 출력 지연(초). 버퍼 재생에서는 이만큼만 앞서 예약하면 된다. */
  readonly signalsmithOutputLatencySeconds: number;
  /** 예약하는 방식이 시작·속도 변경을 지금보다 이만큼 뒤(렌더 퀀텀 경계로 올림)로 예약한다. */
  readonly scheduleLeadSeconds: number;
  /** 브라우저가 보고한 장치 출력 지연(baseLatency + outputLatency). 세 방식에 똑같이 더해진다. */
  deviceLatencySeconds(): number;
  loadTestLoop(): Promise<SongInfo>;
  loadFile(file: File): Promise<SongInfo>;
  /**
   * method로 songTime부터 재생한다. 다른 방식이 재생 중이면 멈추고 넘어간다.
   * 호출 시각부터 그 방식의 출력에 소리가 처음 나타날 때까지를 재서 돌려주고, 다른 재생으로 넘어가거나 멈추면 null.
   */
  play(method: SlowdownMethodId, songTime: number, rate: number): Promise<PlayResult | null>;
  /** 재생 중인 방식에 지금 곡 위치에서 이어지는 새 재생 속도를 적용한다(RFD 0076). */
  setRate(rate: number): void;
  stop(): void;
  /**
   * 재생 중인 방식이 보고하는 곡 위치(곡 길이에서 멈춘다).
   * 재생 중이 아니거나, 곡 끝까지 재생해 그 방식의 출력이 끝났으면 재생을 멈추고 null.
   */
  songTime(): number | null;
  setMetronome(enabled: boolean): void;
  dispose(): void;
}

/**
 * 메인 스레드의 currentTime은 오디오 스레드가 한 번에 몰아 렌더링한 만큼씩 늦게 갱신된다(헤드리스 Chromium 44.1kHz에서 23.2ms).
 * 예약이 처리기에 도착했을 때 이미 지난 시각이 되지 않도록 그보다 길게 둔다.
 */
const SCHEDULE_LEAD_SECONDS = 0.03;
const FIRST_OUTPUT_TIMEOUT_MS = 3000;
/** AnalyserNode 최대 창(48kHz에서 약 683ms). 화면 프레임이 늦어도 창이 이어지게 한다. */
const ANALYSER_WINDOW_FRAMES = 32768;
const METRONOME_LOOKAHEAD_SECONDS = 0.15;
const METRONOME_TICK_MS = 25;
const WORKLET_READY_TIMEOUT_MS = 10_000;
const SIGNALSMITH_LATENCY_PROBES = 3;
/** 멈춘 SoundTouch 노드에 무음을 먹여 남은 소리를 흘려보내는 시간. 이 뒤에야 다음 재생에 다시 쓴다. */
const SOUNDTOUCH_DRAIN_MS = 1000;
/** 입력이 끝난 뒤 출력이 이만큼 조용하면 처리 꼬리가 다 나왔다고 본다. */
const SOUNDTOUCH_TAIL_QUIET_SECONDS = 0.3;
/** 처리 꼬리를 기다리는 상한. 조용해지지 않아도 입력이 끝나고 이만큼 지나면 멈춘다. */
const SOUNDTOUCH_TAIL_MAX_SECONDS = 1.5;

/** 시계가 changeAt부터 바뀌었다고 알린다. 박 클릭이 그 뒤 클릭만 다시 예약한다. */
type ClockChangeListener = (changeAt: number) => void;

interface Player {
  /** 재생을 시작하고 첫 소리를 예약한 AudioContext 시각을 돌려준다. 예약하지 않는 방식은 null. */
  play(songTime: number, rate: number): Promise<number | null>;
  setRate(rate: number): void;
  stop(): void;
  clock(): PiecewiseClock | null;
  /** 곡 끝까지 재생해 이 방식의 출력이 끝났는지. */
  ended(durationSeconds: number): boolean;
  /** 첫 출력 측정용 탭. 방식마다 게이트 뒤에 따로 있어 실제로 버스에 나가는 소리만 잰다. */
  tap: AnalyserNode;
}

interface Output {
  input: AudioNode;
  tap: AnalyserNode;
  open(at?: number): void;
  close(): void;
}

/**
 * 방식 출력 → 게이트 → 측정 탭 → 공용 버스.
 * 멈추면 게이트를 닫아 남은 처리 꼬리를 끊고, 곧바로 다시 재생해도 이전 꼬리가 들리거나 측정에 섞이지 않게 한다.
 */
function createOutput(context: AudioContext, bus: AudioNode): Output {
  const gate = context.createGain();
  gate.gain.value = 0;
  const tap = context.createAnalyser();
  tap.fftSize = ANALYSER_WINDOW_FRAMES;
  gate.connect(tap).connect(bus);
  return {
    input: gate,
    tap,
    open(at = context.currentTime) {
      gate.gain.cancelScheduledValues(0);
      gate.gain.setValueAtTime(0, context.currentTime);
      gate.gain.setValueAtTime(1, at);
    },
    close() {
      gate.gain.cancelScheduledValues(0);
      gate.gain.setTargetAtTime(0, context.currentTime, 0.005);
    },
  };
}

/** 예약하는 방식의 적용 시각. 지금 + 여유를 렌더 퀀텀 경계로 올려 k-rate 값·process()가 그 시각에 정확히 바뀌게 한다. */
const nextQuantumAfterLead = (context: AudioContext) =>
  renderQuantumTimeAtOrAfter(context.currentTime + SCHEDULE_LEAD_SECONDS, context.sampleRate);

function createMediaElementPlayer(context: AudioContext, output: Output, onClockChange: ClockChangeListener) {
  const element = new Audio();
  element.preservesPitch = true;
  context.createMediaElementSource(element).connect(output.input);
  return {
    tap: output.tap,
    load(url: string) {
      element.src = url;
    },
    async play(songTime: number, rate: number) {
      element.currentTime = songTime;
      element.playbackRate = rate;
      output.open();
      await element.play();
      return null;
    },
    setRate(rate: number) {
      // 요소는 속도를 곧바로 받으므로 지금부터 시계가 바뀐다.
      element.playbackRate = rate;
      onClockChange(context.currentTime);
    },
    stop() {
      element.pause();
      output.close();
    },
    // 요소의 currentTime을 읽은 순간의 AudioContext 시각에 묶는다. 두 시계가 따로 흘러 샘플 단위로는 맞지 않는다.
    clock: (): PiecewiseClock | null => element.paused
      ? null
      : startClock(context.currentTime, element.currentTime, element.playbackRate),
    ended: () => element.ended,
  } satisfies Player & { load(url: string): void };
}

/**
 * 노드는 입력 + 출력 지연의 합(latency())만 알려 준다. 버퍼 재생에서 처리기는 입력 지연만큼 버퍼를 앞서 읽으므로
 * (SignalsmithStretch.mjs process()의 inputTime += inputLatencySeconds) 미리 예약해야 하는 시간은 출력 지연뿐이다.
 * 인자 없는 stop()·start()가 처리기 currentTime·currentTime + 출력 지연에 예약한 변경을 돌려주는 것으로 출력 지연을 잰다.
 * 아직 음원을 올리기 전이고 게이트도 닫혀 있어 이 예약은 들리지 않으며, 끝나면 정지 예약으로 되돌린다.
 */
async function probeSignalsmithOutputLatency(stretch: SignalsmithStretchNode, sampleRate: number): Promise<number> {
  const probes: { stoppedOutput: number; startedOutput: number }[] = [];
  for (let attempt = 0; attempt < SIGNALSMITH_LATENCY_PROBES; attempt += 1) {
    const [stopped, started] = await Promise.all([stretch.stop(), stretch.start()]);
    probes.push({ stoppedOutput: stopped.output, startedOutput: started.output });
  }
  await stretch.schedule({ active: false });
  return outputLatencyFromProbes(probes, sampleRate);
}

function createSignalsmithPlayer(
  context: AudioContext,
  output: Output,
  stretch: SignalsmithStretchNode,
  outputLatencySeconds: number,
  onClockChange: ClockChangeListener,
) {
  stretch.connect(output.input);
  let clock: PiecewiseClock | null = null;
  let queuedRate: number | null = null;
  let retryTimer = 0;
  // 처리기는 출력 지연만큼 앞서 계산하므로, 그보다 늦게 도착한 예약은 이미 계산한 소리를 바꾸지 못하고 위치가 튄다.
  // 시작·속도 변경 모두 지금 + 여유(렌더 퀀텀 경계) + 출력 지연에 예약해, 예약한 출력 시각에 그 곡 위치가 정확히 들리게 한다.
  const applyTime = () => nextQuantumAfterLead(context) + outputLatencySeconds;
  const send = (segment: SongClock) =>
    void stretch.schedule({ active: true, input: segment.songTime, rate: segment.rate, output: segment.ctxTime });
  const flushRate = () => {
    window.clearTimeout(retryTimer);
    if (!clock || queuedRate === null) return;
    // schedule()은 처리기 currentTime 이후로 잡혀 있던 예약을 모두 지운다. 직전 예약이 아직 적용 전이면 지금 보내면
    // 그 예약이 사라지므로, 메인 스레드 시각(처리기보다 늦다)이 그 적용 시각을 지난 뒤에 보낸다.
    const pendingUntil = clock[clock.length - 1].ctxTime;
    const now = context.currentTime;
    if (now <= pendingUntil) {
      retryTimer = window.setTimeout(flushRate, Math.max(5, (pendingUntil - now) * 1000 + 5));
      return;
    }
    const at = applyTime();
    clock = changeClockRate(clock, at, queuedRate);
    queuedRate = null;
    send(clock[clock.length - 1]);
    onClockChange(at);
  };
  const stop = () => {
    window.clearTimeout(retryTimer);
    queuedRate = null;
    clock = null;
    output.close();
    void stretch.schedule({ active: false });
  };
  return {
    tap: output.tap,
    async load(buffer: AudioBuffer) {
      await stretch.dropBuffers();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel).slice());
      await stretch.addBuffers(channels, channels.map((channel) => channel.buffer));
    },
    async play(songTime: number, rate: number) {
      window.clearTimeout(retryTimer);
      queuedRate = null;
      const at = applyTime();
      clock = startClock(at, songTime, rate);
      // 그 전까지 노드가 내는 소리는 이전 재생의 처리 꼬리뿐이라 게이트도 시작 시각에 연다.
      output.open(at);
      send(clock[0]);
      return at;
    },
    setRate(rate: number) {
      if (!clock) return;
      queuedRate = rate;
      flushRate();
    },
    stop,
    clock: () => clock,
    ended: (durationSeconds: number) => clock !== null && clockSongTimeAt(clock, context.currentTime) >= durationSeconds,
  } satisfies Player & { load(buffer: AudioBuffer): Promise<void> };
}

function createSoundTouchPlayer(context: AudioContext, output: Output, onClockChange: ClockChangeListener) {
  // SoundTouch 처리기는 process()가 늘 true를 돌려 연결을 끊어도 끝나지 않고, 처리 대기 샘플을 비우는 API도 없다.
  // 그래서 노드를 재생마다 버리지 않고 다시 쓴다. 노드에는 무음(값 0인 ConstantSource)을 늘 함께 먹여, 소스가 끝나거나
  // 멈춘 뒤에도 남은 샘플이 출력으로 빠져나가게 한다. 멈춘 노드는 꼬리가 빠질 때까지(SOUNDTOUCH_DRAIN_MS) 소리를 버리는
  // 출구에 물려 두고, 그 전에 다시 재생하면 새 노드를 만든다. 노드 수는 그 시간 안에 겹친 재생 수로 묶인다.
  const silence = context.createConstantSource();
  silence.offset.value = 0;
  silence.start();
  const drainSink = context.createGain();
  drainSink.gain.value = 0;
  drainSink.connect(context.destination);
  const idleNodes: SoundTouchNode[] = [];
  const drainTimers = new Set<number>();
  const take = () => {
    const node = idleNodes.pop() ?? new SoundTouchNode({ context });
    silence.connect(node);
    node.connect(output.input);
    return node;
  };
  const release = (node: SoundTouchNode) => {
    node.disconnect();
    node.connect(drainSink);
    const timer = window.setTimeout(() => {
      drainTimers.delete(timer);
      silence.disconnect(node);
      node.disconnect();
      idleNodes.push(node);
    }, SOUNDTOUCH_DRAIN_MS);
    drainTimers.add(timer);
  };
  const tailWindow = new Float32Array(output.tap.fftSize);
  let buffer: AudioBuffer | null = null;
  let current: { source: AudioBufferSourceNode; node: SoundTouchNode; clock: PiecewiseClock } | null = null;
  const stop = () => {
    if (!current) return;
    current.source.stop();
    current.source.disconnect();
    release(current.node);
    current = null;
    output.close();
  };
  return {
    tap: output.tap,
    load(next: AudioBuffer) {
      stop();
      buffer = next;
    },
    async play(songTime: number, rate: number) {
      stop();
      if (!buffer) throw new Error("음원을 먼저 고르세요.");
      // 노드의 playbackRate에 소스 재생 속도를 알려 주면 노드가 음높이를 1/rate로 되돌린다.
      const node = take();
      node.playbackRate.cancelScheduledValues(0);
      node.playbackRate.value = rate;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(node);
      const at = nextQuantumAfterLead(context);
      source.start(at, songTime);
      output.open();
      current = { source, node, clock: startClock(at, songTime, rate) };
      return at;
    },
    setRate(rate: number) {
      if (!current) return;
      // 두 playbackRate는 k-rate라 렌더 퀀텀 경계에서만 바뀐다. 경계에 맞춘 같은 시각에 함께 바꾸고, 그 뒤 예약은 시계처럼 지운다.
      const at = nextQuantumAfterLead(context);
      for (const param of [current.source.playbackRate, current.node.playbackRate]) {
        param.cancelScheduledValues(at);
        param.setValueAtTime(rate, at);
      }
      current.clock = changeClockRate(current.clock, at, rate);
      onClockChange(at);
    },
    stop,
    // 소스가 읽는 위치다. SoundTouch 처리 지연만큼 실제로 들리는 위치보다 앞선다.
    clock: () => current?.clock ?? null,
    /** 소스가 곡 끝을 읽은 뒤(입력 끝) 노드가 남은 소리를 다 내보내 출력이 조용해지면(출력 끝) 끝난다. */
    ended(durationSeconds: number) {
      if (!current) return false;
      const inputEnd = clockCtxTimeOfSong(current.clock, durationSeconds);
      const windowEnd = context.currentTime;
      if (windowEnd < inputEnd) return false;
      if (windowEnd >= inputEnd + SOUNDTOUCH_TAIL_MAX_SECONDS) return true;
      output.tap.getFloatTimeDomainData(tailWindow);
      // 창을 읽는 사이에 오디오 스레드가 더 진행했으면 창 끝 시각을 모르므로 다음 프레임에 다시 본다.
      if (context.currentTime !== windowEnd) return false;
      return isOutputQuiet(tailWindow, context.sampleRate, windowEnd, inputEnd, SOUNDTOUCH_TAIL_QUIET_SECONDS);
    },
    dispose() {
      stop();
      for (const timer of drainTimers) window.clearTimeout(timer);
      drainTimers.clear();
      silence.stop();
    },
  } satisfies Player & { load(buffer: AudioBuffer): void; dispose(): void };
}

/** 재생 중인 방식의 시계로 박 시각을 계산해 AudioContext 시계에 짧은 클릭을 미리 예약한다. */
function createMetronome(context: AudioContext, clockOf: () => PiecewiseClock | null) {
  let beatSeconds: number | null = null;
  let durationSeconds = 0;
  let lastBeat = -1;
  let pending: (ScheduledBeat & { gain: GainNode })[] = [];
  const scheduleClick = ({ beat, ctxTime }: ScheduledBeat) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = beat % 4 === 0 ? 2000 : 1500;
    gain.gain.setValueAtTime(0.3, ctxTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxTime + 0.03);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(ctxTime);
    oscillator.stop(ctxTime + 0.03);
    pending.push({ beat, ctxTime, gain });
  };
  const tick = () => {
    const clock = clockOf();
    if (!clock || beatSeconds === null) return;
    const now = context.currentTime;
    pending = pending.filter((click) => click.ctxTime > now);
    for (const beat of beatsToSchedule(clock, now, now + METRONOME_LOOKAHEAD_SECONDS, beatSeconds, durationSeconds, lastBeat)) {
      scheduleClick(beat);
      lastBeat = beat.beat;
    }
  };
  const timer = window.setInterval(tick, METRONOME_TICK_MS);
  const silence = (clicks: readonly { gain: GainNode }[]) => {
    for (const click of clicks) click.gain.disconnect();
  };
  const reset = () => {
    silence(pending);
    pending = [];
    lastBeat = -1;
  };
  return {
    configure(nextBeatSeconds: number | null, nextDurationSeconds: number) {
      beatSeconds = nextBeatSeconds;
      durationSeconds = nextDurationSeconds;
      reset();
    },
    /** 시계가 changeAt부터 바뀌었다. 그 전 클릭은 그대로 두고 그 뒤 클릭만 새 시계로 곧바로 다시 예약한다. */
    clockChanged(changeAt: number) {
      const split = splitClicksAtChange(pending, changeAt, lastBeat);
      silence(split.cancel);
      pending = split.keep;
      lastBeat = split.lastBeat;
      tick();
    },
    reset,
    dispose() {
      window.clearInterval(timer);
      reset();
    },
  };
}

function scheduleTestLoopHit(context: BaseAudioContext, output: AudioNode, noise: AudioBuffer, hit: TestLoopHit) {
  const gain = context.createGain();
  gain.connect(output);
  const envelope = (peak: number, decaySeconds: number) => {
    gain.gain.setValueAtTime(peak, hit.time);
    gain.gain.exponentialRampToValueAtTime(0.001, hit.time + decaySeconds);
    return hit.time + decaySeconds;
  };
  if (hit.voice === "kick" || hit.voice === "lead") {
    const oscillator = context.createOscillator();
    oscillator.connect(gain);
    if (hit.voice === "kick") {
      oscillator.frequency.setValueAtTime(150, hit.time);
      oscillator.frequency.exponentialRampToValueAtTime(45, hit.time + 0.12);
    } else {
      oscillator.type = "triangle";
      oscillator.frequency.value = hit.frequency ?? 440;
    }
    oscillator.start(hit.time);
    oscillator.stop(hit.voice === "kick" ? envelope(0.9, 0.3) : envelope(0.22, 0.45));
    return;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  source.buffer = noise;
  filter.type = "highpass";
  filter.frequency.value = hit.voice === "snare" ? 1500 : 7000;
  source.connect(filter).connect(gain);
  source.start(hit.time);
  source.stop(hit.voice === "snare" ? envelope(0.5, 0.18) : envelope(0.18, 0.05));
}

/** 외부 에셋 없이 120 BPM 16초 루프(킥·스네어·하이햇·멜로디)를 OfflineAudioContext로 렌더링한다. */
async function renderTestLoop(sampleRate: number): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(2, Math.round(TEST_LOOP_SECONDS * sampleRate), sampleRate);
  const noise = offline.createBuffer(1, sampleRate, sampleRate);
  const noiseSamples = noise.getChannelData(0);
  for (let index = 0; index < noiseSamples.length; index += 1) noiseSamples[index] = Math.random() * 2 - 1;
  // 킥·스네어·멜로디가 겹치는 박에서도 1.0을 넘지 않게 전체를 낮춘다(HTMLAudioElement용 WAV는 ±1에서 잘린다).
  const master = offline.createGain();
  master.gain.value = 0.6;
  master.connect(offline.destination);
  for (const hit of testLoopHits()) scheduleTestLoopHit(offline, master, noise, hit);
  return offline.startRendering();
}

/**
 * 화면 프레임마다 탭의 최근 창을 읽어 since 이후 첫 소리를 찾는다. 창이 이어지지 않으면(탭 전환 등으로 프레임이 창 길이보다
 * 늦음) "missed", performance.now() 기준 3초 안에 못 찾으면 "none"이다. AudioContext가 멈춰 currentTime이 흐르지 않아도 끝난다.
 */
function measureFirstOutput(
  context: AudioContext,
  tap: AnalyserNode,
  since: number,
  isCurrent: () => boolean,
): Promise<FirstOutputMeasurement | null> {
  const samples = new Float32Array(tap.fftSize);
  const startedAt = performance.now();
  let coveredUntil = since;
  return new Promise((resolve) => {
    const poll = () => {
      if (!isCurrent()) return resolve(null);
      const windowEnd = context.currentTime;
      tap.getFloatTimeDomainData(samples);
      // 창을 읽는 사이에 오디오 스레드가 더 진행했으면 창 끝 시각을 모르므로 이번 프레임은 건너뛴다.
      if (context.currentTime === windowEnd) {
        const result = pollFirstOutput(samples, context.sampleRate, windowEnd, since, coveredUntil);
        if (result.kind === "found") return resolve(result.seconds);
        if (result.kind === "missed") return resolve("missed");
        coveredUntil = windowEnd;
      }
      if (performance.now() - startedAt > FIRST_OUTPUT_TIMEOUT_MS) return resolve("none");
      requestAnimationFrame(poll);
    };
    poll();
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** context는 사용자 클릭 안에서 만들어 넘긴다. 그래야 자동 재생 정책에 막히지 않는다. */
export async function createSlowdownRig(context: AudioContext): Promise<SlowdownRig> {
  const bus = context.createGain();
  bus.connect(context.destination);
  SignalsmithStretch.moduleUrl = signalsmithModuleUrl;
  const [stretch] = await Promise.all([
    // WASM 컴파일이 막히면(CSP에 'wasm-unsafe-eval' 없음) Signalsmith 노드는 오류 없이 준비 신호만 보내지 않는다.
    withTimeout(SignalsmithStretch(context), WORKLET_READY_TIMEOUT_MS, "Signalsmith Stretch 워크릿이 10초 안에 준비되지 않았습니다. CSP의 'wasm-unsafe-eval'을 확인하세요."),
    SoundTouchNode.register(context, soundTouchProcessorUrl),
  ]);
  const signalsmithLatencySeconds = await stretch.latency();
  const signalsmithOutputLatencySeconds = await probeSignalsmithOutputLatency(stretch, context.sampleRate);
  let active: SlowdownMethodId | null = null;
  let playToken = 0;
  let song: { info: SongInfo; mediaUrl: string } | null = null;
  let metronomeEnabled = false;
  // 박 클릭은 아래에서 만든다. 방식이 시계를 바꾸는 일은 재생 중에만 일어나므로 그때는 이미 있다.
  const onClockChange: ClockChangeListener = (changeAt) => metronome.clockChanged(changeAt);
  const mediaElement = createMediaElementPlayer(context, createOutput(context, bus), onClockChange);
  const signalsmith = createSignalsmithPlayer(context, createOutput(context, bus), stretch, signalsmithOutputLatencySeconds, onClockChange);
  const soundtouch = createSoundTouchPlayer(context, createOutput(context, bus), onClockChange);
  const players: Record<SlowdownMethodId, Player> = { "media-element": mediaElement, signalsmith, soundtouch };
  const metronome = createMetronome(context, () => (active ? players[active].clock() : null));
  const configureMetronome = () => metronome.configure(
    metronomeEnabled ? song?.info.beatSeconds ?? null : null,
    song?.info.durationSeconds ?? 0,
  );
  // 파일을 연달아 놓아도 읽기가 겹치지 않게 한다. 겹치면 Signalsmith에는 두 음원이 이어 붙고 다른 방식에는 뒤 음원만 남는다.
  const enqueueLoad = createSerialQueue();

  const stop = () => {
    playToken += 1;
    if (active) players[active].stop();
    active = null;
    metronome.reset();
  };

  const load = async (info: SongInfo, buffer: AudioBuffer, mediaUrl: string) => {
    stop();
    if (song) URL.revokeObjectURL(song.mediaUrl);
    song = { info, mediaUrl };
    mediaElement.load(mediaUrl);
    soundtouch.load(buffer);
    await signalsmith.load(buffer);
    configureMetronome();
    return info;
  };

  return {
    signalsmithLatencySeconds,
    signalsmithOutputLatencySeconds,
    scheduleLeadSeconds: SCHEDULE_LEAD_SECONDS,
    deviceLatencySeconds: () => context.baseLatency + (context.outputLatency || 0),
    loadTestLoop: () => enqueueLoad(async () => {
      const buffer = await renderTestLoop(context.sampleRate);
      const wav = encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], buffer.sampleRate);
      return load(
        { name: "생성 테스트 루프 (120 BPM)", durationSeconds: buffer.duration, beatSeconds: TEST_LOOP_BEAT_SECONDS },
        buffer,
        URL.createObjectURL(new Blob([wav], { type: "audio/wav" })),
      );
    }),
    loadFile: (file) => enqueueLoad(async () => {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      return load({ name: file.name, durationSeconds: buffer.duration, beatSeconds: null }, buffer, URL.createObjectURL(file));
    }),
    async play(method, songTime, rate) {
      stop();
      const token = playToken;
      const since = context.currentTime;
      // 기다리지 않고 바로 시작해야 호출 직후부터 songTime()이 이 방식의 위치를 돌려준다.
      active = method;
      const started = players[method].play(songTime, rate);
      if (context.state !== "running") void context.resume();
      let scheduledAt: number | null;
      try {
        scheduledAt = await started;
      } catch (error) {
        // 빠르게 다른 재생으로 넘어가며 중단된 시작(HTMLAudioElement의 AbortError)은 오류가 아니다.
        if (token !== playToken) return null;
        stop();
        throw error;
      }
      const firstOutput = await measureFirstOutput(context, players[method].tap, since, () => token === playToken);
      if (firstOutput === null) return null;
      return { firstOutput, scheduledLeadSeconds: scheduledAt === null ? null : scheduledAt - since };
    },
    setRate(rate) {
      if (active) players[active].setRate(rate);
    },
    stop,
    songTime() {
      if (!active || !song) return null;
      const player = players[active];
      const clock = player.clock();
      if (!clock || player.ended(song.info.durationSeconds)) {
        stop();
        return null;
      }
      return Math.min(clockSongTimeAt(clock, context.currentTime), song.info.durationSeconds);
    },
    setMetronome(enabled) {
      metronomeEnabled = enabled;
      configureMetronome();
    },
    dispose() {
      stop();
      metronome.dispose();
      soundtouch.dispose();
      if (song) URL.revokeObjectURL(song.mediaUrl);
      void context.close();
    },
  };
}
