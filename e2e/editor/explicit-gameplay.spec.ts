import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV4, ExtraNotesJson } from '../../src/shared/chart';
import { editorTestChart, openEditor, readUploadedJson, EDITOR_TEST_AUDIO_FILE, isChartUploadPath, isExtraUploadPath } from './editorTestSetup';
import { canvasPosition, drag, notes } from './explicitEditorTestHelpers';
import { installProbe as installManualClock, probe, waitAt, preparationTarget, expectPreparation } from '../explicitPlaybackProbe';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(90000);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: {
    isFirstLaunch: false, skinId: 'classic', masterVolume: 0, scrollSpeed: 200, renderHeight: 600, gearMotion: false, playSpeed: .25,
  } }, version: 0 })));
});

async function startExplicit(page: Page, fromCursor = false) {
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await expect(page.getByRole('button', { name: '커서부터 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: fromCursor ? '커서부터 시작' : '처음부터 시작 · 명시 차트', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
}

async function playRequest(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    const request = useGameStore.getState().explicitPlay!;
    return { startTimeMs: request.startTimeMs, document: request.document, returnUrl: request.returnUrl,
      bodies: request.compiled.bodies, scoreItems: request.compiled.scoreItems };
  });
}

test('새 에디터 Double 제작·Undo·저장·reload 후 처음부터 실제 두 키 down/up으로 6항목을 정산하고 에디터로 돌아온다', async ({ page }, info) => {
  const initial = await openEditor(page, { audio: true });
  const tool = page.locator('select').filter({ has: page.locator('option[value="single"]') });
  await tool.selectOption('double');
  await page.getByRole('button', { name: 'Grace', exact: true }).click();
  await drag(page, 1, 2, 4);
  const created = await notes(page);
  expect(created).toMatchObject([{ type: 'tap', kind: 'double' }, { type: 'body', holdCount: 2 }, { type: 'release', count: 2 }]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await notes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await notes(page)).toEqual(created);
  await tool.selectOption('tick');
  const position = await canvasPosition(page, 1, 3); await page.mouse.click(position.x, position.y);
  const authored = await notes(page); expect(authored).toHaveLength(4);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const bodyPosition = await canvasPosition(page, 1, 2.5); await page.mouse.click(bodyPosition.x, bodyPosition.y);
  await page.keyboard.press('ArrowRight');
  expect((await notes(page)).map(note => note.lane)).toEqual([2, 2, 2, 2]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await notes(page)).toEqual(authored);
  await page.getByRole('button', { name: 'Save, unsaved changes', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible({ timeout: 15000 });
  const main = readUploadedJson(initial.supabaseWrites.find(write => isChartUploadPath(write.path))!) as ChartJsonV4;
  const extra = readUploadedJson(initial.supabaseWrites.find(write => isExtraUploadPath(write.path))!) as ExtraNotesJson;
  expect(main.version).toBe(4);
  const reloaded = await openEditor(page, { chart: main, extra, audio: true });
  expect(await notes(page)).toEqual(authored);
  await installManualClock(page);
  await startExplicit(page);
  await waitAt(page, 1000); await page.keyboard.down('q'); await page.keyboard.down('w');
  await waitAt(page, 2000); await page.keyboard.up('q'); await page.keyboard.up('w');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('6 / 6');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('18');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  await expect(page.getByTestId('explicit-earned')).toHaveText('18');
  await expect(page.getByTestId('explicit-dependent-zero')).toHaveText('0');
  await expect(page.getByTestId('explicit-bodies')).toHaveText('2 / 0');
  await page.getByTestId('explicit-play-result').screenshot({ path: info.outputPath('editor-manual-explicit-result.png') });
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await notes(page)).toEqual(authored);
  expect(reloaded.supabaseWrites).toEqual([]);
  expect(initial.unexpectedSupabaseRequests).toEqual([]); expect(reloaded.unexpectedSupabaseRequests).toEqual([]);
});

test('1500ms 커서에서 미리 누른 키로 남은 바디를 시작하고 커서의 틱·뒤 Release만 2항목6점으로 정산한다', async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'tap', kind: 'single', lane: 1, beat: '2' },
    { type: 'body', holdCount: 1, lane: 1, beat: '2', endBeat: '4' },
    { type: 'tick', count: 1, lane: 1, beat: '3' },
    { type: 'release', count: 1, lane: 1, beat: '4' },
  ] };
  const extra: ExtraNotesJson = { version: 3, extraLaneCount: 1,
    extraNotes: [{ type: 'single', extraLane: 1, beat: '0', grace: false }] };
  const editor = await openEditor(page, { chart, extra, audio: true });
  const before = await notes(page);
  await page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { useEditorStore } = await import(path) as typeof import('../../src/editor/stores/editorStore');
    useEditorStore.getState().setCurrentTimeMs(1500);
  });
  await installManualClock(page);
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await page.getByRole('button', { name: '커서부터 시작', exact: true }).click();
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation', { timeout: 20000 });
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-settled', '0');
  await page.keyboard.down('q');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 10000 });
  const request = await page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    const { explicitPlay } = useGameStore.getState();
    return { startTimeMs: explicitPlay?.startTimeMs, notes: explicitPlay?.document.notes,
      returnUrl: explicitPlay?.returnUrl, body: explicitPlay?.compiled.bodies[0],
      scoreIds: explicitPlay?.compiled.scoreItems.map(item => item.id) };
  });
  expect(request.startTimeMs).toBe(1500);
  expect(request.notes).toEqual(before);
  expect(request.returnUrl).toBe('/editor?songId=e2e-editor-song&difficulty=normal');
  expect(request.body).toMatchObject({ source: { noteIndex: 1 }, startMs: 1500, endMs: 2000 });
  expect(request.scoreIds).toEqual(['n2:tick:0', 'n3:release:0']);
  await waitAt(page, 2000);
  await page.keyboard.up('q');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('2 / 2');
  await expect(page.getByTestId('explicit-earned')).toHaveText('6');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('6');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  await expect(page.getByTestId('explicit-dependent-zero')).toHaveText('0');
  await expect(page.getByTestId('explicit-bodies')).toHaveText('1 / 0');
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await notes(page)).toEqual(before);
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

