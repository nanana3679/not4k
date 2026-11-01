import { expect, test } from "@playwright/test";

test.describe("옵저버 감속 청음 비교 Lab", () => {
  // 소리 자체는 확인하지 않는다. 두 AudioWorklet(Signalsmith WASM·SoundTouch 프로세서)이 Lab CSP와 모듈 주소에서 준비되는지만 본다.
  test("/lab에서 옵저버 감속 청음 비교를 열고 테스트 루프(16초)를 만들면 세 방식의 재생 버튼이 켜지고 Signalsmith 보고 지연이 표시된 뒤 Lab 목록으로 돌아온다", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("link", { name: /^옵저버 감속 청음 비교/ }).click();

    await expect(page).toHaveURL(/\/lab\/observer-slowdown$/);
    await expect(page.getByRole("heading", { level: 1, name: "옵저버 감속 청음 비교" })).toBeVisible();
    await expect(page.getByRole("group", { name: "재생 속도" }).getByRole("button")).toHaveText(["0.25x", "0.5x", "0.75x", "1.0x"]);
    await expect(page.getByRole("button", { name: "1.0x" })).toHaveAttribute("aria-pressed", "true");
    const playButtons = page.locator("article[data-method]").getByRole("button", { name: "재생" });
    await expect(playButtons).toHaveCount(3);
    for (const button of await playButtons.all()) await expect(button).toBeDisabled();

    await page.getByRole("button", { name: /테스트 루프 만들기/ }).click();
    await expect(page.getByRole("status")).toHaveText("생성 테스트 루프 (120 BPM) · 0:16.000");
    await expect(page.getByRole("alert")).toHaveCount(0);
    for (const button of await playButtons.all()) await expect(button).toBeEnabled();
    await expect(page.locator('article[data-method="signalsmith"]')).toContainText(/\d+ms \(latency\(\): 입력\+출력\)/);

    await page.getByRole("link", { name: "Lab 목록" }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });
});
