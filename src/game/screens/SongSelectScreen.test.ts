import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import songSelectSource from './SongSelectScreen.tsx?raw';
import { SongSelectScreen } from './SongSelectScreen';

// 렌더 기반 검사용 대역. 곡 목록·인증·Supabase는 고정 값으로 바꾸고, 설정 모달은 표식 요소로 대신한다.
const storeOverrides = vi.hoisted(() => ({ settingsOpen: false }));

vi.mock('../stores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores')>();
  // zustand는 SSR에서 store의 초기 상태만 읽으므로, settingsOpen을 테스트가 정한 값으로 바꾼 상태를 돌려주는 훅으로 대신한다.
  const state = () => ({ ...actual.useGameStore.getState(), ...storeOverrides });
  const useGameStore = Object.assign(
    (selector?: (current: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
    actual.useGameStore,
  );
  return { ...actual, useGameStore };
});
vi.mock('../../supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/jacket.png' } }) }) } },
  createChartAsset: vi.fn(),
  deleteSongAsset: vi.fn(),
}));
vi.mock('../../shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, isAdmin: true, loading: false, signInWithGoogle: async () => {}, signOut: () => {} }),
}));
vi.mock('../hooks/useSongNavigation', () => {
  const song = {
    id: 'render-song', title: 'Render Song', artist: 'Offline', audio_url: 'songs/render-song/audio.wav', duration: 12,
    preview_url: null, preview_start: null, preview_end: null, jacket_url: null,
    gameplay_start: null, gameplay_end: null, gameplay_fade_in: null, gameplay_fade_out: null,
    charts: [{ id: 'render-chart', song_id: 'render-song', difficulty_label: 'NORMAL', difficulty_level: 3 }],
  };
  return {
    useSongNavigation: () => ({
      songs: [song], loading: false, error: null, focusedSongIndex: 0, focusedChartIndex: 0,
      setFocusedSongIndex: () => {}, setFocusedChartIndex: () => {}, navigateSong: () => {}, fetchSongs: async () => {},
      songListRef: { current: null }, songCardRefs: { current: new Map() }, getSortedCharts: () => song.charts,
    }),
  };
});
vi.mock('./settings/SettingsModal', () => ({
  SettingsModal: () => React.createElement('section', { 'data-test-overlay': 'settings' }),
}));

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** React SSR HTML의 여는 태그를 순서대로 읽어, 자신이나 조상에 inert가 있는지와 바로 뒤의 글자를 함께 돌려준다. */
function openingTags(html: string) {
  const tags: { tag: string; attrs: string; text: string; insideInert: boolean }[] = [];
  const insideInertStack: boolean[] = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [whole, closing, tag, attrs] = match;
    if (closing) {
      insideInertStack.pop();
      continue;
    }
    const insideInert = (insideInertStack.at(-1) ?? false) || /\sinert=""/.test(attrs);
    const text = html.slice(match.index + whole.length).split('<')[0];
    tags.push({ tag, attrs, text, insideInert });
    if (!attrs.endsWith('/') && !VOID_ELEMENTS.has(tag)) insideInertStack.push(insideInert);
  }
  return tags;
}

function renderSongSelect(props: { mobileListOnly?: boolean }, settingsOpen: boolean) {
  storeOverrides.settingsOpen = settingsOpen;
  return openingTags(renderToStaticMarkup(React.createElement(SongSelectScreen, props)));
}

describe('SongSelectScreen tutorial help', () => {
  it('? 버튼 클릭 시 튜토리얼 도움말 팝업을 열도록 상태를 연결', () => {
    expect(songSelectSource).toContain('TutorialHelpModal');
    expect(songSelectSource).toContain('showTutorialHelp');
    expect(songSelectSource).toContain('setShowTutorialHelp(true)');
    expect(songSelectSource).toContain('setShowTutorialHelp(false)');
  });

  it('? 버튼은 보조 액션으로 접근 가능한 dialog 트리거 라벨을 가짐', () => {
    expect(songSelectSource).toContain('aria-label="Open tutorial help"');
    expect(songSelectSource).toContain('aria-haspopup="dialog"');
    expect(songSelectSource).toContain('aria-expanded={showTutorialHelp}');
  });

  it('설정/추가/삭제 모달·튜토리얼 팝업이 열려 있으면 곡 선택 키 네비를 뒤에서 처리하지 않도록 배선', () => {
    // 설정을 모달로 띄우면 곡 선택이 언마운트되지 않으므로, 뒤의 키 네비를 명시적으로 차단해야 한다.
    expect(songSelectSource).toContain('const blockingModalOpen = showAddSong || showTutorialHelp || settingsOpen || deleteSongTarget !== null;');
    expect(songSelectSource).toContain('    blockingModalOpen,\n    newChartTarget,\n');
  });

  it('새 차트 모달(newChartTarget)이 열려 있어도 곡 선택 화면을 inert로 만듦 — PC·모바일의 헤더·곡 목록 4곳에 같은 값', () => {
    // newChartTarget은 내부 상태라 렌더 기반 검사에서 열 수 없어 소스로 확인한다.
    expect(songSelectSource).toContain('const songSelectInert = blockingModalOpen || newChartTarget !== null;');
    expect(songSelectSource.split('inert={songSelectInert}').length - 1).toBe(4);
  });
});

describe('SongSelectScreen 렌더링: 모달이 열린 동안의 inert', () => {
  it('모달이 없으면 PC 화면에 inert 요소 0개', () => {
    const tags = renderSongSelect({}, false);
    expect(tags.filter((element) => /\sinert=""/.test(element.attrs))).toHaveLength(0);
  });

  it('설정 모달이 열리면 PC 화면은 헤더·곡 목록 2곳이 inert이고 버튼 10개가 모두 그 아래, 설정 모달은 inert 밖', () => {
    const tags = renderSongSelect({}, true);
    const buttons = tags.filter((element) => element.tag === 'button');
    expect(tags.filter((element) => /\sinert=""/.test(element.attrs))).toHaveLength(2);
    expect(buttons.map((button) => button.text)).toEqual(['?', '+ Add Song', 'Refresh', 'Settings', 'Login', 'Back', 'Play', 'Edit', '+ Chart', 'Delete']);
    expect(buttons.filter((button) => !button.insideInert).map((button) => button.text)).toEqual([]);
    expect(tags.find((element) => element.attrs.includes('data-test-overlay="settings"'))?.insideInert).toBe(false);
  });

  it('설정 모달이 열리면 모바일 곡 목록 화면도 헤더·곡 목록 2곳이 inert이고 모든 버튼이 그 아래, 설정 모달은 inert 밖', () => {
    const tags = renderSongSelect({ mobileListOnly: true }, true);
    const buttons = tags.filter((element) => element.tag === 'button');
    expect(tags.filter((element) => /\sinert=""/.test(element.attrs))).toHaveLength(2);
    expect(buttons.map((button) => button.text)).toContain('+ Song');
    expect(buttons.filter((button) => !button.insideInert).map((button) => button.text)).toEqual([]);
    expect(tags.find((element) => element.attrs.includes('data-test-overlay="settings"'))?.insideInert).toBe(false);
  });
});
