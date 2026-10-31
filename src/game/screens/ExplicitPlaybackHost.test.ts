import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackRange } from '../../shared';
import type { GameRenderer } from '../renderer/GameRenderer';
import { useGameStore } from '../stores/gameStore';

const fixture = vi.hoisted(() => ({
  calls: [] as string[], audio: [] as FakeAudio[], renderers: [] as FakeRenderer[],
  skins: [] as FakeSkin[], explicit: [] as FakeExplicitSkin[], latency: 0,
  prepareAudio: async () => {}, loadSkin: async () => {}, loadExplicit: async () => {}, initRenderer: async () => {},
}));
class FakeAudio {
  masterVolume = 1; playbackRate = 1; currentTimeMs = 1000;
  loadBuffer = vi.fn<(buffer: AudioBuffer) => void>(() => { fixture.calls.push('audio.loadBuffer'); });
  setPlaybackRange = vi.fn<(range: PlaybackRange | null) => void>(() => { fixture.calls.push('audio.setPlaybackRange'); });
  prepareForPlayback = vi.fn(() => { fixture.calls.push('audio.prepare'); return fixture.prepareAudio(); });
  getOutputLatencyMs = vi.fn(() => { fixture.calls.push('audio.latency'); return fixture.latency; });
  dispose = vi.fn(async () => { fixture.calls.push('audio.dispose'); });
  constructor() { fixture.audio.push(this); }
}
class FakeSkin {
  loadSkin = vi.fn(() => { fixture.calls.push('skin.load'); return fixture.loadSkin(); });
  dispose = vi.fn(() => { fixture.calls.push('skin.dispose'); });
  constructor() { fixture.skins.push(this); }
}
class FakeExplicitSkin {
  load = vi.fn(() => { fixture.calls.push('explicit.load'); return fixture.loadExplicit(); });
  dispose = vi.fn(() => { fixture.calls.push('explicit.dispose'); });
  constructor() { fixture.explicit.push(this); }
}
class FakeRenderer {
  init = vi.fn(() => { fixture.calls.push('renderer.init'); return fixture.initRenderer(); });
  prepareForPlayback = vi.fn<(time: number) => void>(() => { fixture.calls.push('renderer.prepare'); });
  dispose = vi.fn<(removeView: boolean) => void>(() => { fixture.calls.push('renderer.dispose'); });
  constructor(readonly options: ConstructorParameters<typeof GameRenderer>[0]) { fixture.renderers.push(this); }
}
vi.mock('../audio', () => ({ AudioEngine: class extends FakeAudio {} }));
vi.mock('../skin', () => ({ SkinManager: class extends FakeSkin {} }));
vi.mock('../skin/ExplicitSkinLoader', () => ({ ExplicitSkinLoader: class extends FakeExplicitSkin {} }));
vi.mock('../renderer/GameRenderer', () => ({ GameRenderer: class extends FakeRenderer {} }));
vi.mock('./gearMotionKeepAlive', () => ({ keepGearMotionAssets: () => null }));
const { ExplicitPlaybackHost } = await import('./ExplicitPlaybackHost');

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class Target extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.add(listener);
    fixture.calls.push(`input.attach:${type}`);
    super.addEventListener(type, listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (listener) this.listeners.delete(listener);
    fixture.calls.push(`input.detach:${type}`);
    super.removeEventListener(type, listener);
  }
}
const frames = new Map<number, FrameRequestCallback>();
const hosts: InstanceType<typeof ExplicitPlaybackHost>[] = [];
let frameId = 0;
beforeEach(() => {
  fixture.calls = []; fixture.audio = []; fixture.renderers = []; fixture.skins = []; fixture.explicit = [];
  fixture.latency = 0;
  fixture.prepareAudio = async () => {}; fixture.loadSkin = async () => {};
  fixture.loadExplicit = async () => {}; fixture.initRenderer = async () => {};
  frames.clear(); frameId = 0;
  vi.spyOn(performance, 'now').mockReturnValue(100);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++frameId, callback); return frameId;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { fixture.calls.push('frame.cancel'); frames.delete(id); }));
});
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function create() {
  const target = new Target();
  const settings = { ...useGameStore.getInitialState().settings, gearMotion: false, masterVolume: 0.4,
    playSpeed: 2, inputOffsetMs: 10, visualOffsetMs: 30, renderHeight: 1200 };
  const options = { audioBuffer: { duration: 4 } as AudioBuffer,
    playbackRange: { startTime: 1, endTime: 3, fadeInTime: 0, fadeOutTime: 0 },
    difficultyLabel: 'Test', settings, canvas: {} as HTMLCanvasElement, width: 1200, height: 700, inputTarget: target };
  const host = new ExplicitPlaybackHost(options);
  hosts.push(host);
  return { host, target, options };
}

