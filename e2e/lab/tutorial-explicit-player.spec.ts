import { expect, test, type Page } from '@playwright/test';

// /lab/tutorial-explicit-player는 곡 선택 튜토리얼 재생기(TutorialPreviewPlayer)에 명시 정의를 걸어 명시 판정 엔진으로 반복한다.
// 재생기에는 테스트 훅이 없으므로 실제 GameRenderer·ExplicitNoteRenderer 메서드를 감싸 호출 수와 그린 명시 노트 Sprite 수를 센다
// (실제 WebGL이 필요해 vitest로는 확인할 수 없다). Lab 목록에서 링크로 들어가 같은 모듈 인스턴스를 감싼 채 페이지를 연다.

const SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

interface RendererProbe {
  resets: number;
  explicitCharts: number;
  legacyCharts: number;
  judgmentGroups: number;
  maxExplicitSprites: number;
  loopTimeMs: number;
  successfulJudgments: number;
  lastGrade: string;
}

async function installRendererProbe(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rendererPath = '/src/game/renderer/GameRenderer.ts';
    const explicitPath = '/src/game/renderer/ExplicitNoteRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    const { ExplicitNoteRenderer }: typeof import('../../src/game/renderer/ExplicitNoteRenderer') = await import(explicitPath);
    const probe = { resets: 0, explicitCharts: 0, legacyCharts: 0, judgmentGroups: 0, maxExplicitSprites: 0, loopTimeMs: 0, successfulJudgments: 0, lastGrade: '' };
    (window as unknown as { __tutorialExplicitProbe: typeof probe }).__tutorialExplicitProbe = probe;
    const proto = GameRenderer.prototype;
    const reset = proto.resetTransientState;
    proto.resetTransientState = function () { probe.resets++; return reset.call(this); };
    const setExplicitChart = proto.setExplicitChart;
    proto.setExplicitChart = function (...args) { probe.explicitCharts++; return setExplicitChart.apply(this, args); };
    const setChart = proto.setChart;
    // setExplicitChart도 안에서 노트 없는 setChart를 부르므로 노트가 있는 호출만 구형 차트로 센다.
    proto.setChart = function (...args) {
      if (args[0].length > 0) probe.legacyCharts++;
      return setChart.apply(this, args);
    };
    const showJudgmentGroup = proto.showJudgmentGroup;
    proto.showJudgmentGroup = function (state) {
      probe.judgmentGroups++;
      probe.lastGrade = state.grade;
      if (['perfect', 'great', 'good'].includes(state.grade)) probe.successfulJudgments++;
      return showJudgmentGroup.call(this, state);
    };
    const renderFrame = proto.renderFrame;
    proto.renderFrame = function (...args) {
      // 싱글 탭 시연은 2000ms 반복이며 표시 시각도 같은 길이의 앞 복사본 뒤에서 시작한다.
      probe.loopTimeMs = args[0] % 2000;
      return renderFrame.apply(this, args);
    };
    const render = ExplicitNoteRenderer.prototype.render;
    ExplicitNoteRenderer.prototype.render = function (snapshot, visualTimeMs) {
      const notes = render.call(this, snapshot, visualTimeMs);
      probe.maxExplicitSprites = Math.max(probe.maxExplicitSprites, this.spriteCount);
      return notes;
    };
  });
}

const readProbe = (page: Page) => page.evaluate(() =>
  ({ ...(window as unknown as { __tutorialExplicitProbe: RendererProbe }).__tutorialExplicitProbe }));

