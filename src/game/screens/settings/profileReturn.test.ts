import { afterEach, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { signInFromProfile } from './profileAuth';
import { createProfileReturnRestorer } from './profileReturn';
import appSource from '../../App.tsx?raw';

function mockBrowser(href = 'https://example.test/game') {
  let marker: string | null = null;
  const history = { state: { router: 1 }, replaceState: vi.fn() };
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: () => marker,
      setItem: (_key: string, value: string) => { marker = value; },
      removeItem: () => { marker = null; },
    },
    location: { href },
    history,
  });
  return history;
}

afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

it('첫 실행이 아닌 앱 시작에 복귀 의도가 있으면 songSelect·Settings·Profile을 열고 재실행해도 다시 열지 않는다', async () => {
  mockBrowser();
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  const restore = createProfileReturnRestorer();
  restore(false);
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: null,
  });
  useGameStore.getState().setSettingsOpen(false);
  restore(false);
  createProfileReturnRestorer()(false);
  expect(useGameStore.getState().settingsOpen).toBe(false);
});

it('앱 시작에 server_error가 있으면 Profile에 Provider unavailable을 남기고 history에서 오류만 제거한다', async () => {
  const history = mockBrowser('https://example.test/game?keep=1&error=server_error#error_description=Provider+unavailable');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  createProfileReturnRestorer()(false);
  expect(useGameStore.getState().profileAuthError).toBe('Provider unavailable');
  expect(history.replaceState).toHaveBeenCalledWith({ router: 1 }, '', 'https://example.test/game?keep=1');
});

it('첫 실행인 데스크톱 복귀는 presetSetup을 거친 뒤 첫 설정 완료 시 Profile을 연다', async () => {
  mockBrowser();
  await signInFromProfile(async () => {});
  const restore = createProfileReturnRestorer();
  restore(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'presetSetup', settingsOpen: false });
  expect(useGameStore.getState().settings.isFirstLaunch).toBe(true);
  useGameStore.getState().completeFirstLaunch();
  useGameStore.getState().setScreen('songSelect');
  restore(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile' });
});

it('mobileListOnly 복귀는 첫 실행이어도 presetSetup 없이 Profile을 열고 isFirstLaunch=true를 유지한다', async () => {
  mockBrowser('https://example.test/game#error=access_denied');
  await signInFromProfile(async () => {});
  createProfileReturnRestorer()(true);
  expect(useGameStore.getState()).toMatchObject({
    screen: 'songSelect', settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: null,
    settings: { isFirstLaunch: true },
  });
});

it('복귀 의도가 없는 일반 시작은 title을 유지하고 OAuth 오류 URL에도 관여하지 않는다', () => {
  const history = mockBrowser('https://example.test/game?error=server_error');
  createProfileReturnRestorer()(false);
  expect(useGameStore.getState()).toMatchObject({ screen: 'title', settingsOpen: false });
  expect(history.replaceState).not.toHaveBeenCalled();
});

it('GameApp은 모바일 분기 전에 복귀 effect를 연결하고 첫 실행 완료·모바일 변경에 반응한다', () => {
  expect(appSource).toContain('useState(createProfileReturnRestorer)');
  expect(appSource).toMatch(/useEffect\(\(\) => \{\s*restoreProfileReturn\(mobileListOnly\);\s*\}, \[restoreProfileReturn, mobileListOnly, isFirstLaunch\]\)/);
  expect(appSource.indexOf('restoreProfileReturn(mobileListOnly)')).toBeLessThan(appSource.indexOf("if (screen !== 'explicitPlay'"));
});

it.each(['close', 'title'] as const)('Profile 복귀 후 %s로 나가 설정을 다시 열면 Controls이고 이전 오류는 없다', async (exit) => {
  mockBrowser('https://example.test/game?error=server_error');
  useGameStore.getState().completeFirstLaunch();
  await signInFromProfile(async () => {});
  createProfileReturnRestorer()(false);
  if (exit === 'close') useGameStore.getState().setSettingsOpen(false);
  else useGameStore.getState().setScreen('title');
  expect(useGameStore.getState()).toMatchObject({ settingsInitialSection: 'controls', profileAuthError: null });
  useGameStore.getState().setSettingsOpen(true);
  expect(useGameStore.getState()).toMatchObject({ settingsOpen: true, settingsInitialSection: 'controls', profileAuthError: null });
});
