import { expect, test, type Page } from '@playwright/test';

const KEY_BINDINGS = {
  lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
  lane2: ['KeyE', 'KeyD', 'KeyC'],
  lane3: ['KeyP', 'KeyL', 'Comma'],
  lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
};

async function openTutorial(page: Page, shortage = false, keyBindings = KEY_BINDINGS, inputOffsetMs = 0) {
  await page.addInitScript(({ keyBindings, inputOffsetMs }) => {
    localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: {
      // 실제 키 입력의 전달 지연이 흐름 검증을 흔들지 않게 판정 창이 넓은 Easy로 둔다. 판정 창 자체는 단위 테스트가 확인한다.
      keyBindings, preset: 'tkl', isFirstLaunch: false, judgmentMode: 'easy', inputOffsetMs,
    } }, version: 0 }));
  }, { keyBindings: { ...keyBindings, lane1: shortage ? ['KeyQ', 'KeyW'] : keyBindings.lane1 }, inputOffsetMs });
  await page.goto('/game');
  const start = page.getByRole('button', { name: 'Start', exact: true });
  const help = page.getByRole('button', { name: 'Open tutorial help' });
  await expect(start.or(help).first()).toBeVisible();
  if (await start.isVisible()) await start.click();
  await help.click();
  return page.getByRole('dialog', { name: 'Tutorial', exact: true });
}

const ACTIVE_PLAYER = '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="single-note"] [data-tutorial-engine]';

// 실제 rAF가 공개한 경과 시간에 맞춰 실제 키보드로 친다. 고정 sleep·합성 KeyboardEvent·세션 패치는 쓰지 않는다.
async function waitForElapsed(page: Page, target: number, selector = ACTIVE_PLAYER) {
  await page.waitForFunction(({ selector, target }) => {
    const player = document.querySelector<HTMLElement>(selector);
    return player && Number(player.dataset.tutorialElapsedMs) >= target;
  }, { selector, target }, { polling: 'raf', timeout: 10_000 });
}

