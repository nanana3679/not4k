import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { useGameStore } from '../stores/gameStore';
import { prepareExplicitPlayTest, prepareNormalPlay } from '../stores/explicitPlayRequest';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import { ExplicitPlayDebugLog } from '../debug/ExplicitPlayDebugLog';
import type { GameSettings } from '../stores/gameStore';
import { beat, normalizePlaybackRange } from '../../shared';
import type { PlaybackRange } from '../../shared';
import type { GameRenderer } from '../renderer/GameRenderer';

const fixture = vi.hoisted(() => ({ now: 0, audio: [] as FakeAudio[], renderers: [] as FakeRenderer[],
  skins: [] as { dispose: ReturnType<typeof vi.fn> }[], explicit: [] as { dispose: ReturnType<typeof vi.fn> }[],
  load: (() => Promise.resolve()) as () => Promise<void>, init: (() => Promise.resolve()) as () => Promise<void>,
  prepareAudio: (() => Promise.resolve()) as () => Promise<void>, gearReady: null as Promise<void> | null,
  playError: false, preparationError: false, latency: 0,
}));
class FakeAudio {
  masterVolume = 1; playbackRate = 1; duration = 4000; position = 0; startedAt = 0; running = false;
  get currentTimeMs() { return this.position + (this.running ? (fixture.now - this.startedAt) * this.playbackRate : 0); }
  prepareForPlayback = vi.fn(() => fixture.prepareAudio()); getOutputLatencyMs = () => fixture.latency;
  loadBuffer = vi.fn((buffer: AudioBuffer) => { this.duration = buffer.duration * 1000; });
  setPlaybackRange = vi.fn((requested: PlaybackRange | null) => {
    const range = normalizePlaybackRange(requested, this.duration / 1000);
    if (range) this.duration = (range.endTime - range.startTime) * 1000;
  });
  play = vi.fn((position = 0) => this.startPlayback(position));
  playWithPreroll = vi.fn((position: number) => {
    this.startPlayback(position);
  });
  private startPlayback(position: number) {
    if (fixture.playError) throw new Error('audio start');
    this.position = position; this.startedAt = fixture.now; this.running = true;
  }
  pause = vi.fn(() => { this.position = this.currentTimeMs; this.running = false; });
  resume = vi.fn(); dispose = vi.fn(async () => { this.running = false; });
  constructor() { fixture.audio.push(this); }
}
class FakeRenderer {
  init = vi.fn(() => fixture.init()); dispose = vi.fn();
  setExplicitChart = vi.fn<GameRenderer['setExplicitChart']>(); scrollSpeed = 0; setLift = vi.fn(); setSudden = vi.fn();
  setChartVisible = vi.fn(); setExplicitPlaybackChart = vi.fn<GameRenderer['setExplicitPlaybackChart']>();
  setShowFastSlow = vi.fn(); setShowTimingDiff = vi.fn(); setPerfectWindow = vi.fn(); setupKeyboardDisplay = vi.fn();
  prepareForPlayback = vi.fn(() => { if (fixture.preparationError) throw new Error('warm up'); });
  setKeyState = vi.fn(); setKeyBeam = vi.fn(); renderFrame = vi.fn(); updateCombo = vi.fn(); updateAccuracy = vi.fn();
  showJudgmentGroup = vi.fn(); recordFlightJudgment = vi.fn(); showBombEffect = vi.fn();
  recordExplicitPlaybackPosition = vi.fn(); restoreExplicitPlaybackState = vi.fn();
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
vi.mock('./gearMotionKeepAlive', () => ({ keepGearMotionAssets: () => fixture.gearReady ? { ready: fixture.gearReady } : null }));
const { ExplicitPlayRuntime } = await import('./ExplicitPlayRuntime');

class Target extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (listener) this.listeners.add(listener);
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (listener) this.listeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }
}
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const players: InstanceType<typeof ExplicitPlayRuntime>[] = [];
beforeEach(() => {
  fixture.now = 0; fixture.audio = []; fixture.renderers = []; fixture.skins = []; fixture.explicit = [];
  fixture.load = async () => {}; fixture.init = async () => {}; fixture.playError = false; fixture.preparationError = false;
  fixture.prepareAudio = async () => {}; fixture.gearReady = null;
  fixture.latency = 0;
  frames.clear(); frameId = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => fixture.now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { for (const player of players.splice(0)) player.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function create(auto = true, chart = explicitPlaytestCharts[0].chart, settings: Partial<GameSettings> = {}, startTimeMs = 0, duration = 4,
  normal?: { playbackRange?: PlaybackRange | null }) {
  const target = new Target(); const onResult = vi.fn<(result: ExplicitSessionResult) => void>();
  const onError = vi.fn(); const onPhase = vi.fn(); const onProgress = vi.fn();
  const request: ExplicitPlayRequest = normal
    ? prepareNormalPlay({ document: chart, audioBuffer: { duration } as AudioBuffer, playbackRange: normal.playbackRange })
    : prepareExplicitPlayTest({ document: chart, audioBuffer: { duration } as AudioBuffer, returnUrl: '/lab/explicit-playtest', auto, startTimeMs });
  const player = new ExplicitPlayRuntime({ request, settings: { ...useGameStore.getInitialState().settings, gearMotion: false, ...settings },
    canvas: {} as HTMLCanvasElement, width: 1200, height: 700, inputTarget: target, onResult, onError, onPhase, onProgress });
  players.push(player);
  return { player, target, onResult, onError, onPhase, onProgress };
}
function at(time: number) {
  const audio = fixture.audio.at(-1)!;
  fixture.now = audio.startedAt + (time + fixture.latency * audio.playbackRate - audio.position) / audio.playbackRate;
}
function frame(time: number) {
  at(time); wallFrame(fixture.now);
}
function wallFrame(time: number, timestamp = time) {
  fixture.now = time; const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(timestamp);
}
function key(target: Target, type: 'keydown' | 'keyup', code: string, timeStamp = fixture.now) {
  const event = new Event(type); Object.defineProperties(event, { code: { value: code }, timeStamp: { value: timeStamp } });
  target.dispatchEvent(event);
}

describe('명시 실제 재생 runtime', () => {
  it('일반 첫 시작과 Retry는 각각 준비 완료 즉시 play(0)·playing이며 음악 준비와 resumeAt을 호출하지 않는다', async () => {
    const resume = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    for (let attempt = 0; attempt < 2; attempt++) {
      const run = create(false, undefined, {}, 0, 4, {}); await run.player.start();
      const audio = fixture.audio[attempt]; const renderer = fixture.renderers[attempt];
      expect(run.onPhase.mock.calls.map(call => call[0])).toEqual(['preparing', 'playing']);
      expect(audio.play).toHaveBeenCalledExactlyOnceWith(0);
      expect(audio.playWithPreroll).not.toHaveBeenCalled();
      expect(renderer.prepareForPlayback).toHaveBeenCalledOnce();
      expect(renderer.setChartVisible).toHaveBeenLastCalledWith(true);
      expect(audio.play.mock.invocationCallOrder[0]).toBeGreaterThan(renderer.prepareForPlayback.mock.invocationCallOrder[0]);
      expect(run.target.listeners.size).toBe(4);
      run.player.dispose(); expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    }
    expect(resume).not.toHaveBeenCalled();
  });

  it.each(['skin', 'audio', 'gear', 'renderer'] as const)('일반 시작의 %s 준비가 실제5초 걸려도 play·키 입력·Esc·타임아웃 시작이 없다', async stage => {
    let resolve!: () => void; let entered!: () => void;
    const waiting = new Promise<void>(done => { resolve = done; });
    const ready = new Promise<void>(done => { entered = done; });
    const block = () => { entered(); return waiting; };
    if (stage === 'skin') fixture.load = block;
    if (stage === 'audio') fixture.prepareAudio = block;
    if (stage === 'renderer') fixture.init = block;
    if (stage === 'gear') { fixture.gearReady = waiting; fixture.load = async () => { entered(); }; }
    const run = create(false, undefined, {}, 0, 4, {}); const starting = run.player.start(); await ready;
    wallFrame(5000); key(run.target, 'keydown', 'Escape'); run.player.togglePause();
    expect(run.onPhase).toHaveBeenLastCalledWith('preparing');
    expect(fixture.audio[0].play).not.toHaveBeenCalled(); expect(run.target.listeners.size).toBe(0);
    resolve(); await starting;
    expect(run.onPhase).toHaveBeenLastCalledWith('playing'); expect(fixture.audio[0].startedAt).toBe(5000);
    expect(fixture.audio[0].playWithPreroll).not.toHaveBeenCalled();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it.each([0.5, 1, 2])('일반 배속%s·L₀20ms·입력+40ms·시각+70ms는 준비 없이 P0에서 시작하고1000ms Point를 Perfect로 처리한다', async rate => {
    fixture.latency = 20;
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(2) }];
    const run = create(false, chart, { playSpeed: rate, inputOffsetMs: 40, visualOffsetMs: 70 }, 0, 4, {});
    await run.player.start(); wallFrame(0);
    expect(fixture.renderers[0].prepareForPlayback).toHaveBeenCalledWith(50 * rate);
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(50 * rate, 0);
    at(1000 - 40 * rate); key(run.target, 'keydown', 'KeyQ'); frame(1000 - 40 * rate); frame(4200);
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 3, fastCount: 0, slowCount: 0 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledOnce();
  });

  it('일반 차트 offset−40ms·L₀20ms·2배속에서 시작 직후 down은 음수 시각 Point를 제외하지 않고 Perfect로 친다', async () => {
    fixture.latency = 20;
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.meta.offsetMs = -40; chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(0) }];
    const run = create(false, chart, { playSpeed: 2 }, 0, 4, {}); await run.player.start();
    key(run.target, 'keydown', 'KeyQ'); wallFrame(0); frame(4200);
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ totalNotes: 1, earnedScore: 3 });
  });

  it('일반 배속2·L₀20ms에서5000ms pause는2000으로 되감고 실제2999ms 숨긴 뒤3000ms에 다시 표시한다', async () => {
    fixture.latency = 20;
    const run = create(false, undefined, { playSpeed: 2, visualOffsetMs: 70 }, 0, 8, {});
    await run.player.start(); frame(2000); frame(5000); run.player.togglePause();
    expect(fixture.renderers[0].restoreExplicitPlaybackState).toHaveBeenCalledWith(2000, 2, expect.any(Array));
    run.player.togglePause();
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledExactlyOnceWith(-3960);
    const started = fixture.now;
    wallFrame(started + 2999); expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    expect(fixture.renderers[0].setChartVisible).toHaveBeenLastCalledWith(false);
    wallFrame(started + 3000); expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(2140, 0);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('일반 시작의 출력 지연20ms 안에서 즉시 pause해도0ms 목표로 음악 준비한 뒤 정상 재개한다', async () => {
    fixture.latency = 20;
    const run = create(false, undefined, {}, 0, 4, {}); await run.player.start();
    key(run.target, 'keydown', 'Escape'); key(run.target, 'keydown', 'Escape');
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledExactlyOnceWith(-2980);
    wallFrame(3000); expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('일반 입력+100ms·L₀20ms에서 J−20의 KeyQ(raw80) 뒤 입력 없이 J5에 멈추면 오류 없이 0으로 되감아 일시정지한다', async () => {
    fixture.latency = 20;
    const run = create(false, undefined, { inputOffsetMs: 100 }, 0, 4, {}); await run.player.start();
    at(-20); key(run.target, 'keydown', 'KeyQ'); frame(-20);
    at(5); key(run.target, 'keydown', 'Escape');
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onPhase).toHaveBeenLastCalledWith('paused');
    expect(fixture.renderers[0].restoreExplicitPlaybackState).toHaveBeenCalledWith(0, 1, expect.any(Array));
  });

  it('원본16초의8～12초 구간은 songTime0으로 시작하고 렌더러·완주 기준은4000ms이다', async () => {
    const range = { startTime: 8, endTime: 12, fadeInTime: .2, fadeOutTime: .3 };
    const run = create(false, undefined, {}, 0, 16, { playbackRange: range }); await run.player.start();
    expect(fixture.audio[0].setPlaybackRange).toHaveBeenCalledWith(range);
    expect(fixture.audio[0].play).toHaveBeenCalledExactlyOnceWith(0);
    expect(fixture.renderers[0].setExplicitChart.mock.calls[0][4]).toBe(4000);
    frame(3999); expect(run.onResult).not.toHaveBeenCalled(); frame(4000);
    expect(run.onResult).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('일반 AutoEvent1000～2000ms와3000ms 실제 down은4항목12점·타격4회·고도4회로 한 번 종료한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.events.push({ type: 'auto', beat: beat(2), endBeat: beat(4) });
    const run = create(false, chart, {}, 0, 4, {}); await run.player.start();
    frame(1000); frame(2000); at(3000); key(run.target, 'keydown', 'KeyE'); frame(3000);
    const pending = [...frames.values()]; frame(4200); for (const callback of pending) callback(4300);
    expect(run.onResult).toHaveBeenCalledOnce();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 12, processedNotes: 4 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(4);
    expect(fixture.renderers[0].recordFlightJudgment).toHaveBeenCalledTimes(4);
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
  });

  it('일반 debugMode는 실제 판정·되감기 목표2000·최종 결과를 기록하고 완주 후 Quit도1회만 다운로드한다', async () => {
    const record = vi.spyOn(ExplicitPlayDebugLog.prototype, 'record');
    const rewind = vi.spyOn(ExplicitPlayDebugLog.prototype, 'rewind');
    const finish = vi.spyOn(ExplicitPlayDebugLog.prototype, 'finish');
    const click = vi.fn(); vi.stubGlobal('document', { createElement: () => ({ click }) });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:debug');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const run = create(false, undefined, { debugMode: true }, 0, 8, {}); await run.player.start();
    at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1000); frame(5000);
    run.player.togglePause(); run.player.togglePause(); frame(2000); frame(8200); run.player.downloadDebugLog();
    expect(record).toHaveBeenCalled(); expect(rewind).toHaveBeenCalledExactlyOnceWith(2000, expect.any(ExplicitJudgmentSession));
    expect(finish).toHaveBeenCalledExactlyOnceWith(run.onResult.mock.calls[0][0]);
    expect(click).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('일반 debugMode 기록 실패는 판정과 완주를 막지 않고 오류 로그만1회 남긴다', async () => {
    vi.spyOn(ExplicitPlayDebugLog.prototype, 'record').mockImplementation(() => { throw new Error('debug'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = create(false, undefined, { debugMode: true }, 0, 4, {}); await run.player.start();
    frame(1000); frame(4200);
    expect(run.onResult).toHaveBeenCalledOnce(); expect(run.onError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('일반 debugMode에서 Retry용 dispose와 로딩 취소는 다운로드하지 않는다', async () => {
    const download = vi.spyOn(ExplicitPlayDebugLog.prototype, 'download').mockImplementation(() => {});
    const first = create(false, undefined, { debugMode: true }, 0, 4, {}); await first.player.start(); first.player.dispose();
    let resolve!: () => void; let entered!: () => void;
    const ready = new Promise<void>(done => { entered = done; });
    fixture.init = () => { entered(); return new Promise<void>(done => { resolve = done; }); };
    const canceled = create(false, undefined, { debugMode: true }, 0, 4, {});
    const start = canceled.player.start(); await ready; canceled.player.downloadDebugLog(); canceled.player.dispose(); resolve(); await start;
    expect(download).not.toHaveBeenCalled(); expect(fixture.audio[1].play).not.toHaveBeenCalled();
    expect(canceled.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('일반4초 끝의 Point4000과입력−100ms는 진행 시각이4120ms 기한을 넘는4221ms까지 결과를 기다린다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(8) }];
    const run = create(false, chart, { inputOffsetMs: -100 }, 0, 4, {}); await run.player.start();
    frame(4000); at(4100); key(run.target, 'keydown', 'KeyQ'); frame(4100); frame(4220);
    expect(run.onResult).not.toHaveBeenCalled(); frame(4221);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1 } });
  });

  it('마지막 프레임1500 뒤5000에서 멈춰2000으로 되감으면 준비 후2010 down도 남은 바디를 시작한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(2) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(12) },
      { type: 'release', count: 1, lane: 1, beat: beat(12) }];
    const run = create(false, chart, {}, 0, 8); await run.player.start();
    frame(0); at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1500);
    at(5000); run.player.togglePause(); key(run.target, 'keyup', 'KeyQ'); run.player.togglePause();
    frame(2000); at(2010); key(run.target, 'keydown', 'KeyW'); frame(2010);
    const snapshot = fixture.renderers[0].setExplicitChart.mock.calls[0][2]();
    expect(run.onError).not.toHaveBeenCalled();
    expect(snapshot.bodyUnits[0]).toMatchObject({ state: 'active', actualStartMs: 2010 });
  });

  it.each([false, true])('프레임1500～5000 공백에서 auto=%s의1750 Point는2000 복원에 반영되고 과거 타격은 다시 재생하지 않는다', async auto => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(2) },
      { type: 'point', kind: 'single', lane: 2, beat: beat(7, 2) }];
    const run = create(auto, chart, {}, 0, 8); await run.player.start(); frame(0);
    if (!auto) { at(1000); key(run.target, 'keydown', 'KeyQ'); }
    frame(1500); at(5000); run.player.togglePause();
    const renderer = fixture.renderers[0];
    const hits = renderer.showBombEffect.mock.calls.length;
    const flights = renderer.recordFlightJudgment.mock.calls.length;
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 2, combo: auto ? 2 : 0 }, 2000);
    run.player.togglePause(); frame(2000);
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(hits);
    expect(renderer.recordFlightJudgment).toHaveBeenCalledTimes(flights);
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('프레임1500 뒤5000→2000 복원은 입력−200ms의core1800까지만 진행하고2050 down의Point1850 Perfect를 보존한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(37, 10) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(37, 10), endBeat: beat(12) },
      { type: 'release', count: 1, lane: 1, beat: beat(12) }];
    const run = create(false, chart, { inputOffsetMs: -200 }, 0, 8); await run.player.start();
    frame(0); frame(1500); at(5000); run.player.togglePause();
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 0, combo: 0 }, 2000);
    run.player.togglePause(); frame(2000);
    at(2050); key(run.target, 'keydown', 'KeyQ'); frame(2050);
    expect(fixture.renderers[0].setExplicitChart.mock.calls[0][2]().items[0]).toMatchObject({ state: 'success', grade: 'perfect' });
    expect(run.onError).not.toHaveBeenCalled();
  });

  it.each([0.5, 1, 2])('배속%s·L₀20ms·입력−40ms·시각+70ms에서도 음악 준비는 실제3000ms이고 그 전에는 차트·판정·효과가 없다', async rate => {
    fixture.latency = 20;
    const advance = vi.spyOn(ExplicitJudgmentSession.prototype, 'advance');
    const resume = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create(true, undefined, { playSpeed: rate, inputOffsetMs: -40, visualOffsetMs: 70 });
    await run.player.start();
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledWith(-2980 * rate);
    const renderer = fixture.renderers[0];
    for (const time of [0, 1000, 2999]) wallFrame(time);
    expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    expect(renderer.setChartVisible).toHaveBeenLastCalledWith(false);
    expect(advance).not.toHaveBeenCalled(); expect(resume).not.toHaveBeenCalled();
    expect(renderer.showBombEffect).not.toHaveBeenCalled(); expect(renderer.recordFlightJudgment).not.toHaveBeenCalled();
    expect(renderer.renderFrame).toHaveBeenLastCalledWith(70 * rate, 1999);
    wallFrame(3000);
    expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(renderer.setChartVisible).toHaveBeenLastCalledWith(true);
    expect(resume).toHaveBeenCalledExactlyOnceWith(0, [], 0, 0);
  });

  it('목표100000ms·2배속·L₀20ms·4초 음원은 가상P=94040부터 준비하고 실제2999ms까지 차트를 숨긴다', async () => {
    fixture.latency = 20;
    const run = create(false, undefined, { playSpeed: 2 }, 100000); await run.player.start();
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledWith(94040);
    wallFrame(2999); expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 0, combo: 0 }, 100000);
    wallFrame(3000);
    expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(fixture.renderers[0].setChartVisible).toHaveBeenLastCalledWith(true);
    frame(100121); expect(run.onResult).toHaveBeenCalledOnce();
  });

  it.each(['preheld', 'late-down', 'auto'] as const)('커서1500ms의 %s는 이전 Point1000을 제외하고 남은 바디와 sustain1500부터3항목9점을 처리한다', async mode => {
    fixture.latency = 20;
    const run = create(mode === 'auto', undefined, { playSpeed: 2 }, 1500); await run.player.start();
    const renderer = fixture.renderers[0];
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledWith(-4460);
    wallFrame(1000);
    if (mode === 'preheld') key(run.target, 'keydown', 'KeyQ');
    wallFrame(2999);
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 0, combo: 0 }, 1500);
    expect(renderer.recordFlightJudgment).not.toHaveBeenCalled();
    wallFrame(3000);
    const playback = renderer.setExplicitPlaybackChart.mock.calls.at(-1)![0];
    expect(playback.bodies[0]).toMatchObject({ startMs: 1500, endMs: 2000 });
    expect(playback.scoreItems.map(item => item.timeMs)).toEqual([1500, 2000, 3000]);
    if (mode === 'late-down') { at(1580); key(run.target, 'keydown', 'KeyQ'); frame(1580); }
    if (mode !== 'auto') { at(2000); key(run.target, 'keyup', 'KeyQ'); }
    frame(2000);
    if (mode !== 'auto') { at(3000); key(run.target, 'keydown', 'KeyE'); }
    frame(3000); frame(4200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ totalNotes: 3, processedNotes: 3,
      earnedScore: 9, finalDenominatorWeight: 9, judgmentCounts: { perfect: 3, miss: 0 } });
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(3);
  });

  it('차트 offset−5000ms로 노트가 모두0 이전에 있어도 처음 준비2999ms까지 정산·효과는0이다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.meta.offsetMs = -5000;
    const run = create(true, chart); await run.player.start(); wallFrame(0); wallFrame(2999);
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 0, combo: 0 }, 0);
    expect(fixture.renderers[0].recordFlightJudgment).not.toHaveBeenCalled();
    expect(fixture.renderers[0].showJudgmentGroup).not.toHaveBeenCalled();
  });

  it('처음 준비 중2999ms에 누른 키는 hold만 seed하며 0ms Point를 새 down으로 판정하지 않는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 2, beat: beat(0) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) }];
    const run = create(false, chart); await run.player.start();
    wallFrame(1000); key(run.target, 'keydown', 'KeyQ'); key(run.target, 'keyup', 'KeyQ');
    wallFrame(2999); key(run.target, 'keydown', 'KeyW');
    wallFrame(3000);
    const snapshot = fixture.renderers[0].setExplicitChart.mock.calls[0][2]();
    expect(snapshot.bodyUnits[0].state).toBe('active');
    expect(snapshot.items[0].state).toBe('pending');
    expect(fixture.renderers[0].showBombEffect).not.toHaveBeenCalled();
    frame(2000); frame(4200);
    const result = run.onResult.mock.calls[0][0];
    expect(result.score.earnedScore).toBe(0);
    expect(result.facts.filter(fact => fact.kind === 'input')).toHaveLength(0);
  });

  it('준비 중 누른 KeyQ의 timestamp2990 up이 실제3000 활성화 뒤3010에 도착하면 바디0～2000을 hold 없음으로 다시 재개해 유지 노트1000에 점수를 주지 않는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: 'sustain', count: 1, lane: 1, beat: beat(2) }];
    const run = create(false, chart); await run.player.start();
    wallFrame(1000); key(run.target, 'keydown', 'KeyQ'); wallFrame(3000);
    const query = fixture.renderers[0].setExplicitChart.mock.calls[0][2];
    expect(query().bodyUnits[0].state).toBe('active');
    fixture.now = 3010; key(run.target, 'keyup', 'KeyQ', 2990);
    frame(1000); frame(4200);
    const result = run.onResult.mock.calls[0][0];
    expect(run.onError).not.toHaveBeenCalled();
    expect(result.snapshot.bodyUnits[0].state).toBe('failed');
    expect(result.score).toMatchObject({ earnedScore: 0, judgmentCounts: { perfect: 0 } });
    expect(result.facts.filter(fact => fact.kind === 'input')).toHaveLength(0);
  });

  it('준비 중 timestamp2990 KeyQ down이 실제3000 활성화 뒤3010에 도착하면 새 down 없이 hold로 반영해 바디0～2000과 유지 노트1000을 Perfect로 잇는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: 'sustain', count: 1, lane: 1, beat: beat(2) }];
    const run = create(false, chart); await run.player.start();
    wallFrame(3000);
    fixture.now = 3010; key(run.target, 'keydown', 'KeyQ', 2990);
    frame(1000); at(2500); key(run.target, 'keyup', 'KeyQ'); frame(2500); frame(4200);
    const result = run.onResult.mock.calls[0][0];
    expect(run.onError).not.toHaveBeenCalled();
    expect(result.snapshot.bodyUnits[0].state).toBe('complete');
    expect(result.score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1 } });
    expect(result.facts.filter(fact => fact.kind === 'input' && fact.action === 'down')).toHaveLength(0);
  });

  it('준비 종료 프레임이80ms 늦어도 실제3020ms down은 새 Point 입력이고 준비 중 down으로 버리지 않는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(0) }];
    const run = create(false, chart); await run.player.start(); wallFrame(2990);
    fixture.now = 3020; key(run.target, 'keydown', 'KeyQ'); wallFrame(3080, 3070);
    frame(4200);
    expect(run.onResult.mock.calls[0][0].score.judgmentCounts.perfect).toBe(1);
  });

  it.each([0.5, 1, 2])('배속%s·L₀20ms·입력−40ms·시각+70ms에서도5000ms pause는2000ms로 되감고 실제3000ms 준비한다', async rate => {
    fixture.latency = 20;
    const run = create(false, undefined, { playSpeed: rate, inputOffsetMs: -40, visualOffsetMs: 70 }, 0, 8);
    await run.player.start(); frame(0); frame(2000); frame(5000);
    run.player.togglePause(); run.player.togglePause();
    const started = fixture.now;
    const renderer = fixture.renderers[0];
    expect(fixture.audio[0].playWithPreroll).toHaveBeenLastCalledWith(2000 - 2980 * rate);
    expect(renderer.restoreExplicitPlaybackState).toHaveBeenCalledExactlyOnceWith(2000, rate, []);
    wallFrame(started + 2999);
    expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    expect(renderer.renderFrame.mock.calls.at(-1)![0]).toBe(2000 + 70 * rate);
    wallFrame(started + 3000);
    expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(run.onError).not.toHaveBeenCalled();
    expect(renderer.setExplicitChart.mock.calls[0][2]().atMs).toBe(2000 - 40 * rate);
  });

  it.each([true, false])('5000→2000ms 재개 preheld=%s는 prefix6점을 보존하고 남은 바디의 새 시작 뒤 총15점을 만든다', async preheld => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [
      { type: 'point', kind: 'single', lane: 1, beat: beat(2) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(8) },
      { type: 'sustain', count: 1, lane: 1, beat: beat(3) },
      { type: 'sustain', count: 1, lane: 1, beat: beat(5) },
      { type: 'release', count: 1, lane: 1, beat: beat(8) },
      { type: 'point', kind: 'single', lane: 2, beat: beat(12) },
    ];
    const run = create(false, chart, {}, 0, 8); await run.player.start();
    at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1500); frame(2000);
    at(4000); key(run.target, 'keyup', 'KeyQ'); frame(4000); frame(5000);
    const renderer = fixture.renderers[0];
    const effectsBefore = renderer.showBombEffect.mock.calls.length;
    expect(effectsBefore).toBe(4);
    run.player.togglePause();
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 2, combo: 2 }, 2000);
    run.player.togglePause();
    const startedAt = fixture.now;
    wallFrame(startedAt + 1000); key(run.target, 'keydown', 'KeyQ'); key(run.target, 'keyup', 'KeyQ');
    if (preheld) key(run.target, 'keydown', 'KeyW');
    wallFrame(startedAt + 2999);
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(effectsBefore);
    wallFrame(startedAt + 3000);
    const playback = renderer.setExplicitPlaybackChart.mock.calls.at(-1)![0];
    expect(playback.bodies[0]).toMatchObject({ startMs: 2000, endMs: 4000 });
    expect(playback.scoreItems).toHaveLength(5);
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(effectsBefore);
    if (!preheld) { at(2080); key(run.target, 'keydown', 'KeyW'); frame(2080); }
    frame(2500); at(4000); key(run.target, 'keyup', 'KeyW'); frame(4000);
    at(6000); key(run.target, 'keydown', 'KeyE'); frame(6000); frame(8200);
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 15, processedNotes: 5 });
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(7);
    expect(renderer.recordFlightJudgment).toHaveBeenCalledTimes(7);
  });

  it('Auto 바디1000～4000의5000→2000 복원은 KeyQ hold를 되찾고4000 release를 다시 처리해6점이다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(2) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(8) },
      { type: 'release', count: 1, lane: 1, beat: beat(8) }];
    const resume = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create(true, chart, {}, 0, 8); await run.player.start(); frame(1000); frame(2000); frame(5000);
    run.player.togglePause(); run.player.togglePause(); frame(2000);
    expect(resume.mock.calls.at(-1)![1]).toHaveLength(1);
    expect(resume.mock.calls.at(-1)![1]![0].key).toMatch(/^explicit-auto:/);
    frame(4000); frame(8200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 6, processedNotes: 2 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(3);
  });

  it('double의T2000 이전 실패는 유지하고T 이후 유지 실패는 복원하여 두 키를 준비해도 이전 종속0점은 남는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[1].chart);
    chart.notes = [{ type: 'point', kind: 'double', lane: 1, beat: beat(2) },
      { type: 'body', holdCount: 2, lane: 1, beat: beat(2), endBeat: beat(8) },
      { type: 'sustain', count: 2, lane: 1, beat: beat(5) },
      { type: 'release', count: 2, lane: 1, beat: beat(8) }];
    const run = create(false, chart, {}, 0, 8); await run.player.start();
    at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1500); frame(2000);
    const snapshot = fixture.renderers[0].setExplicitChart.mock.calls[0][2];
    const prefixFailed = snapshot().bodyUnits.find(unit => unit.state === 'failed')!;
    at(2100); key(run.target, 'keyup', 'KeyQ'); frame(2300); frame(5000);
    expect(snapshot().bodyUnits.every(unit => unit.state === 'failed')).toBe(true);
    run.player.togglePause(); run.player.togglePause();
    key(run.target, 'keydown', 'KeyQ'); key(run.target, 'keydown', 'KeyW'); frame(2000);
    expect(snapshot().bodyUnits.find(unit => unit.id === prefixFailed.id)).toEqual(prefixFailed);
    expect(snapshot().bodyUnits.map(unit => unit.state).sort()).toEqual(['active', 'failed']);
    frame(2500); at(4000); key(run.target, 'keyup', 'KeyQ'); key(run.target, 'keyup', 'KeyW'); frame(4000); frame(8200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 9, processedNotes: 6 });
  });

  it('1000ms Auto pause가0으로 되감기면 Point1000·1060을 다시 치되 최종6점이고 폐기 전 타격까지 합쳐3회다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [1000, 1060].map(ms => ({ type: 'point' as const, kind: 'single' as const, lane: 1, beat: beat(ms, 500) }));
    const run = create(true, chart); await run.player.start(); frame(1000);
    run.player.togglePause(); run.player.togglePause(); frame(0); frame(1000); frame(1060); frame(4200);
    const result = run.onResult.mock.calls[0][0];
    expect(result.facts.filter(fact => fact.kind === 'input' && fact.action === 'down').map(fact => fact.atMs)).toEqual([1000, 1060]);
    expect(result.score.earnedScore).toBe(6);
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(3);
  });

  it('트릴1000·2500에서5000→2000 되감기는 첫 키 이력을 보존해2500을 다른 키로 다시 처리한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[3].chart);
    chart.notes = [1000, 2500].map(ms => ({ type: 'point' as const, kind: 'trill' as const, lane: 1, beat: beat(ms, 500) }));
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(12) }];
    const run = create(true, chart, {}, 0, 8); await run.player.start(); frame(1000); frame(2000); frame(5000);
    run.player.togglePause(); run.player.togglePause(); frame(2000); frame(2500); frame(8200);
    const result = run.onResult.mock.calls[0][0];
    const downs = result.facts.filter(fact => fact.kind === 'input').filter(fact => fact.action === 'down');
    expect(downs).toHaveLength(2); expect(downs[0].key).not.toBe(downs[1].key);
    expect(result.score).toMatchObject({ earnedScore: 6, judgmentCounts: { perfect: 2, goodTrill: 0 } });
  });

  it('첫 준비1000ms에서 pause→resume→재pause해도 목표0을 보존하고 매번 새 실제3초를 기다린다', async () => {
    const run = create(); await run.player.start(); wallFrame(1000); run.player.togglePause();
    wallFrame(5000); run.player.togglePause(); wallFrame(6000); run.player.togglePause();
    wallFrame(9000); run.player.togglePause(); wallFrame(11999);
    expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    wallFrame(12000); expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(fixture.audio[0].playWithPreroll.mock.calls.map(call => call[0])).toEqual([-3000, -3000, -3000]);
    expect(frames.size).toBe(1); expect(run.target.listeners.size).toBe(4);
    run.player.dispose(); expect(frames.size).toBe(0); expect(run.target.listeners.size).toBe(0);
  });

  it('5000→2000 음악 준비1000ms에서 다시 pause하면2000 목표를 보존하고 세션은 한 번만 복원한다', async () => {
    const reconstruct = vi.spyOn(ExplicitJudgmentSession.prototype, 'reconstructAt');
    const run = create(true, undefined, {}, 0, 8); await run.player.start(); frame(1000); frame(2000); frame(5000);
    run.player.togglePause(); run.player.togglePause();
    wallFrame(fixture.now + 1000); run.player.togglePause();
    wallFrame(fixture.now + 5000); run.player.togglePause();
    const started = fixture.now;
    expect(reconstruct).toHaveBeenCalledExactlyOnceWith(2000);
    expect(fixture.audio[0].playWithPreroll.mock.calls.map(call => call[0])).toEqual([-3000, -1000, -1000]);
    wallFrame(started + 2999); expect(run.onPhase).toHaveBeenLastCalledWith('music-preparation');
    wallFrame(started + 3000); expect(run.onPhase).toHaveBeenLastCalledWith('playing');
    expect(run.target.listeners.size).toBe(4); expect(frames.size).toBe(1);
    run.player.dispose(); expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('첫 준비 종료가50ms 늦게 반영한 hold는3000→0 되감기의0ms 상태로 새어 들어가지 않는다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(12) }];
    const resume = vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt');
    const run = create(false, chart, {}, 0, 8); await run.player.start();
    wallFrame(2999); key(run.target, 'keydown', 'KeyQ'); wallFrame(3050);
    expect(resume).toHaveBeenLastCalledWith(0, [{ lane: 1, key: 'KeyQ' }], 50, 0);
    const query = fixture.renderers[0].setExplicitChart.mock.calls[0][2];
    expect(query().bodyUnits[0].state).toBe('active');
    frame(3000); run.player.togglePause();
    expect(query().bodyUnits[0].state).toBe('waiting');
    expect(query().bodyUnits[0].actualStartMs).toBeNull();
    expect(run.onError).not.toHaveBeenCalled();
  });

  it('커서3500에서5000 pause는3500까지만 되감고3000 노트는 포함하지 않아4500 재연주 뒤6점이다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [3000, 3500, 4500].map(ms => ({ type: 'point' as const, kind: 'single' as const, lane: 1, beat: beat(ms, 500) }));
    const run = create(true, chart, {}, 3500, 8); await run.player.start(); frame(3500); frame(5000);
    run.player.togglePause(); run.player.togglePause();
    expect(fixture.audio[0].playWithPreroll).toHaveBeenLastCalledWith(500);
    frame(3500); frame(4500); frame(8200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ totalNotes: 2, processedNotes: 2, earnedScore: 6 });
    expect(run.onResult.mock.calls[0][0].facts.filter(fact => fact.kind === 'settlement').map(fact => fact.atMs)).toEqual([3500, 4500]);
  });

  it('1000 Perfect·3000 Miss 뒤5000→2000으로 되감아3000을 다시 치면3점에서6점으로 바뀌고 분모6은 유지된다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [1000, 3000].map(ms => ({ type: 'point' as const, kind: 'single' as const, lane: 1, beat: beat(ms, 500) }));
    const run = create(false, chart, {}, 0, 8); await run.player.start();
    at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1000);
    at(1050); key(run.target, 'keyup', 'KeyQ'); frame(2000); frame(5000);
    const renderer = fixture.renderers[0];
    expect(renderer.updateAccuracy).toHaveBeenLastCalledWith(50);
    run.player.togglePause(); run.player.togglePause(); frame(2000);
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 1, combo: 1 }, 2000);
    at(3000); key(run.target, 'keydown', 'KeyQ'); frame(3000); frame(8200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 6, finalDenominatorWeight: 6,
      processedNotes: 2, judgmentCounts: { perfect: 2, miss: 0 } });
    expect(renderer.showBombEffect).toHaveBeenCalledTimes(2);
  });

  it.each([[1, -200], [2, -100]])('배속%s·입력%s·L₀20ms의T2000 복원은 뒤늦은raw1850을 버리고 core1800을 유지해2050 실제 down을 받는다', async (rate, offset) => {
    fixture.latency = 20;
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [{ type: 'point', kind: 'single', lane: 1, beat: beat(1850, 500) }];
    const run = create(false, chart, { playSpeed: rate, inputOffsetMs: offset, visualOffsetMs: 90 }, 0, 8);
    await run.player.start(); frame(2000);
    at(2050); key(run.target, 'keydown', 'KeyQ'); frame(2050);
    at(2100); key(run.target, 'keyup', 'KeyQ'); frame(5000);
    run.player.togglePause();
    const query = fixture.renderers[0].setExplicitChart.mock.calls[0][2];
    expect(query().atMs).toBe(1800); expect(query().items[0].state).toBe('pending');
    run.player.togglePause(); frame(2000);
    expect(query().items[0].state).toBe('pending');
    at(2050); key(run.target, 'keydown', 'KeyQ'); frame(2050); frame(8200);
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1, miss: 0 } });
    expect(run.onResult.mock.calls[0][0].facts.filter(fact => fact.kind === 'input' && fact.action === 'down')).toHaveLength(1);
  });

  it('입력+200ms로T2000 전에 친 미래 Point2100은 복원에 남고3000 재연주와 합쳐6점이다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.notes = [2100, 3000].map(ms => ({ type: 'point' as const, kind: 'single' as const, lane: 1, beat: beat(ms, 500) }));
    const run = create(false, chart, { inputOffsetMs: 200 }, 0, 8); await run.player.start();
    at(1900); key(run.target, 'keydown', 'KeyQ'); frame(1900);
    at(1950); key(run.target, 'keyup', 'KeyQ'); frame(2000); frame(5000);
    run.player.togglePause();
    expect(run.onProgress).toHaveBeenLastCalledWith({ settled: 1, combo: 1 }, 2000);
    const query = fixture.renderers[0].setExplicitChart.mock.calls[0][2];
    expect(query().atMs).toBe(2150);
    run.player.togglePause(); frame(2000);
    at(2800); key(run.target, 'keydown', 'KeyQ'); frame(2800); frame(8200);
    expect(run.onError).not.toHaveBeenCalled();
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ earnedScore: 6, processedNotes: 2 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(2);
  });

  it('자동 입력과 같은 시각의 실제 Keyboard down/up은 모두 4항목·12점·Miss0이며 타격과 고도는 항목마다 1회다', async () => {
    const resultRead = vi.spyOn(ExplicitJudgmentSession.prototype, 'result');
    const auto = create(); await auto.player.start();
    for (const time of [0, 1000, 1500, 2000, 3000, 4200]) frame(time);
    const automatic = auto.onResult.mock.calls[0][0];
    expect(resultRead).toHaveBeenCalledOnce();
    expect(automatic.score).toMatchObject({ processedNotes: 4, earnedScore: 12, finalDenominatorWeight: 12 });
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(4);
    expect(fixture.renderers[0].recordFlightJudgment).toHaveBeenCalledTimes(4);
    expect(auto.target.listeners.size).toBe(0);
    expect(frames.size).toBe(0);
    const manual = create(false); await manual.player.start();
    at(1000); key(manual.target, 'keydown', 'KeyQ'); frame(1000);
    frame(1500); at(2000); key(manual.target, 'keyup', 'KeyQ'); frame(2000);
    at(3000); key(manual.target, 'keydown', 'KeyE'); frame(3000);
    at(3050); key(manual.target, 'keyup', 'KeyE'); frame(3050); frame(4200);
    expect(manual.onResult.mock.calls[0][0].score).toEqual(automatic.score);
    expect(manual.onError).not.toHaveBeenCalled();
  });

  it('auto 구간1000～2000ms와 3000ms 수동 Point는 하나의 session으로 4항목을 정산한다', async () => {
    const chart = structuredClone(explicitPlaytestCharts[0].chart);
    chart.events.push({ type: 'auto', beat: { n: 2, d: 1 }, endBeat: { n: 4, d: 1 } });
    const run = create(false, chart); await run.player.start();
    frame(1000); frame(2000); at(3000); key(run.target, 'keydown', 'KeyE'); frame(3000); frame(4200);
    expect(run.onResult.mock.calls[0][0].score).toMatchObject({ processedNotes: 4, earnedScore: 12 });
  });

  it('1500ms Esc는0으로 되감고 준비 hold만으로1000ms Point를 자동 성공시키지 않으며 listener4개를 보존한다', async () => {
    const run = create(false); await run.player.start();
    at(1000); key(run.target, 'keydown', 'KeyQ'); frame(1500);
    key(run.target, 'keydown', 'Escape');
    expect(run.onPhase).toHaveBeenLastCalledWith('paused');
    expect(fixture.renderers[0].renderFrame).toHaveBeenLastCalledWith(0, 0);
    expect(run.target.listeners.size).toBe(4);
    const rendered = fixture.renderers[0].renderFrame.mock.calls.length;
    wallFrame(fixture.now + 500); expect(fixture.renderers[0].renderFrame.mock.calls).toHaveLength(rendered);
    key(run.target, 'keydown', 'Escape'); frame(0); frame(1500);
    at(2000); key(run.target, 'keyup', 'KeyQ'); frame(2000); frame(4200);
    expect(run.onResult.mock.calls[0][0].score.judgmentCounts.perfect).toBe(0);
    expect(run.target.listeners.size).toBe(0);
  });

  it('더블 자동입력의 같은 그룹 대표는 한 번 표시하며 6항목의 고도·타격은 각각 6회다', async () => {
    const run = create(true, explicitPlaytestCharts[1].chart); await run.player.start();
    frame(1000); frame(1500); frame(2000); frame(4200);
    expect(fixture.renderers[0].showJudgmentGroup).toHaveBeenCalledTimes(3);
    expect(fixture.renderers[0].recordFlightJudgment).toHaveBeenCalledTimes(6);
    expect(fixture.renderers[0].showBombEffect).toHaveBeenCalledTimes(6);
    expect(run.onResult.mock.calls[0][0].score.earnedScore).toBe(18);
  });

  it('무점수 바디 자동 유지도 실제 complete로 끝나며 분모0·획득0이고 HUD 비율은 비운다', async () => {
    const run = create(true, explicitPlaytestCharts[2].chart); await run.player.start();
    frame(1000); frame(2000); frame(4200);
    const result = run.onResult.mock.calls[0][0];
    expect(result.score).toMatchObject({ totalNotes: 0, earnedScore: 0, finalDenominatorWeight: 0 });
    expect(result.snapshot.bodyUnits[0].state).toBe('complete');
    expect(fixture.renderers[0].updateAccuracy).toHaveBeenLastCalledWith(null);
    expect(fixture.renderers[0].showBombEffect).not.toHaveBeenCalled();
  });

  it.each([false, true])('일반=%s의 explicit 스킨 읽기 실패는 audio·양쪽 skin을 정리하고 keyboard·RAF를 시작하지 않는다', async normal => {
    fixture.load = async () => { throw new Error('explicit skin'); };
    const run = create(true, undefined, {}, 0, 4, normal ? {} : undefined); await run.player.start();
    expect(run.onError.mock.calls[0][0].message).toBe('explicit skin');
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.skins[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.explicit[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.audio[0].play).not.toHaveBeenCalled();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it.each([['warmup', false], ['audio', false], ['warmup', true], ['audio', true]] as const)('%s 시작 실패·일반=%s는 renderer·textures·input을 정리하고 listener를 남기지 않는다', async (stage, normal) => {
    fixture.preparationError = stage === 'warmup'; fixture.playError = stage === 'audio';
    const run = create(true, undefined, {}, 0, 4, normal ? {} : undefined); await run.player.start();
    expect(run.onError).toHaveBeenCalledOnce();
    expect(fixture.renderers[0].dispose).toHaveBeenCalled();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it.each([false, true])('일반=%s의 스킨 준비 중 취소 후 늦게 resolve되어도 오디오·입력·renderer를 다시 시작하지 않는다', async normal => {
    let resolve!: () => void; let entered!: () => void;
    const loading = new Promise<void>(done => { entered = done; });
    fixture.load = () => { entered(); return new Promise<void>(done => { resolve = done; }); };
    const run = create(true, undefined, {}, 0, 4, normal ? {} : undefined); const start = run.player.start(); await loading;
    run.player.dispose(); resolve(); await start;
    expect(fixture.audio[0].play).not.toHaveBeenCalled();
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.renderers).toHaveLength(0); expect(run.target.listeners.size).toBe(0);
  });

  it('음악 준비1000ms에 취소하면 예약 오디오·RAF·키 listener를 모두 닫고 늦은 frame은 결과를 만들지 않는다', async () => {
    const run = create(); await run.player.start(); wallFrame(1000);
    const queued = [...frames.values()]; run.player.dispose(); run.player.dispose();
    fixture.now = 5000; for (const callback of queued) callback(5000);
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(run.onResult).not.toHaveBeenCalled(); expect(run.onError).not.toHaveBeenCalled();
  });

  it('준비 종료의 session 재개 오류도 오디오·RAF·키 listener를 정리하고 오류를 한 번 보고한다', async () => {
    vi.spyOn(ExplicitJudgmentSession.prototype, 'resumeAt').mockImplementationOnce(() => { throw new Error('resume failure'); });
    const run = create(); await run.player.start(); wallFrame(3000);
    expect(run.onError).toHaveBeenCalledOnce();
    expect(run.onError.mock.calls[0][0].message).toBe('resume failure');
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
  });

  it('레인1에 실제 바인딩1개로 double Auto를 요청하면 준비 음악 전에 오류로 종료한다', async () => {
    const run = create(true, explicitPlaytestCharts[1].chart, { keyBindings: { lane1: ['KeyQ'], lane2: ['KeyE'], lane3: ['KeyP'], lane4: ['BracketLeft'] } });
    await run.player.start();
    expect(run.onError).toHaveBeenCalledOnce();
    expect(fixture.audio[0].playWithPreroll).not.toHaveBeenCalled();
    expect(run.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('play→dispose→새 play는 준비 시작−3000ms·새 session·listener4개만 소유하고 이중 dispose는 안전하다', async () => {
    const first = create(); await first.player.start(); frame(1000); first.player.dispose(); first.player.dispose();
    expect(first.target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    const second = create(); await second.player.start();
    expect(second.target.listeners.size).toBe(4);
    expect(fixture.audio[0].playWithPreroll).toHaveBeenCalledWith(-3000); expect(fixture.audio[1].playWithPreroll).toHaveBeenCalledWith(-3000);
    for (const time of [1000, 2000, 3000, 4200]) frame(time);
    expect(second.onResult.mock.calls[0][0].score.processedNotes).toBe(4);
    expect(first.onResult).not.toHaveBeenCalled();
  });
});