for (const auto of [false, true]) test(`${auto ? 'Auto' : '수동'} 4500ms 재개는 곡 시간 3000ms를 되감아 prefix ${auto ? 6 : 9}점만 남기고 ${auto ? '버린 성공을' : '뒤 Miss·바디 실패를'} 다시 정산한다`, async ({ page }, info) => {
  const prefixCount = auto ? 2 : 3;
  const totalCount = auto ? 6 : 7;
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'tap', kind: 'single', lane: 1, beat: '2' },
    { type: 'body', holdCount: 1, lane: 1, beat: '2', endBeat: '8' },
    { type: 'tick', count: 1, lane: 1, beat: '5/2' },
    { type: 'tick', count: 1, lane: 1, beat: '5' },
    { type: 'release', count: 1, lane: 1, beat: '8' },
    { type: 'tap', kind: 'single', lane: 2, beat: '4' },
    { type: 'tap', kind: 'single', lane: 2, beat: '11' },
    { type: 'body', holdCount: 1, lane: 3, beat: '1', endBeat: '5/2' },
    ...(!auto ? [{ type: 'tap' as const, kind: 'single' as const, lane: 2 as const, beat: '77/25', grace: true }] : []),
  ], events: [...editorTestChart().events, ...(auto ? [{ type: 'auto' as const, beat: '0', endBeat: '12', editorLane: 3 }] : [])] };
  const extra: ExtraNotesJson = { version: 3, extraLaneCount: 1,
    extraNotes: [{ type: 'single', extraLane: 1, beat: '3', grace: false }] };
  const editor = await openEditor(page, { chart, extra, audio: true });
  const originalNotes = await notes(page);
  await installManualClock(page);
  await startExplicit(page);
  const originalRequest = await playRequest(page);
  if (!auto) {
    await waitAt(page, 1000); await page.keyboard.down('q');
    // Leave 60 song ms for a real frame to process this future 1540ms Grace tap before T around1500ms.
    await waitAt(page, 1440); await page.keyboard.down('e'); await page.keyboard.up('e');
    await waitAt(page, 1900); await page.keyboard.up('q');
  }
  await waitAt(page, 4500);
  const firstPass = await probe(page);
  expect(firstPass.session?.score).toMatchObject({ processedNotes: totalCount - 1, totalNotes: totalCount,
    earnedScore: auto ? 15 : 9, finalDenominatorWeight: totalCount * 3, judgmentCounts: { miss: auto ? 0 : 3 } });
  expect(firstPass.session?.snapshot.bodyUnits.map(unit => unit.state)).toEqual(auto ? ['complete', 'complete'] : ['failed', 'failed']);
  const prefixFacts = firstPass.session!.facts.filter(fact => fact.confirmedAt < 1500);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'paused');
  const pausedAudio = (await probe(page)).pauses.at(-1)!;
  const pausedSongMs = pausedAudio.positionMs - pausedAudio.latencyMs * pausedAudio.rate;
  expect(pausedSongMs).toBeGreaterThanOrEqual(4500);
  expect(pausedSongMs).toBeLessThan(4700);
  await page.keyboard.press('Escape');
  const preparing = await expectPreparation(page, prefixCount);
  const target = preparationTarget(preparing.preparations.at(-1)!);
  expect(target).toBeGreaterThanOrEqual(1500);
  expect(target).toBeLessThan(auto ? 1600 : 1540);
  // AudioEngine.pause is sampled just after the runtime chooses T from the same real clock.
  expect(Math.abs(target - (pausedSongMs - 3000))).toBeLessThan(30);
  expect(preparing.session?.score).toMatchObject({ processedNotes: prefixCount, totalNotes: totalCount, earnedScore: prefixCount * 3,
    finalDenominatorWeight: totalCount * 3, judgmentCounts: { miss: auto ? 0 : 1 } });
  expect(preparing.session?.snapshot.items.filter(item => item.state !== 'success').every(item => item.state === 'pending')).toBe(true);
  expect(preparing.session?.facts.filter(fact => fact.confirmedAt < 1500)).toEqual(prefixFacts);
  if (!auto) {
    const earlyTap = preparing.session!.snapshot.items.find(item => item.sourceNoteIndex === 8)!;
    expect(earlyTap).toMatchObject({ state: 'success', grade: 'perfect' });
    expect(originalRequest.scoreItems.find(item => item.id === earlyTap.id)!.timeMs).toBeGreaterThan(target);
    expect(preparing.session!.facts.find(fact => fact.id === earlyTap.settlementFactId)!.confirmedAt).toBeLessThan(target);
  }
  expect(preparing.session?.snapshot.bodyUnits[0].state).not.toBe('failed');
  expect(preparing.session?.snapshot.bodyUnits[1].state).toBe(auto ? 'complete' : 'failed');
  expect(preparing.hitCount).toBe(firstPass.hitCount);
  expect(preparing.flightCount).toBe(firstPass.flightCount);
  expect(await playRequest(page)).toEqual(originalRequest);
  if (!auto) await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await expectPreparation(page, prefixCount);
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 10000 });
  const resumed = await probe(page);
  expect(resumed.playbackStarts.at(-1)?.[0]).toBeCloseTo(target, 5);
  expect(resumed.hitCount).toBe(firstPass.hitCount);
  expect(resumed.flightCount).toBe(firstPass.flightCount);
  if (!auto) {
    await waitAt(page, 2000); await page.keyboard.down('e'); await page.keyboard.up('e');
    await waitAt(page, 4000); await page.keyboard.up('w');
    await waitAt(page, 5500); await page.keyboard.down('e'); await page.keyboard.up('e');
  }
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText(`${totalCount} / ${totalCount}`);
  await expect(page.getByTestId('explicit-earned')).toHaveText(String(totalCount * 3));
  await expect(page.getByTestId('explicit-denominator')).toHaveText(String(totalCount * 3));
  await expect(page.getByTestId('explicit-dependent-zero')).toHaveText('0');
  await expect(page.getByTestId('explicit-bodies')).toHaveText(auto ? '2 / 0' : '1 / 1');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText(auto ? '0' : '1');
  const final = await probe(page);
  expect(final.hitCount - firstPass.hitCount).toBe(4);
  expect(final.flightCount - firstPass.flightCount).toBe(4);
  expect(final.session?.effects.filter(effect => effect.hitGrade !== null)).toHaveLength(totalCount);
  expect(final.session?.facts.filter(fact => fact.kind === 'settlement')).toHaveLength(totalCount);
  expect(final.preparations.every(preparation => preparation.visibleAfterMs! >= 3000)).toBe(true);
  expect(final).toMatchObject({ keyboardListeners: 0, rendererDisposals: 1, audioDisposals: 1, webgl: true });
  await page.getByTestId('explicit-play-result').screenshot({ path: info.outputPath(`rewind-${auto ? 'auto' : 'manual'}-result.png`) });
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await notes(page)).toEqual(originalNotes);
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('커서1500ms에서 시작해 2300ms에 재개하면 1500ms 하한·원본 source·aux·6점 분모를 보존하고 준비 재정지도 같은 목표를 쓴다', async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'tap', kind: 'single', lane: 1, beat: '2' },
    { type: 'body', holdCount: 1, lane: 1, beat: '2', endBeat: '5' },
    { type: 'tick', count: 1, lane: 1, beat: '4' },
    { type: 'release', count: 1, lane: 1, beat: '5' },
  ] };
  const extra: ExtraNotesJson = { version: 3, extraLaneCount: 1,
    extraNotes: [{ type: 'single', extraLane: 1, beat: '0', grace: false }] };
  const editor = await openEditor(page, { chart, extra, audio: true });
  const originalNotes = await notes(page);
  await page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { useEditorStore } = await import(path) as typeof import('../../src/editor/stores/editorStore');
    useEditorStore.getState().setCurrentTimeMs(1500);
  });
  await installManualClock(page);
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await page.getByRole('button', { name: '커서부터 시작', exact: true }).click();
  await expectPreparation(page, 0);
  await page.keyboard.down('q');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 10000 });
  const originalRequest = await playRequest(page);
  expect(originalRequest).toMatchObject({ startTimeMs: 1500, returnUrl: '/editor?songId=e2e-editor-song&difficulty=normal' });
  expect(originalRequest.document.notes).toEqual(originalNotes);
  expect(originalRequest.scoreItems.map(item => item.id)).toEqual(['n2:tick:0', 'n3:release:0']);
  expect(originalRequest.bodies[0]).toMatchObject({ source: { noteIndex: 1 }, startMs: 1500, endMs: 2500 });
  await waitAt(page, 2300);
  const firstPass = await probe(page);
  expect(firstPass.session?.score).toMatchObject({ processedNotes: 1, earnedScore: 3, finalDenominatorWeight: 6 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.up('q'); await page.keyboard.press('Escape');
  const preparing = await expectPreparation(page, 0);
  expect(preparationTarget(preparing.preparations.at(-1)!)).toBeCloseTo(1500, 5);
  expect(preparing.session?.score).toMatchObject({ earnedScore: 0, totalNotes: 2, finalDenominatorWeight: 6 });
  await page.keyboard.down('w');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('Escape');
  const restarted = await expectPreparation(page, 0);
  expect(preparationTarget(restarted.preparations.at(-1)!)).toBeCloseTo(1500, 5);
  expect(restarted.hitCount).toBe(firstPass.hitCount);
  expect(restarted.flightCount).toBe(firstPass.flightCount);
  expect(await playRequest(page)).toEqual(originalRequest);
  await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'playing', { timeout: 10000 });
  await waitAt(page, 2500); await page.keyboard.up('w');
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('2 / 2');
  await expect(page.getByTestId('explicit-earned')).toHaveText('6');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('6');
  await expect(page.getByTestId('explicit-bodies')).toHaveText('1 / 0');
  await expect(page.getByTestId('explicit-play-result').locator('[data-grade="miss"]')).toHaveText('0');
  const final = await probe(page);
  expect(final.hitCount - firstPass.hitCount).toBe(2);
  expect(final.flightCount - firstPass.flightCount).toBe(2);
  expect(final.preparations).toHaveLength(3);
  expect(final.preparations[0].visibleAfterMs).toBeGreaterThanOrEqual(3000);
  expect(final.preparations[1].visibleAfterMs).toBeNull();
  expect(final.preparations[2].visibleAfterMs).toBeGreaterThanOrEqual(3000);
  expect(final).toMatchObject({ keyboardListeners: 0, rendererDisposals: 1, audioDisposals: 1 });
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  expect(await notes(page)).toEqual(originalNotes);
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

for (const fromCursor of [false, true]) test(`fromCursor=${fromCursor}에서 커서 앞 mixed main의 legacy single은 문서·커서·저장 상태와 메뉴를 보존한다`, async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'tap', kind: 'single', lane: 1, beat: '2' }, { type: 'single', lane: 4, beat: '0', grace: false },
  ] };
  const editor = await openEditor(page, { chart, audio: true }); const before = await notes(page);
  await page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { useEditorStore } = await import(path) as typeof import('../../src/editor/stores/editorStore');
    useEditorStore.getState().setCurrentTimeMs(1500);
  });
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await page.getByRole('button', { name: fromCursor ? '커서부터 시작' : '처음부터 시작 · 명시 차트', exact: true }).click();
  await expect(page.getByText(/명시 차트 컴파일 실패/)).toBeVisible();
  await expect(page.getByRole('button', { name: '커서부터 시작', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/editor\?/); await expect(page.getByTestId('explicit-play')).toHaveCount(0);
  expect(await notes(page)).toEqual(before); expect(editor.supabaseWrites).toEqual([]);
});

