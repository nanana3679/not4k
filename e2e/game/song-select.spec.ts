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

async function navigateToSongSelect(page: Page) {
  await page.goto('/game');
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

  test('? 버튼으로 중앙 튜토리얼 팝업을 열고 닫을 수 있음', async ({ page }) => {
    const helpButton = page.getByRole('button', { name: 'Open tutorial help' });
    await expect(helpButton).toHaveText('?');

    await helpButton.click();

    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-tutorial-preview-canvas="true"]')).toHaveCount(2);

    const activeSlot = dialog.locator('[data-tutorial-preview-slot="active"]');
    // 레인 키 라벨·키보드 배열은 이제 GameRenderer(PixiJS) 캔버스 안에 그려져 DOM 요소가 없다.
    await expect(activeSlot.locator('[data-tutorial-preview-canvas="true"]')).toBeVisible();

    await dialog.locator('[data-tutorial-index-item="connected-long-note-switch"]').click();
    // 도식 확인 모달은 카드/슬롯이 아니라 문서 최상위(portal)로 그려진다 — page 기준으로 찾는다.
    const diagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(diagramModal).toBeVisible();
    await expect(diagramModal.locator('[data-tutorial-diagram-id="connected-switch"]')).toBeVisible();
    await expect(diagramModal.locator('[data-tutorial-diagram-ok="true"]')).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(diagramModal).toBeVisible();
    await diagramModal.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(diagramModal).toBeHidden();

    await dialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]').click();
    await expect(dialog.locator(
      '[data-tutorial-carousel-track][data-tutorial-transition-phase="animating"]'
    )).toBeVisible();
    const activeOverlapSlot = dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]'
    );
    await expect(activeOverlapSlot).toBeVisible();
    const overlapDiagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(overlapDiagramModal.locator('[data-tutorial-diagram-id="connected-overlap"]')).toBeVisible();
    const firstOverlapInstanceId = await activeOverlapSlot.getAttribute('data-tutorial-preview-instance');
    await page.getByRole('button', { name: 'Next tutorial' }).click();
    await expect(page.locator('[data-tutorial-diagram-modal="true"]')).toBeHidden();
    await expect(dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="headless-long-note"]'
    )).toBeVisible();
    await page.getByRole('button', { name: 'Previous tutorial' }).click();
    const restoredOverlapSlot = dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]'
    );
    await expect(restoredOverlapSlot).not.toHaveAttribute(
      'data-tutorial-preview-instance',
      firstOverlapInstanceId ?? ''
    );
    const restoredDiagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(restoredDiagramModal.locator('[data-tutorial-diagram-id="connected-overlap"]')).toBeVisible();
    await restoredDiagramModal.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(restoredDiagramModal).toBeHidden();

    await page.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toBeHidden();

    await helpButton.click();
    const reopenedDialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(reopenedDialog).toBeVisible();
    await expect(
      reopenedDialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]')
    ).toHaveAttribute('data-tutorial-index-seen', 'true');
    await expect(
      reopenedDialog.locator(
        '[data-tutorial-index-item="connected-long-note-overlap"] [data-tutorial-index-check="true"]'
      )
    ).toBeVisible();
    await reopenedDialog.locator('[data-tutorial-reset-viewed-cache="true"]').click();
    await expect(
      reopenedDialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]')
    ).toHaveAttribute('data-tutorial-index-seen', 'false');
    await expect(
      reopenedDialog.locator(
        '[data-tutorial-index-item="connected-long-note-overlap"] [data-tutorial-index-check="true"]'
      )
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(reopenedDialog).toBeHidden();
  });
});
