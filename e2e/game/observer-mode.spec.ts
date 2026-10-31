import { test, expect as baseExpect, type Page } from '@playwright/test';
import { normalDocument, openNormalSong, SONG_ID } from '../normalPlayTestHelpers';
import { probe, waitAt } from '../explicitPlaybackProbe';
import type { ChartDocument } from '../../src/shared/types/chart';

const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.setTimeout(120_000);

/** Q를 미리 유지하면 0.5·1·1.5초 tick을 실제 입력으로 처리한다. 좁은 tap 창에 맞춘 전송은 필요 없다. */
function observerDocument(): ChartDocument {
  return { ...normalDocument(false),
    meta: { ...normalDocument(false).meta, title: 'Observer route' },
    notes: [
      { type: 'body', lane: 1, holdCount: 1, beat: { n: 0, d: 1 }, endBeat: { n: 4, d: 1 } },
      ...[1, 2, 3].map(n => ({ type: 'tick' as const, lane: 1, count: 1 as const, beat: { n, d: 1 } })),
    ],
  };
}

async function openObserverSong(page: Page, options: Parameters<typeof openNormalSong>[2] = {}) {
  const fixture = await openNormalSong(page, observerDocument(), { duration: 30, ...options });
  // 일시적인 result 전이도 놓치지 않도록 실제 store를 읽기 전용으로 구독한다.
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore } = await import(/* @vite-ignore */ path) as typeof import('../../src/game/stores/gameStore');
    const screens: string[] = [useGameStore.getState().screen];
    const read = () => {
      const state = useGameStore.getState();
      return { screen: state.screen, selectedSongId: state.selectedSongId, selectedDifficulty: state.selectedDifficulty,
        observerLoaded: state.observerPlay !== null, normalLoaded: state.normalPlay !== null,
        result: state.lastResult, screens: [...screens] };
    };
    useGameStore.subscribe(state => { if (screens.at(-1) !== state.screen) screens.push(state.screen); });
    Object.assign(window, { readObserverRoute: read });
  });
  return fixture;
}

function readRoute(page: Page) {
  return page.evaluate(() => (window as unknown as { readObserverRoute: () => {
    screen: string; selectedSongId: string | null; selectedDifficulty: string | null;
    observerLoaded: boolean; normalLoaded: boolean; result: unknown; screens: string[];
  } }).readObserverRoute());
}

async function expectObserverPlaying(page: Page) {
  await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByTestId('observer-canvas')).toBeVisible();
  await expect.poll(async () => (await probe(page)).audioPlaying).toBe(true);
}

async function enterObserver(page: Page) {
  await page.getByRole('button', { name: 'Observer', exact: true }).click();
  await expectObserverPlaying(page);
  expect(await readRoute(page)).toMatchObject({ screen: 'observer', observerLoaded: true, normalLoaded: false, result: null });
  expect((await readRoute(page)).screens).toContain('loading');
}