test('legacy aux는 저장한 그대로 보존하며 explicit main만 auto 물리입력으로 3항목9점을 정산한다', async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'tap', kind: 'single', lane: 1, beat: '2' },
    { type: 'body', holdCount: 1, lane: 1, beat: '2', endBeat: '4' },
    { type: 'tick', count: 1, lane: 1, beat: '3' }, { type: 'release', count: 1, lane: 1, beat: '4' },
  ], events: [...editorTestChart().events, { type: 'auto', beat: '0', endBeat: '6', editorLane: 3 }] };
  const extra: ExtraNotesJson = { version: 3, extraLaneCount: 1, extraNotes: [{ type: 'single', extraLane: 1, beat: '2', grace: false }] };
  const editor = await openEditor(page, { chart, extra, audio: true }); const before = await notes(page);
  await startExplicit(page);
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('explicit-settled')).toHaveText('3 / 3');
  await expect(page.getByTestId('explicit-earned')).toHaveText('9');
  await expect(page.getByTestId('explicit-denominator')).toHaveText('9');
  const request = await page.evaluate(async () => {
    const path = '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(path) as typeof import('../../src/game/stores/gameStore');
    const state = useGameStore.getState();
    return { notes: state.explicitPlay?.document.notes, count: state.explicitPlay?.compiled.totalJudgments, result: state.lastResult };
  });
  expect(request.notes).toEqual(before); expect(request.count).toBe(3); expect(request.result).toBeNull();
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page.locator('canvas')).toHaveCount(1); expect(await notes(page)).toEqual(before);
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('aux의 소속 없는 틱은 새 테스트 버튼과 저장을 함께 차단하여 원본문서 위반을 숨기지 않는다', async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: '2' }] };
  const editor = await openEditor(page, { chart, audio: true, extra: { version: 4, extraLaneCount: 1,
    extraNotes: [{ type: 'tick', count: 1, extraLane: 1, beat: '2' }] } });
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await expect(page.getByRole('button', { name: '처음부터 시작 · 명시 차트', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '커서부터 시작', exact: true })).toBeDisabled();
  await page.mouse.click(10, 100);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]); await expect(page.getByTestId('explicit-play')).toHaveCount(0);
});

