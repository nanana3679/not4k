import { expect, test, type Page } from "@playwright/test";

const galleryPath = "/lab/images/background-drafts-20261018/";
const ALL_LAYER_FILES = ["layer-lanes.webp", "layer-notes.webp", "layer-judgment-line.webp", "layer-gear-mid.webp", "layer-hud.webp"];

/** File names of the preview layers that are actually drawn (computed opacity 1, after the 120 ms fade). */
function drawnLayerFiles(page: Page) {
  return page.locator(".preview .layer").evaluateAll((nodes) => nodes
    .filter((node) => getComputedStyle(node).opacity === "1")
    .map((node) => (node as HTMLImageElement).getAttribute("src")!.replace("captures/", "")));
}

for (const width of [390, 1280]) {
  test(`${width}px Lab에서 배경 시안 갤러리를 열어 미리보기 누르기로 레이어 5장을 내렸다 올리고, HUD 끄기·지금 배경·Breakthrough 고도 하로 바꾼 뒤 목록으로 돌아온다`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/lab");
    const galleryPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /^배경 시안 · 인게임 겹쳐 보기/ }).click();
    const gallery = await galleryPromise;
    await gallery.setViewportSize({ width, height: 900 });
    await expect(gallery).toHaveURL(new RegExp(galleryPath));
    await expect(gallery.getByRole("heading", { level: 1 })).toHaveText("배경 시안 위에 인게임 에셋 겹쳐 보기");

    // 첫 화면: 2차 시안 Liftoff 고도 중 위에 레이어 5장(레인 바탕·노트·판정선·고도 중 기어·HUD)이 모두 로드되어 그려진다.
    await expect(gallery.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
    await expect.poll(() => gallery.locator(".preview img").evaluateAll((nodes) => nodes.map((node) => (node as HTMLImageElement).naturalWidth))).toEqual([1672, 1920, 1920, 1920, 1920, 1920]);
    await expect.poll(() => drawnLayerFiles(gallery)).toEqual(ALL_LAYER_FILES);
    expect(await gallery.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

    // 미리보기를 누르면 레이어 전체가 사라지고(보이기 버튼 눌림 해제), 다시 누르면 돌아온다.
    await gallery.locator("#preview").click();
    await expect.poll(() => drawnLayerFiles(gallery)).toEqual([]);
    await expect(gallery.locator("#master")).toHaveAttribute("aria-pressed", "false");
    await expect(gallery.locator("#preview")).toHaveAttribute("aria-pressed", "false");
    await gallery.locator("#preview").click();
    await expect.poll(() => drawnLayerFiles(gallery)).toEqual(ALL_LAYER_FILES);

    // HUD만 끄면 나머지 4장은 남는다.
    await gallery.getByRole("checkbox", { name: /HUD/ }).uncheck();
    await expect.poll(() => drawnLayerFiles(gallery)).toEqual(ALL_LAYER_FILES.slice(0, 4));

    // 지금 배경 · Breakthrough · 고도 하를 고르면 배경과 기어 게이지가 그 고도로 바뀌고 주소에 남는다.
    await gallery.getByText("지금 배경", { exact: true }).click();
    await gallery.getByText("Breakthrough", { exact: true }).first().click();
    await gallery.getByText("하 · 0%", { exact: true }).first().click();
    await expect(gallery.locator("#background")).toHaveAttribute("src", "captures/current-breakthrough-low.webp");
    await expect(gallery.locator("#gear-layer")).toHaveAttribute("src", "captures/layer-gear-low.webp");
    await expect(gallery.locator("#selected-title")).toHaveText("지금 배경 · Breakthrough · 고도 하");
    await expect.poll(() => gallery.locator("#background").evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1920);
    await expect(gallery).toHaveURL(/#source=current&scenario=breakthrough&altitude=low&layers=gear%2Clanes%2Cnotes&overlay=1&brightness=100$/);

    await gallery.getByRole("link", { name: "← Lab 목록", exact: true }).last().click();
    await expect(gallery).toHaveURL(/\/lab\/$/);
    await expect(gallery.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });
}

test("주소 source=current·infiltration·high·layers=gear·overlay=0·brightness=60을 복원하고 H·C·↓·→ 키로 바꾸며, 일부만 적은 주소는 나머지를 기본값으로 읽는다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${galleryPath}#source=current&scenario=infiltration&altitude=high&layers=gear&overlay=0&brightness=60`);
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-infiltration-high.webp");
  await expect(page.locator("#gear-layer")).toHaveAttribute("src", "captures/layer-gear-high.webp");
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
  // 내린 동안에도 레이어 체크는 켜고 끌 수 있고(포커스가 사라지지 않게), 고른 레이어(기어)만 체크되어 있다.
  await expect(page.getByRole("checkbox", { name: /기어/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /기어/ })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: /HUD/ })).not.toBeChecked();
  await expect(page.locator("#brightness-value")).toHaveText("60%");
  await expect(page.locator("#background")).toHaveCSS("filter", "brightness(0.6)");

  await page.keyboard.press("h");
  await expect.poll(() => drawnLayerFiles(page)).toEqual(["layer-gear-high.webp"]);
  await page.keyboard.press("c");
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/infiltration-high.webp");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/infiltration-mid.webp");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp");
  // 라디오에 포커스가 있어도 H는 동작한다(화살표만 라디오가 쓴다).
  await page.getByRole("radio", { name: "Liftoff" }).focus();
  await page.keyboard.press("h");
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);

  // 슬라이더 단계(5%)에 맞지 않는 밝기 37은 35로 맞춘다.
  await page.goto(`${galleryPath}#brightness=37`);
  await expect(page.locator("#brightness-value")).toHaveText("35%");
  // 일부만 적은 주소: 적지 않은 값은 이전 화면이 아니라 기본값(2차 시안·고도 중·레이어 전체·보이기·밝기 100%)이다.
  await page.goto(`${galleryPath}#scenario=breakthrough`);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp");
  await expect.poll(() => drawnLayerFiles(page)).toEqual(ALL_LAYER_FILES);
  await expect(page.locator("#brightness-value")).toHaveText("100%");
  // Object 원형의 이름(__proto__·toString)은 값으로 받지 않고 기본값으로 읽는다.
  await page.goto(`${galleryPath}#scenario=__proto__&altitude=toString&source=constructor`);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
  expect(errors).toEqual([]);
});

