import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`${width}px Lab에서 정면 분출 시안 3개와 이전 3번의 방향 기준을 확인하고 Lab 목록으로 돌아온다`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/lab");
    const galleryPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /^추진부 버튼 · 정면 분출/ }).click();
    const gallery = await galleryPromise;
    await gallery.setViewportSize({ width, height: 900 });
    await expect(gallery).toHaveURL(/\/lab\/images\/thrust-button-study-20260929\/$/);
    await expect(gallery.getByRole("heading", { level: 1 })).toHaveText("사용자를 향하는 추진부");
    await expect(gallery.locator(".decision")).toContainText("분출구 하나 · 싱글은 연파랑 · 더블은 금색");
    await expect(gallery.locator(".study")).toHaveCount(3);
    for (const image of await gallery.locator(".study img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
    }
    await gallery.getByText("방향 기준이 된 이전 3번 펼치기", { exact: true }).click();
    await expect(gallery.locator("#reference")).toContainText("원형 출구와 버튼 외형은 채택하지 않았습니다");
    const reference = gallery.locator("#reference img");
    await reference.scrollIntoViewIfNeeded();
    await expect.poll(() => reference.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(await gallery.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await gallery.getByRole("link", { name: "← Lab 목록", exact: true }).last().click();
    await expect(gallery).toHaveURL(/\/lab\/$/);
    await expect(gallery.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });
}
