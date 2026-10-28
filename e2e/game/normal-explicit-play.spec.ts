import { test, expect } from '@playwright/test';
import { normalDocument, openNormalSong, readNormalState, startNormalSong, SONG_ID } from '../normalPlayTestHelpers';
import { probe, waitAt, preparationTarget, expectPreparation } from '../explicitPlaybackProbe';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(60000);

test('곡 선택의 v4 main·구형 aux를 읽어 AutoEvent로 4항목12점을 정산하고 공식 결과와 Back을 표시한다', async ({ page }) => {
  const fixture = await openNormalSong(page);
  await startNormalSong(page);
  const playing = await readNormalState(page);
  expect(playing.selectedSongId).toBe(SONG_ID);
  expect(playing.request?.document).toEqual(fixture.document);
  expect((await probe(page)).preparations).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  const state = await probe(page); const result = (await readNormalState(page)).result;
  expect(state.session?.score).toMatchObject({ processedNotes: 4, totalNotes: 4, earnedScore: 12, finalDenominatorWeight: 12 });
  expect(result).toMatchObject({ achievementRate: state.session!.score.achievementRate,
    judgmentCounts: state.session!.score.judgmentCounts, isFullCombo: true });
  await expect(page.getByText('100.00%', { exact: true })).toBeVisible();
  await expect(page.getByText('SSS', { exact: true })).toBeVisible();
  await expect(page.getByText('Full Combo:', { exact: true }).locator('..')).toHaveText(/YES/);
  await expect(page.getByText(/Max Combo/i)).toHaveCount(0);
  expect(state).toMatchObject({ webgl: true, explicitCharts: 1, warmups: 1, hitCount: 4, rendererDisposals: 1, audioDisposals: 1, keyboardListeners: 0 });
  expect(state.spriteCount).toBeGreaterThan(0);
  expect(fixture.reads.some(path => path.endsWith('/normal.extra.json'))).toBe(true);
  expect(fixture.unexpected).toEqual([]); expect(fixture.errors).toEqual([]);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
  await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
});

test('첫 시작과 Retry는 에셋 준비 뒤 음악 준비 없이 0ms에서 새 세션을 시작해 4항목만 정산한다', async ({ page }) => {
  await openNormalSong(page);
  await startNormalSong(page);
  await waitAt(page, 1100);
  // 오디오 시계가 1100ms를 넘어도 부하로 프레임이 밀리면 세션이 1000ms 자동 입력을 아직 처리하지 않았을 수 있다.
  await expect.poll(async () => (await probe(page)).session?.score.processedNotes ?? 0, { timeout: 10000 }).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
  expect((await probe(page)).session?.score.processedNotes).toBe(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '1');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  const restarted = await probe(page);
  expect(restarted.preparations).toEqual([]);
  expect(restarted.starts).toEqual([0, 0]);
  expect(restarted.explicitCharts).toBe(2);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await readNormalState(page)).result?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
  expect(await probe(page)).toMatchObject({ rendererDisposals: 2, audioDisposals: 2, keyboardListeners: 0 });
});

for (const speed of [0.5, 2]) {
  test(`${speed}배속 일반 재생을 4.5초에서 Resume하면 곡3초를 되감고 실제3초 준비 뒤 4항목을 중복 없이 정산한다`, async ({ page }) => {
    await openNormalSong(page, normalDocument(), { duration: 7, playSpeed: speed });
    await startNormalSong(page); await waitAt(page, 4500);
    const beforePause = await probe(page);
    expect(beforePause.session!.score.processedNotes).toBe(4);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    const paused = await probe(page); const audioPause = paused.pauses.at(-1)!;
    const target = Math.max(0, audioPause.positionMs - audioPause.latencyMs * speed - 3000);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation');
    const preparing = await probe(page);
    expect(preparationTarget(preparing.preparations.at(-1)!)).toBeCloseTo(target, 5);
    expect(preparing.chartVisible).toBe(false);
    expect(preparing.session!.score.processedNotes).toBe(paused.session!.score.processedNotes);
    expect(preparing.session!.score.processedNotes).toBeLessThan(beforePause.session!.score.processedNotes);
    await expect(page.getByText(/^[321]$/)).toHaveCount(0);
    const settled = preparing.session!.score.processedNotes;
    await page.waitForTimeout(300);
    await expectPreparation(page, settled);
    await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 15000 });
    expect((await probe(page)).preparations.at(-1)!.visibleAfterMs).toBeGreaterThanOrEqual(3000);
    await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 20000 });
    expect((await readNormalState(page)).result?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
    expect((await probe(page)).session?.score.earnedScore).toBe(12);
  });
}

