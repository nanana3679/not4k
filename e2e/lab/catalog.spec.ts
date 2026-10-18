import { expect, test } from "@playwright/test";

test.describe("Lab preview catalog", () => {
  test("/lab에서 시설 통과·에셋 시연실·Gear를 포함한 7개 미리보기와 이미지 갤러리 7개를 찾고 비행 시연을 연다", async ({ page }) => {
    await page.goto("/lab");

    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
    await expect(page.locator(".lab-index-group li")).toHaveCount(14);
    await expect(page.getByRole("link", { name: /^노트 에셋 시연실/ })).toBeVisible();
    await page.getByRole("link", { name: /Open preview/ }).click();

    await expect(page).toHaveURL(/\/lab\/flight-background-preview$/);
    const preview = page.frameLocator('iframe[title="Flight Background Preview"]');
    await expect(preview.getByRole("tab", { name: "LIFTOFF" })).toBeVisible();
    await expect(preview.getByRole("tab", { name: "INFILTRATION" })).toBeVisible();
    await expect(preview.getByRole("tab", { name: "BREAKTHROUGH" })).toBeVisible();
    await page.getByRole("link", { name: "Preview Archive로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });

  test("390px 화면에서도 미리보기 목록은 가로 넘침 없이 모두 접근 가능하다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lab");

    await expect(page.locator(".lab-index-group li")).toHaveCount(14);
    const overflow = await page.locator(".lab-index").evaluate((catalog) => catalog.scrollWidth > catalog.clientWidth + 1);
    expect(overflow).toBe(false);
    const scrollTop = await page.locator(".lab-index").evaluate((catalog) => {
      catalog.scrollTop = catalog.scrollHeight;
      return catalog.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    const lastPreview = page.getByRole("link", { name: /Judgment Playtest/ });
    await expect(lastPreview).toBeVisible();
    await lastPreview.click();
    await expect(page).toHaveURL(/\/lab\/judgment-playtest$/);
  });

  test("912px 태블릿 경계에서도 카탈로그는 가로로 넘치지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 912, height: 900 });
    await page.goto("/lab");

    const overflow = await page.locator(".lab-index").evaluate((catalog) => catalog.scrollWidth > catalog.clientWidth + 1);
    expect(overflow).toBe(false);
    await expect(page.getByRole("link", { name: /Judgment Playtest/ })).toBeVisible();
  });

  for (const width of [390, 1280]) {
    test(`${width}px Lab에서 시설 통과를 열어 내부·고도를 조절하고 목록으로 돌아온다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/lab');
      await page.getByRole('link', { name: /Facility Passage Preview/ }).click();
      await expect(page).toHaveURL(/\/lab\/facility-passage(?:\?|$)/);
      const preview = page.frameLocator('iframe[title="Facility Passage Preview"]');
      await expect(preview.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
      await expect(preview.locator('#passage-stops')).toBeVisible();
      await expect(preview.locator('#expiry')).toBeHidden();
      const identity = await preview.locator('body').evaluate(() => (window as unknown as { flightStudy: { snapshot(): { passageId: string } } }).flightStudy.snapshot().passageId);
      await preview.locator('[data-stop="inside"]').click();
      await preview.locator('#altitude').fill('50');
      await expect.poll(() => preview.locator('body').evaluate(() => {
        const state = (window as unknown as { flightStudy: { snapshot(): { study: string; altitude: number; pose: { center: number[] } } } }).flightStudy.snapshot();
        return { study: state.study, altitude: state.altitude, depth: state.pose.center[2] };
      })).toEqual({ study: 'passage', altitude: 0.5, depth: 0 });
      expect(await preview.locator('body').evaluate(() => (window as unknown as { flightStudy: { snapshot(): { passageId: string } } }).flightStudy.snapshot().passageId)).toBe(identity);
      await expect.poll(() => new URL(page.url()).searchParams.get('altitude')).toBe('0.5');
      await page.reload();
      await expect(preview.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
      await expect.poll(() => preview.locator('body').evaluate(() => {
        const state = (window as unknown as { flightStudy: { snapshot(): { study: string; altitude: number; pose: { center: number[] } } } }).flightStudy.snapshot();
        return { study: state.study, altitude: state.altitude, inside: Math.abs(state.pose.center[2]) < 0.01 };
      })).toEqual({ study: 'passage', altitude: 0.5, inside: true });
      expect(await preview.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(errors).toEqual([]);
      await page.getByRole('link', { name: 'Preview Archive로 돌아가기' }).click();
      await expect(page).toHaveURL(/\/lab$/);
    });
  }

  for (const width of [390, 1280]) {
    test(`${width}px Lab에서 restZone을 열어 4.15초·4.3초·10.35초·10.6초 판넬 상태를 상태 표시와 렌더러 양쪽에서, 추정 녹숫·사용자 녹숫·텍스처 다시 만들기·최소 길이 지침을 확인하고 Pixi 경고 없이 목록으로 돌아온다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      // 아직 묶인 텍스처를 지우는 등 Pixi가 경고하면 화면은 멀쩡해도 실패로 본다.
      const pixiWarnings: string[] = [];
      page.on('console', message => {
        if (message.text().includes('PixiJS Warning')) pixiWarnings.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/lab');
      await page.getByRole('link', { name: /^restZone Lane/ }).click();
      const preview = page.locator('[data-lab-page="rest-zone-lane"]');
      await expect(preview).toHaveAttribute('data-preview-ready', 'true');
      const canvas = preview.locator('canvas');
      await expect(canvas).toHaveCount(1);
      const phase = page.locator('[data-panel-phase]');
      // 렌더러가 프레임마다 실제로 그린 진행도와 다시 만든 판넬 텍스처를 알리는 곳(React 상태 표시와 따로 계산한다).
      const stageHost = page.locator('.rest-zone-canvas');
      const seek = (ms: string) => page.getByLabel('재생 위치', { exact: true }).fill(ms);
      // 판넬은 4초부터 300ms 동안 꺼지고, 기본 추정 녹숫 1.5초를 뺀 10.5초까지 다 올라온다.
      // 사용자 녹숫(기본 (426 + 6.25)px ÷ 355px/초 ≈ 1218ms)은 전환 시각을 바꾸지 않는다.
      const dwell = page.locator('[data-note-dwell-ms]');
      const gap = page.locator('[data-dwell-gap-ms]');
      await expect(dwell).toHaveAttribute('data-note-dwell-ms', '1218');
      await expect(gap).toContainText('추정보다 0.28초 빠른 설정입니다');
      for (const [ms, expected, drawn] of [
        ['3999', 'up', '0.000'], ['4150', 'falling', '0.250'], ['4300', 'down', '1.000'], ['10350', 'rising', '0.250'], ['10600', 'up', '0.000'],
      ]) {
        await seek(ms);
        await expect(phase).toHaveAttribute('data-panel-phase', expected);
        await expect(stageHost).toHaveAttribute('data-drawn-progress', drawn);
        await expect(page.getByRole('button', { name: '재생', exact: true })).toBeEnabled();
      }
      await seek('4150');
      await expect(page.getByLabel('현재 판넬 상태')).toContainText('진행도 25%');
      // 리프트 30%면 사용자 녹숫이 약 711ms로 줄지만 렌더러는 그대로 10.5초에 판넬을 다 올려 둔다.
      await seek('10600');
      await page.getByLabel(/^리프트/).fill('30');
      await expect(dwell).toHaveAttribute('data-note-dwell-ms', '711');
      await expect(gap).toContainText('추정보다 0.79초 빠른 설정입니다');
      await expect(phase).toHaveAttribute('data-panel-phase', 'up');
      await expect(stageHost).toHaveAttribute('data-drawn-progress', '0.000');
      // 판넬이 꺼져 있는 7초에서 리프트·서든·테두리를 바꾸면 렌더러가 판넬 텍스처를 그 높이·테두리로 다시 만든다.
      await seek('7000');
      await expect(stageHost).toHaveAttribute('data-drawn-progress', '1.000');
      await expect(stageHost).toHaveAttribute('data-panel-texture-height', '246'); // 리프트 30%: 판정선 426 − 180
      await page.getByLabel(/^리프트/).fill('0');
      await expect(stageHost).toHaveAttribute('data-panel-texture-height', '426');
      // 서든 20%면 위 120px가 가려져 판넬 높이 306, 사용자 녹숫 약 880ms다.
      await page.getByLabel(/^서든/).fill('20');
      await expect(dwell).toHaveAttribute('data-note-dwell-ms', '880');
      await expect(stageHost).toHaveAttribute('data-panel-texture-height', '306');
      await page.getByLabel(/^서든/).fill('0');
      await expect(stageHost).toHaveAttribute('data-panel-texture-height', '426');
      for (const style of ['red-stripe', 'rim', 'none', 'red-outline']) {
        await page.getByLabel('테두리', { exact: true }).selectOption(style);
        await expect(stageHost).toHaveAttribute('data-panel-texture-edge', style);
      }
      // 스크롤 200px/초면 사용자 녹숫이 약 2161ms로 추정보다 0.66초 느리다.
      await page.getByLabel(/^스크롤 속도/).fill('200');
      await expect(gap).toContainText('추정보다 0.66초 느린 설정입니다');
      await page.getByLabel(/^스크롤 속도/).fill('355');
      // 추정 녹숫을 0.6초로 낮추면 11.4초까지 다 올라오므로 10.6초에는 아직 꺼져 있다.
      await seek('10600');
      await page.getByLabel(/^난이도별 추정 녹숫/).fill('600');
      await expect(phase).toHaveAttribute('data-panel-phase', 'down');
      await expect(stageHost).toHaveAttribute('data-drawn-progress', '1.000');
      // 1.5초짜리 restZone은 추정 녹숫 0.6초면 최소 길이 1.2초를 넘지만, 1.5초면 최소 길이 2.1초보다 짧아 꺼지지 않는다.
      await page.getByLabel('restZone 배치', { exact: true }).selectOption('short');
      await expect(page.getByRole('note')).toHaveCount(0);
      await page.getByLabel(/^난이도별 추정 녹숫/).fill('1500');
      await expect(page.getByRole('note')).toContainText('지침 최소 길이 2.10초');
      await expect(page.getByRole('note')).toContainText('꺼지지 않습니다');
      await page.getByLabel('restZone 배치', { exact: true }).selectOption('single');
      await expect(page.getByRole('note')).toHaveCount(0);
      await page.getByLabel('restZone 배치', { exact: true }).selectOption('pair-offset');
      await expect(page.getByLabel('현재 판넬 상태')).toContainText('레인 4');
      await page.getByLabel('restZone 배치', { exact: true }).selectOption('pair-same');
      await expect(page.getByLabel('현재 판넬 상태')).toContainText('레인 3·4');
      await page.getByLabel('인접 레인 묶기', { exact: true }).uncheck();
      await expect(page.getByLabel('현재 판넬 상태')).not.toContainText('레인 3·4');
      await page.getByLabel('인접 레인 묶기', { exact: true }).check();
      await page.getByLabel('레인 사이 틈 메우기', { exact: true }).uncheck();
      await page.getByLabel('레인 사이 틈 메우기', { exact: true }).check();
      await page.getByLabel(/^빗금 레인색 밝기/).fill('200');
      await page.getByLabel(/^빗금 간격/).fill('4');
      await page.getByLabel(/^어둠 시작 위치/).fill('20');
      await page.getByLabel(/^윗변 남는 밝기/).fill('30');
      await page.getByLabel(/^꺼지는 각도/).fill('85');
      await page.getByLabel(/^원근 거리/).fill('0.6');
      await page.getByLabel(/^애니메이션 길이/).fill('1000');
      await page.getByLabel(/^스크롤 속도/).fill('500');
      await page.getByLabel('노트 표시', { exact: true }).uncheck();
      await page.getByLabel('노트 표시', { exact: true }).check();
      await page.getByLabel('재생 속도', { exact: true }).selectOption('0.25');
      await expect(canvas).toHaveCount(1);
      const stage = await page.locator('.rest-zone-canvas').boundingBox();
      const controls = await page.getByRole('region', { name: '판넬 조절' }).boundingBox();
      if (width === 390) expect(controls!.y).toBeGreaterThan(stage!.y + stage!.height);
      expect(await preview.evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(false);
      await page.getByRole('button', { name: '처음으로' }).click();
      await expect(page.getByLabel('재생 위치', { exact: true })).toHaveValue('0');
      await page.getByRole('button', { name: '재생', exact: true }).click();
      await expect.poll(() => page.getByLabel('재생 위치', { exact: true }).inputValue()).not.toBe('0');
      // 메쉬가 그려진 앱의 종료·재진입도 검증한다(Pixi 8.21 GC 회귀).
      await page.getByRole('link', { name: 'Preview Archive로 돌아가기' }).click();
      await page.getByRole('link', { name: /^restZone Lane/ }).click();
      await expect(preview).toHaveAttribute('data-preview-ready', 'true');
      await page.getByLabel('재생 위치', { exact: true }).fill('4300');
      await expect(phase).toHaveAttribute('data-panel-phase', 'down');
      await page.getByRole('link', { name: 'Preview Archive로 돌아가기' }).click();
      await expect(page).toHaveURL(/\/lab$/);
      expect(errors).toEqual([]);
      expect(pixiWarnings).toEqual([]);
    });
  }

  test("IMAGE GALLERIES의 Module Size × Distance를 열면 정적 비교 이미지 9장이 로드된다", async ({ context, page }) => {
    await page.goto("/lab");

    const galleryPagePromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /Module Size × Distance/ }).click();
    const galleryPage = await galleryPagePromise;
    await galleryPage.waitForLoadState("domcontentloaded");

    await expect(galleryPage).toHaveURL(/\/lab\/images\/module-size-distance-20260910\/$/);
    await expect(galleryPage).toHaveTitle("크기 × 거리 9개 시안");
    await expect(galleryPage.locator("img")).toHaveCount(9);
    for (const image of await galleryPage.locator("img").all()) await image.scrollIntoViewIfNeeded();
    await expect.poll(
      () => galleryPage.locator("img").evaluateAll((images: HTMLImageElement[]) => images.every((image) => image.complete && image.naturalWidth > 0)),
    ).toBe(true);
  });
});
