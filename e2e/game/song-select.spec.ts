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
      liftPx: 0,
      suddenPx: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

async function navigateToSongSelect(page: Page) {
  await page.goto('/');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
}

test.describe('Song Select Screen', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToSongSelect(page);
  });

  test('displays 3 placeholder songs with titles and artists', async ({ page }) => {
    await expect(page.getByText('Placeholder Song 1')).toBeVisible();
    await expect(page.getByText('Placeholder Song 2')).toBeVisible();
    await expect(page.getByText('Placeholder Song 3')).toBeVisible();

    await expect(page.getByText('Artist A')).toBeVisible();
    await expect(page.getByText('Artist B')).toBeVisible();
    await expect(page.getByText('Artist C')).toBeVisible();
  });

  test('difficulty buttons rendered per song', async ({ page }) => {
    // Song 1: EASY, NORMAL, HARD; Song 2: NORMAL, HARD; Song 3: EASY, NORMAL
    const easyButtons = page.getByRole('button', { name: 'EASY' });
    const normalButtons = page.getByRole('button', { name: 'NORMAL' });
    const hardButtons = page.getByRole('button', { name: 'HARD' });

    await expect(easyButtons).toHaveCount(2);
    await expect(normalButtons).toHaveCount(3);
    await expect(hardButtons).toHaveCount(2);
  });

  test('clicking difficulty navigates away from song select', async ({ page }) => {
    await page.getByRole('button', { name: 'EASY' }).first().click();
    // Navigates to loading screen (shows "Loading..." briefly, then Supabase error)
    const loadingText = page.getByText('Loading...');
    const supabaseError = page.getByText('Supabase not configured');
    await expect(loadingText.or(supabaseError)).toBeVisible();
  });
});
