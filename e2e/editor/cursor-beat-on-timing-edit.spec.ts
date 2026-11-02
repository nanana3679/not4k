import { test, expect, type Page } from '@playwright/test';
import { canvasPosition } from './explicitEditorTestHelpers';
import { editorTestChart, openEditor } from './editorTestSetup';

// 정지 중 타이밍 값(오프셋·BPM)을 바꾸면 커서는 수정 직전 박을 유지하고 그 박의 새 음원 시각으로 옮겨진다(RFD 0099).
// 음원(0.5초)이 있어야 재생할 수 있다. 120 BPM 4/4에서는 타임라인이 1마디(2000ms)라 커서는 그 안에서 고른다.
// 음원이 있으면 타임라인은 음원 길이를 덮는 마디까지라, BPM을 낮추면 마디 수가 줄어 커서가 타임라인 끝에 묶일 수 있다.

test.setTimeout(60_000);

type PlaybackProbeWindow = Window & { editorPlaybackStartMs?: number };

/** 다음 play() 직후 재생기 위치를 기록한다. 이후 rAF·테스트 대기 시간의 진행량은 포함하지 않는다. */
async function captureNextPlaybackStart(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const path = '/src/editor/playback/PlaybackController.ts';
    const { PlaybackController } = await import(path);
    const original = PlaybackController.prototype.play;
    delete (window as PlaybackProbeWindow).editorPlaybackStartMs;
    PlaybackController.prototype.play = function (this: { readonly currentTimeMs: number }) {
      try {
        original.call(this);
        (window as PlaybackProbeWindow).editorPlaybackStartMs = this.currentTimeMs;
      } finally {
        PlaybackController.prototype.play = original;
      }
    };
  });
}

async function cursor(page: Page): Promise<{ currentTimeMs: number; isPlaying: boolean }> {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { currentTimeMs, isPlaying } = (await import(path)).useEditorStore.getState();
    return { currentTimeMs, isPlaying };
  });
}

async function timelineEndMs(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().timelineRangeMs?.totalTimelineMs ?? null;
  });
}

/** Select 모드에서 0박의 초기 BPM 변경 이벤트(5번째 열)를 더블클릭해 모달에서 BPM을 `bpm`으로 바꾼다. */
async function editInitialBpm(page: Page, bpm: number): Promise<void> {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  let position = await canvasPosition(page, 5, 0);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  if (position.y < box.y || position.y > box.y + box.height) {
    await canvas.dispatchEvent('wheel', { deltaY: position.y - (box.y + box.height / 2) });
    position = await canvasPosition(page, 5, 0);
  }
  await page.mouse.dblclick(position.x, position.y);
  await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
  await page.getByLabel('BPM', { exact: true }).fill(String(bpm));
  await page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true }).locator('..').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toHaveCount(0);
}

/** 왼쪽 마디 레일(레인 왼쪽 seek 영역)을 눌러 120 BPM 기준 `at`박 높이로 커서를 옮기고 옮긴 시각을 돌려준다. */
async function seekOnRail(page: Page, at: number): Promise<number> {
  const box = (await page.locator('canvas').boundingBox())!;
  const { y } = await canvasPosition(page, 1, at);
  await page.mouse.click(box.x + 4, y);
  const { currentTimeMs } = await cursor(page);
  const offsetMs = await page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().chart.meta.offsetMs as number;
  });
  // 화소 단위로 고르므로 박 위치와 몇 ms 다를 수 있다. 이후 기대값은 이 실제 시각에서 계산한다.
  expect(currentTimeMs).toBeGreaterThan(offsetMs + at * 500 - 50);
  expect(currentTimeMs).toBeLessThan(offsetMs + at * 500 + 50);
  return currentTimeMs;
}

