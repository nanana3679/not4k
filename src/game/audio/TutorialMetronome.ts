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
    // 25ms 타이머는 120ms 앞까지 예약을 보충할 뿐, 박 위치는 항상 loopStartNow에서 구한다.
    const schedule = () => {
      const context = this.context;
      if (!context || context.state !== 'running') return;
      const sample = this.sample(context, performance.now());
      const from = Math.max(scheduledThrough, tutorialPerformanceTime(context.currentTime, sample) - origin);
      const until = Math.min(untilMs, tutorialPerformanceTime(context.currentTime + 0.12, sample) - origin);
      for (const click of getTutorialClicks(pattern, from, until)) {
        const at = tutorialAudioTime(origin + click.atMs, sample);
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
      /** 첫 클릭을 25ms 뒤에 예약하고, 그 소리가 들리는 시각에서 4박 뒤를 루프 0으로 삼는다. */
      start: (now: number) => {
        const context = this.ensureContext();
        return (context ? tutorialPerformanceTime(context.currentTime + 0.025, this.sample(context, now)) : now)
          + pattern.countInMs;
      },
      sync: (loopStartNow: number, playing: boolean, stopAtElapsedMs = Infinity) => {
        if (!playing) { stop(); return; }
        if (origin !== loopStartNow || untilMs !== stopAtElapsedMs) stop();
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
