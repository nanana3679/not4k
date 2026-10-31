import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePlaybackRange } from '../../shared';
import type { PlaybackRange } from '../../shared';
import type { ExplicitNoteEntity } from '../../shared/types/chart';
import type { FadedAudioSpan } from '../audio/AudioEngine';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as t, makeExplicitReplayFixture } from '../judgment/explicitJudgmentTestHarness';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import { ExplicitJudgmentEffectSink } from '../judgment/ExplicitJudgmentEffectSink';
import { ObserverRepetition } from '../observer/ObserverRepetition';
import type { GameRenderer } from '../renderer/GameRenderer';
import { useGameStore } from '../stores/gameStore';
import type { GameSettings } from '../stores/gameStore';
import type { ObserverPlayState } from './ObserverPlayRuntime';

const fixture = vi.hoisted(() => ({ now: 0, latency: 0,
  audio: [] as FakeAudio[], renderers: [] as FakeRenderer[],
  skins: [] as { dispose: ReturnType<typeof vi.fn> }[], explicit: [] as { dispose: ReturnType<typeof vi.fn> }[],
  prepareAudio: async () => {}, load: async () => {}, init: async () => {},
}));
class FakeAudio {
  masterVolume = 1; playbackRate = 1; duration = 4000; position = 0; startedAt = 0; running = false;
  get currentTimeMs() { return this.position + (this.running ? (fixture.now - this.startedAt) * this.playbackRate : 0); }
  prepareForPlayback = vi.fn(() => fixture.prepareAudio());
  getOutputLatencyMs = () => fixture.latency;
  loadBuffer = vi.fn((buffer: AudioBuffer) => { this.duration = buffer.duration * 1000; });
  setPlaybackRange = vi.fn((requested: PlaybackRange | null) => {
    const range = normalizePlaybackRange(requested, this.duration / 1000);
    if (range) this.duration = (range.endTime - range.startTime) * 1000;
  });
  playFadedSpan = vi.fn((_span: FadedAudioSpan, startMs = _span.fromMs) => {
    this.position = startMs; this.startedAt = fixture.now; this.running = true;
  });
  play = vi.fn(); playWithPreroll = vi.fn();
  pause = vi.fn(() => { this.position = this.currentTimeMs; this.running = false; });
  resume = vi.fn(() => { this.startedAt = fixture.now; this.running = true; });
  dispose = vi.fn(async () => { this.running = false; });
  constructor() { fixture.audio.push(this); }
}
class FakeRenderer {
  init = vi.fn(() => fixture.init()); dispose = vi.fn();
  setExplicitChart = vi.fn<GameRenderer['setExplicitChart']>();
  setExplicitPlaybackChart = vi.fn<GameRenderer['setExplicitPlaybackChart']>();
  scrollSpeed = 0; setLift = vi.fn(); setSudden = vi.fn(); setChartVisible = vi.fn();
  setShowFastSlow = vi.fn(); setShowTimingDiff = vi.fn(); setPerfectWindow = vi.fn(); setupKeyboardDisplay = vi.fn();
  prepareForPlayback = vi.fn(); resetTransientState = vi.fn();
  setKeyState = vi.fn(); setKeyBeam = vi.fn(); renderFrame = vi.fn(); updateCombo = vi.fn(); updateAccuracy = vi.fn();
  showJudgmentGroup = vi.fn(); recordFlightJudgment = vi.fn(); showBombEffect = vi.fn();
  constructor() { fixture.renderers.push(this); }
}
vi.mock('../audio', () => ({ AudioEngine: class extends FakeAudio {} }));
vi.mock('../renderer/GameRenderer', () => ({ GameRenderer: class extends FakeRenderer {} }));
vi.mock('../skin', () => ({ SkinManager: class {
  dispose = vi.fn(); loadSkin = vi.fn(async () => {});
  constructor() { fixture.skins.push(this); }
} }));
vi.mock('../skin/ExplicitSkinLoader', () => ({ ExplicitSkinLoader: class {
  dispose = vi.fn(); load = vi.fn(() => fixture.load());
  constructor() { fixture.explicit.push(this); }
} }));
vi.mock('./gearMotionKeepAlive', () => ({ keepGearMotionAssets: () => null }));
const { ObserverPlayRuntime } = await import('./ObserverPlayRuntime');