async function waitFrames(page: Page, count = 10) {
  await page.evaluate(count => new Promise<void>(resolve => {
    const frame = () => { if (--count === 0) resolve(); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }), count);
}

async function exitObserver(page: Page, fixture: Awaited<ReturnType<typeof openObserverSong>>) {
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Observer', exact: true })).toBeEnabled();
  await expect(page.getByTestId('observer-canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toHaveCount(0);
  const route = await readRoute(page);
  expect(route).toMatchObject({ screen: 'songSelect', selectedSongId: SONG_ID, selectedDifficulty: 'normal',
    observerLoaded: false, normalLoaded: false, result: null });
  expect(route.screens).not.toContain('result');
  expect(fixture.reads.filter(request => !/^(GET|OPTIONS) /.test(request))).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
}

async function startManualHold(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.down('KeyQ');
  const nextSpan = (await probe(page)).fadedSpans.length + 1;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expectObserverPlaying(page);
  return nextSpan;
}

test('Observer 진입은 Auto On·1.0x로 즉시 재생하고 Auto Off는 수동 HUD를 0부터 표시한다', async ({ page }) => {
  const fixture = await openObserverSong(page, { playSpeed: .5 });
  await enterObserver(page);
  const auto = page.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await probe(page)).hitCount).toBeGreaterThan(0);
  const before = await probe(page);
  expect(before.fadedSpans).toEqual([{ positionMs: 0, rate: 1, fromMs: 0, toMs: 30_000 }]);
  expect(before.preparations).toEqual([]);
  expect(before.hud.filter(update => update.span === 1).every(update => update.combo === 0 && update.accuracy === null)).toBe(true);
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  const manual = await probe(page);
  expect(manual.hud.slice(before.hud.length)[0]).toEqual({ span: 1, combo: 0, accuracy: 0 });
  expect(manual.fadedSpans).toEqual(before.fadedSpans);
  expect(manual.audioPositionMs).toBeGreaterThanOrEqual(before.audioPositionMs);
  await exitObserver(page, fixture);
});

test('2.5초 전곡이 끝나면 수동 콤보·달성률을 0으로 초기화하고 다음 반복에서도 직접 입력을 집계한다', async ({ page }) => {
  const fixture = await openObserverSong(page, { duration: 2.5 });
  await enterObserver(page);
  const firstManualSpan = await startManualHold(page);
  try {
    // 성공 → 다음 반복 첫 0 → 다음 성공의 이력을 검사한다. poll이 반복 경계를 놓쳐도 남는다.
    await expect.poll(async () => {
      const { hud } = await probe(page);
      const success = hud.find(update => update.span >= firstManualSpan && update.combo > 0 && (update.accuracy ?? 0) > 0);
      if (!success) return false;
      const reset = hud.find(update => update.span > success.span && update.combo === 0 && update.accuracy === 0);
      return !!reset && hud.some(update => update.span === reset.span && update.combo > 0 && (update.accuracy ?? 0) > 0);
    }, { timeout: 45_000 }).toBe(true);
    const state = await probe(page);
    expect(state.fadedSpans.every(span => span.positionMs === 0 && span.fromMs === 0 && span.toMs === 2500 && span.rate === 1)).toBe(true);
    expect(state.hud.filter(update => update.span >= firstManualSpan).every(update => update.combo <= 3)).toBe(true);
    expect(state.preparations).toEqual([]);
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expectObserverPlaying(page);
  } finally { await page.keyboard.up('KeyQ'); }
  await exitObserver(page, fixture);
});

test('수동 집계가 있는 상태에서 Retry를 누르면 Auto Off를 유지하고 0ms·콤보 0·달성률 0으로 재시작한다', async ({ page }) => {
  const fixture = await openObserverSong(page);
  await enterObserver(page);
  const firstManualSpan = await startManualHold(page);
  try {
    await expect.poll(async () => (await probe(page)).hud.some(update =>
      update.span === firstManualSpan && update.combo > 0 && (update.accuracy ?? 0) > 0)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'paused');
    const before = await probe(page);
    expect(before.audioPositionMs).toBeGreaterThan(0);
    expect(before.hud.at(-1)!.combo).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expectObserverPlaying(page);
    const after = await probe(page);
    expect(after.fadedSpans).toHaveLength(before.fadedSpans.length + 1);
    expect(after.fadedSpans.at(-1)).toMatchObject({ positionMs: 0, rate: 1 });
    expect(after.hud.find(update => update.span === after.fadedSpans.length)).toEqual({
      span: after.fadedSpans.length, combo: 0, accuracy: 0,
    });
    expect(after.preparations).toEqual([]);
    expect(after.rendererDisposals).toBe(before.rendererDisposals);
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
  } finally { await page.keyboard.up('KeyQ'); }
  await exitObserver(page, fixture);
});

test('1.2초 이후 Esc로 일시정지하고 다시 Esc를 누르면 되감기 없이 같은 음원 위치에서 재개한다', async ({ page }) => {
  const fixture = await openObserverSong(page);
  await enterObserver(page);
  await waitAt(page, 1200);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'paused');
  const paused = await probe(page);
  expect(paused.audioPlaying).toBe(false);
  expect(paused.pauses).toHaveLength(1);
  expect(paused.audioPositionMs).toBeGreaterThanOrEqual(1200);
  await waitFrames(page);
  expect(await probe(page)).toMatchObject({ audioPlaying: false, audioPositionMs: paused.audioPositionMs, frames: paused.frames });
  await page.keyboard.press('Escape');
  await expectObserverPlaying(page);
  const resumed = await probe(page);
  expect(resumed.resumes).toEqual([paused.audioPositionMs]);
  expect(resumed.fadedSpans).toEqual(paused.fadedSpans);
  expect(resumed.preparations).toEqual([]);
  expect(resumed.sourceStarts).toHaveLength(paused.sourceStarts.length + 1);
  // 실제 AudioBufferSourceNode.start의 offset을 비교해 재개 후 경과 시간에 의존하지 않는다.
  expect(resumed.sourceStarts.at(-1)!.offset).toBeCloseTo(paused.audioPositionMs / 1000, 6);
  await expect.poll(async () => (await probe(page)).audioPositionMs).toBeGreaterThan(paused.audioPositionMs + 200);
  await expect.poll(async () => (await probe(page)).frames).toBeGreaterThan(paused.frames);
  await exitObserver(page, fixture);
});