for (const inputOffsetMs of [0, -200, 200]) {
  test(`Basic single-note offset ${inputOffsetMs}ms에서 실제 바인딩 키로 누적 3회 성공하면 실습을 멈추고 3/3·다음·통과 체크를 표시하며 재개방·새로고침 뒤에도 체크가 남는다`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const dialog = await openTutorial(page, false, KEY_BINDINGS, inputOffsetMs);
    const item = dialog.locator('[data-tutorial-index-item="single-note"]');
    await expect(item.getByLabel('Passed tutorial')).toHaveCount(0);
    await item.click();
    const player = page.locator(ACTIVE_PLAYER);
    await expect(player).toHaveAttribute('data-tutorial-paused', 'false');
    await expect(player).toHaveAttribute('data-tutorial-elapsed-ms', /\d/);
    const loopMs = Number(await player.getAttribute('data-tutorial-loop-ms'));
    expect(loopMs).toBe(1500);
    await dialog.getByRole('button', { name: '직접 입력', exact: true }).click();
    await expect(player).toHaveAttribute('data-tutorial-input-mode', 'directInput');
    const progress = dialog.locator('[data-tutorial-progress]');
    await expect(progress).toHaveText('0/3');
    await expect(dialog.getByRole('button', { name: '다음', exact: true })).toHaveCount(0);

    // 현재 시연에서 전환한 패턴은 제외한다. 각 시도는 다음 전체 반복을 골라 250·750·1250ms에서 오프셋만큼 앞당긴 실제 시각에 입력한다.
    // 부하로 한 번 실패해도 누적 성공 계약대로 다음 반복에서 계속하며 최대 8회로 제한한다.
    for (let attempt = 0; attempt < 8; attempt++) {
      const elapsed = Number(await player.getAttribute('data-tutorial-elapsed-ms'));
      const startMs = (Math.floor(elapsed / loopMs) + 1) * loopMs;
      for (const [index, key] of KEY_BINDINGS.lane2.entries()) {
        await waitForElapsed(page, startMs + (index + 0.5) * (loopMs / 3) - inputOffsetMs - 12);
        await page.keyboard.press(key);
      }
      await page.waitForFunction(({ selector, endMs }) => {
        const player = document.querySelector<HTMLElement>(selector);
        return player && (player.dataset.tutorialPaused === 'true' || Number(player.dataset.tutorialElapsedMs) >= endMs + 32);
      }, { selector: ACTIVE_PLAYER, endMs: startMs + loopMs + Math.max(0, -inputOffsetMs) }, { polling: 'raf', timeout: 10_000 });
      if (await progress.textContent() === '3/3') break;
    }

    await expect(progress).toHaveText('3/3');
    const condition = dialog.locator('[data-tutorial-condition="maxGreatOrWorseCount"]');
    await expect(condition).toHaveAttribute('data-tutorial-condition-status', 'met');
    await expect(condition).toHaveCSS('color', 'rgb(142, 230, 168)');
    await expect(condition.getByLabel('충족')).toHaveText('✓');
    await expect(player).toHaveAttribute('data-tutorial-paused', 'true');
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('not4k-tutorial-pass-state')!).guestIds))
      .toEqual(['single-note']);
    await expect(dialog.locator('[data-tutorial-index-item="single-note"]')).toHaveAttribute('aria-current', 'step');
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    await expect(dialog.locator('[data-tutorial-preview-slot="active"]')).toHaveAttribute('data-tutorial-preview-id', 'double-note');
    await expect(progress).toHaveText('0/3');
    await expect(dialog.getByRole('button', { name: '시연', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');
    await dialog.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Open tutorial help' }).click();
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');
    await item.click();
    await expect(progress).toHaveText('0/3');
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');

    await page.reload();
    const start = page.getByRole('button', { name: 'Start', exact: true });
    const help = page.getByRole('button', { name: 'Open tutorial help' });
    await expect(start.or(help).first()).toBeVisible();
    if (await start.isVisible()) await start.click();
    await help.click();
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');
    await item.click();
    await expect(progress).toHaveText('0/3');
    await expect(item.getByLabel('Passed tutorial')).toHaveText('✓');
    expect(errors).toEqual([]);
  });
}

