import { expect, type Page } from '@playwright/test';
import type { ExplicitSessionResult } from '../src/game/judgment/ExplicitJudgmentSession';

interface Preparation {
  positionMs: number;
  rate: number;
  latencyMs: number;
  startedAtMs: number;
  visibleAfterMs: number | null;
}

interface FadedSpanStart {
  positionMs: number;
  rate: number;
  fromMs: number;
  toMs: number;
}

interface HudUpdate {
  /** playFadedSpan 호출 순번. Auto 전환·일시정지·재개는 늘리지 않는다. */
  span: number;
  combo: number;
  accuracy: number | null;
}

/** Observes real audio, runtime state and renderer calls without advancing the clock or scoring inputs. */
export async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const moduleUrl = (path: string) => performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path;
    const { GameRenderer } = await import(/* @vite-ignore */ moduleUrl('/src/game/renderer/GameRenderer.ts')) as typeof import('../src/game/renderer/GameRenderer');
    const { AudioEngine } = await import(/* @vite-ignore */ moduleUrl('/src/game/audio/AudioEngine.ts')) as typeof import('../src/game/audio/AudioEngine');
    const { ExplicitPlayRuntime } = await import(/* @vite-ignore */ moduleUrl('/src/game/screens/ExplicitPlayRuntime.ts')) as typeof import('../src/game/screens/ExplicitPlayRuntime');
    const probe = { explicitCharts: 0, warmups: 0, rendererDisposals: 0, audioDisposals: 0, starts: [] as number[],
      frames: 0, audioPlaying: false, audioPositionMs: 0, renderedTimeMs: 0,
      fadedSpans: [] as FadedSpanStart[], resumes: [] as number[], hud: [] as HudUpdate[],
      sourceStarts: [] as { offset: number; duration: number | undefined }[],
      preparations: [] as { positionMs: number; rate: number; latencyMs: number; startedAtMs: number; visibleAfterMs: number | null }[],
      playbackStarts: [] as number[][],
      groups: [] as string[], hitCount: 0, flightCount: 0, judgmentAt: 0, webgl: false, spriteCount: 0, keyboardListeners: 0,
      runtimeKeyboardListeners: 0,
      pauses: [] as { positionMs: number; rate: number; latencyMs: number }[],
      session: null as ExplicitSessionResult | null, chartVisible: false,
      partialFailure: false, partialSuccess: false };
    let currentAudio: InstanceType<typeof AudioEngine> | null = null;
    type RuntimeFields = {
      session: import('../src/game/judgment/ExplicitJudgmentSession').ExplicitJudgmentSession | null;
      onKeyDown: EventListener;
      onKeyUp: EventListener;
      input: { inputSystem: { handleKeyDown: EventListener; handleKeyUp: EventListener } } | null;
    };
    let currentRuntime: RuntimeFields | null = null;
    let lastSession: RuntimeFields['session'] = null;
    const start = ExplicitPlayRuntime.prototype.start;
    ExplicitPlayRuntime.prototype.start = function () {
      currentRuntime = this as unknown as RuntimeFields;
      return start.call(this);
    };
    Object.defineProperty(probe, 'session', { get: () => (currentRuntime?.session ?? lastSession)?.result() ?? null });
    Object.defineProperty(probe, 'judgmentAt', { get: () => currentAudio ? currentAudio.currentTimeMs - currentAudio.getOutputLatencyMs() * currentAudio.playbackRate : -Infinity });
    Object.defineProperty(probe, 'audioPlaying', { get: () => currentAudio?.playing ?? false });
    Object.defineProperty(probe, 'audioPositionMs', { get: () => currentAudio?.currentTimeMs ?? 0 });
    Object.assign(window, { explicitPlayProbe: probe });
    const keyboardListeners = new Set<EventListenerOrEventListenerObject>();
    const runtimeKeyboardListeners = new Set<EventListenerOrEventListenerObject>();
    const addListener = window.addEventListener.bind(window);
    const removeListener = window.removeEventListener.bind(window);
    window.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      if (type === 'keydown' || type === 'keyup') {
        keyboardListeners.add(listener); probe.keyboardListeners = keyboardListeners.size;
        const input = currentRuntime?.input?.inputSystem;
        if (listener === currentRuntime?.onKeyDown || listener === currentRuntime?.onKeyUp ||
          listener === input?.handleKeyDown || listener === input?.handleKeyUp) runtimeKeyboardListeners.add(listener);
        probe.runtimeKeyboardListeners = runtimeKeyboardListeners.size;
      }
      addListener(type, listener, options);
    };
    window.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      if (type === 'keydown' || type === 'keyup') {
        keyboardListeners.delete(listener); probe.keyboardListeners = keyboardListeners.size;
        runtimeKeyboardListeners.delete(listener); probe.runtimeKeyboardListeners = runtimeKeyboardListeners.size;
      }
      removeListener(type, listener, options);
    };
    const setChart = GameRenderer.prototype.setExplicitChart;
    GameRenderer.prototype.setExplicitChart = function (...args) { probe.explicitCharts++; return setChart.apply(this, args); };
    const setPlayback = GameRenderer.prototype.setExplicitPlaybackChart;
    GameRenderer.prototype.setExplicitPlaybackChart = function (chart) {
      probe.playbackStarts.push(chart.bodies.map(body => body.startMs));
      return setPlayback.call(this, chart);
    };
    const visibility = GameRenderer.prototype.setChartVisible;
    GameRenderer.prototype.setChartVisible = function (visible) {
      probe.chartVisible = visible;
      const result = visibility.call(this, visible);
      if (visible && probe.preparations.length) {
        const preparation = probe.preparations.at(-1)!;
        preparation.visibleAfterMs ??= performance.now() - preparation.startedAtMs;
      }
      return result;
    };
    const warmup = GameRenderer.prototype.prepareForPlayback;
    GameRenderer.prototype.prepareForPlayback = function (...args) { probe.warmups++; return warmup.apply(this, args); };
    const render = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      probe.frames++;
      probe.renderedTimeMs = args[0];
      lastSession = currentRuntime?.session ?? lastSession;
      const fields = this as unknown as { app: { renderer: { gl?: unknown } }; explicitNoteRenderer: { spriteCount: number } | null;
        explicitSnapshotQuery?: () => import('../src/game/judgment/ExplicitJudgmentState').ExplicitJudgmentSnapshot };
      probe.webgl ||= !!fields.app.renderer.gl;
      const result = render.apply(this, args);
      probe.spriteCount = Math.max(probe.spriteCount, fields.explicitNoteRenderer?.spriteCount ?? 0);
      const units = fields.explicitSnapshotQuery?.().bodyUnits ?? [];
      probe.partialFailure ||= units.some(unit => unit.state === 'failed') && units.some(unit => unit.state === 'active');
      probe.partialSuccess ||= units.some(unit => unit.state === 'failed') && units.some(unit => unit.state === 'complete');
      return result;
    };
    const show = GameRenderer.prototype.showJudgmentGroup;
    GameRenderer.prototype.showJudgmentGroup = function (state) { probe.groups.push(state.groupId); return show.call(this, state); };
    const bomb = GameRenderer.prototype.showBombEffect;
    GameRenderer.prototype.showBombEffect = function (lane) { probe.hitCount++; return bomb.call(this, lane); };
    const flight = GameRenderer.prototype.recordFlightJudgment;
    GameRenderer.prototype.recordFlightJudgment = function (grade) { probe.flightCount++; return flight.call(this, grade); };
    const dispose = GameRenderer.prototype.dispose;
    GameRenderer.prototype.dispose = function (...args) { probe.rendererDisposals++; return dispose.apply(this, args); };
    // Observer는 combo → accuracy 순서로 HUD를 갱신한다. 변경과 반복 첫 값을 보존해
    // Node 쪽 poll 사이에 0 → 성공 → 다음 반복이 모두 지나가도 경계를 검사할 수 있다.
    let combo = 0;
    const updateCombo = GameRenderer.prototype.updateCombo;
    GameRenderer.prototype.updateCombo = function (value) { combo = value; return updateCombo.call(this, value); };
    const updateAccuracy = GameRenderer.prototype.updateAccuracy;
    GameRenderer.prototype.updateAccuracy = function (accuracy) {
      const next = { span: probe.fadedSpans.length, combo, accuracy };
      const previous = probe.hud.at(-1);
      if (!previous || previous.span !== next.span || previous.combo !== combo || previous.accuracy !== accuracy) {
        probe.hud.push(next);
      }
      return updateAccuracy.call(this, accuracy);
    };
    const sourceStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      // 출력 지연 준비용 짧은 버퍼는 제외하고 실제 곡의 source 예약만 관찰한다.
      if (this.buffer && this.buffer.duration > 1) probe.sourceStarts.push({ offset: offset ?? 0, duration });
      return sourceStart.call(this, when, offset, duration);
    };
    const play = AudioEngine.prototype.play;
    AudioEngine.prototype.play = function (at) { currentAudio = this; probe.starts.push(at ?? 0); return play.call(this, at); };
    const playFadedSpan = AudioEngine.prototype.playFadedSpan;
    AudioEngine.prototype.playFadedSpan = function (span, positionMs = span.fromMs) {
      currentAudio = this;
      probe.fadedSpans.push({ positionMs, rate: this.playbackRate, fromMs: span.fromMs, toMs: span.toMs });
      return playFadedSpan.call(this, span, positionMs);
    };
    const prepare = AudioEngine.prototype.playWithPreroll;
    AudioEngine.prototype.playWithPreroll = function (positionMs) {
      currentAudio = this;
      probe.preparations.push({ positionMs, rate: this.playbackRate, latencyMs: this.getOutputLatencyMs(),
        startedAtMs: performance.now(), visibleAfterMs: null });
      return prepare.call(this, positionMs);
    };
    const pause = AudioEngine.prototype.pause;
    AudioEngine.prototype.pause = function () {
      probe.pauses.push({ positionMs: this.currentTimeMs, rate: this.playbackRate, latencyMs: this.getOutputLatencyMs() });
      return pause.call(this);
    };
    const resume = AudioEngine.prototype.resume;
    AudioEngine.prototype.resume = function () {
      probe.resumes.push(this.currentTimeMs);
      return resume.call(this);
    };
    const audioDispose = AudioEngine.prototype.dispose;
    AudioEngine.prototype.dispose = function () { probe.audioDisposals++; return audioDispose.call(this); };
  });
}
export async function probe(page: Page) {
  return page.evaluate(() => (window as unknown as { explicitPlayProbe: {
    explicitCharts: number; warmups: number; rendererDisposals: number; audioDisposals: number;
    frames: number; audioPlaying: boolean; audioPositionMs: number; renderedTimeMs: number;
    fadedSpans: FadedSpanStart[]; resumes: number[]; hud: HudUpdate[];
    sourceStarts: { offset: number; duration: number | undefined }[];
    starts: number[]; groups: string[]; hitCount: number; flightCount: number; webgl: boolean; spriteCount: number; keyboardListeners: number;
    runtimeKeyboardListeners: number;
    judgmentAt: number; partialFailure: boolean; partialSuccess: boolean; chartVisible: boolean;
    session: ExplicitSessionResult | null;
    pauses: { positionMs: number; rate: number; latencyMs: number }[];
    preparations: Preparation[];
    playbackStarts: number[][];
  } }).explicitPlayProbe);
}

export async function waitAt(page: Page, at: number) {
  await page.waitForFunction(target =>
    (window as unknown as { explicitPlayProbe: { judgmentAt: number } }).explicitPlayProbe.judgmentAt >= target,
  at, { polling: 10, timeout: 30000 });
}

/** playWithPreroll receives audio P; remove latency once and add 3 REAL seconds at playback rate. */
export function preparationTarget(preparation: Preparation): number {
  return preparation.positionMs + (3000 - preparation.latencyMs) * preparation.rate;
}

export async function expectPreparation(page: Page, settled: number) {
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-settled', String(settled));
  const state = await probe(page);
  expect(state.chartVisible).toBe(false);
  expect(state.session?.score.processedNotes).toBe(settled);
  return state;
}

