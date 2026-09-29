import { expect, test, type Page } from '@playwright/test';

const chartFile = {
  name: 'skin-comparison.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    version: 3,
    meta: { title: '실제 차트 비교', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: 'song.wav', previewAudioFile: '', offsetMs: 0 },
    notes: [
      { type: 'single', lane: 1, beat: '4' },
      { type: 'long', lane: 1, beat: '4', endBeat: '6' },
      { type: 'double', lane: 2, beat: '4' },
      { type: 'doubleLong', lane: 2, beat: '4', endBeat: '6' },
    ],
    trillZones: [], events: [{ type: 'bpm', beat: '0', bpm: 120 }],
  })),
};

function audioFile() {
  const rate = 8000;
  const buffer = Buffer.alloc(44 + rate * 4 * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
  return { name: 'song.wav', mimeType: 'audio/wav', buffer };
}

async function openPanel(page: Page) {
  await page.goto('/lab/note-assets?design=classic&version=v004');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await page.getByText('실제 차트로 연주', { exact: true }).click();
}

test('v004에서 JSON·음원으로 직접 연주하고 v001 재시도·복귀 후에도 파일과 게임 설정을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openPanel(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem('not4k-settings'));
  const play = page.getByRole('button', { name: '선택한 스킨으로 연주', exact: true });
  await expect(play).toBeDisabled();
  await page.getByLabel('차트 JSON', { exact: true }).setInputFiles(chartFile);
  await expect(play).toBeDisabled();
  await page.getByLabel('음원', { exact: true }).setInputFiles(audioFile());
  await expect(play).toBeEnabled();

  // Observe the actual renderer and store; input and judgment remain the real game path.
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    const moduleUrl = (path: string) => performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path;
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(moduleUrl('/src/game/stores/gameStore.ts'));
    win.__labStoreBefore = useGameStore.getState();
    win.__labGetStore = useGameStore.getState;
    const { GameClock }: typeof import('../../src/game/time/GameClock') = await import(moduleUrl('/src/game/time/GameClock.ts'));
    const judgmentTime = GameClock.prototype.judgmentTimeMs;
    GameClock.prototype.judgmentTimeMs = function () {
      const time = judgmentTime.call(this);
      if (document.querySelector('[data-testid="gameplay-canvas"]')) win.__labJudgmentTime = time;
      return time;
    };
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(moduleUrl('/src/game/renderer/GameRenderer.ts'));
    const render = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      const result = render.apply(this, args);
      const self = this as unknown as { app: { canvas: HTMLCanvasElement }; skinManager: { skinId: string } };
      if (self.app.canvas.dataset.testid === 'gameplay-canvas') {
        win.__labSkin = self.skinManager.skinId;
        win.__labTime = args[0];
      }
      return result;
    };
    const showJudgment = GameRenderer.prototype.showJudgment;
    GameRenderer.prototype.showJudgment = function (...args) {
      const self = this as unknown as { app: { canvas: HTMLCanvasElement } };
      if (self.app.canvas.dataset.testid === 'gameplay-canvas' && args[0] !== 'miss') win.__labHit = true;
      return showJudgment.apply(this, args);
    };
  });

  await play.click();
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__labSkin)).toBe('classic-v004');
  await expect(page.locator('[data-tutorial-preview-canvas]')).toHaveCount(0);
  await page.waitForFunction(() => Number((window as unknown as Record<string, unknown>).__labJudgmentTime) >= 1990, { }, { polling: 'raf' });
  await page.keyboard.down('q');
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__labHit)).toBe(true);
  await page.waitForFunction(() => Number((window as unknown as Record<string, unknown>).__labTime) >= 3050, { }, { polling: 'raf' });
  await page.keyboard.up('q');
  await expect(page.getByRole('status')).toContainText('최근 연주 · 실제 차트 비교');
  await expect(play).toBeEnabled();
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await page.locator('.asset-lab-chart-play').screenshot({ path: testInfo.outputPath('chart-play-result.png') });

  await page.getByLabel('버전', { exact: true }).selectOption('v001');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await play.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__labSkin)).toBe('classic-v001');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  const firstCanvas = await page.getByTestId('gameplay-canvas').elementHandle();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => firstCanvas!.evaluate(element => element.isConnected)).toBe(false);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit', exact: true }).click();
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await expect(play).toBeEnabled();
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v001');
  expect(await page.evaluate(() => localStorage.getItem('not4k-settings'))).toBe(settingsBefore);
  expect(await page.evaluate(() => {
    const win = window as unknown as { __labGetStore: () => unknown; __labStoreBefore: unknown };
    return win.__labGetStore() === win.__labStoreBefore;
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('잘못된 차트·음원 선택은 오류를 표시하고 유효한 파일로 교체하면 연주 버튼이 활성화된다', async ({ page }) => {
  await openPanel(page);
  const play = page.getByRole('button', { name: '선택한 스킨으로 연주', exact: true });
  await page.getByLabel('차트 JSON', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('유효한 JSON이 아닙니다');
  await expect(play).toBeDisabled();
  await page.getByLabel('차트 JSON', { exact: true }).setInputFiles(chartFile);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('음원', { exact: true }).setInputFiles({ name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('음원을 읽을 수 없습니다');
  await expect(play).toBeDisabled();
  await page.getByLabel('음원', { exact: true }).setInputFiles(audioFile());
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(play).toBeEnabled();
  await page.getByLabel('차트 JSON', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(play).toBeDisabled();
});
