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
import { ExplicitSessionRendererAdapter } from '../judgment/ExplicitSessionRendererAdapter';
import { ObserverRepetition } from '../observer/ObserverRepetition';
import * as playbackCharts from '../judgment/explicitPlaybackChart';
import { ExplicitNotePresenter } from '../renderer/ExplicitNotePresenter';
import { buildExplicitSkinView } from '../skin/explicitSkin';
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
  judgment: Parameters<GameRenderer['showJudgmentGroup']>[0] | null = null;
  bombLanes: number[] = [];
  init = vi.fn(() => fixture.init()); dispose = vi.fn();
  setExplicitChart = vi.fn<GameRenderer['setExplicitChart']>();
  setExplicitPlaybackChart = vi.fn<GameRenderer['setExplicitPlaybackChart']>();
  scrollSpeed = 0; setLift = vi.fn(); setSudden = vi.fn(); setChartVisible = vi.fn();
  setShowFastSlow = vi.fn(); setShowTimingDiff = vi.fn(); setPerfectWindow = vi.fn(); setupKeyboardDisplay = vi.fn();
  prepareForPlayback = vi.fn();
  resetTransientState = vi.fn(() => { this.judgment = null; this.bombLanes = []; });
  setKeyState = vi.fn(); setKeyBeam = vi.fn(); updateCombo = vi.fn(); updateAccuracy = vi.fn();
  renderFrame = vi.fn(() => ({ judgment: this.judgment, bombLanes: [...this.bombLanes],
    snapshot: this.setExplicitChart.mock.calls[0][2]() }));
  showJudgmentGroup = vi.fn<GameRenderer['showJudgmentGroup']>(state => { this.judgment = state; });
  recordFlightJudgment = vi.fn(); showBombEffect = vi.fn((lane: number) => { this.bombLanes.push(lane); });
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