for (const replaceAudio of [false, true]) test(`${replaceAudio ? '음원 교체·Meta 적용과 ' : ''}노트 1개 추가 뒤 테스트 플레이에서 복귀하면 재생·미저장 상태를 유지하고 이탈 취소${replaceAudio ? ' 뒤 프리뷰를 재생성하여 저장한다' : ' 시 에디터에 남는다'}`, async ({ page }) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: '2' }],
    events: [...editorTestChart().events, { type: 'auto', beat: '0', endBeat: '4', editorLane: 3 }] };
  const editor = await openEditor(page, { chart, audio: true, songTiming: {
    bpmChanges: [{ beat: '0', bpm: 120 }],
    timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0,
  } });
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  if (replaceAudio) {
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Meta', exact: true }).click();
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(EDITOR_TEST_AUDIO_FILE);
    const modal = page.getByRole('heading', { name: 'Chart Metadata', exact: true }).locator('..');
    await expect(modal.getByText('Replace Audio', { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
  }
  const position = await canvasPosition(page, 2, 3); await page.mouse.click(position.x, position.y);
  const edited = await notes(page);
  expect(edited).toHaveLength(2);
  const unsavedSave = page.getByRole('button', { name: 'Save, unsaved changes', exact: true });
  await expect(unsavedSave).toBeVisible();

  await startExplicit(page);
  await expect(page.getByTestId('explicit-play-result')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: '돌아가기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  await expect(page.locator('canvas')).toHaveCount(1);
  // 돌아온 에디터는 음원을 다시 읽는 동안 화면 전체를 덮는 로딩 표시로 입력을 막는다.
  await expect(page.getByRole('status').filter({ hasText: 'Loading audio...' })).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(/Audio load failed/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await notes(page)).toEqual(edited);
  // 페이지가 다시 마운트돼도 savedChartJson은 불러온 차트의 값이다. 돌아온 차트로 다시 만들면 여기서 'Save'가 된다.
  await expect(unsavedSave).toBeVisible();

  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Songs', exact: true }).click();
  const leaveConfirm = page.getByRole('heading', { name: 'Unsaved Changes', exact: true });
  await expect(leaveConfirm).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(leaveConfirm).toHaveCount(0);
  await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=normal$/);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await notes(page)).toEqual(edited);
  await expect(unsavedSave).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
  if (replaceAudio) {
    await unsavedSave.click();
    await expect(page.getByText('Song saved', { exact: true })).toBeVisible();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    expect(editor.supabaseWrites.filter(write => /\/audio[^/]*\.wav$/.test(write.path))).toHaveLength(1);
    expect(editor.supabaseWrites.filter(write => /\/preview[^/]*\.wav$/.test(write.path))).toHaveLength(1);
    expect(editor.supabaseWrites.filter(write => write.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  }
});
