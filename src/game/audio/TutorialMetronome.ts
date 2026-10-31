import {
  getTutorialClicks, tutorialAudioTime, tutorialPerformanceTime,
  type TutorialAudioClockSample, type TutorialMetronomePattern,
} from './tutorialMetronomeTiming';

/** 모달 하나가 소유한다. 생성만으로 AudioContext를 열지 않으며 두 슬롯이 같은 출력을 쓴다. */
export class TutorialMetronome {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private readonly tracks = new Set<{ stop(): void }>();

  setMasterVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  private ensureContext(): AudioContext | null {
    if (!this.context && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }

  /** 첫 기동 자동 열기는 무음으로 진행할 수 있다. pointer/key 제스처에서만 resume을 요청한다. */
  resumeFromGesture(): void {
    const context = this.ensureContext();
    if (context?.state === 'suspended') void context.resume().catch(() => {});
  }

  private sample(context: AudioContext, now: number): TutorialAudioClockSample {
    const finite = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;
    return { audioTime: context.currentTime, performanceTime: now,
      latencyMs: (finite(context.baseLatency) + finite(context.outputLatency)) * 1000,
      outputTimestamp: context.getOutputTimestamp?.(),
    };
  }

  createTrack(pattern: TutorialMetronomePattern) {
    let origin = 0;
    let audioOrigin: number | null = null;
    let mapping: TutorialAudioClockSample | null = null;
    let runningSince: number | null = null;
    let previousValidTimestamp = false;
    let lastSampleNow = -Infinity;
    const settledMapping = (context: AudioContext, now: number) => {
      if (mapping) return mapping;
      runningSince ??= now;
      // 같은 프레임의 start/sync 호출을 연속된 출력 관측으로 세지 않는다.
      if (now - lastSampleNow < 25) return null;
      lastSampleNow = now;
      const sample = this.sample(context, now);
      const stamp = sample.outputTimestamp;
      const valid = !!stamp && Number.isFinite(stamp.contextTime) && stamp.contextTime! > 0
        && Number.isFinite(stamp.performanceTime) && stamp.performanceTime! > 0;
      if (valid && previousValidTimestamp) mapping = sample;
      else if (now - runningSince >= 200) mapping = { ...sample, outputTimestamp: undefined };
      previousValidTimestamp = valid;
      return mapping;
    };
    let untilMs = Infinity;
    let scheduledThrough = -Infinity;
    let timer: ReturnType<typeof setInterval> | undefined;
    const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      for (const { oscillator, gain } of voices) {
        oscillator.onended = null;
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
      }
      voices.clear();
      scheduledThrough = -Infinity;
    };
    // 한 번 고른 AudioContext 원점에서만 예약한다. 이후 출력 mapping 변화는 재보정하지 않는다.
    // 제스처로 처음 출력을 열 때는 이미 진행 중인 무음 루프에 합류하며 예약 불가능한 박은 건너뛴다.
    const schedule = () => {
      const context = this.context;
      if (!context || context.state !== 'running') return;
      const sample = settledMapping(context, performance.now());
      if (!sample) return;
      audioOrigin ??= tutorialAudioTime(origin, sample);
      const from = Math.max(scheduledThrough, (context.currentTime - audioOrigin) * 1000);
      const until = Math.min(untilMs, (context.currentTime + 0.12 - audioOrigin) * 1000);
      for (const click of getTutorialClicks(pattern, from, until)) {
        const at = audioOrigin + click.atMs / 1000;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const voice = { oscillator, gain };
        voices.add(voice);
        oscillator.frequency.value = click.accent ? 1200 : 1000;
        gain.gain.setValueAtTime(click.accent ? 0.22 : 0.18, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.025);
        oscillator.connect(gain);
        gain.connect(this.gain!);
        oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + 0.03);
      }
      scheduledThrough = Math.max(scheduledThrough, until);
    };
    const track = {
      /** running 출력이 안정될 때까지 null. 첫 클릭의 audio 원점에서 들리는 루프 0을 역산한다. */
      start: (now: number): number | null => {
        const context = this.ensureContext();
        // rAF 시각은 과거일 수 있어 audio 관측에는 실제 performance 시각을 짝지어 쓴다.
        const sampleNow = performance.now();
        if (!context || context.state !== 'running') {
          // 자동 열기는 무음으로 진행한다. 나중의 첫 제스처는 이 performance 원점을 유지한다.
          return (context ? tutorialPerformanceTime(context.currentTime + 0.025, this.sample(context, sampleNow)) : now)
            + pattern.countInMs;
        }
        const sample = settledMapping(context, sampleNow);
        if (!sample) return null;
        audioOrigin = context.currentTime + 0.025 + pattern.countInMs / 1000;
        origin = tutorialPerformanceTime(audioOrigin, sample);
        return origin;
      },
      /** 고정 mapping을 유지하며 다음 박을 예약할 여유를 화면·판정에도 적용한다. */
      resumeDelayMs: (now: number) => {
        const context = this.context;
        if (!context || context.state !== 'running') return 0;
        return Math.max(25, tutorialPerformanceTime(context.currentTime + 0.025,
          mapping ?? this.sample(context, now)) - now);
      },
      sync: (loopStartNow: number, playing: boolean, stopAtElapsedMs = Infinity) => {
        if (!playing) { stop(); return; }
        if (origin !== loopStartNow) { stop(); audioOrigin = null; }
        if (untilMs !== stopAtElapsedMs) stop();
        origin = loopStartNow;
        untilMs = stopAtElapsedMs;
        if (timer === undefined) timer = setInterval(schedule, 25);
        schedule();
      },
      stop: () => { stop(); this.tracks.delete(track); },
    };
    this.tracks.add(track);
    return track;
  }

  dispose(): void {
    for (const track of this.tracks) track.stop();
    const context = this.context;
    this.context = null;
    this.gain = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
