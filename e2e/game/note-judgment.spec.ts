import { test, expect } from '@playwright/test';
import { normalDocument, openNormalSong, readNormalState, startNormalSong } from '../normalPlayTestHelpers';
import { probe } from '../explicitPlaybackProbe';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(60000);

test('AutoEvent의 탭·틱·Release3개는 무점수 Body와 함께 100% 결과를 만들고 Max Combo를 표시하지 않는다', async ({ page }) => {
  const document = normalDocument();
  document.notes = document.notes.filter(note => note.lane === 1);
  const fixture = await openNormalSong(page, document, { duration: 3 });
  await startNormalSong(page);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('100.00%', { exact: true })).toBeVisible();
  await expect(page.getByText('Full Combo:', { exact: true }).locator('..')).toHaveText(/YES/);
  await expect(page.getByText(/Max Combo/i)).toHaveCount(0);
  expect((await readNormalState(page)).result?.judgmentCounts).toMatchObject({ perfect: 3, miss: 0 });
  expect((await probe(page)).session?.score).toMatchObject({ earnedScore: 9, finalDenominatorWeight: 9 });
  expect(fixture.errors).toEqual([]);
});

test('공식 결과에서 Back 후 같은 명시 차트를 다시 재생해도 4항목12점 결과는 누적되지 않는다', async ({ page }) => {
  const fixture = await openNormalSong(page);
  await startNormalSong(page);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  const first = (await readNormalState(page)).result;
  expect(first?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await startNormalSong(page);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await readNormalState(page)).result).toEqual(first);
  await expect(page.getByText('100.00%', { exact: true })).toHaveCount(1);
  expect((await probe(page)).preparations).toEqual([]);
  expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});
