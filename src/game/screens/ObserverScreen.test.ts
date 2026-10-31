import { isValidElement } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { InputSystem } from '../input/InputSystem';
import { useGameStore } from '../stores/gameStore';
import { prepareNormalPlay } from '../stores/explicitPlayRequest';
import type { ObserverPlayRuntimeOptions } from './ObserverPlayRuntime';

const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(), players: [] as FakeRuntime[] }));
class FakeRuntime {
  start = vi.fn(async () => { this.options.onPhase('loading'); });
  dispose = vi.fn(); togglePause = vi.fn(); retry = vi.fn(); setAuto = vi.fn();
  constructor(readonly options: ObserverPlayRuntimeOptions) { harness.players.push(this); }
}

// ExplicitPlayScreen과 같은 React ref/effect harness. GPU·오디오 대신 화면 콜백 수명을 검사한다.
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const slot = harness.cursor++;
    return harness.slots[slot] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = initial;
    return [harness.slots[slot], (value: unknown) => {
      harness.slots[slot] = typeof value === 'function' ? value(harness.slots[slot]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const slot = harness.cursor++;
    const previous = harness.slots[slot] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      harness.effects.push(() => {
        harness.cleanups.get(slot)?.(); harness.cleanups.delete(slot);
        const cleanup = effect(); if (cleanup) harness.cleanups.set(slot, cleanup);
      });
      harness.slots[slot] = deps;
    }
  },
}));
vi.mock('../stores', () => ({ useGameStore: Object.assign(
  (select: (state: ReturnType<typeof useGameStore.getState>) => unknown) => select(useGameStore.getState()),
  { getState: useGameStore.getState },
) }));
vi.mock('./ObserverPlayRuntime', () => ({ ObserverPlayRuntime: class extends FakeRuntime {} }));
const { ObserverScreen } = await import('./ObserverScreen');

interface ElementProps extends ButtonHTMLAttributes<HTMLButtonElement> { ref?: { current: unknown } }
function visit(node: ReactNode, action: (type: unknown, props: ElementProps) => void): void {
  if (Array.isArray(node)) { node.forEach(child => visit(child, action)); return; }
  if (!isValidElement<ElementProps>(node)) return;
  action(node.type, node.props); visit(node.props.children, action);
}
function render() {
  harness.cursor = 0;
  const tree = ObserverScreen();
  const html = renderToStaticMarkup(tree);
  const buttons = new Map<string, ElementProps>();
  visit(tree, (type, props) => {
    if (props.ref) props.ref.current = { clientWidth: 1200, clientHeight: 650 };
    if (type === 'button') buttons.set(props['aria-label'] ?? String(props.children), props);
  });
  for (const commit of harness.effects.splice(0)) commit();
  const button = (name: string) => {
    expect(buttons.has(name), `button ${name}`).toBe(true);
    return buttons.get(name)!;
  };
  return { html, button, click(name: string) {
    const props = button(name);
    expect(props.disabled).not.toBe(true);
    props.onClick!({} as Parameters<NonNullable<typeof props.onClick>>[0]);
  } };
}
function openObserver() {
  const state = useGameStore.getState();
  const request = prepareNormalPlay({ document: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 4 } as AudioBuffer });
  state.completePlayLoad(state.beginPlayLoad('observer'), request);
}
function playing() {
  render();
  const player = harness.players[0];
  player.options.onPhase('playing');
  return player;
}
function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
  return Object.assign(new Event(type, { cancelable: true }), { code, repeat });
}
function unmount() {
  for (const cleanup of harness.cleanups.values()) cleanup();
  harness.cleanups.clear();
}
beforeEach(() => {
  harness.cursor = 0; harness.slots = []; harness.effects = []; harness.players = []; harness.cleanups.clear();
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.stubGlobal('window', new EventTarget());
  useGameStore.getState().selectSong('song-1', 'HARD', 'selected.mp3');
  openObserver();
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); useGameStore.setState(useGameStore.getInitialState(), true); });

