import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ screen: 'explicitPlay', experience: 'fullGame', editorReturnUrl: null as string | null }));
vi.mock('./stores', () => ({ useGameStore: (select: (state: unknown) => unknown) => select({
  screen: fixture.screen, editorReturnUrl: fixture.editorReturnUrl, settings: { gearMotion: true },
}) }));
vi.mock('./hooks/useGameExperience', () => ({ useGameExperience: () => fixture.experience }));
vi.mock('./screens', () => ({
  TitleScreen: () => 'title', PresetSetupScreen: () => 'setup', LoadingScreen: () => 'legacy-loading',
  PlayScreen: () => 'legacy-play', NormalPlayScreen: () => 'normal-play', ResultScreen: () => 'official-result',
  ExplicitPlayScreen: () => 'explicit-play', SongSelectScreen: () => 'song-list',
}));
const { default: GameApp } = await import('./App');

describe('GameApp 명시 화면 분기', () => {
  it.each(['fullGame', 'mobileSongList'])('%s에서도 의도적으로 요청한 explicitPlay 화면은 별도 실제 재생 컴포넌트로 연다', experience => {
    fixture.screen = 'explicitPlay'; fixture.experience = experience;
    expect(renderToStaticMarkup(createElement(GameApp))).toBe('explicit-play');
  });
  it.each([['loading', 'legacy-loading'], ['play', 'legacy-play'], ['result', 'official-result']])('%s 기본 화면은 %s 경로를 연다', (screen, expected) => {
    fixture.screen = screen; fixture.experience = 'fullGame'; fixture.editorReturnUrl = null;
    expect(renderToStaticMarkup(createElement(GameApp))).toBe(expected);
  });
  it.each(['/editor?draft=1', '/lab/judgment-case'])('play의 복귀 경로가 %s인 기존 테스트는 PlayScreen을 유지한다', editorReturnUrl => {
    fixture.screen = 'play'; fixture.experience = 'fullGame'; fixture.editorReturnUrl = editorReturnUrl;
    expect(renderToStaticMarkup(createElement(GameApp))).toBe('legacy-play');
  });
  it('모바일 일반 play는 normal-play를 열지 않고 곡 목록을 유지한다', () => {
    fixture.screen = 'play'; fixture.experience = 'mobileSongList'; fixture.editorReturnUrl = null;
    expect(renderToStaticMarkup(createElement(GameApp))).toBe('song-list');
  });
});
