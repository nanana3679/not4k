/**
 * 옵저버 감속 청음 비교 Lab의 오디오 배선. 결정 보조용이며 게임의 AudioEngine·GameClock은 쓰지 않는다.
 * AudioWorkletNode를 모듈 최상위에서 상속하는 라이브러리가 있어 페이지가 사용자 클릭 뒤에 동적으로 읽는다.
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
  beatsToSchedule,
  encodeWav,
  firstAudibleIndex,
  retimeClock,
  songTimeAt,
  testLoopHits,
  type SongClock,
  type TestLoopHit,
} from "./observerSlowdownAudio";

export type SlowdownMethodId = "media-element" | "signalsmith" | "soundtouch";

export interface SongInfo {
  name: string;
  durationSeconds: number;
  /** 생성 테스트 루프만 박 길이를 안다. 박 클릭은 이 값이 있을 때만 쓴다. */
  beatSeconds: number | null;
}

export interface SlowdownRig {
  /** Signalsmith 노드가 보고한 입력 + 출력 지연(초). */
  readonly signalsmithLatencySeconds: number;
  /** 브라우저가 보고한 장치 출력 지연(baseLatency + outputLatency). 세 방식에 똑같이 더해진다. */
  deviceLatencySeconds(): number;
  loadTestLoop(): Promise<SongInfo>;
  loadFile(file: File): Promise<SongInfo>;
  /**
   * method로 songTime부터 재생한다. 다른 방식이 재생 중이면 멈추고 넘어간다.
   * 호출 시각부터 그 방식의 출력에 소리가 처음 나타날 때까지(초)를 돌려주고, 감지하지 못했거나 다른 재생으로 넘어가면 null.
   */
  play(method: SlowdownMethodId, songTime: number, rate: number): Promise<number | null>;
  /** 재생 중인 방식에 지금 곡 위치에서 바로 새 재생 속도를 적용한다(RFD 0076). */
  setRate(rate: number): void;
  stop(): void;
  /** 재생 중인 방식이 보고하는 곡 위치. 재생 중이 아니면 null. */
  songTime(): number | null;
  setMetronome(enabled: boolean): void;
  dispose(): void;
}

/** 메인 스레드의 currentTime은 오디오 스레드보다 늦게 갱신된다. 시작·속도 변경을 이만큼 뒤로 예약해 과거 시각이 되지 않게 한다. */
const SCHEDULE_LEAD_SECONDS = 0.02;
const FIRST_OUTPUT_TIMEOUT_SECONDS = 3;
const METRONOME_LOOKAHEAD_SECONDS = 0.15;
const METRONOME_TICK_MS = 25;
const WORKLET_READY_TIMEOUT_MS = 10_000;

interface Player {
  play(songTime: number, rate: number): Promise<void>;
  setRate(rate: number): void;
  stop(): void;
  clock(): SongClock | null;
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
  tap.fftSize = 2048;
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

function createMediaElementPlayer(context: AudioContext, output: Output) {
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
    },
    setRate(rate: number) {
      element.playbackRate = rate;
    },
    stop() {
      element.pause();
      output.close();
    },
    // 요소의 currentTime을 읽은 순간의 AudioContext 시각에 묶는다. 두 시계가 따로 흘러 샘플 단위로는 맞지 않는다.
    clock: (): SongClock | null => element.paused
      ? null
      : { ctxTime: context.currentTime, songTime: element.currentTime, rate: element.playbackRate },
  } satisfies Player & { load(url: string): void };
}

