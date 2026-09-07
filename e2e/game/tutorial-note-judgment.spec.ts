import { test, expect, type Page } from '@playwright/test';

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800, liftPercent: 0, suddenPercent: 0, targetFps: 60,
      offsetMs: 0, preset: 'tkl', isFirstLaunch: false,
    },
  },
  version: 0,
});

async function openTutorial(page: Page) {
  await page.goto('/game');
  await page.evaluate((settings) => localStorage.setItem('not4k-settings', settings), NON_FIRST_LAUNCH_SETTINGS);
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  await page.getByRole('button', { name: 'Open tutorial help' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('TutorialPreviewPlayer 실제 loop tail 판정', () => {
  test('connected overlap은 loopMs 경계 release를 두 개 session에서 각각 Perfect로 정산한다', async ({ page }) => {
    test.setTimeout(30000);
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const dialog = await openTutorial(page);
    const trace = await page.evaluate(async () => {
      // Vite HMR은 실제 재생기가 가져오는 모듈에 ?t=를 붙일 수 있다.
      // 같은 소스를 별도 URL로 import하면 다른 class를 계측하게 된다.
      const sessionUrl = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/game/judgment/NoteJudgmentSession.ts');
      if (!sessionUrl) throw new Error('튜토리얼이 로드한 NoteJudgmentSession 모듈을 찾을 수 없습니다');
      const { NoteJudgmentSession }: typeof import('../../src/game/judgment/NoteJudgmentSession') = await import(sessionUrl);
      const sessions = new WeakMap<object, number>();
      const batches: Array<{ sessionId: number; at: number; events: Array<{ kind: string; grade: string; inputAt: number | null; confirmedAt: number; consumed: boolean }>; achievementRate: number; miss: number }> = [];
      let nextSessionId = 0;
      const proto = NoteJudgmentSession.prototype as typeof NoteJudgmentSession.prototype & { __tutorialTrace?: boolean };
      if (!proto.__tutorialTrace) {
        const original = proto.processBatch;
        proto.processBatch = function(at, inputs) {
          const session = this as unknown as { events: readonly { kind: string; grade: string; inputAt: number | null; confirmedAt: number; consumed: boolean }[] };
          const sessionId = sessions.get(this) ?? nextSessionId++;
          sessions.set(this, sessionId);
          const result = original.call(this, at, inputs);
          const events = session.events.filter(event => event.confirmedAt === at)
            .map(({ kind, grade, inputAt, confirmedAt, consumed }) => ({ kind, grade, inputAt, confirmedAt, consumed }));
          if (events.length) {
            const state = (this as unknown as { score: { getState(): { achievementRate: number; judgmentCounts: { miss: number } } } }).score.getState();
            batches.push({ sessionId, at, events, achievementRate: state.achievementRate, miss: state.judgmentCounts.miss });
          }
          return result;
        };
        proto.__tutorialTrace = true;
      }
      const { TUTORIAL_PREVIEWS }: typeof import('../../src/game/screens/songSelect/tutorialPreviewChart') = await import(new URL('/src/game/screens/songSelect/tutorialPreviewChart.ts', location.origin).href);
      const preview = TUTORIAL_PREVIEWS.find(item => item.id === 'connected-long-note-overlap');
      if (!preview) throw new Error('connected-long-note-overlap preview missing');
      (globalThis as typeof globalThis & { __tutorialTraceBatches?: typeof batches }).__tutorialTraceBatches = batches;
      return { loopMs: preview.loopMs };
    });
    await dialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]').click();
    const active = dialog.locator('[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]');
    const diagram = active.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(diagram.locator('[data-tutorial-diagram-ok="true"]')).toBeVisible();
    await diagram.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(diagram).toBeHidden();

    const deadline = Date.now() + trace.loopMs * 3 + 2000;
    while (Date.now() < deadline) {
      const ok = dialog.locator('[data-tutorial-diagram-modal="true"]:visible [data-tutorial-diagram-ok="true"]');
      if (await ok.count()) await ok.last().click();
      const observedSessions = await page.evaluate(loopMs => new Set(((globalThis as typeof globalThis & { __tutorialTraceBatches?: Array<{ sessionId: number; at: number }> }).__tutorialTraceBatches ?? []).filter(batch => batch.at === loopMs).map(batch => batch.sessionId)).size, trace.loopMs);
      if (observedSessions >= 2) break;
      await page.waitForTimeout(100);
    }

    const result = await page.evaluate(() =>
      (globalThis as typeof globalThis & { __tutorialTraceBatches?: Array<{ sessionId: number; at: number; events: Array<{ kind: string; grade: string; inputAt: number | null; confirmedAt: number; consumed: boolean }>; achievementRate: number; miss: number }> }).__tutorialTraceBatches ?? [],
    );
    const tailBatches = result.filter(batch => batch.at === trace.loopMs);
    const sessionIds = [...new Set(tailBatches.map(batch => batch.sessionId))];
    expect(sessionIds.length, JSON.stringify({ pageErrors, batches: result.map(batch => ({ sessionId: batch.sessionId, at: batch.at, kinds: batch.events.map(event => event.kind) })) })).toBeGreaterThanOrEqual(2);
    for (const sessionId of sessionIds) {
      expect(tailBatches.filter(batch => batch.sessionId === sessionId)).toHaveLength(1);
      expect(tailBatches.find(batch => batch.sessionId === sessionId)?.events).toHaveLength(1);
    }
    const tail = tailBatches.flatMap(batch => batch.events.map(event => ({ ...event, sessionId: batch.sessionId, achievementRate: batch.achievementRate, miss: batch.miss })));
    expect(tail.every(event => event.kind === 'release' && event.grade === 'perfect' && event.inputAt === trace.loopMs && event.confirmedAt === trace.loopMs && event.consumed)).toBe(true);
    expect(tail.every(event => event.achievementRate === 100 && event.miss === 0)).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
