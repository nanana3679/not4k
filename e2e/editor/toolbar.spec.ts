import { test, expect, type Page } from '@playwright/test';
import { openEditor } from './editorTestSetup';

// 툴바에는 select가 둘이다: Create 모드에서만 보이는 엔티티 타입 드롭다운과 늘 보이는 Snap 드롭다운.
const entityTypeSelect = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="single"]') });
const snapSelect = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="custom"]') });

test.describe('에디터 툴바', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test('기본 Create 모드에서 Select·Delete 버튼을 차례로 누르면 누른 모드 버튼만 #4488ff로 활성화된다', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create', exact: true });
    const selectBtn = page.getByRole('button', { name: 'Select', exact: true });
    const deleteBtn = page.getByRole('button', { name: 'Delete', exact: true });

    // Create is active by default (#4488ff = rgb(68, 136, 255))
    await expect(createBtn).toHaveCSS('background-color', 'rgb(68, 136, 255)');

    // Click Select
    await selectBtn.click();
    await expect(selectBtn).toHaveCSS('background-color', 'rgb(68, 136, 255)');
    await expect(createBtn).not.toHaveCSS('background-color', 'rgb(68, 136, 255)');

    // Click Delete
    await deleteBtn.click();
    await expect(deleteBtn).toHaveCSS('background-color', 'rgb(68, 136, 255)');
    await expect(selectBtn).not.toHaveCSS('background-color', 'rgb(68, 136, 255)');
  });

  test('엔티티 타입 드롭다운은 Create 모드에서만 보이고 Select·Delete 모드에서는 숨는다', async ({ page }) => {
    const dropdown = entityTypeSelect(page);

    // Create mode by default — dropdown visible
    await expect(dropdown).toBeVisible();

    // Switch to Select — dropdown hidden
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(dropdown).toBeHidden();

    // Switch to Delete — still hidden
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dropdown).toBeHidden();

    // Back to Create — visible again
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dropdown).toBeVisible();
  });

  test('엔티티 타입 드롭다운에서 double·bpm을 고르면 선택값이 double → bpm으로 바뀐다', async ({ page }) => {
    const dropdown = entityTypeSelect(page);

    await dropdown.selectOption('double');
    await expect(dropdown).toHaveValue('double');

    await dropdown.selectOption('bpm');
    await expect(dropdown).toHaveValue('bpm');
  });

  test('Snap 드롭다운에서 1/8·1/16을 고르면 스냅 값이 4 → 8 → 16으로 바뀐다', async ({ page }) => {
    const dropdown = snapSelect(page);
    await expect(dropdown).toHaveValue('4');

    await dropdown.selectOption('1/8');
    await expect(dropdown).toHaveValue('8');

    await dropdown.selectOption('1/16');
    await expect(dropdown).toHaveValue('16');
  });

  test('진입 직후 툴바 Zoom 표시는 기본값 200px/s다', async ({ page }) => {
    await expect(page.getByText(/Zoom: \d+px\/s/)).toHaveText('Zoom: 200px/s');
  });

  test('재생 전 툴바 재생 버튼은 Play로 표시된다', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
});
