import { expect, test } from "@playwright/test";

test.describe("Lab preview catalog", () => {
  test("/lab에서 8개 미리보기와 이미지 갤러리 2개를 찾고 Flight Background Preview를 연다", async ({ page }) => {
    await page.goto("/lab");

    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
    await expect(page.locator(".lab-index-group li")).toHaveCount(10);
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

    await expect(page.locator(".lab-index-group li")).toHaveCount(10);
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
      () => galleryPage.locator("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
    ).toBe(true);
  });
});