function createSignalsmithPlayer(context: AudioContext, output: Output, stretch: SignalsmithStretchNode, latencySeconds: number) {
  stretch.connect(output.input);
  let clock: SongClock | null = null;
  return {
    tap: output.tap,
    async load(buffer: AudioBuffer) {
      await stretch.dropBuffers();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel).slice());
      await stretch.addBuffers(channels, channels.map((channel) => channel.buffer));
    },
    async play(songTime: number, rate: number) {
      // 노드가 자기 지연을 보정하므로 보고 지연만큼 뒤로 예약하면 첫 소리부터 songTime이 그 시각에 들린다.
      // 그 전까지 노드가 내는 소리는 이전 재생의 처리 꼬리뿐이라 게이트도 시작 시각에 연다.
      clock = { ctxTime: context.currentTime + SCHEDULE_LEAD_SECONDS + latencySeconds, songTime, rate };
      output.open(clock.ctxTime);
      await stretch.schedule({ active: true, input: clock.songTime, rate, output: clock.ctxTime });
    },
    setRate(rate: number) {
      if (!clock) return;
      // 지연 보정을 기다리지 않고 곧바로 다시 예약한다. 노드는 자기 지연 동안 이전 속도의 소리와 섞어 넘어간다.
      clock = retimeClock(clock, context.currentTime + SCHEDULE_LEAD_SECONDS, rate);
      void stretch.schedule({ active: true, input: clock.songTime, rate, output: clock.ctxTime });
    },
    stop() {
      clock = null;
      output.close();
      void stretch.schedule({ active: false });
    },
    clock: () => clock,
  } satisfies Player & { load(buffer: AudioBuffer): Promise<void> };
}

function createSoundTouchPlayer(context: AudioContext, output: Output) {
  let buffer: AudioBuffer | null = null;
  let current: { source: AudioBufferSourceNode; node: SoundTouchNode; clock: SongClock } | null = null;
  const stop = () => {
    if (!current) return;
    current.source.stop();
    current.source.disconnect();
    current.node.disconnect();
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
      // 처리 노드는 재생마다 새로 만들어 이전 재생에서 남은 처리 대기 샘플이 섞이지 않게 한다.
      // 노드의 playbackRate에 소스 재생 속도를 알려 주면 노드가 음높이를 1/rate로 되돌린다.
      const node = new SoundTouchNode({ context });
      node.playbackRate.value = rate;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(node).connect(output.input);
      const ctxTime = context.currentTime + SCHEDULE_LEAD_SECONDS;
      source.start(ctxTime, songTime);
      output.open();
      current = { source, node, clock: { ctxTime, songTime, rate } };
    },
    setRate(rate: number) {
      if (!current) return;
      const at = context.currentTime + SCHEDULE_LEAD_SECONDS;
      current.source.playbackRate.setValueAtTime(rate, at);
      current.node.playbackRate.setValueAtTime(rate, at);
      current.clock = retimeClock(current.clock, at, rate);
    },
    stop,
    // 소스가 읽는 위치다. SoundTouch 처리 지연만큼 실제로 들리는 위치보다 앞선다.
    clock: () => current?.clock ?? null,
  } satisfies Player & { load(buffer: AudioBuffer): void };
}

