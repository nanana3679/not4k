import { test, expect } from '@playwright/test';

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

  test('preset setup: TKL navigates to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'TKL (Tenkeyless)' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('preset setup: Numpad navigates to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Numpad' }).click();
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
