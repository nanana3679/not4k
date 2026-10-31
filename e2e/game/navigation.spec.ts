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
    test(`preset setup: ${preset} navigates to song select with the first-launch tutorial modal open`, async ({ page }) => {
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

  test('first-launch tutorial modal does not reopen on a later song select visit or after reload', async ({ page }) => {
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
