import { test, expect } from '@playwright/test';
import { openEditor } from './editorTestSetup';

test.describe('에디터 모드 전환 단축키', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test('Select 모드에서 C 키를 누르면 Create 버튼이 활성화된다', async ({ page }) => {
    // Switch away from Create first
    await page.getByRole('button', { name: 'Select', exact: true }).click();

    // Press C
    await page.keyboard.press('c');

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });

  test('Create 모드에서 S 키를 누르면 Select 버튼이 활성화된다', async ({ page }) => {
    await page.keyboard.press('s');

    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });

  test('Create 모드에서 D 키를 누르면 Delete 버튼이 활성화된다', async ({ page }) => {
    await page.keyboard.press('d');

    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });
});

test.describe('에디터 재생 단축키', () => {
  test.beforeEach(async ({ page }) => {
    // play()는 음원 버퍼가 있어야 동작한다 — 음원이 있는 곡으로 진입한다.
    await openEditor(page, { audio: true });
  });

  test('음원이 있는 곡에서 Space를 두 번 누르면 재생 버튼이 Play → Pause → Play로 바뀐다', async ({ page }) => {
    // Initially "Play"
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    // Press Space — toggle to "Pause"
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // Press Space again — back to "Play"
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
});
