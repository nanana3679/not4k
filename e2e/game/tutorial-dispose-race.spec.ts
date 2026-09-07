import { test, expect, type Locator, type Page } from '@playwright/test';

// 튜토리얼 프리뷰 렌더러 교차 teardown 레이스 회귀 테스트.
// 튜토리얼 캐러셀은 프리뷰별로 독립 PIXI Application을 동시에 띄운다. 한 프리뷰가 언마운트되며
// app.destroy()로 공유 GPU 자원을 해제하는 순간, 살아있는 형제 렌더러의 app.render()가 PIXI 내부
// 배처에서 null을 만나 "Cannot read properties of null (reading 'clear')"로 크래시했다.
// 프리뷰를 빠르게 마운트/언마운트해 그 레이스를 유발하고, uncaught pageerror가 0인지 검증한다.
// (실제 WebGL이 필요해 vitest로는 재현 불가 — swiftshader e2e에서만 잡힌다.)

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800,
      liftPercent: 0,
      suddenPercent: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

async function navigateToSongSelect(page: Page) {
  await page.goto('/game');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
}

// 빠른 토글 중 DOM detach로 클릭이 실패하는 건 정상 — 무시하고 churn만 이어간다.
async function safeClick(locator: Locator): Promise<void> {
  await locator.click({ timeout: 1200, force: true }).catch(() => {});
}

test('튜토리얼 프리뷰를 빠르게 전환·열닫기해도 렌더러 clear() 크래시가 없음', async ({ page }) => {
  test.setTimeout(120000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(`${err.name}: ${err.message}`);
  });

  await navigateToSongSelect(page);

  const openBtn = page.getByRole('button', { name: 'Open tutorial help' });
  const nextBtn = page.getByRole('button', { name: 'Next tutorial' });
  const prevBtn = page.getByRole('button', { name: 'Previous tutorial' });
  const closeBtn = page.getByRole('button', { name: 'Close tutorial help' });

  // 라운드 1: 열자마자 바로 닫기 — start()가 아직 init 중일 때 형제 프리뷰가 dispose된다.
  for (let i = 0; i < 12; i++) {
    await safeClick(openBtn);
    await page.waitForTimeout(10 + (i % 6) * 8); // init 완료 전후를 오가도록 지연을 흔든다
    await safeClick(closeBtn);
    await page.waitForTimeout(10);
  }

  // 라운드 2: 열고 프리뷰를 빠르게 전환 — 렌더 루프가 도는 중에 형제 프리뷰가 dispose 반복.
  await safeClick(openBtn);
  for (let i = 0; i < 32; i++) {
    await safeClick(i % 2 === 0 ? nextBtn : prevBtn);
    await page.waitForTimeout(12 + (i % 5) * 8);
  }
  await safeClick(closeBtn);

  // 라운드 3: 전환 직후 곧바로 닫기 — 새 프리뷰가 init 중일 때 전체 언마운트.
  for (let i = 0; i < 12; i++) {
    await safeClick(openBtn);
    await page.waitForTimeout(25);
    await safeClick(nextBtn);
    await page.waitForTimeout(8); // 새 프리뷰 init 중
    await safeClick(closeBtn);
    await page.waitForTimeout(8);
  }

  await page.waitForTimeout(300);

  const clearErrors = pageErrors.filter((e) => e.includes('clear'));
  expect(clearErrors, `clear() 크래시 발생:\n${clearErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `예기치 못한 pageError:\n${pageErrors.join('\n')}`).toEqual([]);
});