/** 재생 중인 방식의 시계로 박 시각을 계산해 AudioContext 시계에 짧은 클릭을 미리 예약한다. */
function createMetronome(context: AudioContext, clockOf: () => SongClock | null) {
  let beatSeconds: number | null = null;
  let durationSeconds = 0;
  let lastBeat = -1;
  let pending: { gain: GainNode; at: number }[] = [];
  const scheduleClick = (at: number, accent: boolean) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = accent ? 2000 : 1500;
    gain.gain.setValueAtTime(0.3, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.03);
    pending.push({ gain, at });
  };
  const timer = window.setInterval(() => {
    const clock = clockOf();
    if (!clock || beatSeconds === null) return;
    const now = context.currentTime;
    pending = pending.filter((click) => click.at > now);
    for (const { beat, ctxTime } of beatsToSchedule(clock, now, now + METRONOME_LOOKAHEAD_SECONDS, beatSeconds, durationSeconds, lastBeat)) {
      scheduleClick(ctxTime, beat % 4 === 0);
      lastBeat = beat;
    }
  }, METRONOME_TICK_MS);
  /** 위치·속도가 바뀌면 예약해 둔 앞으로의 클릭을 지우고 새 시계로 다시 예약한다. */
  const reset = () => {
    for (const click of pending) click.gain.disconnect();
    pending = [];
    lastBeat = -1;
  };
  return {
    configure(nextBeatSeconds: number | null, nextDurationSeconds: number) {
      beatSeconds = nextBeatSeconds;
      durationSeconds = nextDurationSeconds;
      reset();
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

function measureFirstOutput(context: AudioContext, tap: AnalyserNode, since: number, isCurrent: () => boolean): Promise<number | null> {
  const samples = new Float32Array(tap.fftSize);
  return new Promise((resolve) => {
    const poll = () => {
      if (!isCurrent()) return resolve(null);
      tap.getFloatTimeDomainData(samples);
      const now = context.currentTime;
      const windowStart = now - samples.length / context.sampleRate;
      // 호출 전에 이미 분석 창에 있던 소리(같은 방식을 곧바로 다시 재생한 경우의 꼬리)는 세지 않는다.
      const index = firstAudibleIndex(samples, Math.ceil((since - windowStart) * context.sampleRate));
      if (index >= 0) return resolve(Math.max(0, windowStart + index / context.sampleRate - since));
      if (now - since > FIRST_OUTPUT_TIMEOUT_SECONDS) return resolve(null);
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
  const mediaElement = createMediaElementPlayer(context, createOutput(context, bus));
  const signalsmith = createSignalsmithPlayer(context, createOutput(context, bus), stretch, signalsmithLatencySeconds);
  const soundtouch = createSoundTouchPlayer(context, createOutput(context, bus));
  const players: Record<SlowdownMethodId, Player> = { "media-element": mediaElement, signalsmith, soundtouch };
  let active: SlowdownMethodId | null = null;
  let playToken = 0;
  let song: { info: SongInfo; mediaUrl: string } | null = null;
  let metronomeEnabled = false;
  const metronome = createMetronome(context, () => (active ? players[active].clock() : null));
  const configureMetronome = () => metronome.configure(
    metronomeEnabled ? song?.info.beatSeconds ?? null : null,
    song?.info.durationSeconds ?? 0,
  );

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
    deviceLatencySeconds: () => context.baseLatency + (context.outputLatency || 0),
    async loadTestLoop() {
      const buffer = await renderTestLoop(context.sampleRate);
      const wav = encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], buffer.sampleRate);
      return load(
        { name: "생성 테스트 루프 (120 BPM)", durationSeconds: buffer.duration, beatSeconds: TEST_LOOP_BEAT_SECONDS },
        buffer,
        URL.createObjectURL(new Blob([wav], { type: "audio/wav" })),
      );
    },
    async loadFile(file) {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      return load({ name: file.name, durationSeconds: buffer.duration, beatSeconds: null }, buffer, URL.createObjectURL(file));
    },
    async play(method, songTime, rate) {
      stop();
      const token = playToken;
      const since = context.currentTime;
      // 기다리지 않고 바로 시작해야 호출 직후부터 songTime()이 이 방식의 위치를 돌려준다.
      active = method;
      const started = players[method].play(songTime, rate);
      if (context.state !== "running") void context.resume();
      try {
        await started;
      } catch (error) {
        // 빠르게 다른 재생으로 넘어가며 중단된 시작(HTMLAudioElement의 AbortError)은 오류가 아니다.
        if (token !== playToken) return null;
        stop();
        throw error;
      }
      return measureFirstOutput(context, players[method].tap, since, () => token === playToken);
    },
    setRate(rate) {
      if (!active) return;
      players[active].setRate(rate);
      metronome.reset();
    },
    stop,
    songTime() {
      const clock = active ? players[active].clock() : null;
      return clock ? songTimeAt(clock, context.currentTime) : null;
    },
    setMetronome(enabled) {
      metronomeEnabled = enabled;
      configureMetronome();
    },
    dispose() {
      stop();
      metronome.dispose();
      if (song) URL.revokeObjectURL(song.mediaUrl);
      void context.close();
    },
  };
}
