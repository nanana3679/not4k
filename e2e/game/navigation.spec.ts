import { test, expect, type Page } from '@playwright/test';

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800,
      liftPercent: 0,
      suddenPercent: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

/** 가짜 Supabase 호스트로 가는 곡 목록 요청이 부하 때문에 오래 걸리지 않게 빈 목록으로 바로 응답한다. */
async function stubEmptySongs(page: Page) {
  await page.route('**/rest/v1/songs**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ json: [] });
  });
}

/** 곡 목록 요청을 붙잡아 두고, 돌려준 함수를 부르면 빈 목록으로 응답한다. */
async function holdSongs(page: Page): Promise<() => void> {
  let releaseSongs!: () => void;
  const songsReleased = new Promise<void>(resolve => { releaseSongs = resolve; });
  await page.route('**/rest/v1/songs**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    await songsReleased;
    await route.fulfill({ json: [] });
  });
  return releaseSongs;
}

async function choosePresetOnFirstLaunch(page: Page, preset: 'TKL (Tenkeyless)' | 'Numpad') {
  await page.goto('/game');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: preset }).click();
}

test.describe('Game Navigation', () => {
  test('title screen shows Start button', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByRole('heading', { name: 'not4k' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('first launch: Start navigates to preset setup', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(
      page.getByRole('heading', { name: 'Choose Your Keyboard Layout' })
    ).toBeVisible();
  });

  for (const preset of ['TKL (Tenkeyless)', 'Numpad'] as const) {
    test(`첫 기동에 ${preset} 프리셋을 고르면 곡 선택 위에 튜토리얼 모달이 열리고 Close로 바로 닫으면 곡 선택을 그대로 쓴다`, async ({ page }) => {
      await stubEmptySongs(page);
      await choosePresetOnFirstLaunch(page, preset);

      // 첫 기동 튜토리얼 모달(RFD 0055): 프리셋 설정 직후 곡 선택 위에 도움말 모달이 열린다.
      await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
      const dialog = page.getByRole('dialog', { name: 'Tutorial' });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open tutorial help' })).toHaveAttribute('aria-expanded', 'true');

      // 처음부터 바로 닫을 수 있고, 닫으면 곡 선택을 그대로 쓴다(Escape가 뒤의 곡 선택 키 처리로 타이틀에 간다).
      await dialog.getByRole('button', { name: 'Close tutorial help' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open tutorial help' })).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    });
  }

  test('첫 기동 튜토리얼 모달은 타이틀을 거쳐 곡 선택에 다시 들어오거나 새로고침하면 다시 열리지 않고 ? 버튼으로만 열린다', async ({ page }) => {
    await stubEmptySongs(page);
    await choosePresetOnFirstLaunch(page, 'TKL (Tenkeyless)');
    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toBeHidden();

    // 같은 세션에서 타이틀로 돌아갔다가 다시 곡 선택에 들어온다.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // 새로고침 뒤에는 첫 기동이 끝난 설정만 남아 프리셋 설정 없이 곡 선택으로 가고, 모달도 열지 않는다.
    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // 수동 재진입은 `?` 버튼으로 한다.
    await page.getByRole('button', { name: 'Open tutorial help' }).click();
    await expect(dialog).toBeVisible();
  });

  test('첫 기동 튜토리얼 모달이 열린 채 새로고침하면 프리셋 설정 없이 들어간 곡 선택에서 모달이 다시 열리지 않는다', async ({ page }) => {
    await stubEmptySongs(page);
    await choosePresetOnFirstLaunch(page, 'Numpad');
    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('프리셋 설정을 마쳤지만 곡 선택에서 모달이 열리기 전에 새로고침하면 Start 뒤 곡 선택에서 모달이 한 번 열리고, 그 뒤 새로고침하면 다시 열리지 않는다', async ({ page }) => {
    await stubEmptySongs(page);
    await page.goto('/game');
    // completeFirstLaunch 직후·곡 선택이 모달을 열기 전의 저장 상태: 첫 기동은 끝났고 열기 신호는 아직 켜져 있다.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('not4k-settings', JSON.stringify({
        state: { settings: { isFirstLaunch: false }, shouldOpenFirstLaunchTutorialModal: true }, version: 0,
      }));
    });
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('not4k-settings')!).state.shouldOpenFirstLaunchTutorialModal)).toBe(false);

    // 화면은 저장하지 않으므로 새로고침 뒤에는 타이틀에서 다시 시작한다.
    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('곡 목록 요청이 끝나지 않은 동안에도 첫 기동 튜토리얼 모달은 로딩 화면에 가리지 않아 Close를 누를 수 있고, 닫으면 Loading songs... 화면이 보인다', async ({ page }) => {
    const releaseSongs = await holdSongs(page);
    await choosePresetOnFirstLaunch(page, 'TKL (Tenkeyless)');
    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();
    // click은 실제로 맨 위에서 포인터를 받는 요소인지 확인하므로, 로딩 화면이 덮고 있으면 실패한다.
    await dialog.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Loading songs...')).toBeVisible();

    releaseSongs();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('곡 목록 요청 중 첫 기동 튜토리얼 모달에서 Advanced 탭을 고른 뒤 목록이 도착해도 같은 모달 DOM이 남아 Advanced가 선택된 채이고, Escape는 모달만 닫는다', async ({ page }) => {
    const releaseSongs = await holdSongs(page);
    await choosePresetOnFirstLaunch(page, 'TKL (Tenkeyless)');
    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    const advancedTab = dialog.getByRole('tab', { name: 'Advanced', exact: true });
    await expect(dialog).toBeVisible();
    await advancedTab.click();
    await expect(advancedTab).toHaveAttribute('aria-selected', 'true');
    // 저장소에서 되살릴 수 없는 표식을 모달 DOM에 붙여, 다시 마운트되면 사라지게 한다.
    await dialog.evaluate(element => { element.setAttribute('data-e2e-mount-marker', 'before-songs'); });

    releaseSongs();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    await expect(dialog).toHaveAttribute('data-e2e-mount-marker', 'before-songs');
    await expect(advancedTab).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('non-first launch: Start goes directly to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(
      (s) => localStorage.setItem('not4k-settings', s),
      NON_FIRST_LAUNCH_SETTINGS
    );
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('settings modal opens over song select and closes back to it', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(
      (s) => localStorage.setItem('not4k-settings', s),
      NON_FIRST_LAUNCH_SETTINGS
    );
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();

    // 설정은 곡 선택 위에 모달로 뜬다 (화면 전환이 아님 → Song Select가 뒤에 남아 있다)
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();

    // Close 버튼으로 닫으면 모달만 사라지고 곡 선택으로 돌아온다
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('escape closes the settings modal instead of exiting to title', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(
      (s) => localStorage.setItem('not4k-settings', s),
      NON_FIRST_LAUNCH_SETTINGS
    );
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    // 모달 열린 상태의 Escape는 모달만 닫아야 한다. 뒤의 곡 선택 keydown으로 새어
    // 타이틀로 이탈하면 회귀(HIGH-1).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });
});
