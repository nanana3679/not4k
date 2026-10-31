import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';

// 첫 기동 튜토리얼 모달(RFD 0055): 곡 선택이 store 신호로 도움말 모달을 연 채 시작하고, 마운트 effect에서 신호를 지운다.
// renderToStaticMarkup은 effect를 실행하지 않으므로 useEffect만 가로채 모아 두고 테스트가 직접 실행한다.
// 정적 렌더라 effect 뒤 재렌더(신호를 지운 뒤에도 모달이 남는지)는 여기서 볼 수 없고 e2e/game/navigation.spec.ts가 확인한다.
const fixture = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, songsLoading: false }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
}));
// zustand 훅은 서버 렌더에서 초기 상태를 읽으므로 테스트가 바꾼 현재 상태를 그대로 넘긴다.
vi.mock('../stores', () => ({
  useGameStore: (select?: (state: ReturnType<typeof useGameStore.getState>) => unknown) =>
    select ? select(useGameStore.getState()) : useGameStore.getState(),
}));
vi.mock('../../supabase', () => ({
  createChartAsset: vi.fn(), deleteSongAsset: vi.fn(),
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));
vi.mock('../../shared/hooks/useAuth', () => ({ useAuth: () => ({
  user: null, isAdmin: false, loading: false, signInWithGoogle: async () => {}, signOut: () => {},
}) }));
vi.mock('../hooks/useSongNavigation', () => ({ useSongNavigation: () => ({
  songs: [], loading: fixture.songsLoading, error: null, focusedSongIndex: 0, focusedChartIndex: 0,
  setFocusedSongIndex: () => {}, setFocusedChartIndex: () => {}, fetchSongs: () => {},
  songListRef: { current: null }, songCardRefs: { current: new Map() }, getSortedCharts: () => [],
}) }));
vi.mock('../hooks/usePreviewAudio', () => ({ usePreviewAudio: () => ({ stopPreview: () => {}, playPreviewAt: () => {} }) }));
vi.mock('./songSelect/TutorialHelpModal', () => ({ TutorialHelpModal: () => '[tutorial-help-modal]' }));
vi.mock('./settings/SettingsModal', () => ({ SettingsModal: () => '[settings-modal]' }));
const { SongSelectScreen } = await import('./SongSelectScreen');

function mount() {
  const html = renderToStaticMarkup(createElement(SongSelectScreen));
  for (const effect of fixture.effects.splice(0)) effect();
  return html;
}

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  fixture.effects = [];
  fixture.songsLoading = false;
});
afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

describe('SongSelectScreen 첫 기동 튜토리얼 모달', () => {
  it('프리셋 설정을 마친(completeFirstLaunch) 직후 곡 선택을 처음 그리면 튜토리얼 도움말 모달을 연 채 그리고 ? 버튼은 aria-expanded=true다', () => {
    useGameStore.getState().completeFirstLaunch();
    const html = mount();
    expect(html).toContain('[tutorial-help-modal]');
    expect(html).toMatch(/aria-label="Open tutorial help"[^>]*aria-expanded="true"/);
  });

  it('첫 기동 튜토리얼 모달을 연 곡 선택은 마운트하면서 shouldOpenFirstLaunchTutorialModal을 false로 지운다', () => {
    useGameStore.getState().completeFirstLaunch();
    mount();
    expect(useGameStore.getState().shouldOpenFirstLaunchTutorialModal).toBe(false);
  });

  it('첫 기동 튜토리얼 모달을 한 번 연 뒤 곡 선택을 다시 그리면 모달 없이 그리고 ? 버튼은 aria-expanded=false다', () => {
    useGameStore.getState().completeFirstLaunch();
    mount();
    const html = mount();
    expect(html).not.toContain('[tutorial-help-modal]');
    expect(html).toMatch(/aria-label="Open tutorial help"[^>]*aria-expanded="false"/);
  });

  it('프리셋 설정 직후 곡 목록을 아직 불러오는 중(Loading songs...)이어도 튜토리얼 도움말 모달을 함께 그린다', () => {
    fixture.songsLoading = true;
    useGameStore.getState().completeFirstLaunch();
    const html = mount();
    expect(html).toContain('Loading songs...');
    expect(html).toContain('[tutorial-help-modal]');
  });

  it('첫 기동을 이미 마친 상태(isFirstLaunch=false, shouldOpenFirstLaunchTutorialModal=false)에서 곡 선택을 그리면 모달 없이 그리고 store 상태를 바꾸지 않는다', () => {
    useGameStore.getState().updateSettings({ isFirstLaunch: false });
    const before = useGameStore.getState();
    const html = mount();
    expect(html).not.toContain('[tutorial-help-modal]');
    expect(useGameStore.getState()).toBe(before);
  });
});
