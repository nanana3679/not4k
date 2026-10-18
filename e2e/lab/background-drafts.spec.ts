import { expect, test, type Page } from "@playwright/test";

const galleryPath = "/lab/images/background-drafts-20261018/";
const LAYERS = ["lanes", "notes", "gear", "hud"] as const;

async function visibleLayers(gallery: Page) {
  return gallery.locator(".stage .layer").evaluateAll((nodes) => nodes.filter((node) => !(node as HTMLImageElement).hidden).map((node) => (node as HTMLElement).dataset.layer));
}

for (const width of [390, 1280]) {
  test(`${width}px Lab에서 배경 시안 갤러리를 열어 에셋을 내렸다 올리고 레이어·배경을 바꾼 뒤 Lab 목록으로 돌아온다`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/lab");
    const galleryPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /^배경 시안 · 인게임 겹쳐 보기/ }).click();
    const gallery = await galleryPromise;
    await gallery.setViewportSize({ width, height: 900 });
    await expect(gallery).toHaveURL(new RegExp(`${galleryPath}`));
    await expect(gallery.getByRole("heading", { level: 1 })).toHaveText("배경 시안 위에 인게임 에셋 겹쳐 보기");

    // 첫 화면: 시안 A 위에 레이어 4장이 모두 올라가 있고, 이미지는 모두 실제로 로드된다.
    await expect(gallery.locator("#background")).toHaveAttribute("src", "backgrounds/a-painted-liftoff.webp");
    await expect.poll(() => gallery.locator(".stage img").evaluateAll((nodes) => nodes.map((node) => (node as HTMLImageElement).naturalWidth))).toEqual([1536, 1920, 1920, 1920, 1920]);
    expect(await visibleLayers(gallery)).toEqual([...LAYERS]);
    expect(await gallery.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

    // 화면을 누르면 에셋 전체를 내리고, 다시 누르면 올린다.
    await gallery.locator("#stage").click();
    expect(await visibleLayers(gallery)).toEqual([]);
    await expect(gallery.locator("#master")).toHaveText("인게임 에셋 올리기 (H)");
    await gallery.locator("#stage").click();
    expect(await visibleLayers(gallery)).toEqual([...LAYERS]);

    // HUD만 끄면 나머지 3장은 남는다.
    await gallery.getByRole("checkbox", { name: /HUD/ }).uncheck();
    expect(await visibleLayers(gallery)).toEqual(["lanes", "notes", "gear"]);

    // 배경 카드를 고르면 무대 배경과 설명이 바뀌고, 상태가 주소에 남는다.
    await gallery.locator(".choice", { hasText: "현재 · Breakthrough" }).click();
    await expect(gallery.locator("#background")).toHaveAttribute("src", "captures/current-breakthrough.webp");
    await expect(gallery.locator("#selected-title")).toHaveText("현재 · Breakthrough");
    await expect.poll(() => gallery.locator("#background").evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1920);
    expect(new URL(gallery.url()).hash).toBe("#bg=current-breakthrough&layers=gear%2Clanes%2Cnotes&raised=1&dim=100");

    await gallery.getByRole("link", { name: "← Lab 목록", exact: true }).last().click();
    await expect(gallery).toHaveURL(/\/lab\/$/);
    await expect(gallery.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });
}

test("주소의 bg·layers·raised·dim을 복원하고 H·→ 키로 에셋 올리기와 다음 배경을 바꾼다", async ({ page }) => {
  await page.goto(`${galleryPath}#bg=e-infiltration-storm&layers=gear&raised=1&dim=60`);
  await expect(page.locator("#background")).toHaveAttribute("src", "backgrounds/e-infiltration-storm.webp");
  expect(await visibleLayers(page)).toEqual(["gear"]);
  await expect(page.locator("#dim-value")).toHaveText("60%");
  await expect(page.locator("#background")).toHaveCSS("filter", "brightness(0.6)");

  await page.keyboard.press("h");
  expect(await visibleLayers(page)).toEqual([]);
  // 내린 동안에는 레이어 체크박스를 바꿀 수 없다.
  await expect(page.getByRole("checkbox", { name: /기어/ })).toBeDisabled();
  await page.keyboard.press("h");
  expect(await visibleLayers(page)).toEqual(["gear"]);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#background")).toHaveAttribute("src", "backgrounds/f-breakthrough-canyon.webp");
  // 마지막 배경(현재 · Breakthrough) 다음은 처음(A)으로 돈다.
  await page.goto(`${galleryPath}#bg=current-breakthrough`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#background")).toHaveAttribute("src", "backgrounds/a-painted-liftoff.webp");
});

test("인게임 레이어 4장은 1920×1080 투명 이미지라 왼쪽 위 구석은 비어 있고 기어 레이어는 아래 가운데 키 자리가 불투명하다", async ({ page }) => {
  await page.goto(galleryPath);
  const alpha = await page.evaluate(async (layers) => {
    const read = async (name: string) => {
      const image = new Image();
      image.src = new URL(`captures/layer-${name}.webp`, location.href).href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const at = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3];
      return { size: `${canvas.width}x${canvas.height}`, corner: at(20, 20), keys: at(900, 870) };
    };
    return Object.fromEntries(await Promise.all(layers.map(async (name) => [name, await read(name)])));
  }, [...LAYERS]);
  for (const name of LAYERS) {
    expect(alpha[name].size).toBe("1920x1080");
    expect(alpha[name].corner).toBe(0);
  }
  expect(alpha.gear.keys).toBe(255);
});
