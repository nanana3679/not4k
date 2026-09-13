import { expect, test } from "@playwright/test";

test.describe("Lab preview catalog", () => {
  test("/lab에서 7개 미리보기를 분류별로 찾고 Flight Background Preview를 연다", async ({ page }) => {
    await page.goto("/lab");

    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
    await expect(page.locator(".lab-index-group li")).toHaveCount(7);
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

    await expect(page.locator(".lab-index-group li")).toHaveCount(7);
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
});
