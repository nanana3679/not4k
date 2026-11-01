import { expect, test, type Page } from "@playwright/test";

/** "지금 곡 위치 0:01.234"의 곡 위치(초). 재생 중이 아니어서 "—"이면 null. */
async function displayedSongTime(page: Page): Promise<number | null> {
  const text = await page.getByText(/^지금 곡 위치/).textContent();
  const match = text?.match(/(\d+):(\d+\.\d+)/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

async function createTestLoop(page: Page) {
  await page.getByRole("button", { name: /테스트 루프 만들기/ }).click();
  await expect(page.getByRole("status")).toHaveText("생성 테스트 루프 (120 BPM) · 0:16.000");
  await expect(page.getByRole("alert")).toHaveCount(0);
}

test.describe("옵저버 감속 청음 비교 Lab", () => {
  // 소리 자체는 확인하지 않는다. 두 AudioWorklet(Signalsmith WASM·SoundTouch 프로세서)이 Lab CSP와 모듈 주소에서 준비되는지만 본다.
  test("/lab에서 옵저버 감속 청음 비교를 열고 테스트 루프(16초)를 만들면 세 방식의 재생 버튼이 켜지고 Signalsmith 출력·입력 지연이 표시된 뒤 Lab 목록으로 돌아온다", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("link", { name: /^옵저버 감속 청음 비교/ }).click();

    await expect(page).toHaveURL(/\/lab\/observer-slowdown$/);
    await expect(page.getByRole("heading", { level: 1, name: "옵저버 감속 청음 비교" })).toBeVisible();
    await expect(page.getByRole("group", { name: "재생 속도" }).getByRole("button")).toHaveText(["0.25x", "0.5x", "0.75x", "1.0x"]);
    await expect(page.getByRole("button", { name: "1.0x" })).toHaveAttribute("aria-pressed", "true");
    const playButtons = page.locator("article[data-method]").getByRole("button", { name: "재생" });
    await expect(playButtons).toHaveCount(3);
    for (const button of await playButtons.all()) await expect(button).toBeDisabled();

    await createTestLoop(page);
    for (const button of await playButtons.all()) await expect(button).toBeEnabled();
    await expect(page.locator('article[data-method="signalsmith"]')).toContainText(/출력 \d+ms \+ 입력 \d+ms \(latency\(\) 합 \d+ms\)/);

    await page.getByRole("link", { name: "Lab 목록" }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });

  // 소리 내용은 보지 않고 화면의 곡 위치·재생 상태·측정값 표시로 재생 흐름을 확인한다.
  test("테스트 루프를 Signalsmith로 재생하면 곡 위치가 흐르고 0.5x로 바꾼 뒤와 SoundTouchJS로 전환한 뒤에도 뒤로 가지 않고 이어 흐르다가 정지하면 위치 표시가 —로 돌아간다", async ({ page }) => {
    await page.goto("/lab/observer-slowdown");
    await createTestLoop(page);
    const signalsmith = page.locator('article[data-method="signalsmith"]');
    const soundtouch = page.locator('article[data-method="soundtouch"]');

    await signalsmith.getByRole("button", { name: "재생" }).click();
    await expect(signalsmith).toHaveAttribute("data-playing", "true");
    await expect.poll(() => displayedSongTime(page)).toBeGreaterThan(0.3);
    await expect(signalsmith.locator("dd").last()).toHaveText(/^\d+ms$/);

    await page.getByRole("button", { name: "0.5x", exact: true }).click();
    await expect(page.getByRole("button", { name: "0.5x", exact: true })).toHaveAttribute("aria-pressed", "true");
    const beforeRateSettles = (await displayedSongTime(page)) ?? 0;
    await expect.poll(() => displayedSongTime(page)).toBeGreaterThan(beforeRateSettles + 0.2);
    await expect(signalsmith).toHaveAttribute("data-playing", "true");

    const beforeSwitch = (await displayedSongTime(page)) ?? 0;
    await soundtouch.getByRole("button", { name: "이 방식으로 전환" }).click();
    await expect(soundtouch).toHaveAttribute("data-playing", "true");
    await expect(signalsmith).toHaveAttribute("data-playing", "false");
    expect(await displayedSongTime(page)).toBeGreaterThanOrEqual(beforeSwitch);
    await expect.poll(() => displayedSongTime(page)).toBeGreaterThan(beforeSwitch + 0.2);
    await expect(soundtouch.locator("dd").last()).toHaveText(/^\d+ms$/);

    await soundtouch.getByRole("button", { name: "정지" }).click();
    await expect(page.locator('article[data-playing="true"]')).toHaveCount(0);
    await expect(page.getByText(/^지금 곡 위치/)).toHaveText("지금 곡 위치 —");
  });
});
