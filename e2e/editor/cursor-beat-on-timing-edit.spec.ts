import { test, expect, type Page } from '@playwright/test';
import { canvasPosition } from './explicitEditorTestHelpers';
import { openEditor } from './editorTestSetup';

// 정지 중 타이밍 값(오프셋·BPM)을 바꾸면 커서는 수정 직전 박을 유지하고 그 박의 새 음원 시각으로 옮겨진다(RFD 0099).
// 음원(0.5초)이 있어야 재생할 수 있다. 120 BPM 4/4에서는 타임라인이 1마디(2000ms)라 커서는 그 안에서 고른다.

test.setTimeout(60_000);

async function cursor(page: Page): Promise<{ currentTimeMs: number; isPlaying: boolean }> {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { currentTimeMs, isPlaying } = (await import(path)).useEditorStore.getState();
    return { currentTimeMs, isPlaying };
  });
}

/** 왼쪽 마디 레일(레인 왼쪽 seek 영역)을 눌러 120 BPM 기준 `at`박 높이로 커서를 옮기고 옮긴 시각을 돌려준다. */
async function seekOnRail(page: Page, at: number): Promise<number> {
  const box = (await page.locator('canvas').boundingBox())!;
  const { y } = await canvasPosition(page, 1, at);
  await page.mouse.click(box.x + 4, y);
  const { currentTimeMs } = await cursor(page);
  // 화소 단위로 고르므로 박 위치와 몇 ms 다를 수 있다. 이후 기대값은 이 실제 시각에서 계산한다.
  expect(currentTimeMs).toBeGreaterThan(at * 500 - 50);
  expect(currentTimeMs).toBeLessThan(at * 500 + 50);
  return currentTimeMs;
}

/** Space로 재생했다가 잠시 뒤 다시 Space로 멈춘다. */
async function playBriefly(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

test.describe('정지 중 타이밍 값 수정 뒤 커서 박 유지', () => {
  test('재생·일시정지 뒤 레일로 2박(약 1000ms)에 seek하고 초기 BPM을 120→60으로 바꾸면 커서가 같은 2박의 약 2000ms로 옮겨지고 Space 재생이 거기서 시작한다', async ({ page }) => {
    await openEditor(page, { audio: true });
    await playBriefly(page);
    const before = await seekOnRail(page, 2);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    let position = await canvasPosition(page, 5, 0);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    if (position.y < box.y || position.y > box.y + box.height) {
      await canvas.dispatchEvent('wheel', { deltaY: position.y - (box.y + box.height / 2) });
      position = await canvasPosition(page, 5, 0);
    }
    await page.mouse.dblclick(position.x, position.y);
    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
    await page.getByLabel('BPM', { exact: true }).fill('60');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toHaveCount(0);

    // 2박 = 120 BPM에서 before ms, 60 BPM에서 before × 2 ms(오프셋 0)
    const expected = before * 2;
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(expected, 3);

    await playBriefly(page);
    // 재생이 수정 전 시각(before ≈ 1000ms)에서 시작했다면 짧게 재생한 뒤에도 expected(≈ 2000ms)보다 앞이다.
    // 헤드리스에서 음원 시각이 흐르지 않아도 재생 루프는 시작 위치를 보고하므로 이 비교는 성립한다.
    const after = (await cursor(page)).currentTimeMs;
    expect(after).toBeGreaterThan(expected - 1);
    expect(after).toBeLessThan(expected + 1500);
  });

  test('2박(약 1000ms)에 커서를 두고 오프셋을 0→100으로 바꾸면 커서가 100ms 뒤로 옮겨지고 Undo하면 원래 시각으로 돌아온다', async ({ page }) => {
    await openEditor(page, { audio: true });
    const before = await seekOnRail(page, 2);

    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Offset', exact: true }).click();
    const offsetInput = page.getByLabel('Audio offset milliseconds', { exact: true });
    await offsetInput.fill('100');
    await offsetInput.press('Enter');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(offsetInput).toHaveCount(0);

    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(before + 100, 3);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(before, 3);
  });
});