/** Space로 재생했다가 잠시 뒤 다시 Space로 멈춘다. */
async function playBriefly(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

test.describe('정지 중 타이밍 값 수정 뒤 커서 박 유지', () => {
  for (const offsetMs of [2000, -500]) {
    test(`offset ${offsetMs}ms 차트를 열면 커서는 0박인 ${offsetMs}ms에 있고 첫 Space도 거기서 재생한다`, async ({ page }) => {
      const chart = editorTestChart();
      chart.meta.offsetMs = offsetMs;
      await openEditor(page, { chart, audio: true });
      await expect.poll(async () => (await cursor(page)).currentTimeMs).toBe(offsetMs);

      await captureNextPlaybackStart(page);
      await playBriefly(page);
      const start = await page.evaluate(() => (window as PlaybackProbeWindow).editorPlaybackStartMs);
      // −500ms의 허용 범위는 −501～−450ms라, 0ms에서 잘못 재생하면 반드시 실패한다.
      expect(start).toBeGreaterThan(offsetMs - 1);
      expect(start).toBeLessThan(offsetMs + 50);
    });
  }

  test('재생·일시정지 뒤 레일로 2박(약 1000ms)에 seek하고 초기 BPM을 120→60으로 바꾸면 커서가 같은 2박의 약 2000ms로 옮겨지고 Space 재생이 거기서 시작한다', async ({ page }) => {
    await openEditor(page, { audio: true });
    await playBriefly(page);
    const before = await seekOnRail(page, 2);

    await editInitialBpm(page, 60);

    // 2박 = 120 BPM에서 before ms, 60 BPM에서 before × 2 ms(오프셋 0)
    const expected = before * 2;
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(expected, 3);

    await playBriefly(page);
    // 재생이 수정 전 시각(before ≈ 1000ms)에서 시작했다면 짧게 재생한 뒤에도 expected(≈ 2000ms)보다 앞이다.
    // 헤드리스에서 음원 시각이 흐르지 않아도 재생 루프는 시작 위치를 보고하므로 이 비교는 성립한다.
    const after = (await cursor(page)).currentTimeMs;
    expect(after).toBeGreaterThan(expected - 1);
    expect(after).toBeLessThan(expected + 1500);
  });

  test('2박(약 1000ms)에 커서를 두고 오프셋을 0→100으로 바꾸면 커서가 100ms 뒤로 옮겨지고 Undo하면 원래 시각으로 돌아온다', async ({ page }) => {
    await openEditor(page, { audio: true });
    const before = await seekOnRail(page, 2);

    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Offset', exact: true }).click();
    const offsetInput = page.getByLabel('Audio offset milliseconds', { exact: true });
    await offsetInput.fill('100');
    await offsetInput.press('Enter');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(offsetInput).toHaveCount(0);

    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(before + 100, 3);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(before, 3);
  });

  test('960 BPM(2마디, 끝 500ms)에서 6박(약 375ms)에 둔 커서는 초기 BPM을 120으로 낮추면 1마디(4박)로 줄어든 타임라인의 끝 2000ms에 묶이고, Undo하면 4박(250ms)이 아니라 원래 6박의 시각으로 돌아온다', async ({ page }) => {
    const chart = editorTestChart();
    chart.events = [{ type: 'bpm', beat: '0', bpm: 960, editorLane: 1 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 }];
    await openEditor(page, { chart, audio: true });
    // 음원 길이(0.5초)가 반영돼야 타임라인이 2마디(8박 = 500ms)가 된다. 그 전에는 기본 16마디다.
    await expect.poll(() => timelineEndMs(page)).toBe(500);
    // seekOnRail은 120 BPM의 박 단위로 높이를 고르므로 0.75 = 375ms = 960 BPM의 6박이다.
    const before = await seekOnRail(page, 0.75);

    // 6박 = 120 BPM에서 3000ms지만 타임라인은 음원을 덮는 1마디(4박, 끝 2000ms)로 줄어 그 끝에 묶인다.
    await editInitialBpm(page, 120);
    await expect.poll(() => timelineEndMs(page)).toBe(2000);
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(2000, 3);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await cursor(page)).currentTimeMs).toBeCloseTo(before, 3);
  });
});
