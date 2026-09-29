import { expect, test, type Page } from '@playwright/test';

const SONG_ID = 'dev-skin-song';
const chart = {
  version: 3,
  meta: { title: 'Supabase 스킨 비교', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: 'audio.wav', previewAudioFile: '', offsetMs: 0 },
  notes: [
    { type: 'single', lane: 1, beat: '4' }, { type: 'long', lane: 1, beat: '4', endBeat: '8' },
    { type: 'double', lane: 2, beat: '4' }, { type: 'doubleLong', lane: 2, beat: '4', endBeat: '8' },
  ],
  trillZones: [], events: [{ type: 'bpm', beat: '0', bpm: 120 }],
};

function silentWav() {
  const rate = 8000;
  const wav = Buffer.alloc(44 + rate * 12 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  return wav;
}

async function openSongs(page: Page) {
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: { isFirstLaunch: false, skinId: 'crystal', masterVolume: 0 } }, version: 0 })));
  // Only the Supabase HTTP boundary is replaced. Song selection and LoadingScreen
  // fetch and decode their data through the regular app flow.
  await page.route('**/rest/v1/songs?**', route => route.fulfill({ json: [{
    id: SONG_ID, title: chart.meta.title, artist: 'test', audio_url: `songs/${SONG_ID}/audio.wav`,
    duration: 12, preview_url: null, preview_start: 0, preview_end: 1, jacket_url: `songs/${SONG_ID}/jacket.svg`,
    gameplay_start: 2, gameplay_end: 10, gameplay_fade_in: 0, gameplay_fade_out: 0,
    charts: [{ id: 'dev-chart', song_id: SONG_ID, difficulty_label: 'NORMAL', difficulty_level: 1 }],
  }] }));
  await page.route(`**/storage/v1/object/public/assets/songs/${SONG_ID}/normal.json`, route => route.fulfill({ json: chart }));
  await page.route(`**/storage/v1/object/public/assets/songs/${SONG_ID}/audio.wav*`, route => route.fulfill({ contentType: 'audio/wav', body: silentWav() }));
  await page.route(`**/storage/v1/object/public/assets/songs/${SONG_ID}/jacket.svg*`, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#163851"/></svg>' }));
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  await expect(page.getByLabel('개발용 스킨')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

async function openSkinSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
  await expect(dialog.getByLabel('개발용 스킨')).toBeVisible();
  return dialog;
}

async function closeSettings(page: Page) {
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
}

test('dev Settings → Skin에서 v005를 고르면 Supabase 곡으로 연주하고 재시도·v001 비교·기본 스킨 복귀를 지원한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openSongs(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem('not4k-settings'));
  await openSkinSettings(page);
  await page.getByLabel('개발용 스킨').selectOption('v005');
  await page.screenshot({ path: testInfo.outputPath('settings-dev-skin.png') });
  await closeSettings(page);

  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => new URL(name).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(url);
    const render = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      const result = render.apply(this, args);
      const self = this as unknown as {
        skinManager: { skinId: string; getTexture: (key: string) => unknown };
        laneAreaX: number;
        noteLayer: { children: Array<{ texture: unknown; x: number; width: number }> };
        longNoteBodyLayer: { children: Array<{ x: number; width: number }> };
      };
      const state = window as unknown as Record<string, unknown>;
      state.__devPlaySkin = self.skinManager.skinId;
      const points = self.noteLayer.children.filter(sprite =>
        ['noteSingle', 'noteDouble'].some(key => sprite.texture === self.skinManager.getTexture(key)));
      if (points.length === 2 && self.longNoteBodyLayer.children.length === 2) {
        const bounds = ({ x, width }: { x: number; width: number }) => ({ x: x - self.laneAreaX, width });
        state.__devNoteBounds = { points: points.map(bounds), bodies: self.longNoteBodyLayer.children.map(bounds) };
      }
      return result;
    };
  });

  const chartResponse = page.waitForResponse(response => response.url().endsWith(`/songs/${SONG_ID}/normal.json`));
  const audioResponse = page.waitForResponse(response => response.url().endsWith(`/songs/${SONG_ID}/audio.wav`) && response.request().resourceType() === 'fetch');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  expect((await chartResponse).status()).toBe(200);
  expect((await audioResponse).status()).toBe(200);
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__devPlaySkin)).toBe('classic-v005');
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__devNoteBounds)).toBeTruthy();
  const bounds = await page.evaluate(() => (window as unknown as {
    __devNoteBounds: { points: Array<{ x: number; width: number }>; bodies: Array<{ x: number; width: number }> };
  }).__devNoteBounds);
  expect(bounds.points).toEqual([{ x: 0, width: 100 }, { x: 100, width: 100 }]);
  bounds.bodies.forEach((body, lane) => {
    expect(body.x).toBeCloseTo(lane * 100 + 2.83, 2);
    expect(body.width).toBeCloseTo(94.34, 2);
    expect(body.x).toBeGreaterThan(bounds.points[lane].x);
    expect(body.x + body.width).toBeLessThan(bounds.points[lane].x + bounds.points[lane].width);
  });

  expect(await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => new URL(name).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(url);
    const state = useGameStore.getState();
    return { title: state.chartData?.meta.title, song: state.selectedSongId, audioDuration: state.audioBuffer?.duration, range: state.selectedPlaybackRange };
  })).toEqual({ title: chart.meta.title, song: SONG_ID, audioDuration: 12, range: { startTime: 2, endTime: 10, fadeInTime: 0, fadeOutTime: 0 } });

  await page.keyboard.press('Escape');
  const oldCanvas = await page.getByTestId('gameplay-canvas').elementHandle();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => oldCanvas!.evaluate(element => element.isConnected)).toBe(false);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit', exact: true }).click();
  await openSkinSettings(page);
  await expect(page.getByLabel('개발용 스킨')).toHaveValue('v005');
  await page.getByLabel('개발용 스킨').selectOption('v001');
  await closeSettings(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__devPlaySkin)).toBe('classic-v001');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit', exact: true }).click();
  await openSkinSettings(page);
  await page.getByLabel('개발용 스킨').selectOption('settings');
  await closeSettings(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__devPlaySkin)).toBe('crystal');
  expect(await page.evaluate(() => localStorage.getItem('not4k-settings'))).toBe(settingsBefore);
  expect(errors).toEqual([]);
});

test('Settings 탭 전환·재열기에서 v004를 유지하고 선택기에서 Esc로 닫으며 새로고침하면 게임 설정으로 복귀한다', async ({ page }) => {
  await openSongs(page);
  const dialog = await openSkinSettings(page);
  const select = page.getByLabel('개발용 스킨');
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await select.selectOption('v004');
  await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await expect(select).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
  await expect(select).toHaveValue('v004');
  await select.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  await openSkinSettings(page);
  await expect(select).toHaveValue('v004');
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await openSkinSettings(page);
  await expect(select).toHaveValue('settings');
});
