import { test, expect, type Page } from '@playwright/test';
import { installProbe, probe, waitAt, preparationTarget, expectPreparation } from '../explicitPlaybackProbe';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(60000);

async function openLab(page: Page) {
  const external: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/') || url.pathname.startsWith('/auth/v1/')) {
      external.push(`${route.request().method()} ${url.pathname}`);
      await route.fulfill({ status: 500, json: { error: 'offline explicit playtest' } }); return;
    }
    if (url.origin === new URL(page.url() === 'about:blank' ? test.info().project.use.baseURL! : page.url()).origin) {
      await route.continue(); return;
    }
    await route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: {
    isFirstLaunch: false, skinId: 'classic', masterVolume: 0, scrollSpeed: 200, renderHeight: 600, gearMotion: false,
  } }, version: 0 })));
  await page.goto('/lab/explicit-playtest');
  await expect(page.locator('[data-lab-page="explicit-playtest"]')).toBeVisible({ timeout: 20000 });
  return external;
}

test('새 Lab 자동입력은 실제 WebGL·새도안·4항목12점 정산 뒤 audio/GPU를 정리하고 다시 재생·복귀한다', async ({ page }) => {
  const external = await openLab(page); await installProbe(page);
  await page.getByRole('button', { name: '자동 입력', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation', { timeout: 20000 });
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-settled', '0');
  expect((await probe(page)).hitCount).toBe(0);
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('4 / 4');
  await expect(page.getByTestId('explicit-earned')).toHaveText('12');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('12');
  expect(await probe(page)).toMatchObject({ explicitCharts: 1, warmups: 1, hitCount: 4, flightCount: 4, rendererDisposals: 1, audioDisposals: 1, webgl: true, keyboardListeners: 0 });
  expect((await probe(page)).spriteCount).toBeGreaterThan(0);
  await page.getByTestId('explicit-play-result').screenshot({ path: test.info().outputPath('explicit-result.png') });
  await page.getByRole('button', { name: '다시 재생', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '1');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  const preparations = (await probe(page)).preparations;
  expect(preparations).toHaveLength(2);
  for (const preparation of preparations) {
    expect(preparation.positionMs / preparation.rate - preparation.latencyMs).toBeCloseTo(-3000, 5);
    expect(preparation.visibleAfterMs).toBeGreaterThanOrEqual(3000);
  }
  expect((await probe(page)).hitCount).toBe(8);
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page.locator('[data-lab-page="explicit-playtest"]')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('Esc pause·계속·처음부터 다시 후에도 자동입력은 6항목18점이며 같은 그룹 효과를 중복 소비하지 않는다', async ({ page }) => {
  await openLab(page); await installProbe(page);
  await page.getByRole('combobox').selectOption('double');
  await page.getByRole('button', { name: '자동 입력', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'paused');
  const before = await page.getByTestId('explicit-play').getAttribute('data-visual-time');
  await page.waitForTimeout(300);
  expect(await page.getByTestId('explicit-play').getAttribute('data-visual-time')).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await page.getByRole('button', { name: '처음부터 다시', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '1');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('6 / 6');
  await expect(page.getByTestId('explicit-earned')).toHaveText('18');
  const state = await probe(page);
  expect(state.groups.slice(-3).length).toBe(3);
  expect(new Set(state.groups.slice(-3)).size).toBe(3);
  expect(state.audioDisposals).toBe(2); expect(state.rendererDisposals).toBe(2);
});

test('수동 실제 Q키의 사전 hold는 무점수 Body를 완료하고 분모0의 공식 비율·rank를 표시하지 않는다', async ({ page }) => {
  await openLab(page);
  await page.getByRole('combobox').selectOption('body-only');
  await page.getByRole('button', { name: '수동 연습', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation', { timeout: 20000 });
  await page.keyboard.down('q');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await page.keyboard.up('q');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('0');
  await expect(page.getByTestId('explicit-play-result')).toContainText('점수 노트 없음');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  await expect(page.getByTestId('explicit-play-result')).toContainText('1 / 0');
});

test('반복은 새 instance로 0ms부터 시작하고 reset·돌아가기 뒤 canvas와 자원을 남기지 않는다', async ({ page }) => {
  await openLab(page); await installProbe(page);
  await page.getByRole('button', { name: '자동 입력', exact: true }).click();
  await page.getByRole('checkbox', { name: '반복', exact: true }).check();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '1', { timeout: 20000 });
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await page.getByRole('checkbox', { name: '반복', exact: true }).uncheck();
  await page.getByRole('button', { name: '처음부터 다시', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '2');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page.locator('canvas')).toHaveCount(0);
  const state = await probe(page);
  expect(state.preparations).toHaveLength(3);
  expect(state.audioDisposals).toBe(3); expect(state.rendererDisposals).toBe(3);
  expect(state.keyboardListeners).toBe(0);
});

test('1500ms 바디 중간에서 재개하면 0ms로 되감고 준비 hold와 별개로 탭을 다시 눌러 4항목12점을 정산한다', async ({ page }) => {
  await openLab(page); await installProbe(page);
  await page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    useGameStore.getState().updateSettings({ playSpeed: .25 });
  });
  await page.getByRole('button', { name: '수동 연습', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  await waitAt(page, 1000); await page.keyboard.down('q');
  await waitAt(page, 1500);
  await expect.poll(async () => (await probe(page)).session?.score.processedNotes).toBe(2);
  const firstPass = await probe(page);
  expect(firstPass.session?.score).toMatchObject({ processedNotes: 2, earnedScore: 6, finalDenominatorWeight: 12 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.up('q');
  await page.keyboard.press('Escape');
  const preparation = await expectPreparation(page, 0);
  expect(preparationTarget(preparation.preparations.at(-1)!)).toBeCloseTo(0, 5);
  expect(preparation.session?.score).toMatchObject({ earnedScore: 0, finalDenominatorWeight: 12 });
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await expectPreparation(page, 0);
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  expect((await probe(page)).session?.score.processedNotes).toBe(0);
  // Preparation hold must not synthesize the 1000ms tap down.
  await page.keyboard.up('w');
  await waitAt(page, 1000); await page.keyboard.down('w');
  await waitAt(page, 2000); await page.keyboard.up('w');
  await waitAt(page, 3000); await page.keyboard.down('e'); await page.keyboard.up('e');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-earned')).toHaveText('12');
  await expect(page.getByTestId('explicit-settled')).toHaveText('4 / 4');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  const state = await probe(page);
  expect(state.preparations).toHaveLength(2);
  expect(state.preparations.every(preparation => preparation.visibleAfterMs! >= 3000)).toBe(true);
  expect(state.playbackStarts.at(-1)?.[0]).toBe(1000);
  expect(state.hitCount - firstPass.hitCount).toBe(4);
  expect(state.flightCount - firstPass.flightCount).toBe(4);
  expect(state.session?.effects).toHaveLength(4);
  expect(state.keyboardListeners).toBe(0);
});

test('실제 튜토리얼 preview는 저작 차트를 controller로 반복하고 초기화·닫기가 Pixi 자원을 정리한다', async ({ page }) => {
  await openLab(page); await installProbe(page);
  await page.getByRole('button', { name: '튜토리얼 미리보기', exact: true }).click();
  const preview = page.getByTestId('explicit-tutorial-preview');
  await expect(preview).toHaveAttribute('data-iteration', '1', { timeout: 20000 });
  expect((await probe(page)).hitCount).toBeGreaterThanOrEqual(4);
  await page.getByRole('checkbox', { name: '미리보기 반복', exact: true }).uncheck();
  await expect(preview.getByRole('status')).toContainText('완료', { timeout: 15000 });
  await page.getByRole('checkbox', { name: '미리보기 반복', exact: true }).check();
  await expect(preview).toHaveAttribute('data-iteration', '2');
  await expect(preview.getByRole('status')).toContainText('재생 중');
  await page.getByRole('button', { name: '미리보기 초기화', exact: true }).click();
  await expect(preview).toHaveAttribute('data-iteration', '0');
  await page.getByRole('button', { name: '미리보기 닫기', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect((await probe(page)).rendererDisposals).toBeGreaterThanOrEqual(2);
});

test('새 스킨 PNG 읽기 실패는 시작 오류를 표시하고 오디오를 시작하지 않으며 돌아가기가 가능하다', async ({ page }) => {
  await openLab(page); await installProbe(page);
  await page.route('**/*explicit*/*.png', route => route.abort());
  await page.route('**/classic-explicit/**/*.png', route => route.abort());
  await page.getByRole('button', { name: '자동 입력', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'error', { timeout: 15000 });
  expect((await probe(page)).starts).toEqual([]);
  expect((await probe(page)).preparations).toEqual([]);
  expect((await probe(page)).audioDisposals).toBe(1);
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page.locator('[data-lab-page="explicit-playtest"]')).toBeVisible();
});

test('실제 한 키 Double 연주는 부분 실패·성공을 WebGL에 표시하고 모든6항목을 정산한다', async ({ page }, info) => {
  await openLab(page); await installProbe(page);
  await page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    useGameStore.getState().updateSettings({ playSpeed: .25 });
  });
  await page.getByRole('combobox').selectOption('double');
  await page.getByRole('button', { name: '수동 연습', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  const waitAt = (at: number) => page.waitForFunction(target => (window as unknown as { explicitPlayProbe: { judgmentAt: number } }).explicitPlayProbe.judgmentAt >= target,
    at, { polling: 10, timeout: 20000 });
  await waitAt(1000); await page.keyboard.down('q');
  await waitAt(2000); await page.keyboard.up('q');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('6 / 6');
  await expect(page.getByTestId('explicit-earned')).toHaveText('9');
  await expect(page.getByTestId('explicit-bodies')).toHaveText('1 / 1');
  expect(await probe(page)).toMatchObject({ partialFailure: true, partialSuccess: true, webgl: true, keyboardListeners: 0 });
  await page.getByTestId('explicit-play-result').screenshot({ path: info.outputPath('manual-double-partial-result.png') });
});

test('일반 탭·Release도 실제 Q/E 입력으로 auto와 같은 4항목12점을 정산한다', async ({ page }, info) => {
  await openLab(page); await installProbe(page);
  await page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    useGameStore.getState().updateSettings({ playSpeed: .25 });
  });
  await page.getByRole('button', { name: '수동 연습', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  const waitAt = (at: number) => page.waitForFunction(target => (window as unknown as { explicitPlayProbe: { judgmentAt: number } }).explicitPlayProbe.judgmentAt >= target,
    at, { polling: 10, timeout: 20000 });
  await waitAt(1000); await page.keyboard.down('q');
  await waitAt(2000); await page.keyboard.up('q');
  await waitAt(3000); await page.keyboard.down('e'); await page.keyboard.up('e');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('4 / 4');
  await expect(page.getByTestId('explicit-earned')).toHaveText('12');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  expect(await probe(page)).toMatchObject({ hitCount: 4, flightCount: 4, webgl: true, keyboardListeners: 0 });
  // 캡처가 다음 키 입력을 늦추지 않도록 실제 연주와 정산이 끝난 뒤 저장한다.
  await page.getByTestId('explicit-play-result').screenshot({ path: info.outputPath('manual-regular-result.png') });
});