test('1레인 Q·W 2키로 advanced-double-hold를 열면 직접 입력을 막고 4키 필요 안내에서 Controls 설정을 연다', async ({ page }) => {
  const dialog = await openTutorial(page, true);
  await dialog.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await expect(dialog.locator('[data-tutorial-preview-slot="active"]')).toHaveAttribute('data-tutorial-preview-id', 'advanced-double-hold');
  await expect(dialog.getByRole('button', { name: '직접 입력', exact: true })).toBeDisabled();
  await expect(dialog.getByText('1번 레인에 키가 4개 필요하지만 2개만 설정되어 있습니다', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '시연', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '키 설정', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

for (const id of ['connected-long-note-switch', 'connected-long-note-overlap']) {
  test(`${id}의 경계 +5ms 뒤 실제 keyup으로 3회 성공하면 도식 없이 다음을 누를 수 있고 시연 복귀 시 도식이 나타난다`, async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openTutorial(page);
    await dialog.locator(`[data-tutorial-index-item="${id}"]`).click();
    const diagram = page.locator('[data-tutorial-diagram-modal="true"]');
    await expect(diagram).toBeVisible();
    await diagram.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(diagram).toHaveCount(0);
    const selector = `[data-tutorial-preview-slot="active"][data-tutorial-preview-id="${id}"] [data-tutorial-engine]`;
    const player = page.locator(selector);
    await dialog.getByRole('button', { name: '직접 입력', exact: true }).click();
    await expect(player).toHaveAttribute('data-tutorial-input-mode', 'directInput');
    const progress = dialog.locator('[data-tutorial-progress]');
    const switchKeys = id === 'connected-long-note-switch';
    const firstKey = switchKeys ? 'KeyE' : 'KeyP';
    const secondKey = switchKeys ? 'KeyD' : 'KeyL';
    const attempts: { iteration: string | null; perfect: string | null; miss: string | null; achievement: string | null }[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const elapsed = Number(await player.getAttribute('data-tutorial-elapsed-ms'));
      const startMs = (Math.floor(elapsed / 4000) + 1) * 4000;
      await expect(diagram).toHaveCount(0);
      await waitForElapsed(page, startMs + 3000 - 12, selector);
      await page.keyboard.down(firstKey);
      if (switchKeys) {
        // RFD 0037 §3-2: 앞 바디는 끝의 Good 이른 폭 안에서 종료할 수 있고 연결 up 소비는 없다.
        // up을 먼저 마쳐 새 탭의 대기에 keyup 왕복 지연을 더하지 않는다. Great 1개는 허용하지만 2개부터 성공 조건을 초과한다.
        await waitForElapsed(page, startMs + 3400, selector);
        await page.keyboard.up(firstKey);
      }
      await waitForElapsed(page, startMs + 3500 - 12, selector);
      await page.keyboard.down(secondKey);
      if (!switchKeys) {
        await waitForElapsed(page, startMs + 3750 - 12, selector);
        await page.keyboard.up(secondKey);
      }
      await waitForElapsed(page, startMs + 4000 + 5, selector);
      await page.keyboard.up(switchKeys ? secondKey : firstKey);
      // 마지막 릴리즈의 Easy Good 창(150ms)이 닫힌 뒤 성공 횟수가 반영된다.
      await page.waitForFunction(({ selector, endMs }) => {
        const player = document.querySelector<HTMLElement>(selector);
        return player && (player.dataset.tutorialPaused === 'true' || Number(player.dataset.tutorialElapsedMs) >= endMs + 150 + 32);
      }, { selector, endMs: startMs + 4000 }, { polling: 'raf', timeout: 10_000 });
      attempts.push(await player.evaluate(element => ({
        iteration: element.getAttribute('data-tutorial-last-iteration'),
        perfect: element.getAttribute('data-tutorial-last-perfect'),
        miss: element.getAttribute('data-tutorial-last-miss'),
        achievement: element.getAttribute('data-tutorial-last-achievement'),
      })));
      if (await progress.textContent() === '3/3') break;
    }
    await expect(progress, `패턴별 정산: ${JSON.stringify(attempts)}`).toHaveText('3/3');
    await expect(player).toHaveAttribute('data-tutorial-paused', 'true');
    await expect(diagram).toHaveCount(0);
    await dialog.getByRole('button', { name: '다음', exact: true }).click({ trial: true });
    await dialog.getByRole('button', { name: '시연', exact: true }).click();
    await expect(player).toHaveAttribute('data-tutorial-input-mode', 'demonstration');
    await expect(diagram).toBeVisible();
  });
}

for (const key of ['Enter', 'Space']) {
  test(`레인에 바인딩된 ${key}로 직접 입력 중 포커스된 Advanced 탭을 활성화할 수 있다`, async ({ page }) => {
    const dialog = await openTutorial(page, false, { ...KEY_BINDINGS, lane2: ['Enter', 'Space', 'KeyE'] });
    await dialog.locator('[data-tutorial-index-item="single-note"]').click();
    await dialog.getByRole('button', { name: '직접 입력', exact: true }).click();
    await expect(page.locator(ACTIVE_PLAYER)).toHaveAttribute('data-tutorial-input-mode', 'directInput');
    const advanced = dialog.getByRole('tab', { name: 'Advanced', exact: true });
    await advanced.focus();
    await page.keyboard.press(key);
    await expect(advanced).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-tutorial-preview-slot="active"]')).toHaveAttribute('data-tutorial-preview-id', 'advanced-double-hold');
  });
}
