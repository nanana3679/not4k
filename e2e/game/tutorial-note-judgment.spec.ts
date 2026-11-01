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
      scrollSpeed: 800, liftPercent: 0, suddenPercent: 0, targetFps: 60,
      offsetMs: 0, preset: 'tkl', isFirstLaunch: false,
    },
  },
  version: 0,
});

async function openTutorial(page: Page, judgmentMode: 'normal' | 'easy') {
  await page.goto('/game');
  const settings = JSON.parse(NON_FIRST_LAUNCH_SETTINGS);
  Object.assign(settings.state.settings, { judgmentMode, inputOffsetMs: 137 });
  await page.evaluate((value) => localStorage.setItem('not4k-settings', value), JSON.stringify(settings));
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  await page.getByRole('button', { name: 'Open tutorial help' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('TutorialPreviewPlayer 명시 엔진의 반복 경계 정산', () => {
  for (const judgmentMode of ['normal', 'easy'] as const) {
    test(`${judgmentMode} 설정·입력 오프셋 137ms에서 connected overlap을 6000ms씩 2회 시연하면 매회 Perfect 3·Miss 0·100%이고 경계 판정은 없다`, async ({ page }) => {
      test.setTimeout(60_000);
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const dialog = await openTutorial(page, judgmentMode);
      await dialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]').click();
      const active = dialog.locator('[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]');
      await expect(active).toBeVisible();
      const player = active.locator('[data-tutorial-engine]');
      await expect(player).toHaveAttribute('data-tutorial-engine', 'explicit');
      await expect(player).toHaveAttribute('data-tutorial-judgment-mode', judgmentMode);
      await expect(player).toHaveAttribute('data-tutorial-loop-ms', '6000');

      // 실제 세션이 끝낸 반복의 DOM 결과를 읽는다. 도식은 매 반복 확인하며 prototype을 패치하지 않는다.
      for (const iteration of [0, 1]) {
        await expect.poll(async () => {
          const ok = page.locator('[data-tutorial-diagram-modal="true"]:visible [data-tutorial-diagram-ok="true"]');
          if (await ok.count()) await ok.last().click();
          return player.getAttribute('data-tutorial-last-iteration');
        }, { timeout: 20_000, intervals: [100] }).toBe(String(iteration));
        const settlements = JSON.parse(await player.getAttribute('data-tutorial-boundary-settlements') ?? '[]');
        // 마지막 릴리즈는 4000ms에 판정하고 2000ms 여백 뒤 반복하므로 경계에는 판정이 없다.
        expect(settlements).toEqual([]);
        await expect(player).toHaveAttribute('data-tutorial-last-perfect', '3');
        await expect(player).toHaveAttribute('data-tutorial-last-miss', '0');
        await expect(player).toHaveAttribute('data-tutorial-last-achievement', '100');
      }
      expect(pageErrors).toEqual([]);
    });
  }
});