describe('ObserverScreen 조작과 수명', () => {
  it('진입 시 Auto On·aria-pressed=true와 버튼 4개를 canvas 바깥에 표시하고 runtime을 1회 시작한다', () => {
    const page = render();
    expect(page.html).toContain('Auto <span aria-hidden="true">On</span>');
    expect(page.button('Auto')['aria-pressed']).toBe(true);
    for (const name of ['Auto', 'Pause', 'Retry', 'Exit']) expect(page.button(name).type).toBe('button');
    expect(page.html.indexOf('</header>')).toBeLessThan(page.html.indexOf('<canvas'));
    expect(harness.players).toHaveLength(1);
    expect(harness.players[0].start).toHaveBeenCalledOnce();
    expect(harness.players[0].options).toMatchObject({ width: 1200, height: 650, inputTarget: window });
  });

  it('loading 중 Esc 1회와 반복 입력은 pause를 호출하지 않고 Auto·Pause·Retry를 비활성화한다', () => {
    render();
    const page = render();
    window.dispatchEvent(key('keydown', 'Escape'));
    window.dispatchEvent(key('keydown', 'Escape', true));
    expect(harness.players[0].togglePause).not.toHaveBeenCalled();
    for (const name of ['Auto', 'Pause', 'Retry']) expect(page.button(name).disabled).toBe(true);
    expect(page.button('Exit').disabled).not.toBe(true);
    expect(page.html).toContain('Preparing audio and graphics');
  });

  it('playing에서 Auto를 끄면 setAuto(false)를 호출하고 onState의 Off·1:05를 표시한다', () => {
    const player = playing();
    render().click('Auto');
    expect(player.setAuto).toHaveBeenCalledExactlyOnceWith(false);
    player.options.onState!({ autoEnabled: false, manualStats: { combo: 2, achievementRate: 50 }, songTimeMs: 65000 });
    const page = render();
    expect(page.button('Auto')['aria-pressed']).toBe(false);
    expect(page.html).toContain('Off');
    expect(page.html).toContain('1:05');
    page.click('Auto');
    expect(player.setAuto).toHaveBeenLastCalledWith(true);
    expect(harness.players).toHaveLength(1);
  });

  it('Pause 뒤 paused 콜백은 Play로 바뀌고 같은 runtime의 togglePause로 재개한다', () => {
    const player = playing();
    render().click('Pause');
    expect(player.togglePause).toHaveBeenCalledOnce();
    player.options.onPhase('paused');
    const page = render();
    expect(page.html).toContain('Paused · Esc to play');
    expect(page.html).toContain('observer-canvas');
    page.click('Play');
    expect(player.togglePause).toHaveBeenCalledTimes(2);
    player.options.onPhase('playing');
    expect(render().button('Pause').disabled).toBe(false);
    expect(harness.players).toHaveLength(1);
  });

  it('playing·paused에서 Esc는 각각 1회 토글하고 repeat Esc와 KeyR은 무시한다', () => {
    const player = playing();
    window.dispatchEvent(key('keydown', 'Escape'));
    player.options.onPhase('paused');
    window.dispatchEvent(key('keydown', 'Escape'));
    window.dispatchEvent(key('keydown', 'Escape', true));
    window.dispatchEvent(key('keydown', 'KeyR'));
    expect(player.togglePause).toHaveBeenCalledTimes(2);
    expect(player.retry).not.toHaveBeenCalled();
  });

  it('paused에서 Retry를 누르면 runtime.retry를 1회 호출하고 새 runtime을 만들지 않는다', () => {
    const player = playing();
    player.options.onPhase('paused');
    render().click('Retry');
    expect(player.retry).toHaveBeenCalledOnce();
    expect(player.dispose).not.toHaveBeenCalled();
    player.options.onPhase('playing');
    expect(render().button('Pause').disabled).toBe(false);
    expect(harness.players).toHaveLength(1);
  });

  it('song-1·HARD에서 Exit를 누르면 dispose 1회 뒤 같은 선택으로 돌아가고 lastResult는 null이다', () => {
    const player = playing();
    player.dispose.mockImplementation(() => expect(useGameStore.getState().screen).toBe('observer'));
    render().click('Exit');
    unmount();
    expect(player.dispose).toHaveBeenCalledOnce();
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', observerPlay: null, normalPlay: null,
      lastResult: null, selectedSongId: 'song-1', selectedDifficulty: 'HARD', selectedAudioUrl: 'selected.mp3' });
  });

  it('loading에서 Exit 뒤 늦은 playing·onState·onError는 요청과 결과를 되살리지 않는다', () => {
    render();
    const player = harness.players[0];
    render().click('Exit');
    player.options.onPhase('playing');
    player.options.onState!({ autoEnabled: false, manualStats: null, songTimeMs: 1000 });
    player.options.onError(new Error('late failure'));
    const page = render();
    expect(page.html).not.toContain('late failure');
    expect(page.button('Auto')['aria-pressed']).toBe(true);
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', observerPlay: null, lastResult: null });
    expect(player.dispose).toHaveBeenCalledOnce();
  });

  it('runtime 오류 skin failed는 안내·Exit를 표시하고 Esc와 재생 조작을 막는다', () => {
    const player = playing();
    player.options.onPhase('error');
    player.options.onError(new Error('skin failed'));
    const page = render();
    expect(page.html).toContain('role="alert"');
    expect(page.html).toContain('skin failed');
    for (const name of ['Auto', 'Pause', 'Retry']) expect(page.button(name).disabled).toBe(true);
    window.dispatchEvent(key('keydown', 'Escape'));
    expect(player.togglePause).not.toHaveBeenCalled();
    page.click('Exit');
    expect(useGameStore.getState().screen).toBe('songSelect');
  });

  it('요청이 없으면 runtime 0개와 No song loaded 안내를 표시하고 Exit로 곡 선택에 복귀한다', () => {
    useGameStore.setState({ observerPlay: null });
    const page = render();
    expect(harness.players).toHaveLength(0);
    expect(page.html).toContain('No song loaded.');
    page.click('Exit');
    expect(useGameStore.getState().screen).toBe('songSelect');
  });

  it('unmount 뒤 Esc와 늦은 콜백은 무시하고 runtime을 1회 dispose한다', () => {
    const player = playing();
    unmount();
    window.dispatchEvent(key('keydown', 'Escape'));
    player.options.onPhase('paused');
    expect(player.togglePause).not.toHaveBeenCalled();
    expect(player.dispose).toHaveBeenCalledOnce();
  });

  it('요청 2로 교체하면 runtime 1을 정리하고 이전 오류·Auto 콜백을 무시한다', () => {
    const first = playing();
    openObserver();
    render();
    first.options.onError(new Error('old request'));
    first.options.onState!({ autoEnabled: false, manualStats: null, songTimeMs: 1000 });
    const page = render();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(harness.players).toHaveLength(2);
    expect(page.html).not.toContain('old request');
    expect(page.button('Auto')['aria-pressed']).toBe(true);
  });
});