test('1.1초 Pause의 Resume은 원래 시작0ms가 하한이고 준비 중 다시 Pause해도 같은0ms로 준비한다', async ({ page }) => {
  await openNormalSong(page);
  await startNormalSong(page); await waitAt(page, 1100); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const first = await expectPreparation(page, 0);
  expect(preparationTarget(first.preparations.at(-1)!)).toBeCloseTo(0, 5);
  await page.keyboard.down('w'); await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const second = await expectPreparation(page, 0);
  expect(preparationTarget(second.preparations.at(-1)!)).toBeCloseTo(0, 5);
  expect(second.preparations).toHaveLength(2);
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await readNormalState(page)).result?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
});

for (const hold of [false, true]) {
  test(`무점수 Body를 ${hold ? 'Q키로 유지하면 완료1·Miss0' : '놓치면 Miss1'}이며 공식 결과의 달성률·랭크는 숨긴다`, async ({ page }) => {
    const document = normalDocument(false);
    document.notes = document.notes.filter(note => note.type === 'body');
    await openNormalSong(page, document, { duration: 3 });
    await startNormalSong(page);
    if (hold) await page.keyboard.down('q');
    await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
    if (hold) await page.keyboard.up('q');
    const state = await probe(page);
    expect(state.session?.score).toMatchObject({ totalNotes: 0, finalDenominatorWeight: 0, judgmentCounts: { miss: hold ? 0 : 1 } });
    expect(state.session?.snapshot.bodyUnits.filter(unit => unit.state === (hold ? 'complete' : 'failed'))).toHaveLength(1);
    await expect(page.getByText(/\d+\.\d+%/)).toHaveCount(0);
    await expect(page.getByText(/^(SSS|SS|S|A|B|C|D|F)$/)).toHaveCount(0);
    await expect(page.getByText('MISS:', { exact: true }).locator('..')).toHaveText(`MISS:${hold ? 0 : 1}`);
    await expect(page.getByText('Full Combo:', { exact: true }).locator('..')).toHaveText(`Full Combo:${hold ? 'YES' : 'NO'}`);
  });
}

test('점수 Point2개를 모두 놓치면 공식 결과는 0.00%·F·Miss2다', async ({ page }) => {
  const document = normalDocument(false);
  document.notes = document.notes.filter(note => note.type === 'point');
  await openNormalSong(page, document); await startNormalSong(page);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('0.00%', { exact: true })).toBeVisible();
  await expect(page.getByText('F', { exact: true })).toBeVisible();
  expect((await probe(page)).session?.score).toMatchObject({ earnedScore: 0, finalDenominatorWeight: 6 });
  expect((await readNormalState(page)).result?.judgmentCounts.miss).toBe(2);
});

test('저장된 legacy main은 명확한 오류로 거부하고 오디오·공식 결과·원본문서를 변경하지 않는다', async ({ page }) => {
  const document = normalDocument(false);
  document.notes = [{ type: 'single', lane: 1, beat: { n: 2, d: 1 } },
    { type: 'long', lane: 1, beat: { n: 2, d: 1 }, endBeat: { n: 4, d: 1 }, holdOnly: true }];
  const before = structuredClone(document); const fixture = await openNormalSong(page, document);
  const stateBefore = await readNormalState(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This chart uses an older note format.', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Back to Song Select', exact: true })).toBeVisible();
  expect((await probe(page)).starts).toEqual([]); expect((await probe(page)).preparations).toEqual([]);
  expect((await readNormalState(page)).result).toEqual(stateBefore.result);
  expect((await readNormalState(page)).request).toEqual(stateBefore.request);
  expect(document).toEqual(before);
  const preserved = await page.evaluate(async id => {
    const path = '/src/supabase/storage.ts';
    const { fetchChart } = await import(path) as typeof import('../../src/supabase/storage');
    return fetchChart(id, 'normal');
  }, SONG_ID);
  expect(preserved).toEqual(before);
  expect(fixture.reads.every(request => request.startsWith('GET ') || request.startsWith('OPTIONS '))).toBe(true);
  expect(fixture.unexpected).toEqual([]);
  await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Song Select', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
});