class Target extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.add(listener);
    super.addEventListener(type, listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.delete(listener);
    super.removeEventListener(type, listener);
  }
}
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const players: InstanceType<typeof ObserverPlayRuntime>[] = [];
beforeEach(() => {
  fixture.now = 0; fixture.latency = 0; fixture.audio = []; fixture.renderers = []; fixture.skins = []; fixture.explicit = [];
  fixture.prepareAudio = async () => {}; fixture.load = async () => {}; fixture.init = async () => {};
  frames.clear(); frameId = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => fixture.now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  for (const player of players.splice(0)) player.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function create(notes: ExplicitNoteEntity[] = [p(1000), p(2000)], settings: Partial<GameSettings> = {}, duration = 4,
  playbackRange?: PlaybackRange) {
  const document = makeExplicitReplayFixture('ENJ-observer-runtime', '실제 Observer 런타임', notes, [],
    { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: 'whole' }).chart;
  const request = { document, compiled: compileExplicitJudgmentChart(document), audioBuffer: { duration } as AudioBuffer, playbackRange };
  const target = new Target();
  const onPhase = vi.fn(); const onError = vi.fn(); const onState = vi.fn<(state: ObserverPlayState) => void>();
  const config = { ...useGameStore.getInitialState().settings, gearMotion: false, inputOffsetMs: 0, visualOffsetMs: 0,
    keyBindings: { lane1: ['KeyW', 'KeyQ'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'] },
    ...settings };
  const player = new ObserverPlayRuntime({ request, settings: config, canvas: {} as HTMLCanvasElement,
    width: 1200, height: 700, inputTarget: target, onPhase, onError, onState });
  players.push(player);
  return { player, target, onPhase, onError, onState, config, request,
    state: () => onState.mock.lastCall![0] };
}
function at(songTimeMs: number) {
  const audio = fixture.audio.at(-1)!;
  fixture.now = audio.startedAt + (songTimeMs + fixture.latency * audio.playbackRate - audio.position) / audio.playbackRate;
}
function wallFrame(time: number) {
  fixture.now = time;
  const callbacks = [...frames.values()]; frames.clear();
  for (const callback of callbacks) callback(time);
}
function frame(songTimeMs: number) { at(songTimeMs); wallFrame(fixture.now); }
function key(target: Target, type: 'keydown' | 'keyup', code = 'KeyW', timeStamp = fixture.now) {
  const event = new Event(type);
  Object.defineProperties(event, { code: { value: code }, timeStamp: { value: timeStamp } });
  target.dispatchEvent(event);
}
const snapshot = () => fixture.renderers[0].setExplicitChart.mock.calls[0][2]();
function expectKeys(pressed: boolean) {
  const renderer = fixture.renderers[0];
  expect(renderer.setKeyState.mock.calls.filter(call => call[0] === 'KeyW').at(-1)).toEqual(['KeyW', pressed]);
  expect(renderer.setKeyBeam.mock.calls.filter(call => call[0] === 1).at(-1)).toEqual([1, pressed]);
}

describe('ObserverPlayRuntime 전곡 반복', () => {
  it('설정 1.5배속·원본 16초의 8～12초 구간에 진입하면 Auto·1배속으로 {0,0,4000,4000}을 즉시 재생한다', async () => {
    const range = { startTime: 8, endTime: 12, fadeInTime: .2, fadeOutTime: .3 };
    const run = create(undefined, { playSpeed: 1.5 }, 16, range);
    await run.player.start(); await run.player.start();
    const audio = fixture.audio[0]; const renderer = fixture.renderers[0];
    expect(audio.playbackRate).toBe(1); expect(run.config.playSpeed).toBe(1.5);
    expect(audio.setPlaybackRange).toHaveBeenCalledExactlyOnceWith(range);
    expect(audio.playFadedSpan).toHaveBeenCalledExactlyOnceWith({ fromMs: 0, fadeInUntilMs: 0, fadeOutFromMs: 4000, toMs: 4000 }, 0);
    expect(audio.play).not.toHaveBeenCalled(); expect(audio.playWithPreroll).not.toHaveBeenCalled();
    expect(renderer.setExplicitChart.mock.calls[0][4]).toBe(4000);
    expect(renderer.setChartVisible).toHaveBeenLastCalledWith(true);
    expect(audio.playFadedSpan.mock.invocationCallOrder[0]).toBeGreaterThan(renderer.prepareForPlayback.mock.invocationCallOrder[0]);
    expect(run.onPhase.mock.calls).toEqual([['loading'], ['playing']]);
    expect(run.state()).toEqual({ autoEnabled: true, manualStats: null, songTimeMs: 0 });
    expect(run.target.listeners.size).toBe(2); expect(frames.size).toBe(1); expect(run.onError).not.toHaveBeenCalled();
  });

  it('출력 지연 30ms에서 첫 진입·반복·Retry 직후 P10ms의 J−20ms를 오류 없이 관측하고 0ms Auto 탭을 판정한다', async () => {
    fixture.latency = 30;
    const run = create([p(0)]); await run.player.start();
    for (const restart of [() => {}, () => frame(4000), () => run.player.retry()]) {
      restart();
      frame(-20);
      expect(run.state().songTimeMs).toBe(-20); expect(snapshot().atMs).toBe(-20);
      expect(snapshot().items[0].settlementFactId).toBeNull();
      frame(0); expect(snapshot().items[0].settlementFactId).not.toBeNull();
      expect(run.onError).not.toHaveBeenCalled();
    }
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(3);
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(3);
  });

  it('출력 지연 30ms·입력 −40ms에서 첫 진입·반복·Retry의 J−20ms down은 raw−60ms Great와 수동 2/3점을 보존한다', async () => {
    fixture.latency = 30;
    const run = create([p(0)], { inputOffsetMs: -40 }); await run.player.start(); run.player.setAuto(false);
    for (const restart of [() => {}, () => frame(4000), () => run.player.retry()]) {
      restart();
      at(-20); key(run.target, 'keydown'); frame(-20);
      expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 1, achievementRate: 2 / 3 * 100 } });
      expect(fixture.renderers[0].showJudgmentGroup.mock.lastCall![0]).toMatchObject({ grade: 'great', timingDeltaMs: -60 });
      at(-10); key(run.target, 'keyup'); frame(-10);
      expect(run.onError).not.toHaveBeenCalled();
    }
  });

  it('출력 지연 30ms·입력 +100ms·시각 +70ms에서 J−20ms down은 80ms 탭을 Perfect로 치고 화면은 50ms이다', async () => {
    fixture.latency = 30;
    const run = create([p(80)], { inputOffsetMs: 100, visualOffsetMs: 70 });
    await run.player.start(); run.player.setAuto(false);
    at(-20); key(run.target, 'keydown'); frame(-20);
    expect(snapshot().atMs).toBe(80);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(50, 0);
    frame(-10); run.player.togglePause(); run.player.togglePause(); frame(0);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('수동 1000ms 탭 뒤 전곡을 2회 반복하고 Retry하면 매번 콤보 0·0%이며 audio·renderer·스킨·입력은 각 1개를 유지한다', async () => {
    const finalize = vi.spyOn(ExplicitJudgmentSession.prototype, 'finalize');
    const run = create([p(1000)]); await run.player.start(); run.player.setAuto(false);
    const listeners = [...run.target.listeners];
    for (let repeat = 0; repeat < 2; repeat++) {
      at(1000); key(run.target, 'keydown'); frame(1000);
      expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
      at(1100); key(run.target, 'keyup'); frame(1100);
      frame(4000);
      expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 } });
      expect(snapshot().items[0].settlementFactId).toBeNull();
    }
    at(1000); key(run.target, 'keydown'); frame(1000); run.player.retry();
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 } });
    expect(snapshot().items[0].settlementFactId).toBeNull();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(4);
    expect(fixture.audio).toHaveLength(1); expect(fixture.renderers).toHaveLength(1);
    expect(fixture.skins).toHaveLength(1); expect(fixture.explicit).toHaveLength(1);
    expect(fixture.renderers[0].setExplicitChart).toHaveBeenCalledOnce();
    expect(fixture.renderers[0].setExplicitPlaybackChart).toHaveBeenCalledTimes(3);
    expect(fixture.renderers[0].resetTransientState).toHaveBeenCalledTimes(3);
    expect([...run.target.listeners]).toEqual(listeners); expect(frames.size).toBe(1);
    expect(finalize).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('Auto로 전곡 2회 반복하고 Retry해도 Auto를 유지하며 재진입하면 수동 선택을 버리고 Auto로 시작한다', async () => {
    const run = create([p(1000)]); await run.player.start();
    frame(1000); frame(4000); frame(1000); frame(4000); run.player.retry();
    expect(run.state().autoEnabled).toBe(true);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(4);
    run.player.setAuto(false); run.player.dispose();
    const next = create([p(1000)]); await next.player.start();
    expect(next.state().autoEnabled).toBe(true); expect(next.state().manualStats).toBeNull();
  });

  it('반복·Retry 경계에 쥔 KeyW는 새 0ms 바디의 preheld가 되고 이전 큐의 down은 0ms 탭을 치지 않는다', async () => {
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const run = create([b(0, 1000), t(500), p(0, 'single', 2)]); await run.player.start(); run.player.setAuto(false);
    at(3500); key(run.target, 'keydown'); frame(4000); frame(0);
    let session = advance.mock.contexts.at(-1) as ExplicitJudgmentSession;
    expect(session.facts.filter(fact => fact.kind === 'bodyStarted')).toMatchObject([{ via: 'preheld', actualStartMs: 0 }]);
    frame(500); expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 50 });
    at(600); key(run.target, 'keydown', 'KeyE'); run.player.retry(); frame(0);
    session = advance.mock.contexts.at(-1) as ExplicitJudgmentSession;
    expect(session.facts.filter(fact => fact.kind === 'bodyStarted')).toMatchObject([{ via: 'preheld', actualStartMs: 0 }]);
    expect(session.facts.filter(fact => fact.kind === 'input')).toEqual([]);
    expect(snapshot().items.find(item => item.kind === 'tap')!.settlementFactId).toBeNull();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('Auto를 1100ms에 끄면 수동 0부터 세고 2000ms Perfect 뒤 Auto를 켜면 콤보·달성률을 숨긴다', async () => {
    const run = create(); await run.player.start(); frame(1000);
    const renderer = fixture.renderers[0];
    expect(renderer.showJudgmentGroup).toHaveBeenCalledOnce();
    expect(renderer.updateCombo).toHaveBeenLastCalledWith(0); expect(renderer.updateAccuracy).toHaveBeenLastCalledWith(null);
    at(1100); run.player.setAuto(false);
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    at(2000); key(run.target, 'keydown'); frame(2000);
    expect(renderer.updateCombo).toHaveBeenLastCalledWith(1); expect(renderer.updateAccuracy).toHaveBeenLastCalledWith(100);
    run.player.setAuto(true);
    expect(run.state().manualStats).toBeNull();
    expect(renderer.updateCombo).toHaveBeenLastCalledWith(0); expect(renderer.updateAccuracy).toHaveBeenLastCalledWith(null);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1000ms 수동 탭의 효과를 1회 drain한 같은 배열로 시각 sink·수동 집계에 전달해 타격 1회·콤보 1을 만든다', async () => {
    const visual = vi.spyOn(ExplicitJudgmentEffectSink.prototype, 'applyConfirmedEffects');
    const tally = vi.spyOn(ObserverRepetition.prototype, 'applyConfirmedEffects');
    const drain = vi.spyOn(ExplicitJudgmentSession.prototype, 'drainEffects');
    const run = create([p(1000)]); await run.player.start(); run.player.setAuto(false);
    drain.mockClear();
    at(1000); key(run.target, 'keydown'); frame(1000);
    expect(drain).toHaveBeenCalledOnce(); expect(visual).toHaveBeenCalledOnce(); expect(tally).toHaveBeenCalledOnce();
    expect(visual.mock.calls[0][0]).toBe(tally.mock.calls[0][0]);
    frame(1016);
    expect(visual).toHaveBeenCalledOnce(); expect(tally).toHaveBeenCalledOnce();
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledOnce();
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
  });

  it('1000～3000ms 바디 중 Auto를 1500ms에 껐다 켜면 다음 RAF 전에도 KeyW·레인 1 빔이 즉시 꺼졌다 켜진다', async () => {
    const run = create([p(1000), b(1000, 3000), r(3000)]); await run.player.start(); frame(1500);
    expectKeys(true);
    run.player.setAuto(false); expectKeys(false);
    run.player.setAuto(true); expectKeys(true);
    frame(2000); expect(snapshot().bodyUnits[0].state).toBe('active');
    frame(3000); expectKeys(false);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms에서 5초 일시정지하면 노트·판정 시각을 유지하고 resume은 같은 위치와 세션을 준비 없이 잇는다', async () => {
    const resumeAt = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create([p(1000), b(1000, 3000), r(3000)]); await run.player.start(); frame(1500);
    const before = snapshot(); run.player.togglePause();
    const audio = fixture.audio[0]; const renderer = fixture.renderers[0];
    const rendered = renderer.renderFrame.mock.calls.length;
    wallFrame(6500);
    expect(audio.currentTimeMs).toBe(1500); expect(snapshot()).toEqual(before);
    expect(renderer.renderFrame).toHaveBeenCalledTimes(rendered);
    expect(renderer.setChartVisible).toHaveBeenLastCalledWith(true);
    run.player.togglePause(); expect(audio.resume).toHaveBeenCalledOnce();
    expect(audio.currentTimeMs).toBe(1500); frame(1600);
    expect(snapshot().bodyUnits[0].state).toBe('active');
    expect(audio.playFadedSpan).toHaveBeenCalledOnce(); expect(audio.playWithPreroll).not.toHaveBeenCalled();
    expect(resumeAt).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1000ms에 일시정지 중 누른 KeyW와 재개 뒤 늦게 도착한 정지 중 down은 탭 점수가 되지 않는다', async () => {
    const run = create([p(1000), p(1100, 'single', 2)]); await run.player.start(); run.player.setAuto(false); frame(1000);
    run.player.togglePause(); wallFrame(5000); key(run.target, 'keydown');
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    run.player.togglePause(); key(run.target, 'keydown', 'KeyE', 4999); frame(1100);
    expect(snapshot().items.every(item => item.settlementFactId === null)).toBe(true);
    frame(1221); expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    expect(fixture.renderers[0].showBombEffect).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Auto를 끄고 KeyW를 눌렀다 떼면 입력을 판정하지 않고 재개 후 20ms 유예 뒤 바디가 실패한다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000), r(3000), p(1500, 'single', 2)]);
    await run.player.start(); frame(1400); at(1500); run.player.togglePause();
    wallFrame(5000); run.player.setAuto(false);
    expect(run.onPhase).toHaveBeenLastCalledWith('paused'); expectKeys(false);
    key(run.target, 'keydown'); key(run.target, 'keyup'); key(run.target, 'keydown', 'KeyE');
    wallFrame(6000); expect(snapshot().atMs).toBe(1500);
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    run.player.togglePause(); frame(1519);
    expect(snapshot().bodyUnits[0]).toMatchObject({ state: 'recovering', maintenanceDeadlineMs: 1520 });
    frame(1521); expect(snapshot().bodyUnits[0]).toMatchObject({ state: 'failed', failedAtMs: 1520 });
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Auto를 끈 뒤 KeyW를 누른 채 재개하면 바디를 유지하고 2000ms 틱부터 콤보 1·100%다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000), r(3000)]); await run.player.start(); frame(1500);
    run.player.togglePause(); wallFrame(5000); run.player.setAuto(false); key(run.target, 'keydown');
    run.player.togglePause(); frame(2000);
    expect(snapshot().bodyUnits[0].state).toBe('active');
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Auto를 끌 때 쥔 KeyW를 재개 전에 놓으면 재개의 hold 동기화로 1520ms에 유지 실패한다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000)]); await run.player.start(); frame(1500);
    run.player.togglePause(); key(run.target, 'keydown'); run.player.setAuto(false);
    expect(snapshot().bodyUnits[0].state).toBe('active');
    wallFrame(5000); key(run.target, 'keyup'); run.player.togglePause();
    frame(1519); expect(snapshot().bodyUnits[0].state).toBe('recovering');
    frame(1521); expect(snapshot().bodyUnits[0]).toMatchObject({ state: 'failed', failedAtMs: 1520 });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Auto를 껐다 켜면 빔·HUD를 즉시 바꾸고 5초 뒤 재개해도 Auto 바디를 유지한다', async () => {
    const run = create([p(1000), b(1000, 3000), r(3000)]); await run.player.start(); frame(1500);
    run.player.togglePause(); run.player.setAuto(false); expectKeys(false);
    wallFrame(6500); run.player.setAuto(true); expectKeys(true);
    expect(run.state()).toEqual({ autoEnabled: true, manualStats: null, songTimeMs: 1500 });
    expect(fixture.audio[0].resume).not.toHaveBeenCalled();
    run.player.togglePause(); frame(2000);
    expect(snapshot().bodyUnits[0].state).toBe('active'); expect(run.onError).not.toHaveBeenCalled();
  });

  it('입력 −100ms에서 마지막 4000ms 탭은 곡 4220ms까지 반복을 늦추고 4221ms에 다음 반복을 시작한다', async () => {
    const run = create([p(4000)], { inputOffsetMs: -100 }); await run.player.start(); run.player.setAuto(false);
    frame(4000); expect(snapshot().items[0].settlementFactId).toBeNull();
    at(4100); key(run.target, 'keydown'); frame(4100);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    frame(4220); expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    frame(4221); expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2);
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('입력 −100ms에서 마지막 4000ms 탭을 놓치면 4221ms에 Miss를 1회 표시한 뒤 반복한다', async () => {
    const run = create([p(4000)], { inputOffsetMs: -100 }); await run.player.start(); run.player.setAuto(false);
    frame(4000); frame(4220);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    frame(4221);
    expect(fixture.renderers[0].showJudgmentGroup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ grade: 'miss' }));
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Retry하면 수동 모드를 유지한 새 0ms 세션으로 즉시 재생한다', async () => {
    const run = create(); await run.player.start(); run.player.setAuto(false); frame(1500); run.player.togglePause();
    run.player.retry();
    expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(run.state()).toEqual({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 }, songTimeMs: 0 });
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2); expect(fixture.audio[0].resume).not.toHaveBeenCalled();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it.each(['오디오', '스킨', '렌더러'] as const)('%s 로딩 중 dispose 2회 뒤 준비가 끝나도 재생·RAF·listener 없이 자원을 각 1회 정리한다', async stage => {
    let release!: () => void; let entered!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const block = () => { entered(); return pending; };
    if (stage === '오디오') fixture.prepareAudio = block;
    if (stage === '스킨') fixture.load = block;
    if (stage === '렌더러') fixture.init = block;
    const run = create(); const starting = run.player.start(); await ready;
    run.player.dispose(); run.player.dispose(); release(); await starting;
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.skins[0].dispose).toHaveBeenCalledOnce(); expect(fixture.explicit[0].dispose).toHaveBeenCalledOnce();
    if (stage === '렌더러') expect(fixture.renderers[0].dispose).toHaveBeenCalledExactlyOnceWith(false);
    expect(fixture.audio[0].playFadedSpan).not.toHaveBeenCalled();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(run.onPhase.mock.calls).toEqual([['loading']]); expect(run.onState).not.toHaveBeenCalled();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it.each(['재생', '일시정지'] as const)('%s 중 dispose 2회 뒤 늦은 RAF·입력·공개 메서드를 호출해도 자원 해제는 1회이며 listener·RAF는 0개다', async phase => {
    const run = create(); await run.player.start(); frame(1000);
    if (phase === '일시정지') run.player.togglePause();
    const pending = [...frames.values()]; const count = run.onState.mock.calls.length;
    run.player.dispose(); run.player.dispose();
    for (const callback of pending) callback(1100);
    key(run.target, 'keydown'); run.player.togglePause(); run.player.setAuto(false); run.player.retry(); await run.player.start();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce(); expect(fixture.renderers[0].dispose).toHaveBeenCalledExactlyOnceWith(false);
    expect(fixture.skins[0].dispose).toHaveBeenCalledOnce(); expect(fixture.explicit[0].dispose).toHaveBeenCalledOnce();
    expect(run.onState).toHaveBeenCalledTimes(count); expect(run.onError).not.toHaveBeenCalled();
  });

  it('RAF 렌더 오류 1회는 error 단계·onError로 전달하고 audio·renderer·listener·RAF를 정리한다', async () => {
    const run = create(); await run.player.start();
    const error = new Error('render');
    fixture.renderers[0].renderFrame.mockImplementationOnce(() => { throw error; }); frame(1000);
    expect(run.onPhase).toHaveBeenLastCalledWith('error'); expect(run.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce(); expect(fixture.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });
});