test("인게임 레이어 7장은 1920×1080 투명 이미지이고, 레인 바탕·노트·판정선·HUD·기어는 각자 자리에서 불투명하며, 기어 유리관은 고도 상에서 하늘색·하에서 어둡다", async ({ page }) => {
  await page.goto(galleryPath);
  const files = ["layer-lanes", "layer-notes", "layer-judgment-line", "layer-gear-high", "layer-gear-mid", "layer-gear-low", "layer-hud"];
  const samples = await page.evaluate(async (names) => {
    const read = async (name: string) => {
      const image = new Image();
      image.src = new URL(`captures/${name}.webp`, location.href).href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
      const maxAlpha = (x: number, y: number, width: number, height: number) => {
        const data = context.getImageData(x, y, width, height).data;
        let max = 0;
        for (let i = 3; i < data.length; i += 4) max = Math.max(max, data[i]);
        return max;
      };
      return {
        size: `${canvas.width}x${canvas.height}`,
        corner: at(20, 20)[3],
        laneArea: at(1050, 400)[3], // lane 3, above the judgment line
        judgmentLineRow: maxAlpha(1050, 764, 1, 6), // judgment line y 426 × 1.8
        laneOneLongNote: at(790, 700)[3], // lane 1 long note held at 8.8 s
        judgmentText: maxAlpha(880, 610, 160, 40), // PERFECT around (533.5, 351) × 1.8
        key: at(900, 870)[3], // second key of the gear deck
        tube: at(683, 200), // left glass gauge, upper part
      };
    };
    return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await read(name)])));
  }, files);
  for (const name of files) {
    expect(samples[name].size).toBe("1920x1080");
    expect(samples[name].corner).toBe(0);
  }
  expect(samples["layer-lanes"].laneArea).toBe(255);
  expect(samples["layer-judgment-line"].judgmentLineRow).toBe(255);
  expect(samples["layer-judgment-line"].laneArea).toBe(0);
  expect(samples["layer-notes"].laneOneLongNote).toBe(255);
  expect(samples["layer-hud"].judgmentText).toBeGreaterThan(150);
  for (const altitude of ["high", "mid", "low"]) expect(samples[`layer-gear-${altitude}`].key).toBe(255);
  // 고도 상(100%)은 유리관이 액체로 가득 차 밝은 하늘색, 하(0%)는 빈 유리라 어둡다.
  const [highBlue, lowBlue] = [samples["layer-gear-high"].tube[2], samples["layer-gear-low"].tube[2]];
  expect(highBlue - lowBlue).toBeGreaterThan(150);
});