test('명시 sustain이 Body 밖에 있으면 전체 문서 검증에서 오디오 시작 전에 거부한다', async ({ page }) => {
  const document = normalDocument();
  document.notes.push({ type: 'sustain', lane: 3, count: 1, beat: { n: 3, d: 1 } });
  await openNormalSong(page, document);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to Song Select', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toContainText('This chart contains invalid notes or chart data.');
  expect((await probe(page)).starts).toEqual([]); expect((await probe(page)).preparations).toEqual([]);
  expect((await readNormalState(page)).result).toBeNull();
});

test('음악 준비 중 Quit은 예약 오디오·키 리스너·GPU를 정리하고 3초 뒤에도 플레이를 다시 열지 않는다', async ({ page }) => {
  await openNormalSong(page); await startNormalSong(page);
  expect((await probe(page)).runtimeKeyboardListeners).toBe(4);
  await waitAt(page, 1100); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expectPreparation(page, 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
  const disposed = await probe(page);
  expect(disposed).toMatchObject({ rendererDisposals: 1, audioDisposals: 1, runtimeKeyboardListeners: 0 });
  await page.waitForTimeout(3200);
  await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
  expect((await probe(page)).starts).toEqual(disposed.starts);
  expect((await readNormalState(page)).result).toBeNull();
});

test('9초 음원의 gameplay2～6초 범위는 source offset2·duration4로 첫 시작과 Retry를 재생한다', async ({ page }) => {
  const range = { startTime: 2, endTime: 6, fadeInTime: .2, fadeOutTime: .3 };
  await openNormalSong(page, normalDocument(), { duration: 9, range });
  await page.evaluate(() => {
    const starts: { offset: number | undefined; duration: number | undefined }[] = [];
    Object.assign(window, { normalSourceStarts: starts });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      if (this.buffer && this.buffer.duration > 1) starts.push({ offset, duration });
      start.call(this, when, offset, duration);
    };
  });
  await startNormalSong(page);
  expect((await readNormalState(page)).range).toEqual(range);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-iteration', '1');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
  expect(await page.evaluate(() => (window as unknown as { normalSourceStarts: unknown[] }).normalSourceStarts))
    .toEqual([{ offset: 2, duration: 4 }, { offset: 2, duration: 4 }]);
  expect((await probe(page)).preparations).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 15000 });
  expect((await readNormalState(page)).result?.judgmentCounts).toMatchObject({ perfect: 4, miss: 0 });
});

test('문서 응답을 기다리던 LoadingScreen을 떠나면 늦은 응답이 일반 재생·오디오·결과를 만들지 않는다', async ({ page }) => {
  let release!: () => void;
  const holdChart = new Promise<void>(resolve => { release = resolve; });
  const fixture = await openNormalSong(page, normalDocument(), { holdChart });
  try {
    await page.evaluate(() => {
      const state = { closes: 0 };
      Object.assign(window, { normalLoadingProbe: state });
      const close = AudioContext.prototype.close;
      AudioContext.prototype.close = async function () {
        await close.call(this);
        state.closes++;
      };
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Loading...', { exact: true })).toBeVisible();
    await expect.poll(() => fixture.reads.some(path => path.endsWith('/normal.json'))).toBe(true);
    await page.evaluate(async () => {
      const path = '/src/game/stores/gameStore.ts';
      const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
      useGameStore.getState().setScreen('title');
    });
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    const completed = page.waitForResponse(response => response.url().endsWith('/normal.json'));
    release(); await (await completed).finished();
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { normalLoadingProbe: { closes: number } }).normalLoadingProbe.closes)).toBeGreaterThan(0);
    expect((await readNormalState(page))).toMatchObject({ screen: 'title', request: null, result: null });
    expect((await probe(page)).starts).toEqual([]);
    expect((await probe(page)).preparations).toEqual([]);
    await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