describe('ObserverPlayRuntime 정지 자유 스크롤', () => {
  it('1000ms 정지에서 +1500ms 스크롤은 즉시 2500ms를 표시·알림하고 양끝은 0·4000ms로 제한한다', async () => {
    const run = create(); await run.player.start(); frame(1000); run.player.togglePause();
    const audio = fixture.audio[0]; const renderer = fixture.renderers[0];
    const range = run.player.range;
    expect(run.player.viewPixelsPerMs).toBe(run.config.scrollSpeed / 1000);
    renderer.scrollSpeed = 1200;
    expect(run.player.viewPixelsPerMs).toBe(1.2);
    for (const [delta, expected] of [[1500, 2500], [10000, 4000], [-10000, 0], [250, 250]]) {
      run.onState.mockClear();
      run.player.scrollView(delta);
      expect(renderer.renderFrame).toHaveBeenLastCalledWith(expected, 0);
      expect(run.onState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ songTimeMs: expected }));
      expect(audio.currentTimeMs).toBe(1000); expect(audio.running).toBe(false);
      expect(run.player.range).toBe(range);
    }
    // 같은 벽시각의 연속 조작도 100ms throttle을 기다리지 않는다.
    expect(audio.playFadedSpan).toHaveBeenCalledOnce(); expect(audio.resume).not.toHaveBeenCalled();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('재생 중·구간 드래그 중 +2000ms 스크롤은 화면·알림·오디오를 바꾸지 않는다', async () => {
    const run = create(); run.player.scrollView(2000); await run.player.start(); frame(1000);
    const renderer = fixture.renderers[0]; const audio = fixture.audio[0];
    for (const dragging of [false, true]) {
      if (dragging) run.player.beginRangeEdit();
      const state = run.state(); const rendered = renderer.renderFrame.mock.calls.length;
      run.onState.mockClear(); run.player.scrollView(2000);
      expect(run.onState).not.toHaveBeenCalled();
      expect(renderer.renderFrame).toHaveBeenCalledTimes(rendered);
      expect(audio.currentTimeMs).toBe(1000); expect(audio.running).toBe(!dragging);
      expect(state.songTimeMs).toBe(dragging ? 0 : 1000);
    }
    run.player.endRangeEdit(); run.onState.mockClear();
    for (const delta of [NaN, Infinity, -Infinity, 0]) run.player.scrollView(delta);
    expect(run.onState).not.toHaveBeenCalled();
    run.player.dispose(); run.player.scrollView(2000);
    expect(run.onState).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('수동 콤보 1의 1500ms 정지에서 +2000ms 스크롤 후 Play는 같은 세션·집계로 1500ms를 재개하고 2000ms 입력은 콤보 2다', async () => {
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const attach = vi.spyOn(ExplicitSessionRendererAdapter.prototype, 'attach');
    const run = create(); await run.player.start(); run.player.setAuto(false);
    at(1000); key(run.target, 'keydown'); frame(1000); key(run.target, 'keyup');
    frame(1500); run.player.togglePause();
    const session = advance.mock.contexts.at(-1) as ExplicitJudgmentSession;
    const paused = session.snapshot; const facts = [...session.facts]; const stats = run.state().manualStats;
    expect(stats).toEqual({ combo: 1, achievementRate: 100 });
    advance.mockClear();
    run.player.scrollView(2000); wallFrame(10000);
    expect(advance).not.toHaveBeenCalled(); expect(session.snapshot).toEqual(paused); expect(session.facts).toEqual(facts);
    expect(run.state().manualStats).toEqual(stats);
    run.player.togglePause();
    const audio = fixture.audio[0];
    expect(audio.resume).toHaveBeenCalledOnce(); expect(audio.currentTimeMs).toBe(1500);
    expect(audio.playFadedSpan).toHaveBeenCalledOnce(); expect(attach).toHaveBeenCalledOnce();
    expect(run.state()).toMatchObject({ songTimeMs: 1500, manualStats: stats });
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(1500, 0);
    at(2000); key(run.target, 'keydown'); frame(2000);
    expect(advance.mock.contexts.at(-1)).toBe(session);
    expect(run.state().manualStats).toEqual({ combo: 2, achievementRate: 100 });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1000ms Perfect 뒤 500ms로 되돌려 보면 처리된 노트가 보이고 Play는 원래 성공 판정을 유지한다', async () => {
    const run = create(); await run.player.start(); frame(1000); run.player.togglePause();
    expect(snapshot().items[0].state).toBe('success');
    run.player.scrollView(-500);
    const notes = new ExplicitNotePresenter(run.request.compiled, buildExplicitSkinView('/')).present(snapshot(),
      { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 20, height: 600 }, 500);
    expect(notes[0].layers.every(layer => layer.visible && layer.inViewport)).toBe(true);
    run.player.togglePause();
    expect(snapshot().items[0].state).toBe('success');
    expect(run.state().songTimeMs).toBe(1000); expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms 편집 후 +2000ms 스크롤은 7000ms를 보여도 Play는 준비 시작 2000ms에서 새 시도를 연다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start();
    run.player.beginRangeEdit(); run.player.setRange({ startMs: 5000, endMs: 8000 }); run.player.endRangeEdit();
    run.player.scrollView(2000);
    expect(run.state().songTimeMs).toBe(7000);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(7000, 0);
    expect(snapshot().atMs).toBe(7000);
    run.player.togglePause();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(
      { fromMs: 2000, fadeInUntilMs: 5000, fadeOutFromMs: 8000, toMs: 11000 }, 2000);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2);
    expect(fixture.audio[0].resume).not.toHaveBeenCalled();
    expect(run.state().songTimeMs).toBe(2000); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지에서 +2000ms 스크롤 후 Retry는 0ms, 다음 4000ms 자연 반복도 0ms를 표시한다', async () => {
    const run = create(); await run.player.start(); frame(1500); run.player.togglePause(); run.player.scrollView(2000);
    run.player.retry();
    expect(run.state().songTimeMs).toBe(0);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(0, 0);
    frame(4000);
    expect(run.state().songTimeMs).toBe(0);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(0, 0);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(3);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지·5000ms 구간 미리보기에서 +2000ms 스크롤 후 setAuto(false)는 각각 1500·5000ms로 돌아간다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); frame(1500); run.player.togglePause();
    for (const preview of [false, true]) {
      if (preview) run.player.setRange({ startMs: 5000, endMs: 8000 });
      // 같은 Auto 값으로 다시 호출해도 표시만 복귀하며 새 시도를 만들지 않는다.
      for (const enabled of [false, false, true]) {
        run.player.scrollView(2000); run.player.setAuto(enabled);
        expect(run.state().songTimeMs).toBe(preview ? 5000 : 1500);
        expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(preview ? 5000 : 1500, 0);
        expect(fixture.audio[0].running).toBe(false);
        expect(fixture.audio[0].currentTimeMs).toBe(1500);
      }
    }
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지에서 +2000ms 스크롤 후 구간 편집은 A=0ms로, 새 5000～8000ms 선택은 A=5000ms로 돌아간다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); frame(1500); run.player.togglePause();
    run.player.scrollView(2000); run.player.beginRangeEdit(); run.player.endRangeEdit();
    expect(run.state().songTimeMs).toBe(0);
    run.player.scrollView(2000); run.player.setRange({ startMs: 5000, endMs: 8000 });
    expect(run.state().songTimeMs).toBe(5000);
    run.player.scrollView(2000); run.player.setRange({ startMs: 5000, endMs: 8000 });
    expect(run.state().songTimeMs).toBe(5000);
    expect(fixture.audio[0].currentTimeMs).toBe(1500); expect(run.onError).not.toHaveBeenCalled();
  });

  it('출력 지연 30ms·시각 +70ms에서 +2000ms 스크롤하면 알림은 3500ms·화면은 3570ms이고 Play는 1570ms로 돌아간다', async () => {
    fixture.latency = 30;
    const run = create(undefined, { visualOffsetMs: 70 }); await run.player.start(); frame(1500); run.player.togglePause();
    run.player.scrollView(2000);
    expect(run.state().songTimeMs).toBe(3500);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(3570, 0);
    expect(fixture.audio[0].currentTimeMs).toBe(1530);
    run.player.togglePause();
    expect(run.state().songTimeMs).toBe(1500);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(1570, 0);
    expect(run.onError).not.toHaveBeenCalled();
  });
});

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
    expect(run.player.range).toEqual({ startMs: 0, endMs: 4000 });
    expect(renderer.setChartVisible).toHaveBeenLastCalledWith(true);
    expect(audio.playFadedSpan.mock.invocationCallOrder[0]).toBeGreaterThan(renderer.prepareForPlayback.mock.invocationCallOrder[0]);
    expect(run.onPhase.mock.calls).toEqual([['loading'], ['playing']]);
    expect(run.state()).toMatchObject({ autoEnabled: true, manualStats: null, songTimeMs: 0 });
    // InputSystem keydown·keyup 2개와 정지 중 키 표시 갱신 1개.
    expect(run.target.listeners.size).toBe(3); expect(frames.size).toBe(1); expect(run.onError).not.toHaveBeenCalled();
  });

  it('출력 지연 30ms에서 첫 진입·반복·Retry 직후 P10ms의 J−20ms를 오류 없이 관측하고 0ms Auto 탭을 판정한다', async () => {
    fixture.latency = 30;
    const run = create([p(0)]); await run.player.start();
    for (const restart of [() => {}, () => frame(4000), () => run.player.retry()]) {
      restart();
      frame(-20);
      expect(run.state().songTimeMs).toBe(-30); expect(snapshot().atMs).toBe(-20);
      expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(-20, 0);
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
    expect(fixture.renderers[0].resetTransientState).toHaveBeenCalledOnce();
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

  it.each(['Auto', '수동'] as const)('%s 16～99ms RAF는 상태를 알리지 않고 100·200ms에만 진행 시각을 알린다', async mode => {
    const run = create(); await run.player.start(); run.player.setAuto(mode === 'Auto');
    run.onState.mockClear();
    for (const time of [16, 32, 48, 64, 80, 99]) frame(time);
    expect(run.onState).not.toHaveBeenCalled();
    frame(100);
    expect(run.onState).toHaveBeenCalledOnce(); expect(run.state().songTimeMs).toBe(100);
    frame(116); frame(199);
    expect(run.onState).toHaveBeenCalledOnce();
    frame(200);
    expect(run.onState.mock.calls.map(([state]) => state.songTimeMs)).toEqual([100, 200]);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('100ms 진행 알림 뒤 110·130ms 수동 Perfect는 콤보 1·2와 100%를 즉시 알리고 120ms RAF는 생략한다', async () => {
    const run = create([p(110), p(130)]); await run.player.start(); run.player.setAuto(false); frame(100);
    run.onState.mockClear();
    at(110); key(run.target, 'keydown'); frame(110);
    expect(run.onState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ autoEnabled: false,
      manualStats: { combo: 1, achievementRate: 100 }, songTimeMs: 110 }));
    at(120); key(run.target, 'keyup'); frame(120);
    expect(run.onState).toHaveBeenCalledOnce();
    at(130); key(run.target, 'keydown'); frame(130);
    expect(run.onState).toHaveBeenCalledTimes(2);
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 2, achievementRate: 100 }, songTimeMs: 130 });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('0ms에서 일시정지·재개·Auto·Retry를 조작하고 3999→4000ms에 반복하면 100ms를 기다리지 않고 상태를 알린다', async () => {
    const run = create(); await run.player.start();
    for (const action of [() => run.player.togglePause(), () => run.player.togglePause(),
      () => run.player.setAuto(false), () => run.player.setAuto(true), () => run.player.retry()]) {
      run.onState.mockClear(); action();
      expect(run.onState).toHaveBeenCalledOnce(); expect(run.state().songTimeMs).toBe(0);
    }
    frame(3999); run.onState.mockClear(); frame(4000);
    expect(run.onState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ autoEnabled: true, manualStats: null, songTimeMs: 0 }));
    frame(16);
    expect(run.onState).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
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

  it.each(['일반 일시정지', '구간 값 유지 편집'] as const)(
    '1000ms에서 %s 후 재개 처리 5000～5100ms 중 발생한 5050·5099ms down은 무시하고 5100ms down만 Perfect다', async mode => {
    const run = create([p(1000), p(1000, 'single', 2), p(1000, 'single', 3)]);
    await run.player.start(); run.player.setAuto(false); frame(1000);
    if (mode === '일반 일시정지') run.player.togglePause();
    else { run.player.beginRangeEdit(); run.player.endRangeEdit(); }
    wallFrame(5000);
    const syncHeldKeys = ExplicitJudgmentSession.prototype.syncHeldKeys;
    vi.spyOn(ExplicitJudgmentSession.prototype, 'syncHeldKeys').mockImplementationOnce(function (this: ExplicitJudgmentSession, ...args) {
      fixture.now += 60;
      return syncHeldKeys.apply(this, args);
    });
    const audio = fixture.audio[0];
    audio.resume.mockImplementationOnce(() => {
      fixture.now += 40;
      audio.startedAt = fixture.now; audio.running = true;
    });
    run.player.togglePause();
    expect(fixture.now).toBe(5100);
    key(run.target, 'keydown', 'KeyW', 5050); key(run.target, 'keydown', 'KeyE', 5099);
    key(run.target, 'keydown', 'KeyP', 5100); frame(1000);
    expect(snapshot().items.slice(0, 2).map(item => item.settlementFactId)).toEqual([null, null]);
    expect(snapshot().items[2].settlementFactId).not.toBeNull();
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledExactlyOnceWith(3);
    expect(run.onError).not.toHaveBeenCalled();
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
    expect(run.state()).toMatchObject({ autoEnabled: true, manualStats: null, songTimeMs: 1500 });
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

  it('입력 −100ms에서 마지막 4000ms 탭을 놓치면 4221ms에 반복한 뒤 첫 0ms 렌더에도 Miss가 남는다', async () => {
    const run = create([p(4000)], { inputOffsetMs: -100 }); await run.player.start(); run.player.setAuto(false);
    frame(4000); frame(4220);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    frame(4221);
    const renderer = fixture.renderers[0];
    expect(renderer.showJudgmentGroup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ grade: 'miss' }));
    expect(renderer.renderFrame).toHaveBeenLastCalledWith(0, 0);
    expect(renderer.renderFrame.mock.results.at(-1)!.value.judgment).toMatchObject({ grade: 'miss' });
    frame(16);
    expect(renderer.renderFrame.mock.results.at(-1)!.value.judgment).toMatchObject({ grade: 'miss' });
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1000～4000ms Auto 바디 뒤 4121ms에 반복하면 Perfect·타격은 남고 바디·빔은 초기화되며 Retry는 표시도 지운다', async () => {
    const run = create([b(1000, 4000), r(4000)]); await run.player.start(); frame(3999);
    const renderer = fixture.renderers[0];
    expect(renderer.renderFrame.mock.results.at(-1)!.value.snapshot.bodyUnits[0].state).toBe('active');
    expectKeys(true);
    renderer.showBombEffect.mockClear();
    frame(4121);
    const rendered = renderer.renderFrame.mock.results.at(-1)!.value;
    expect(rendered.judgment).toMatchObject({ grade: 'perfect' });
    expect(rendered.bombLanes).toEqual([1]);
    expect(renderer.showBombEffect).toHaveBeenCalledExactlyOnceWith(1);
    expect(rendered.snapshot.bodyUnits[0].state).toBe('waiting'); expectKeys(false);
    expect(renderer.renderFrame).toHaveBeenLastCalledWith(0, 0);
    expect(renderer.setExplicitPlaybackChart).toHaveBeenCalledOnce();
    run.player.retry();
    expect(renderer.renderFrame.mock.results.at(-1)!.value).toMatchObject({ judgment: null, bombLanes: [] });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms 정지 중 Retry하면 수동 모드를 유지한 새 0ms 세션으로 즉시 재생한다', async () => {
    const run = create(); await run.player.start(); run.player.setAuto(false); frame(1500); run.player.togglePause();
    run.player.retry();
    expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 }, songTimeMs: 0 });
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

describe('ObserverPlayRuntime 선택 구간 편집', () => {
  const selected = { startMs: 5000, endMs: 8000 };
  const fadedSpan = { fromMs: 2000, fadeInUntilMs: 5000, fadeOutFromMs: 8000, toMs: 11000 };
  const select = (player: InstanceType<typeof ObserverPlayRuntime>) => {
    player.beginRangeEdit(); player.setRange(selected); player.endRangeEdit();
  };

  it('전곡 6000ms에서 편집을 시작하면 구간 변경 없이 즉시 A=0ms를 표시하고 편집을 끝내도 정지를 유지한다', async () => {
    const run = create([p(7000)], {}, 12); await run.player.start(); frame(6000);
    run.player.beginRangeEdit();
    expect(run.state().songTimeMs).toBe(0);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(0, 0);
    expect(fixture.audio[0].running).toBe(false);
    expect(run.onPhase).toHaveBeenLastCalledWith('paused');
    run.player.setRange({ startMs: 0, endMs: 12000 });
    wallFrame(10000); run.player.endRangeEdit();
    expect(run.state().songTimeMs).toBe(0);
    expect(fixture.audio[0].running).toBe(false);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms 구간의 6000ms에서 변경 없이 편집을 마치면 A=5000ms를 표시하고 Play는 같은 세션·콤보 1·100%로 6000ms를 잇는다', async () => {
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const run = create([p(6000)], {}, 12); await run.player.start(); select(run.player);
    run.player.setAuto(false); run.player.togglePause();
    at(6000); key(run.target, 'keydown'); frame(6000); key(run.target, 'keyup');
    const previousSession = advance.mock.contexts.at(-1);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    run.player.beginRangeEdit();
    expect(run.state().songTimeMs).toBe(5000);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(5000, 0);
    wallFrame(15000); run.player.endRangeEdit(); run.player.togglePause(); frame(6000);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(2);
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce();
    expect(advance.mock.contexts.at(-1)).toBe(previousSession);
    expect(snapshot().items[0].settlementFactId).not.toBeNull();
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 1, achievementRate: 100 }, songTimeMs: 6000 });
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(6000, 0);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('12초 곡에서 5000～8000ms를 편집하면 오디오는 멈추고 5000ms를 표시하며 재생 시 {2000,5000,8000,11000}을 사용한다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); frame(1000);
    const audio = fixture.audio[0]; const renderer = fixture.renderers[0];
    run.onPhase.mockClear(); run.onState.mockClear();
    run.player.beginRangeEdit(); run.player.setRange(selected);
    expect(audio.pause).toHaveBeenCalledOnce(); expect(audio.running).toBe(false);
    expect(renderer.renderFrame).toHaveBeenLastCalledWith(5000, 0);
    run.player.togglePause(); run.player.retry(); wallFrame(15000);
    expect(audio.playFadedSpan).toHaveBeenCalledOnce();
    run.player.endRangeEdit();
    expect(run.onPhase.mock.calls).toEqual([['paused']]);
    expect(run.onState.mock.calls.map(([state]) => state.songTimeMs)).toEqual([0, 5000, 5000]);
    expect(audio.running).toBe(false); expect(run.player.range).toEqual(selected);
    run.player.togglePause();
    expect(audio.playFadedSpan).toHaveBeenLastCalledWith(fadedSpan, 2000);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(run.onPhase.mock.calls).toEqual([['paused'], ['playing']]);
    expect(run.state()).toMatchObject({ autoEnabled: true, manualStats: null, songTimeMs: 2000 });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms를 선택하면 4000ms 헤드·9000ms 릴리즈는 표시·판정에서 빠지고 4000～9000ms 바디는 양 끝이 잘린다', async () => {
    const run = create([p(4000), b(4000, 9000), t(6000), r(9000), p(5000, 'single', 2), p(8000, 'single', 2)], {}, 12);
    await run.player.start(); frame(9500); select(run.player);
    const chart = fixture.renderers[0].setExplicitPlaybackChart.mock.lastCall![0];
    expect(chart.scoreItems.map(item => item.timeMs)).toEqual([5000, 6000, 8000]);
    expect(chart.bodies).toMatchObject([{ startMs: 5000, endMs: 8000, startTapIndices: [], releaseIndices: [] }]);
    // 모의 renderer가 오래된 성공/실패 상태나 누락된 snapshot을 숨기지 않게 실제 presenter로 표시를 확인한다.
    const notes = new ExplicitNotePresenter(chart, buildExplicitSkinView('/')).present(snapshot(),
      { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 20, height: 600 }, 5000);
    expect(notes.map(note => note.sourceNoteIndex).sort()).toEqual([1, 2, 4, 5]);
    expect(notes.every(note => note.layers.every(layer => layer.visible && !layer.assetId.includes('failed')))).toBe(true);
    expect(notes.find(note => note.kind === 'body')!.layers[0].assetId).toBe('body.single.idle');
    expect(fixture.renderers[0].judgment).toBeNull();
    run.player.togglePause();
    expect(snapshot().items.map(item => item.sourceNoteIndex).sort()).toEqual([2, 4, 5]);
    frame(5000); frame(6000); frame(8000);
    expect(snapshot().items.every(item => item.state === 'success')).toBe(true);
    expect(run.request.compiled.bodies[0]).toMatchObject({ startMs: 4000, endMs: 9000 });
    expect(run.request.compiled.scoreItems).toHaveLength(5); expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms 재생을 6000ms에서 멈추고 끝만 9000ms로 바꾸면 선택 시작 5000ms를 표시한다', async () => {
    const run = create([p(7000)], {}, 12); await run.player.start(); select(run.player); run.player.togglePause(); frame(6000);
    run.player.beginRangeEdit(); run.player.setRange({ startMs: 5000, endMs: 9000 }); run.player.endRangeEdit();
    expect(run.state().songTimeMs).toBe(5000);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(5000, 0);
    run.player.togglePause();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith({ ...fadedSpan, fadeOutFromMs: 9000, toMs: 12000 }, 2000);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('30초 곡의 range·duration 알림은 시각만 바뀌면 100ms를 기다리고 12000～24000ms 편집은 즉시 새 범위를 보낸다', async () => {
    const run = create([p(16000)], {}, 30); await run.player.start();
    const first = run.state();
    expect(first).toMatchObject({ range: { startMs: 0, endMs: 30000 }, durationMs: 30000 });
    run.onState.mockClear(); frame(20); frame(99);
    expect(run.onState).not.toHaveBeenCalled();
    frame(100); expect(run.onState).toHaveBeenCalledOnce();
    expect(run.state().range).toBe(first.range);
    run.player.beginRangeEdit(); run.onState.mockClear();
    run.player.setRange({ startMs: 12000, endMs: 24000 });
    expect(run.onState).toHaveBeenCalledExactlyOnceWith({ autoEnabled: true, manualStats: null,
      songTimeMs: 12000, range: { startMs: 12000, endMs: 24000 }, durationMs: 30000 });
    expect(first.range).toEqual({ startMs: 0, endMs: 30000 });
    expect(Object.isFrozen(run.state().range)).toBe(true);
  });

  it('길이 3000ms인 구간 몸통을 6250.5～9250.5ms로 옮기면 스냅 없이 6250.5ms를 표시한다', async () => {
    const run = create([p(7000)], {}, 12); await run.player.start(); select(run.player);
    run.player.beginRangeEdit(); run.player.setRange({ startMs: 6250.5, endMs: 9250.5 }); run.player.endRangeEdit();
    expect(run.player.range).toEqual({ startMs: 6250.5, endMs: 9250.5 });
    expect(run.state().songTimeMs).toBe(6250.5);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(6250.5, 0);
    run.player.togglePause();
    expect(fixture.audio[0].playFadedSpan.mock.lastCall![1]).toBe(3250.5); expect(run.onError).not.toHaveBeenCalled();
  });

  it('출력 지연 30ms·시각 +70ms에서 시작을 5000ms로 옮기면 정지 화면은 5070ms이고 알림은 5000ms다', async () => {
    fixture.latency = 30;
    const run = create([p(6000)], { visualOffsetMs: 70 }, 12); await run.player.start(); select(run.player);
    expect(run.state().songTimeMs).toBe(5000);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(5070, 0);
    wallFrame(20000); run.player.setAuto(false);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(5070, 0); expect(run.onError).not.toHaveBeenCalled();
  });

  it('출력 지연 30ms·입력 −40ms에서 A=5000ms를 재생하면 세션은 1930ms·오디오는 2000ms에서 시작한다', async () => {
    fixture.latency = 30;
    const run = create([p(5000)], { inputOffsetMs: -40 }, 12); await run.player.start(); select(run.player);
    run.player.setAuto(false); run.player.togglePause();
    expect(snapshot().atMs).toBe(1930); expect(run.state().songTimeMs).toBe(1970);
    expect(fixture.audio[0].currentTimeMs).toBe(2000);
    frame(1980); expect(snapshot().atMs).toBe(1940);
    at(5040); key(run.target, 'keydown'); frame(5040);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('수동 1000ms Perfect 뒤 5000～8000ms로 바꾸면 즉시 콤보 0·0%이고 재생은 새 세션의 수동 모드를 유지한다', async () => {
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const run = create([p(1000), p(6000)], {}, 12); await run.player.start(); run.player.setAuto(false);
    at(1000); key(run.target, 'keydown'); frame(1000); key(run.target, 'keyup');
    const previousSession = advance.mock.contexts.at(-1);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    select(run.player);
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 }, songTimeMs: 5000 });
    run.player.togglePause(); frame(2000);
    expect(advance.mock.contexts.at(-1)).not.toBe(previousSession);
    expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 }, songTimeMs: 2000 });
    at(6000); key(run.target, 'keydown'); frame(6000);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms 편집 중 Auto를 껐다 켜고 다시 끄면 위치 5000ms·정지를 유지하고 재생은 마지막 수동 모드를 쓴다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); run.player.beginRangeEdit(); run.player.setRange(selected);
    expect(run.state().autoEnabled).toBe(true); expect(run.state().manualStats).toBeNull();
    for (const enabled of [false, true, false]) {
      run.player.setAuto(enabled);
      expect(run.state()).toMatchObject({ autoEnabled: enabled, manualStats: enabled ? null : { combo: 0, achievementRate: 0 }, songTimeMs: 5000 });
      expect(fixture.audio[0].running).toBe(false);
    }
    run.player.endRangeEdit(); run.player.togglePause();
    at(6000); key(run.target, 'keydown'); frame(6000);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms 구간에서 Retry와 11000ms 자연 반복을 실행하면 매번 2000ms의 새 시도로 돌아간다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); select(run.player); run.player.setAuto(false);
    // 아직 재생하지 않은 선택 구간도 Retry가 사용한다.
    run.player.retry();
    for (const restart of [() => run.player.retry(), () => frame(11000)]) {
      at(6000); key(run.target, 'keydown'); frame(6000); key(run.target, 'keyup');
      expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
      restart();
      expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(fadedSpan, 2000);
      expect(snapshot().atMs).toBe(2000); expect(snapshot().items[0].settlementFactId).toBeNull();
      expect(run.state()).toMatchObject({ autoEnabled: false, manualStats: { combo: 0, achievementRate: 0 }, songTimeMs: 2000 });
    }
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledTimes(4); expect(run.onError).not.toHaveBeenCalled();
  });

  it('12초 곡의 0～1000ms·1000～11000ms·11000～12000ms를 재생하면 페이드를 0～12000ms 안으로 제한하고 무음을 채우지 않는다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start();
    for (const [range, span] of [
      [{ startMs: 0, endMs: 1000 }, { fromMs: 0, fadeInUntilMs: 0, fadeOutFromMs: 1000, toMs: 4000 }],
      [{ startMs: 1000, endMs: 11000 }, { fromMs: 0, fadeInUntilMs: 1000, fadeOutFromMs: 11000, toMs: 12000 }],
      [{ startMs: 11000, endMs: 12000 }, { fromMs: 8000, fadeInUntilMs: 11000, fadeOutFromMs: 12000, toMs: 12000 }],
    ] as const) {
      run.player.beginRangeEdit(); run.player.setRange(range); run.player.endRangeEdit(); run.player.togglePause();
      expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(span, span.fromMs);
    }
    expect(fixture.audio[0].playWithPreroll).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('12초 곡에서 음수·역순·12001ms·NaN·Infinity 범위를 지정하면 RangeError를 던지고 5000～8000ms·화면·알림을 유지한다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start(); select(run.player);
    const state = run.state(); const range = run.player.range; const renderer = fixture.renderers[0];
    const renderCount = renderer.renderFrame.mock.calls.length; const stateCount = run.onState.mock.calls.length;
    for (const invalid of [
      { startMs: -1, endMs: 8000 }, { startMs: 8001, endMs: 8000 }, { startMs: 5000, endMs: 12001 },
      { startMs: NaN, endMs: 8000 }, { startMs: 5000, endMs: NaN },
      { startMs: -Infinity, endMs: 8000 }, { startMs: 5000, endMs: Infinity },
    ]) expect(() => run.player.setRange(invalid)).toThrow(RangeError);
    expect(run.player.range).toBe(range); expect(run.state()).toBe(state);
    expect(renderer.renderFrame).toHaveBeenCalledTimes(renderCount); expect(run.onState).toHaveBeenCalledTimes(stateCount);
    expect(fixture.audio[0].running).toBe(false); expect(run.onError).not.toHaveBeenCalled();
    run.player.togglePause(); expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(fadedSpan, 2000);
  });

  it('재생 중 5000～8000ms를 지정하면 오류로 전곡을 유지하고 일시정지 뒤에는 드래그 없이 선택할 수 있다', async () => {
    const run = create([p(6000)], {}, 12); await run.player.start();
    expect(() => run.player.setRange(selected)).toThrow('구간은 편집 또는 일시정지 중에만 변경할 수 있습니다');
    expect(run.player.range).toEqual({ startMs: 0, endMs: 12000 }); expect(fixture.audio[0].running).toBe(true);
    run.player.togglePause(); run.player.setRange(selected);
    expect(run.state().songTimeMs).toBe(5000); run.player.togglePause();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(fadedSpan, 2000); expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000ms에 쥔 KeyW·KeyE로 구간을 바꾸면 새 바디는 preheld로 시작하고 이전 큐와 편집 중 down은 5000ms 탭을 치지 않는다', async () => {
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const run = create([b(4000, 7000), t(6000), p(5000, 'single', 2), p(5000, 'single', 3)], {}, 12);
    await run.player.start(); run.player.setAuto(false);
    at(5000); key(run.target, 'keydown'); key(run.target, 'keydown', 'KeyE');
    run.player.beginRangeEdit(); run.player.setRange(selected); key(run.target, 'keydown', 'KeyP');
    wallFrame(10000); run.player.endRangeEdit(); run.player.togglePause(); frame(5000);
    const session = advance.mock.contexts.at(-1) as ExplicitJudgmentSession;
    expect(session.facts.filter(fact => fact.kind === 'bodyStarted')).toMatchObject([{ via: 'preheld', actualStartMs: 5000 }]);
    expect(session.facts.filter(fact => fact.kind === 'input')).toEqual([]);
    expect(snapshot().items.filter(item => item.kind === 'tap').every(item => item.settlementFactId === null)).toBe(true);
    frame(6000); expect(snapshot().items.find(item => item.kind === 'tick')!.state).toBe('success');
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('5000～8000ms에서 구간을 100회 옮겨도 반복은 만들지 않고 동일 구간은 재계산하지 않으며 재생 때 1회만 만든다', async () => {
    const attach = vi.spyOn(ExplicitSessionRendererAdapter.prototype, 'attach');
    const clip = vi.spyOn(playbackCharts, 'selectExplicitRangePlaybackChart');
    const run = create([p(7000)], {}, 12); await run.player.start();
    expect(attach).toHaveBeenCalledOnce(); attach.mockClear(); clip.mockClear();
    run.player.beginRangeEdit();
    for (let index = 0; index < 100; index++) {
      const range = { startMs: 5000 + index, endMs: 8000 + index };
      run.player.setRange(range); run.player.setRange({ ...range });
    }
    run.player.endRangeEdit();
    expect(attach).not.toHaveBeenCalled(); expect(clip).toHaveBeenCalledTimes(100);
    expect(fixture.renderers[0].setExplicitPlaybackChart).toHaveBeenCalledTimes(100);
    expect(fixture.renderers[0].resetTransientState).toHaveBeenCalledOnce();
    run.player.togglePause(); expect(attach).toHaveBeenCalledOnce();
    expect(fixture.audio[0].playFadedSpan.mock.lastCall![1]).toBe(2099); expect(run.onError).not.toHaveBeenCalled();
  });

  it('길이 0인 5000.5ms 구간을 선택하면 같은 시각 노트만 판정하고 빈 6000～7000ms 구간에서는 달성률을 숨긴다', async () => {
    const run = create([p(5000.5)], {}, 12); await run.player.start(); run.player.setAuto(false);
    run.player.togglePause(); run.player.setRange({ startMs: 5000.5, endMs: 5000.5 }); run.player.togglePause();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenLastCalledWith(
      { fromMs: 2000.5, fadeInUntilMs: 5000.5, fadeOutFromMs: 5000.5, toMs: 8000.5 }, 2000.5);
    at(5000.5); key(run.target, 'keydown'); frame(5000.5);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    run.player.togglePause(); run.player.setRange({ startMs: 6000, endMs: 7000 });
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: null });
    run.player.togglePause(); expect(snapshot().items).toEqual([]);
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: null }); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1000ms에서 구간을 그대로 두거나 5000～8000ms로 바꿨다 전곡으로 돌리면 콤보 1·100%를 복원하고 Play는 1000ms부터 같은 집계를 잇는다', async () => {
    const attach = vi.spyOn(ExplicitSessionRendererAdapter.prototype, 'attach');
    const resumeAt = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create([p(1000), p(2000), p(6000)], {}, 12); await run.player.start(); run.player.setAuto(false);
    at(1000); key(run.target, 'keydown'); frame(1000); key(run.target, 'keyup');
    const before = snapshot();
    const renderer = fixture.renderers[0];
    const originalChart = renderer.setExplicitChart.mock.calls[0][0];
    run.player.beginRangeEdit(); run.player.setRange({ startMs: 0, endMs: 12000 }); run.player.endRangeEdit();
    run.player.togglePause();
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce();
    expect(fixture.audio[0].currentTimeMs).toBe(1000);
    expect(snapshot().items).toEqual(before.items);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    // 일반 일시정지 뒤 편집에 들어가도 현재 시도를 보존한다.
    run.player.togglePause(); run.player.beginRangeEdit(); run.player.setRange(selected);
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    run.player.setRange({ startMs: 0, endMs: 12000 });
    expect(run.state()).toMatchObject({ songTimeMs: 0, manualStats: { combo: 1, achievementRate: 100 } });
    run.player.endRangeEdit(); run.player.togglePause();
    expect(fixture.audio[0].currentTimeMs).toBe(1000);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    expect(fixture.audio[0].resume).toHaveBeenCalledTimes(2);
    expect(renderer.setExplicitPlaybackChart.mock.lastCall![0]).toBe(originalChart);
    expect(snapshot().items).toEqual(before.items);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    at(2000); key(run.target, 'keydown'); frame(2000);
    expect(run.state().manualStats).toEqual({ combo: 2, achievementRate: 100 });
    expect(attach).toHaveBeenCalledOnce(); expect(resumeAt).not.toHaveBeenCalled();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms에서 구간 변경 없이 편집하며 Auto를 끄고 KeyW를 유지하면 Play는 같은 바디를 이어 2000ms 틱부터 콤보 1·100%다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000), r(3000)]);
    await run.player.start(); frame(1500); run.player.beginRangeEdit();
    wallFrame(5000); run.player.setAuto(false); key(run.target, 'keydown');
    expect(run.state()).toMatchObject({ autoEnabled: false, songTimeMs: 0, manualStats: { combo: 0, achievementRate: 0 } });
    run.player.endRangeEdit(); run.player.togglePause();
    expect(run.state()).toMatchObject({ autoEnabled: false, songTimeMs: 1500, manualStats: { combo: 0, achievementRate: 0 } });
    expect(snapshot().bodyUnits[0].state).toBe('active');
    frame(2000);
    expect(snapshot().bodyUnits[0].state).toBe('active');
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms에서 구간 변경 없이 편집하며 Auto를 끄고 KeyW를 놓으면 Play 후 1520ms에 같은 바디의 유지가 실패한다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000)]);
    await run.player.start(); frame(1500); run.player.beginRangeEdit();
    wallFrame(5000); key(run.target, 'keydown'); run.player.setAuto(false); key(run.target, 'keyup');
    run.player.endRangeEdit(); run.player.togglePause();
    frame(1519);
    expect(snapshot().bodyUnits[0]).toMatchObject({ state: 'recovering', maintenanceDeadlineMs: 1520 });
    frame(1521);
    expect(snapshot().bodyUnits[0]).toMatchObject({ state: 'failed', failedAtMs: 1520 });
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms에서 구간 변경 없이 편집하며 Auto를 켜고 KeyW를 놓으면 Play는 같은 바디를 Auto로 이어 2000ms 틱을 처리하고 집계를 숨긴다', async () => {
    const run = create([p(1000), b(1000, 3000), t(2000), r(3000)]);
    await run.player.start(); run.player.setAuto(false);
    at(1000); key(run.target, 'keydown'); frame(1500);
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    run.player.beginRangeEdit(); wallFrame(5000); key(run.target, 'keyup'); run.player.setAuto(true);
    expect(run.state()).toMatchObject({ autoEnabled: true, songTimeMs: 0, manualStats: null });
    run.player.endRangeEdit(); run.player.togglePause();
    expect(run.state()).toMatchObject({ autoEnabled: true, songTimeMs: 1500, manualStats: null });
    expect(snapshot().items[0].state).toBe('success');
    expect(snapshot().bodyUnits[0].state).toBe('active');
    frame(2000);
    expect(snapshot().items.find(item => item.kind === 'tick')!.state).toBe('success');
    expect(run.state().manualStats).toBeNull();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('1500ms에 이미 실패한 바디를 구간 변경 없이 편집하고 KeyW를 누른 채 Play해도 시작 창을 다시 열지 않아 2000ms 틱은 0점이다', async () => {
    const resumeAt = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create([b(1000, 3000), t(2000)]);
    await run.player.start(); run.player.setAuto(false); frame(1500);
    const failedBody = snapshot().bodyUnits[0];
    expect(failedBody.state).toBe('failed');
    run.player.beginRangeEdit(); wallFrame(5000); key(run.target, 'keydown');
    run.player.endRangeEdit(); run.player.togglePause(); frame(2000);
    expect(snapshot().bodyUnits[0]).toEqual(failedBody);
    expect(snapshot().items[0].state).toBe('dependentZero');
    expect(run.state().manualStats).toEqual({ combo: 0, achievementRate: 0 });
    expect(resumeAt).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('990ms 프레임 뒤 1000ms KeyW가 큐에 남은 채 변경 없이 편집하면 입력을 1회 판정하고 Play는 1000ms·콤보 1·100%를 잇는다', async () => {
    const run = create([p(1000)], {}, 12); await run.player.start(); run.player.setAuto(false);
    frame(990); at(1000); key(run.target, 'keydown');
    run.player.beginRangeEdit();
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledExactlyOnceWith(1);
    // drain 효과를 집계한 뒤 미리보기의 일시적인 타격 표시는 지운다.
    expect(fixture.renderers[0].renderFrame.mock.results.at(-1)!.value).toMatchObject({ judgment: null, bombLanes: [] });
    wallFrame(5000); run.player.endRangeEdit(); run.player.togglePause();
    expect(fixture.audio[0].currentTimeMs).toBe(1000);
    frame(1000);
    expect(snapshot().items[0].settlementFactId).not.toBeNull();
    expect(run.state().manualStats).toEqual({ combo: 1, achievementRate: 100 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledOnce();
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce();
    expect(fixture.audio[0].resume).toHaveBeenCalledOnce();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('KeyW를 누른 채 5000～8000ms로 바꾸고 편집을 끝낸 뒤 정지 중 KeyW를 놓으면 키 표시와 레인 1 빔이 바로 꺼진다', async () => {
    const run = create([p(1000)], {}, 12); await run.player.start(); run.player.setAuto(false);
    frame(500); key(run.target, 'keydown');
    select(run.player);
    expectKeys(true);
    key(run.target, 'keyup');
    expectKeys(false);
  });

  it('로딩 전 range는 null이고 5000～8000ms 편집 중 dispose 뒤에는 늦은 편집·재생 호출이 알림이나 자원을 되살리지 않는다', async () => {
    const run = create([p(6000)], {}, 12); expect(run.player.range).toBeNull();
    run.player.beginRangeEdit(); run.player.setRange(selected); run.player.endRangeEdit();
    expect(run.onPhase).not.toHaveBeenCalled(); await run.player.start();
    run.player.beginRangeEdit(); const requested = { ...selected }; run.player.setRange(requested);
    requested.startMs = 1;
    expect(run.player.range).toEqual(selected); expect(Object.isFrozen(run.player.range)).toBe(true);
    const pending = [...frames.values()]; const count = run.onState.mock.calls.length;
    run.player.dispose(); run.player.endRangeEdit(); run.player.beginRangeEdit();
    run.player.setRange({ startMs: 6000, endMs: 9000 }); run.player.togglePause(); run.player.retry();
    for (const callback of pending) callback(20000);
    expect(run.onState).toHaveBeenCalledTimes(count); expect(run.player.range).toEqual(selected);
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(fixture.audio[0].playFadedSpan).toHaveBeenCalledOnce(); expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.renderers[0].dispose).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });
});