function frame(timestamp: number) {
  const callbacks = [...frames.values()]; frames.clear();
  for (const callback of callbacks) callback(timestamp);
}

function key(target: Target, type: 'keydown' | 'keyup', code: string) {
  const event = new Event(type);
  Object.defineProperties(event, { code: { value: code }, timeStamp: { value: 100 } });
  target.dispatchEvent(event);
}

describe('ExplicitPlaybackHost 자원 수명', () => {
  it('출력 지연 20ms 준비 뒤 2배속 clock은 곡 1000ms를 판정 960ms·시각 1020ms로 읽고 GPU 준비 후 listener 2개를 연결한다', async () => {
    fixture.prepareAudio = async () => { fixture.latency = 20; };
    const { host, target, options } = create();
    const resources = (await host.init())!;
    expect(fixture.calls).toEqual(['audio.loadBuffer', 'audio.setPlaybackRange', 'skin.load', 'explicit.load',
      'audio.prepare', 'audio.latency', 'renderer.init']);
    expect(resources).toMatchObject({ audio: fixture.audio[0], renderer: fixture.renderers[0], explicitSkin: fixture.explicit[0] });
    expect(fixture.audio[0].loadBuffer).toHaveBeenCalledExactlyOnceWith(options.audioBuffer);
    expect(fixture.audio[0].setPlaybackRange).toHaveBeenCalledExactlyOnceWith(options.playbackRange);
    expect(fixture.audio[0]).toMatchObject({ masterVolume: 0.4, playbackRate: 2 });
    expect(fixture.explicit[0].load).toHaveBeenCalledExactlyOnceWith({ resolution: 2 });
    expect(fixture.renderers[0].options).toMatchObject({ canvas: options.canvas, skinManager: fixture.skins[0],
      difficultyLabel: 'Test', height: 600, resolution: 2, gearMotion: false });
    expect(resources.clock.judgmentTimeMs()).toBe(960);
    expect(resources.clock.visualTimeMs()).toBe(1020);
    expect(resources.clock.toInputTimeMs(100)).toBe(980);
    host.createInput([{ lane: 1, key: 'KeyQ' }], resources.clock, {});
    expect(target.listeners.size).toBe(0); expect(frames.size).toBe(0);
    host.prepareForPlayback(1020);
    expect(fixture.renderers[0].prepareForPlayback).toHaveBeenCalledExactlyOnceWith(1020);
    expect(fixture.calls.slice(-3)).toEqual(['renderer.prepare', 'input.attach:keydown', 'input.attach:keyup']);
    expect(target.listeners.size).toBe(2);
  });

  it.each(['resolve', 'reject'] as const)('오디오 준비 대기 중 dispose 뒤 %s되어도 자원을 각 1회 정리하고 renderer·입력·RAF를 시작하지 않는다', async outcome => {
    const pending = deferred(); const entered = deferred();
    fixture.prepareAudio = () => { entered.resolve(); return pending.promise; };
    const { host, target } = create(); const initializing = host.init(); await entered.promise;
    expect(fixture.audio[0].loadBuffer).toHaveBeenCalledOnce();
    host.dispose();
    expect(fixture.calls.slice(-3)).toEqual(['explicit.dispose', 'skin.dispose', 'audio.dispose']);
    if (outcome === 'resolve') pending.resolve(); else pending.reject(new Error('audio after cancel'));
    expect(await initializing).toBeNull();
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.explicit[0].dispose).toHaveBeenCalledOnce(); expect(fixture.skins[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.renderers).toHaveLength(0); expect(target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it.each(['resolve', 'reject'] as const)('renderer.init 대기 중 dispose 2회 뒤 %s되면 renderer·explicit 스킨·기존 스킨을 순서대로 각 1회 정리한다', async outcome => {
    const pending = deferred(); const entered = deferred();
    fixture.initRenderer = () => { entered.resolve(); return pending.promise; };
    const { host, target } = create(); const initializing = host.init(); await entered.promise;
    fixture.calls = [];
    host.dispose(); host.dispose();
    expect(fixture.calls).toEqual(['audio.dispose']);
    if (outcome === 'resolve') pending.resolve(); else pending.reject(new Error('renderer after cancel'));
    expect(await initializing).toBeNull();
    expect(fixture.calls).toEqual(['audio.dispose', 'renderer.dispose', 'explicit.dispose', 'skin.dispose']);
    expect(fixture.renderers[0].dispose).toHaveBeenCalledExactlyOnceWith(false);
    expect(fixture.renderers[0].prepareForPlayback).not.toHaveBeenCalled();
    expect(target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it.each(['loadSkin', 'loadExplicit', 'prepareAudio', 'initRenderer'] as const)('%s 초기화 오류 1회는 생성한 자원을 각 1회 정리하고 원래 오류를 전달한다', async stage => {
    const error = new Error(stage);
    fixture[stage] = async () => { throw error; };
    const { host, target } = create();
    await expect(host.init()).rejects.toBe(error);
    host.dispose();
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
    expect(fixture.explicit[0].dispose).toHaveBeenCalledOnce(); expect(fixture.skins[0].dispose).toHaveBeenCalledOnce();
    if (stage === 'initRenderer') {
      expect(fixture.renderers[0].dispose).toHaveBeenCalledExactlyOnceWith(false);
      expect(fixture.calls.slice(-4)).toEqual(['renderer.dispose', 'explicit.dispose', 'skin.dispose', 'audio.dispose']);
    } else expect(fixture.renderers).toHaveLength(0);
    expect(target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('입력·RAF 연결 뒤 dispose 2회는 RAF→입력→renderer→explicit 스킨→기존 스킨→audio를 각 1회 정리한다', async () => {
    const { host, target } = create(); const resources = (await host.init())!;
    host.createInput([{ lane: 1, key: 'KeyQ' }], resources.clock, {});
    host.prepareForPlayback(0); host.startFrames(vi.fn(), vi.fn());
    fixture.calls = [];
    host.dispose(); host.dispose();
    expect(fixture.calls).toEqual(['frame.cancel', 'input.detach:keydown', 'input.detach:keyup',
      'renderer.dispose', 'explicit.dispose', 'skin.dispose', 'audio.dispose']);
    expect(fixture.renderers[0].dispose).toHaveBeenCalledExactlyOnceWith(false);
    expect(target.listeners.size).toBe(0); expect(frames.size).toBe(0);
  });

  it('RAF 100·116ms 뒤 dispose하면 예약 1개를 취소하고 늦은 132ms 콜백과 재시작은 실행 0회다', async () => {
    const { host } = create(); await host.init();
    const onFrame = vi.fn(); const onError = vi.fn();
    host.startFrames(onFrame, onError);
    frame(100); frame(116);
    expect(onFrame.mock.calls).toEqual([[100], [116]]); expect(frames.size).toBe(1);
    const queued = [...frames.values()]; host.dispose();
    for (const callback of queued) callback(132);
    host.startFrames(onFrame, onError);
    expect(onFrame).toHaveBeenCalledTimes(2); expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1); expect(onError).not.toHaveBeenCalled();
  });

  it('RAF 100ms 콜백 안에서 dispose하면 다음 RAF 예약은 0개다', async () => {
    const { host } = create(); await host.init();
    host.startFrames(() => host.dispose(), vi.fn());
    frame(100);
    expect(frames.size).toBe(0); expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
  });

  it.each(['frame', 'schedule'] as const)('RAF 100ms의 %s 오류 1회는 onError로 전달하고 다음 RAF를 남기지 않는다', async stage => {
    const { host } = create(); await host.init(); const error = new Error(stage);
    const onError = vi.fn(() => host.dispose());
    host.startFrames(() => { if (stage === 'frame') throw error; }, onError);
    if (stage === 'schedule') vi.mocked(requestAnimationFrame).mockImplementationOnce(() => { throw error; });
    frame(100);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error); expect(frames.size).toBe(0);
    expect(fixture.audio[0].dispose).toHaveBeenCalledOnce();
  });

  it('KeyQ down 1개 뒤 dispose하면 listener 2개·hold 1개·입력 큐 1개를 비우고 이후 KeyQ를 받지 않는다', async () => {
    const { host, target } = create(); const resources = (await host.init())!;
    const beforeInput = vi.fn();
    const input = host.createInput([{ lane: 1, key: 'KeyQ' }], resources.clock, { beforeInput });
    host.prepareForPlayback(0);
    key(target, 'keydown', 'KeyQ');
    expect(input.heldKeys).toEqual([{ lane: 1, key: 'KeyQ' }]); expect(input.timeline.size).toBe(1);
    host.dispose(); key(target, 'keyup', 'KeyQ'); key(target, 'keydown', 'KeyQ');
    expect(target.listeners.size).toBe(0); expect(input.heldKeys).toEqual([]); expect(input.timeline.size).toBe(0);
    expect(input.inputSystem.isLaneHeld(1)).toBe(false); expect(beforeInput).toHaveBeenCalledTimes(1);
  });
});