test('명시 튜토리얼 재생기 Lab은 탭 시연을 반복마다 Perfect 3으로 정산하고, 바디·릴리즈 시연으로 바꿔도 같은 캔버스에서 경계마다 차트를 다시 걸지 않는다', async ({ page }) => {
  test.setTimeout(60000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((settings) => localStorage.setItem('not4k-settings', settings), SETTINGS);

  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Preview Archive' })).toBeVisible({ timeout: 20000 });
  await installRendererProbe(page);
  await page.locator('a[href="/lab/tutorial-explicit-player"]').first().click();
  await expect(page.locator('[data-lab-page="tutorial-explicit-player"]')).toBeVisible({ timeout: 20000 });

  const canvas = page.locator('[data-tutorial-preview-canvas="true"]');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-tutorial-preview-error="true"]')).toHaveCount(0);

  const result = page.locator('[data-finished-patterns]');
  await expect(result).toHaveAttribute('data-expected-perfect', '3');
  await expect(result).toHaveAttribute('data-finished-patterns', '2', { timeout: 20000 });
  await expect(result).toHaveAttribute('data-last-iteration', '1');
  await expect(result).toHaveAttribute('data-last-perfect', '3');
  await expect(result).toHaveAttribute('data-last-miss', '0');

  // 이미 선택한 시연을 눌러도 재생은 계속되므로 누적 횟수·마지막 결과도 유지한다.
  await page.getByRole('button', { name: '싱글 탭 노트', exact: true }).click();
  expect(Number(await result.getAttribute('data-finished-patterns'))).toBeGreaterThanOrEqual(2);
  expect(Number(await result.getAttribute('data-last-iteration'))).toBeGreaterThanOrEqual(1);
  await expect(result).toHaveAttribute('data-last-perfect', '3');

  const afterTap = await readProbe(page);
  // 차트를 걸 때 한 번만 지우고 건다. 반복 경계(2번)마다 다시 걸거나 판정 글자를 지우지 않는다.
  expect(afterTap).toMatchObject({ resets: 1, explicitCharts: 1, legacyCharts: 0 });
  expect(afterTap.judgmentGroups).toBeGreaterThanOrEqual(6);
  expect(afterTap.maxExplicitSprites).toBeGreaterThan(0);

  await canvas.evaluate((element) => { element.dataset.e2eMarker = 'tap'; });
  await page.getByRole('button', { name: '바디·틱·릴리즈' }).click();
  await expect(page.locator('[data-lab-page="tutorial-explicit-player"]')).toHaveAttribute('data-selected-preview', 'body-release');
  await expect(result).toHaveAttribute('data-expected-perfect', '7');
  // 2레인 더블 바디의 릴리즈 노트는 반복 경계(3000ms)와 같은 시각이라 경계 정산에서 처리돼야 Perfect 7이 된다.
  await expect(result).toHaveAttribute('data-finished-patterns', '2', { timeout: 20000 });
  await expect(result).toHaveAttribute('data-last-perfect', '7');
  await expect(result).toHaveAttribute('data-last-miss', '0');
  await expect(canvas).toHaveAttribute('data-e2e-marker', 'tap');

  const afterBody = await readProbe(page);
  expect(afterBody).toMatchObject({ resets: 2, explicitCharts: 2, legacyCharts: 0 });
  expect(pageErrors).toEqual([]);
});


test('직접 입력으로 전환한 싱글 탭 반복에서 기본 TKL KeyE를 500ms에 누르면 탭 1개를 판정하고 나머지 2개는 Miss', async ({ page }) => {
  test.setTimeout(60000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(settings => localStorage.setItem('not4k-settings', settings), SETTINGS);
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Preview Archive' })).toBeVisible({ timeout: 20000 });
  await installRendererProbe(page);
  await page.locator('a[href="/lab/tutorial-explicit-player"]').first().click();
  const result = page.locator('[data-started-patterns]');
  await expect.poll(async () => Number(await result.getAttribute('data-started-patterns'))).toBeGreaterThan(0);
  await page.getByRole('switch', { name: '직접 입력 / 시연' }).check();
  await expect(result).toHaveAttribute('data-input-mode', 'directInput');
  await expect(page.locator('[data-tutorial-binding-notice]')).toHaveCount(0);
  const started = Number(await result.getAttribute('data-started-patterns'));
  // 전환 중이던 패턴이 끝난 뒤, 처음부터 직접 입력인 패턴의 첫 탭을 친다.
  await expect.poll(async () => Number(await result.getAttribute('data-started-patterns'))).toBeGreaterThan(started);
  const iteration = Number(await result.getAttribute('data-started-patterns')) - 1;
  const before = await readProbe(page);
  await page.waitForFunction(() => {
    const probe = (window as unknown as { __tutorialExplicitProbe: RendererProbe }).__tutorialExplicitProbe;
    return probe.loopTimeMs >= 480 && probe.loopTimeMs <= 520;
  }, undefined, { polling: 'raf' });
  // KeyboardEvent를 합성하거나 세션을 직접 호출하지 않고 실제 바인딩 E로 입력한다.
  await page.keyboard.press('e');
  await expect.poll(async () => (await readProbe(page)).successfulJudgments).toBe(before.successfulJudgments + 1);
  expect((await readProbe(page)).lastGrade).toMatch(/^(perfect|great|good)$/);
  await expect(result).toHaveAttribute('data-last-iteration', String(iteration));
  await expect(result).toHaveAttribute('data-last-miss', '2');
  expect((await readProbe(page)).explicitCharts).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('Space가 2레인에 바인딩돼도 포커스된 Lab 스위치에서 Space를 2회 누르면 직접 입력에서 시연으로 복귀한다', async ({ page }) => {
  const settings = JSON.parse(SETTINGS);
  settings.state.settings.keyBindings.lane2 = ['Space', 'KeyE'];
  await page.addInitScript(value => localStorage.setItem('not4k-settings', value), JSON.stringify(settings));
  await page.goto('/lab/tutorial-explicit-player');
  const toggle = page.getByRole('switch', { name: '직접 입력 / 시연' });
  const result = page.locator('[data-started-patterns]');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(result).toHaveAttribute('data-input-mode', 'directInput');
  await page.keyboard.press('Space');
  await expect(result).toHaveAttribute('data-input-mode', 'demonstration');
  await expect(toggle).not.toBeChecked();
});
