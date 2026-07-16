import { test, expect, type Page, type Locator } from '@playwright/test';

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
      audioOffsetMs: 0,
      judgmentOffsetMs: 0,
      renderHeight: 1080,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

// 설정 모달을 연다. 설정은 곡 선택 위에 모달(role=dialog)로 뜨며, 기본 섹션은 Controls다.
async function openSettings(page: Page): Promise<Locator> {
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
  return dialog;
}

// "Lane N" 레이블이 든 키 바인딩 행을 반환한다.
function laneRow(dialog: Locator, laneNumber: number): Locator {
  return dialog.getByText(`Lane ${laneNumber}`, { exact: true }).locator('..');
}

test.describe('Game Settings', () => {
  test('Gameplay: 스크롤 속도 슬라이더를 1200으로 옮기면 값 표시가 1200', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const slider = dialog.getByLabel('Scroll Speed');
    await slider.fill('1200');
    await expect(slider).toHaveValue('1200');
    await expect(dialog.getByText('1200', { exact: true })).toBeVisible();
  });

  test('Gameplay: Lift 슬라이더를 50으로 옮기면 값 표시가 50%', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const slider = dialog.getByLabel('Lift');
    await slider.fill('50');
    await expect(slider).toHaveValue('50');
    await expect(dialog.getByText('50%', { exact: true })).toBeVisible();
  });

  test('Gameplay: Sudden 슬라이더는 비활성(Coming soon)', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    await expect(dialog.getByLabel('Sudden')).toBeDisabled();
    await expect(dialog.getByText('Coming soon', { exact: true })).toBeVisible();
  });

  test('Gameplay: Render Resolution 드롭다운으로 1440p/720p 선택', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const select = dialog.getByLabel('Render Resolution');
    await select.selectOption('1440');
    await expect(select).toHaveValue('1440');
    await select.selectOption('720');
    await expect(select).toHaveValue('720');
  });

  test('Gameplay: Audio Offset 입력에 숫자 50 입력', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const input = dialog.getByLabel('Audio Offset (ms)');
    await input.fill('50');
    await expect(input).toHaveValue('50');
  });

  test('Controls: + Add 클릭 시 리스닝 상태 후 새 키 칩 추가', async ({ page }) => {
    const dialog = await openSettings(page);

    await laneRow(dialog, 1).getByRole('button', { name: '+ Add' }).click();
    await expect(dialog.getByText('Press any key…')).toBeVisible();

    await page.keyboard.press('z');
    await expect(dialog.getByText('KeyZ', { exact: true })).toBeVisible();
  });

  test('Controls: 키가 2개 초과면 칩 삭제 가능', async ({ page }) => {
    const dialog = await openSettings(page);

    const removeButtons = laneRow(dialog, 1).getByTitle('Remove key');
    await expect(removeButtons).toHaveCount(4);
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(3);
  });

  test('Controls: 키가 2개만 남으면 삭제 차단하고 경고', async ({ page }) => {
    const dialog = await openSettings(page);

    // lane2는 3키(KeyE, KeyD, KeyC)로 시작
    const removeButtons = laneRow(dialog, 2).getByTitle('Remove key');
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(2);

    await removeButtons.last().click();
    await expect(dialog.getByText('Each lane must keep at least 2 keys')).toBeVisible();
    await expect(removeButtons).toHaveCount(2);
  });

  test('Controls: 프리셋 리셋 버튼이 바인딩을 교체', async ({ page }) => {
    const dialog = await openSettings(page);

    await dialog.getByRole('button', { name: 'Reset to Numpad' }).click();
    await expect(dialog.getByText('Reset to NUMPAD preset', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Numpad7', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Reset to TKL' }).click();
    await expect(dialog.getByText('Reset to TKL preset', { exact: true })).toBeVisible();
  });
});
