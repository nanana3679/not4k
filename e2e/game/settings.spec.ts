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

async function navigateToSettings(page: Page) {
  await page.goto('/game');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

test.describe('Game Settings', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToSettings(page);
  });

  test('scroll speed slider updates value', async ({ page }) => {
    const slider = page.locator('input[type="range"]').first();
    await slider.fill('1200');
    await expect(page.getByText('Scroll Speed: 1200')).toBeVisible();
  });

  test('lift slider updates value', async ({ page }) => {
    const liftSlider = page.locator('input[type="range"]').nth(1);
    await liftSlider.fill('50');
    await expect(page.getByText('Lift (%): 50')).toBeVisible();
  });

  test('sudden slider updates value', async ({ page }) => {
    const suddenSlider = page.locator('input[type="range"]').nth(2);
    await suddenSlider.fill('100');
    await expect(page.getByText('Sudden (%): 100')).toBeVisible();
  });

  test('FPS dropdown selects options', async ({ page }) => {
    const fpsSelect = page.locator('select');

    await fpsSelect.selectOption('120');
    await expect(fpsSelect).toHaveValue('120');

    await fpsSelect.selectOption('0'); // Unlimited
    await expect(fpsSelect).toHaveValue('0');
  });

  test('audio offset input accepts number', async ({ page }) => {
    const offsetInput = page.locator('input[type="number"]');
    await offsetInput.fill('50');
    await expect(offsetInput).toHaveValue('50');
  });

  test('key binding: add key shows listening state and adds chip', async ({ page }) => {
    // Click "+ Add Key" for lane1
    const lane1Label = page.getByText('lane1:', { exact: true });
    const lane1Row = lane1Label.locator('..');
    await lane1Row.getByRole('button', { name: '+ Add Key' }).click();

    // Should show "Press any key..."
    await expect(page.getByText('Press any key...')).toBeVisible();

    // Press a key not already bound
    await page.keyboard.press('z');

    // Key chip should appear
    await expect(page.getByText('KeyZ')).toBeVisible();
  });

  test('key binding: remove key chip when more than 2 keys', async ({ page }) => {
    // lane1 has 4 keys: KeyQ, KeyW, KeyS, KeyX
    const lane1Label = page.getByText('lane1:', { exact: true });
    const lane1Row = lane1Label.locator('..');
    const removeButtons = lane1Row.getByTitle('Remove key');

    await expect(removeButtons).toHaveCount(4);

    // Remove last key
    await removeButtons.last().click();

    // Should now have 3 keys
    await expect(removeButtons).toHaveCount(3);
  });

  test('key binding: prevent removal when only 2 keys left', async ({ page }) => {
    // lane2 has 3 keys: KeyE, KeyD, KeyC
    const lane2Label = page.getByText('lane2:', { exact: true });
    const lane2Row = lane2Label.locator('..');
    const removeButtons = lane2Row.getByTitle('Remove key');

    // Remove one to get to 2
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(2);

    // Try to remove another — should show warning
    await removeButtons.last().click();
    await expect(page.getByText('Each lane must have at least 2 keys')).toBeVisible();

    // Still 2 keys
    await expect(removeButtons).toHaveCount(2);
  });

  test('preset reset buttons update bindings', async ({ page }) => {
    // Click Numpad preset
    await page.getByRole('button', { name: 'Reset to Numpad Preset' }).click();
    await expect(page.getByText('Reset to NUMPAD preset', { exact: true })).toBeVisible();
    await expect(page.getByText('Numpad7')).toBeVisible();

    // Click TKL preset
    await page.getByRole('button', { name: 'Reset to TKL Preset' }).click();
    await expect(page.getByText('Reset to TKL preset', { exact: true })).toBeVisible();
  });
});