describe('Observer 툴바 레인 키와 포커스', () => {
  it('Space·Enter를 lane1에 바인딩하면 포커스 버튼 4개의 기본 활성화를 막고 down/up은 레인에 전달한다', () => {
    useGameStore.getState().updateKeyBindings({ lane1: ['Space', 'Enter'] });
    const player = playing();
    const page = render();
    const onLanePress = vi.fn(); const onLaneRelease = vi.fn();
    const input = new InputSystem([{ lane: 1, key: 'Space' }, { lane: 1, key: 'Enter' }], { onLanePress, onLaneRelease });
    input.attach(window);
    try {
      for (const name of ['Auto', 'Pause', 'Retry', 'Exit']) {
        const button = page.button(name);
        for (const code of ['Space', 'Enter']) {
          for (const type of ['keydown', 'keyup'] as const) {
            const event = key(type, code);
            const stopPropagation = vi.spyOn(event, 'stopPropagation');
            const handler = type === 'keydown' ? button.onKeyDown : button.onKeyUp;
            handler!(event as unknown as ReactKeyboardEvent<HTMLButtonElement>);
            // 브라우저의 버튼 활성화보다 먼저 기본 동작을 취소해야 한다.
            expect(event.defaultPrevented).toBe(true);
            expect(stopPropagation).not.toHaveBeenCalled();
            window.dispatchEvent(event);
          }
        }
      }
      expect(onLanePress).toHaveBeenCalledTimes(8);
      expect(onLaneRelease).toHaveBeenCalledTimes(8);
      expect(player.setAuto).not.toHaveBeenCalled();
      expect(player.togglePause).not.toHaveBeenCalled();
      expect(player.retry).not.toHaveBeenCalled();
      expect(player.dispose).not.toHaveBeenCalled();
      expect(useGameStore.getState().screen).toBe('observer');
    } finally { input.detach(); }
  });

  it('기본 TKL의 KeyR은 Retry 버튼에서 기본 동작만 막고 미바인딩 Enter·Space·Tab은 유지한다', () => {
    const player = playing();
    const button = render().button('Retry');
    expect(useGameStore.getState().settings.keyBindings.lane3).toContain('KeyR');
    for (const code of ['KeyR', 'Enter', 'Space', 'Tab']) {
      const event = key('keydown', code);
      button.onKeyDown!(event as unknown as ReactKeyboardEvent<HTMLButtonElement>);
      expect(event.defaultPrevented).toBe(code === 'KeyR');
      window.dispatchEvent(event);
    }
    expect(button.tabIndex).not.toBe(-1);
    expect(player.retry).not.toHaveBeenCalled();
  });
});
