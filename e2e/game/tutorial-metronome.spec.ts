import { expect, test } from '@playwright/test';

interface AudioTrace {
  contexts: number;
  closed: number;
  clicks: number[];
}

test('튜토리얼 두 슬롯은 context 하나를 공유하고 4박 준비·시연 전환·레슨 변경 뒤 닫으면 소리를 해제한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: {
      preset: 'tkl', isFirstLaunch: false, masterVolume: 0.4,
    } }, version: 0 }));
    const trace = { contexts: 0, closed: 0, clicks: [] as number[] };
    Object.assign(window, { tutorialAudioTrace: trace });
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); trace.contexts++; }
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (at = 0) => { trace.clicks.push(at); start(at); };
        return oscillator;
      }
      close() { trace.closed++; return super.close(); }
    };
  });
  const readAudio = () => page.evaluate(() => (window as unknown as { tutorialAudioTrace: AudioTrace }).tutorialAudioTrace);
  await page.goto('/game');
  const start = page.getByRole('button', { name: 'Start', exact: true });
  const help = page.getByRole('button', { name: 'Open tutorial help' });
  await expect(start.or(help).first()).toBeVisible();
  if (await start.isVisible()) await start.click();
  const baseline = await readAudio();
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial', exact: true });
  await dialog.locator('[data-tutorial-index-item="single-note"]').click();
  const active = dialog.locator('[data-tutorial-preview-slot="active"][data-tutorial-preview-id="single-note"] [data-tutorial-engine]');
  // count-in 안에 여러 상호작용을 끝내려 하지 않고 확정된 출력 원점을 기다린다.
  await expect(active).toHaveAttribute('data-tutorial-loop-origin-now', /\d/);
  const firstOrigin = Number(await active.getAttribute('data-tutorial-loop-origin-now'));
  await expect.poll(() => active.evaluate(node => performance.now() >= Number((node as HTMLElement).dataset.tutorialLoopOriginNow))).toBe(true);
  await expect(active).toHaveAttribute('data-tutorial-count-in', 'false', { timeout: 5000 });
  await dialog.getByRole('button', { name: '직접 입력', exact: true }).click();
  await page.keyboard.press('KeyE');
  await expect(active).toHaveAttribute('data-tutorial-input-mode', 'directInput');
  await expect.poll(async () => (await readAudio()).clicks.length).toBeGreaterThan(4);
  expect((await readAudio()).contexts - baseline.contexts).toBe(1);

  await dialog.getByRole('button', { name: '시연', exact: true }).click();
  await expect(active).toHaveAttribute('data-tutorial-input-mode', 'demonstration', { timeout: 5000 });
  await expect(active).toHaveAttribute('data-tutorial-count-in', 'false');
  await dialog.locator('[data-tutorial-index-item="double-note"]').click();
  const next = dialog.locator('[data-tutorial-preview-slot="active"][data-tutorial-preview-id="double-note"] [data-tutorial-engine]');
  await expect.poll(async () => Number(await next.getAttribute('data-tutorial-loop-origin-now'))).toBeGreaterThan(firstOrigin);
  await expect(next).toHaveAttribute('data-tutorial-count-in', 'false', { timeout: 5000 });
  expect((await readAudio()).contexts - baseline.contexts).toBe(1);
  await dialog.getByRole('button', { name: 'Close tutorial help' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readAudio()).closed - baseline.closed).toBe(1);
  const clicksAtClose = (await readAudio()).clicks.length;
  await page.waitForTimeout(600);
  expect((await readAudio()).clicks).toHaveLength(clicksAtClose);
});
