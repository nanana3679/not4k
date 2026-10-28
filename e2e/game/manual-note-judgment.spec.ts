import { test, expect } from '@playwright/test';
import { normalDocument, openNormalSong, readNormalState, startNormalSong } from '../normalPlayTestHelpers';
import { probe, waitAt } from '../explicitPlaybackProbe';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(60000);

test('일반 곡의 실제 Q/E down·up은 Point·Body·Sustain·Release를 4항목12점으로 정산한다', async ({ page }) => {
  const fixture = await openNormalSong(page, normalDocument(false), { playSpeed: .25 });
  await startNormalSong(page);
  await waitAt(page, 1000); await page.keyboard.down('q');
  await waitAt(page, 2000); await page.keyboard.up('q');
  await waitAt(page, 3000); await page.keyboard.down('e'); await page.keyboard.up('e');
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 20000 });
  const state = await probe(page); const result = (await readNormalState(page)).result;
  expect(state.session?.score).toMatchObject({ earnedScore: 12, finalDenominatorWeight: 12, processedNotes: 4 });
  expect(result?.judgmentCounts).toEqual(state.session?.score.judgmentCounts);
  expect(result?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
  await expect(page.getByText('100.00%', { exact: true })).toBeVisible();
  expect(state).toMatchObject({ hitCount: 4, flightCount: 4, webgl: true, keyboardListeners: 0 });
  expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});
