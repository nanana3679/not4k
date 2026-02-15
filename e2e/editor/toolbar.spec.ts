import { test, expect } from '@playwright/test';

test.describe('Editor Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('canvas');
  });

  test('mode buttons switch active state on click', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create' });
    const selectBtn = page.getByRole('button', { name: 'Select' });
    const deleteBtn = page.getByRole('button', { name: 'Delete' });

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

  test('entity type dropdown visible only in Create mode', async ({ page }) => {
    const dropdown = page.locator('select');

    // Create mode by default — dropdown visible
    await expect(dropdown).toBeVisible();

    // Switch to Select — dropdown hidden
    await page.getByRole('button', { name: 'Select' }).click();
    await expect(dropdown).toBeHidden();

    // Switch to Delete — still hidden
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(dropdown).toBeHidden();

    // Back to Create — visible again
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(dropdown).toBeVisible();
  });

  test('entity type dropdown changes selection', async ({ page }) => {
    const dropdown = page.locator('select');

    await dropdown.selectOption('double');
    await expect(dropdown).toHaveValue('double');

    await dropdown.selectOption('bpmMarker');
    await expect(dropdown).toHaveValue('bpmMarker');
  });

  test('snap buttons are clickable', async ({ page }) => {
    await page.getByRole('button', { name: '1/4' }).click();
    await page.getByRole('button', { name: '1/8' }).click();
    await page.getByRole('button', { name: '1/16' }).click();
  });

  test('zoom display shows numeric value', async ({ page }) => {
    await expect(page.getByText(/Zoom: \d+px\/s/)).toBeVisible();
  });

  test('play/pause button exists with Play text', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});