test('Exit는 선택한 2번째 곡·normal 난이도로 리절트·Supabase 쓰기 없이 복귀하고 재진입은 Auto On이다', async ({ page }) => {
  const fixture = await openObserverSong(page);
  // 첫 곡·첫 난이도로 돌아가는 잘못된 복원을 잡기 위해 선택 대상을 각각 2번째에 둔다.
  const easy = { id: `${SONG_ID}-easy`, song_id: SONG_ID, difficulty_label: 'easy', difficulty_level: 1 };
  const songs = [
    { ...fixture.song, id: 'decoy', title: 'First song', charts: [{ ...easy, id: 'decoy-easy', song_id: 'decoy' }] },
    { ...fixture.song, charts: [easy, ...fixture.song.charts] },
  ];
  await page.route(/\/rest\/v1\/songs(?:\?|$)/, async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: songs });
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('First song', { exact: true }).last()).toBeVisible();
  await page.getByText(fixture.song.title, { exact: true }).last().click();
  await page.getByText('INFILTRATION Lv.3', { exact: true }).first().click();
  await enterObserver(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await exitObserver(page, fixture);
  // 선택을 건드리지 않고 재진입한다. UI 포커스가 복원되지 않으면 easy/다른 곡 요청으로 실패한다.
  await enterObserver(page);
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await readRoute(page)).toMatchObject({ selectedSongId: SONG_ID, selectedDifficulty: 'normal' });
  expect((await probe(page)).fadedSpans.at(-1)).toMatchObject({ positionMs: 0, rate: 1 });
  await exitObserver(page, fixture);
});

test('Observer 문서 로딩 중 Esc는 곡 선택으로 돌아가거나 일시정지하지 않고 응답 후 재생한다', async ({ page }) => {
  let release!: () => void;
  const holdChart = new Promise<void>(resolve => { release = resolve; });
  const fixture = await openObserverSong(page, { holdChart });
  try {
    await page.getByRole('button', { name: 'Observer', exact: true }).click();
    await expect.poll(() => fixture.reads.some(request => request.endsWith('/normal.json'))).toBe(true);
    await expect(page.getByText('Loading...', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await waitFrames(page);
    expect((await readRoute(page)).screen).toBe('loading');
    await expect(page.getByTestId('observer-screen')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toHaveCount(0);
    expect(await probe(page)).toMatchObject({ fadedSpans: [], pauses: [], resumes: [] });
    release();
    await expectObserverPlaying(page);
    await exitObserver(page, fixture);
  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

test('Observer 오디오 준비 중 Esc는 무시되고 준비 완료 후 Auto On으로 일시정지 없이 재생한다', async ({ page }) => {
  const fixture = await openObserverSong(page);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/audio/AudioEngine.ts') ?? '/src/game/audio/AudioEngine.ts';
    const { AudioEngine } = await import(/* @vite-ignore */ path) as typeof import('../../src/game/audio/AudioEngine');
    const prepare = AudioEngine.prototype.prepareForPlayback;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const held = { waiting: false, release };
    Object.assign(window, { observerAudioPreparation: held });
    AudioEngine.prototype.prepareForPlayback = function () {
      held.waiting = true;
      return Promise.all([prepare.call(this), gate]).then(() => undefined);
    };
  });
  const release = async () => {
    if (!page.isClosed()) await page.evaluate(() =>
      (window as unknown as { observerAudioPreparation: { release: () => void } }).observerAudioPreparation.release());
  };
  try {
    await page.getByRole('button', { name: 'Observer', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { observerAudioPreparation: { waiting: boolean } }).observerAudioPreparation.waiting)).toBe(true);
    await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'loading');
    await page.keyboard.press('Escape');
    await waitFrames(page);
    await expect(page.getByTestId('observer-screen')).toHaveAttribute('data-phase', 'loading');
    for (const name of ['Auto', 'Pause', 'Retry']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    expect(await probe(page)).toMatchObject({ fadedSpans: [], pauses: [], resumes: [] });
    await release();
    await expectObserverPlaying(page);
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await probe(page)).pauses).toEqual([]);
    await exitObserver(page, fixture);
  } finally { await release(); }
});
