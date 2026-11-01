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
  scrollView = vi.fn(); viewPixelsPerMs = .8;
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
  let field!: EventTarget & { clientHeight: number };
  const fieldChildren: unknown[] = [];
  visit(tree, (type, props) => {
    if (props.ref) props.ref.current ??= Object.assign(new EventTarget(), { clientWidth: 1200, clientHeight: 650 });
    if (props.className === 'observer-screen__field') {
      field = props.ref!.current as typeof field;
      visit(props.children, childType => fieldChildren.push(childType));
    }
    if (type === 'button') buttons.set(props['aria-label'] ?? String(props.children), props);
  });
  for (const commit of harness.effects.splice(0)) commit();
  const button = (name: string) => {
    expect(buttons.has(name), `button ${name}`).toBe(true);
    return buttons.get(name)!;
  };
  return { html, button, field, fieldChildren, click(name: string) {
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
function wheel(deltaY: number, deltaMode = 0) {
  return Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY, deltaMode });
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

describe('ObserverScreen 정지 휠', () => {
  it('loading·playing·error에서는 −130px 휠을 무시하고 paused 콜백 직후에는 +150ms 이동과 preventDefault를 실행한다', () => {
    const page = render(); const player = harness.players[0];
    for (const phase of ['loading', 'playing', 'error', 'paused', 'playing'] as const) {
      player.options.onPhase(phase);
      const event = wheel(-130);
      player.scrollView.mockClear(); page.field.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(phase === 'paused');
      if (phase === 'paused') expect(player.scrollView).toHaveBeenCalledExactlyOnceWith(150);
      else expect(player.scrollView).not.toHaveBeenCalled();
    }
  });

  it('높이 650px에서 +130px 휠은 800px/s일 때 −150ms·1200px/s일 때 −100ms이고 높이 1300px에서는 −50ms다', () => {
    const player = playing(); const page = render(); player.options.onPhase('paused');
    page.field.dispatchEvent(wheel(130));
    expect(player.scrollView).toHaveBeenLastCalledWith(-150);
    player.viewPixelsPerMs = 1.2;
    page.field.dispatchEvent(wheel(130));
    expect(player.scrollView).toHaveBeenLastCalledWith(-100);
    page.field.clientHeight = 1300;
    page.field.dispatchEvent(wheel(130));
    expect(player.scrollView).toHaveBeenLastCalledWith(-50);
  });

  it('높이 600px·800px/s에서 −3줄 휠은 +60ms, +1페이지 휠은 −750ms로 환산한다', () => {
    const player = playing(); const page = render(); player.options.onPhase('paused'); page.field.clientHeight = 600;
    page.field.dispatchEvent(wheel(-3, 1));
    expect(player.scrollView).toHaveBeenLastCalledWith(60);
    page.field.dispatchEvent(wheel(1, 2));
    expect(player.scrollView).toHaveBeenLastCalledWith(-750);
  });

  it('휠은 canvas 필드에만 연결하고 미니맵·버튼·window를 제외하며 unmount 뒤 −130px 입력은 무시한다', () => {
    const player = playing(); player.options.onPhase('paused');
    player.options.onState!({ autoEnabled: true, manualStats: null, songTimeMs: 1000,
      range: { startMs: 0, endMs: 4000 }, durationMs: 4000 });
    const page = render();
    expect(page.fieldChildren).toEqual(['canvas']);
    expect(page.html).toContain('</canvas></div><div class="observer-minimap"');
    for (const name of ['Auto', 'Play', 'Retry', 'Exit']) expect(page.button(name).onWheel).toBeUndefined();
    const outside = wheel(-130); window.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false); expect(player.scrollView).not.toHaveBeenCalled();
    page.field.dispatchEvent(wheel(-130)); expect(player.scrollView).toHaveBeenCalledOnce();
    unmount(); player.scrollView.mockClear();
    const detached = wheel(-130); page.field.dispatchEvent(detached);
    expect(detached.defaultPrevented).toBe(false); expect(player.scrollView).not.toHaveBeenCalled();
  });

  it('정지 중 휠로 표시 위치가 1000→3000ms로 바뀌면 미니맵 재생선은 y=444→156으로 이동하고 구간은 0～4000ms다', () => {
    const player = playing(); player.options.onPhase('paused');
    const state = { autoEnabled: true, manualStats: null, songTimeMs: 1000,
      range: { startMs: 0, endMs: 4000 }, durationMs: 4000 };
    player.options.onState!(state);
    const page = render();
    expect(page.html).toContain('data-testid="observer-minimap-playhead" d="M0,444h60"');
    player.scrollView.mockImplementation(deltaMs => player.options.onState!({ ...state, songTimeMs: state.songTimeMs + deltaMs }));
    page.field.dispatchEvent(wheel(-5200 / 3));
    const after = render().html;
    expect(after).toContain('data-range-start-ms="0" data-range-end-ms="4000" data-position-ms="3000"');
    expect(after).toContain('data-testid="observer-minimap-playhead" d="M0,156h60"');
    expect(harness.players).toHaveLength(1);
  });
});

describe('ObserverScreen 조작과 수명', () => {
  it('onState의 1000～3000ms·현재 1000ms를 미니맵에 전달하고 끝 3200ms 갱신에도 runtime은 1개다', () => {
    const player = playing();
    player.options.onState!({ autoEnabled: true, manualStats: null, songTimeMs: 1000,
      range: { startMs: 1000, endMs: 3000 }, durationMs: 4000 });
    expect(render().html).toContain('data-range-start-ms="1000" data-range-end-ms="3000" data-position-ms="1000" data-duration-ms="4000"');
    player.options.onPhase('paused');
    player.options.onState!({ autoEnabled: true, manualStats: null, songTimeMs: 1000,
      range: { startMs: 1000, endMs: 3200 }, durationMs: 4000 });
    const page = render();
    expect(page.html).toContain('data-range-end-ms="3200" data-position-ms="1000"');
    expect(page.button('Play').disabled).toBe(false);
    expect(harness.players).toHaveLength(1);
  });

  it('진입 시 Auto On·aria-pressed=true와 버튼 4개를 canvas 바깥에 표시하고 runtime을 1회 시작한다', () => {
    const page = render();
    expect(page.html).toContain('Auto <span aria-hidden="true">On</span>');
    expect(page.button('Auto')['aria-pressed']).toBe(true);
    for (const name of ['Auto', 'Pause', 'Retry', 'Exit']) expect(page.button(name).type).toBe('button');
    // 조작 버튼은 노트 필드(canvas 부모) 밖의 떠 있는 패널에 있다.
    const controls = page.html.indexOf('class="observer-screen__controls"');
    expect(controls).toBeGreaterThan(-1);
    expect(controls).toBeLessThan(page.html.indexOf('class="observer-screen__field"'));
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
  });

  it('playing에서 Auto를 끄면 setAuto(false)를 호출하고 onState의 Auto Off를 표시한다', () => {
    const player = playing();
    render().click('Auto');
    expect(player.setAuto).toHaveBeenCalledExactlyOnceWith(false);
    player.options.onState!({ autoEnabled: false, manualStats: { combo: 2, achievementRate: 50 }, songTimeMs: 65000, range: null, durationMs: 4000 });
    const page = render();
    expect(page.button('Auto')['aria-pressed']).toBe(false);
    expect(page.html).toContain('Off');
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
    expect(page.button('Play').disabled).not.toBe(true);
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
    player.options.onState!({ autoEnabled: false, manualStats: null, songTimeMs: 1000, range: null, durationMs: 4000 });
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
    first.options.onState!({ autoEnabled: false, manualStats: null, songTimeMs: 1000, range: null, durationMs: 4000 });
    const page = render();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(harness.players).toHaveLength(2);
    expect(page.html).not.toContain('old request');
    expect(page.button('Auto')['aria-pressed']).toBe(true);
  });
});

describe('Observer 툴바 레인 키와 포커스', () => {
  it('진입 때 lane1에 바인딩한 Enter를 설정에서 제거해도 Exit의 down/up 기본 활성화를 막고 레인 입력을 유지한다', () => {
    useGameStore.getState().updateKeyBindings({ lane1: ['Enter'] });
    const player = playing();
    const onLanePress = vi.fn(); const onLaneRelease = vi.fn();
    const input = new InputSystem(player.options.settings.keyBindings.lane1.map(key => ({ lane: 1, key })),
      { onLanePress, onLaneRelease });
    input.attach(window);
    try {
      useGameStore.getState().updateKeyBindings({ lane1: ['KeyQ'] });
      const page = render();
      const button = page.button('Exit');
      for (const type of ['keydown', 'keyup'] as const) {
        const event = key(type, 'Enter');
        const handler = type === 'keydown' ? button.onKeyDown : button.onKeyUp;
        handler!(event as unknown as ReactKeyboardEvent<HTMLButtonElement>);
        // jsdom처럼 기본 버튼 활성화가 없는 환경에서도 브라우저 동작을 재현한다.
        if (type === 'keydown' && !event.defaultPrevented) page.click('Exit');
        expect(event.defaultPrevented).toBe(true);
        window.dispatchEvent(event);
      }
      expect(onLanePress).toHaveBeenCalledExactlyOnceWith(1, expect.any(Number), 'Enter');
      expect(onLaneRelease).toHaveBeenCalledExactlyOnceWith(1, expect.any(Number), 'Enter');
      expect(harness.players).toHaveLength(1);
      expect(player.dispose).not.toHaveBeenCalled();
      expect(useGameStore.getState().screen).toBe('observer');
    } finally { input.detach(); }
  });

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
