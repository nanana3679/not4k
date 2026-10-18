import { expect, test, type Page } from "@playwright/test";

const galleryPath = "/lab/images/background-drafts-20261018/";
const ALL_LAYER_FILES = ["layer-lanes.webp", "layer-notes.webp", "layer-judgment-line.webp", "layer-gear-mid.webp", "layer-hud.webp"];
const SCENARIOS = ["liftoff", "infiltration", "breakthrough"];
const ALTITUDES = ["high", "mid", "low"];

/** File names of the preview layers that are actually drawn (computed opacity 1, after the 120 ms fade). */
function drawnLayerFiles(page: Page) {
  return page.locator(".preview .layer").evaluateAll((nodes) => nodes
    .filter((node) => getComputedStyle(node).opacity === "1")
    .map((node) => (node as HTMLImageElement).getAttribute("src")!.replace("captures/", "")));
}

for (const width of [390, 1280]) {
  test(`${width}px Lab에서 배경 시안 갤러리를 열어 미리보기 누르기로 레이어 5장을 숨겼다 보이고, HUD 끄기·지금 배경·Breakthrough 고도 하로 바꾼 뒤 목록으로 돌아온다`, async ({ context, page }) => {
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

test("주소 source=current&scenario=infiltration&altitude=high&layers=gear&overlay=0&brightness=60으로 열면 지금 배경 Infiltration 고도 상·레이어 숨김·기어만 체크·밝기 60%다", async ({ page }) => {
  await page.goto(`${galleryPath}#source=current&scenario=infiltration&altitude=high&layers=gear&overlay=0&brightness=60`);
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-infiltration-high.webp");
  await expect(page.locator("#gear-layer")).toHaveAttribute("src", "captures/layer-gear-high.webp");
  await expect(page.locator("#selected-title")).toHaveText("지금 배경 · Infiltration · 고도 상");
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
  await expect(page.getByRole("checkbox", { name: /기어/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /HUD/ })).not.toBeChecked();
  await expect(page.locator("#brightness-value")).toHaveText("60%");
  await expect(page.locator("#background")).toHaveCSS("filter", "brightness(0.6)");
});

test("레이어를 숨긴 상태(overlay=0)에서 HUD 체크를 켜면 체크는 포커스를 잃지 않고 기어·HUD 레이어가 다시 보인다", async ({ page }) => {
  await page.goto(`${galleryPath}#layers=gear&overlay=0`);
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
  const hud = page.getByRole("checkbox", { name: /HUD/ });
  await hud.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => drawnLayerFiles(page)).toEqual(["layer-gear-mid.webp", "layer-hud.webp"]);
  await expect(hud).toBeFocused();
});

test("H는 레이어를 숨기고, C는 2차 시안→지금 배경, ↓는 고도 상→중, →는 Infiltration→Breakthrough로 바꾼다", async ({ page }) => {
  await page.goto(`${galleryPath}#scenario=infiltration&altitude=high`);
  await page.keyboard.press("h");
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
  await page.keyboard.press("c");
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-infiltration-high.webp");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-infiltration-mid.webp");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-breakthrough-mid.webp");
});

test("Liftoff 라디오와 밝기 슬라이더에 포커스가 있어도 H는 레이어를 숨겼다 보인다", async ({ page }) => {
  await page.goto(galleryPath);
  await page.getByRole("radio", { name: "Liftoff" }).focus();
  await page.keyboard.press("h");
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
  await page.locator("#brightness").focus();
  await page.keyboard.press("h");
  await expect.poll(() => drawnLayerFiles(page)).toEqual(ALL_LAYER_FILES);
});

test("키보드 단축키 체크를 끄면 H·C·→·↓가 레이어와 배경을 바꾸지 않고, 단축키 안내와 aria-keyshortcuts도 사라진다", async ({ page }) => {
  await page.goto(galleryPath);
  await page.getByRole("checkbox", { name: /키보드 단축키/ }).uncheck();
  await expect(page.locator("legend kbd").first()).toBeHidden();
  await expect(page.locator("#preview")).not.toHaveAttribute("aria-keyshortcuts", "H");
  await expect(page.locator("#master")).not.toHaveAttribute("aria-keyshortcuts", "H");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const key of ["h", "c", "ArrowRight", "ArrowDown"]) await page.keyboard.press(key);
  await expect.poll(() => drawnLayerFiles(page)).toEqual(ALL_LAYER_FILES);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
});

test("'만든 방법과 한계 펼치기'에 포커스가 있으면 ↓는 고도 중을 바꾸지 않는다", async ({ page }) => {
  await page.goto(galleryPath);
  await page.locator("summary").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#selected-title")).toHaveText("2차 시안 · Liftoff · 고도 중");
});

test("주소 layers=bogus는 레이어 전체로 읽고, 비어 있는 layers=는 레이어 없음으로 읽는다", async ({ page }) => {
  await page.goto(`${galleryPath}#layers=bogus`);
  await expect.poll(() => drawnLayerFiles(page)).toEqual(ALL_LAYER_FILES);
  await page.goto(`${galleryPath}#layers=`);
  await expect.poll(() => drawnLayerFiles(page)).toEqual([]);
});

test("주소 brightness=37은 슬라이더 5% 단계에 맞춰 35%로 읽는다", async ({ page }) => {
  await page.goto(`${galleryPath}#brightness=37`);
  await expect(page.locator("#brightness-value")).toHaveText("35%");
  await expect(page.locator("#brightness")).toHaveValue("35");
});

test("다른 화면 뒤에 일부만 적은 주소 #scenario=breakthrough로 가면 나머지는 기본값(2차 시안·고도 중·레이어 전체·보이기·100%)이다", async ({ page }) => {
  await page.goto(`${galleryPath}#source=current&altitude=low&layers=gear&overlay=0&brightness=50`);
  await expect(page.locator("#background")).toHaveAttribute("src", "captures/current-liftoff-low.webp");
  await page.goto(`${galleryPath}#scenario=breakthrough`);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp");
  await expect.poll(() => drawnLayerFiles(page)).toEqual(ALL_LAYER_FILES);
  await expect(page.locator("#brightness-value")).toHaveText("100%");
});

test("주소 scenario=__proto__&altitude=toString&source=constructor는 오류 없이 기본값 2차 시안 Liftoff 고도 중으로 읽는다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${galleryPath}#scenario=__proto__&altitude=toString&source=constructor`);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
  await expect(page.locator("#selected-title")).toHaveText("2차 시안 · Liftoff · 고도 중");
  expect(errors).toEqual([]);
});

test("→ 키를 40번 연달아 눌러도 주소 기록(replaceState)은 2번 이하이고, Liftoff에서 40칸 간 Infiltration이 주소에 남는다", async ({ page }) => {
  await page.addInitScript(() => {
    const original = history.replaceState.bind(history);
    const counter = window as unknown as { replaceCount: number };
    counter.replaceCount = 0;
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      counter.replaceCount += 1;
      original(...args);
    };
  });
  await page.goto(galleryPath);
  await expect(page).toHaveURL(/#source=draft&scenario=liftoff/);
  const before = await page.evaluate(() => (window as unknown as { replaceCount: number }).replaceCount);
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
  // 장면 3개를 도는 40칸 = 13바퀴 + 1칸 → Infiltration
  await expect(page).toHaveURL(/scenario=infiltration/);
  const after = await page.evaluate(() => (window as unknown as { replaceCount: number }).replaceCount);
  expect(after - before).toBeLessThanOrEqual(2);
});

test("주소 기록이 대기 중일 때 같은 주소의 이전 기록으로 뒤로 가면(popstate만 발생) Breakthrough 화면을 다시 읽고, 대기하던 Infiltration 기록이 그 주소를 덮지 않는다", async ({ page }) => {
  await page.clock.install();
  await page.goto(`${galleryPath}#scenario=breakthrough`);
  await page.clock.runFor(300);
  await expect(page).toHaveURL(/scenario=breakthrough&altitude=mid/);
  // A second history entry with the same address: going back to it fires popstate but not hashchange.
  await page.evaluate(() => history.pushState(null, "", location.hash));
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#selected-title")).toHaveText("2차 시안 · Liftoff · 고도 중");
  await page.goBack();
  await expect(page.locator("#selected-title")).toHaveText("2차 시안 · Breakthrough · 고도 중");
  await page.clock.runFor(500);
  await expect(page).toHaveURL(/scenario=breakthrough/);
});

test("→로 Infiltration을 고른 뒤 250ms 안에 Lab 목록으로 나가도 pagehide에서 주소를 기록해, 뒤로 돌아오면 Infiltration 주소다", async ({ page }) => {
  await page.clock.install();
  await page.goto(galleryPath);
  await page.clock.runFor(300);
  await expect(page).toHaveURL(/scenario=liftoff/);
  await page.keyboard.press("ArrowRight");
  await page.getByRole("link", { name: "← Lab 목록", exact: true }).first().click();
  await expect(page).toHaveURL(/\/lab\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/scenario=infiltration/);
});

test("Infiltration 이미지 응답을 붙잡아 둔 사이 Breakthrough로 바꾸면, 나중에 도착한 Infiltration이 Breakthrough를 덮지 않는다", async ({ page }) => {
  await page.goto(galleryPath);
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
  let releaseInfiltration!: () => void;
  const infiltrationHeld = new Promise<void>((resolve) => { releaseInfiltration = resolve; });
  let infiltrationRequested!: () => void;
  const infiltrationArrived = new Promise<void>((resolve) => { infiltrationRequested = resolve; });
  await page.route("**/drafts/infiltration-mid.webp", async (route) => {
    infiltrationRequested();
    await infiltrationHeld;
    await route.continue();
  });
  await page.getByText("Infiltration", { exact: true }).first().click();
  await infiltrationArrived;
  await page.getByText("Breakthrough", { exact: true }).first().click();
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp");
  const infiltrationLoaded = page.waitForResponse("**/drafts/infiltration-mid.webp");
  releaseInfiltration();
  await infiltrationLoaded;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp");
});

test("딥 링크 #scenario=breakthrough는 Breakthrough 이미지가 도착하기 전에도 첫 화면 src를 곧바로 그 파일로 둔다", async ({ page }) => {
  let releaseBreakthrough!: () => void;
  const breakthroughHeld = new Promise<void>((resolve) => { releaseBreakthrough = resolve; });
  await page.route("**/drafts/breakthrough-mid.webp", async (route) => {
    await breakthroughHeld;
    await route.continue();
  });
  await page.goto(`${galleryPath}#scenario=breakthrough`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/breakthrough-mid.webp", { timeout: 1000 });
  releaseBreakthrough();
});

test("딥 링크 #scenario=breakthrough의 이미지를 받지 못하면 role=alert 안내에 drafts/breakthrough-mid.webp를 알린다", async ({ page }) => {
  await page.route("**/drafts/breakthrough-mid.webp", (route) => route.abort());
  await page.goto(`${galleryPath}#scenario=breakthrough`);
  await expect(page.getByRole("alert")).toContainText("drafts/breakthrough-mid.webp");
});

test("고른 Infiltration 이미지를 받지 못하면 이전 Liftoff 배경을 그대로 두고 role=alert 안내에 drafts/infiltration-mid.webp를 알린다", async ({ page }) => {
  await page.goto(galleryPath);
  await expect.poll(() => page.locator("#background").evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1672);
  await page.route("**/drafts/infiltration-mid.webp", (route) => route.abort());
  await page.getByText("Infiltration", { exact: true }).first().click();
  await expect(page.getByRole("alert")).toContainText("drafts/infiltration-mid.webp");
  await expect(page.locator("#background")).toHaveAttribute("src", "drafts/liftoff-mid.webp");
});

test("배경 18장(2차 시안 9장 1672×941·지금 배경 9장 1920×1080)이 모두 디코딩된다", async ({ page }) => {
  await page.goto(galleryPath);
  const sizes = await page.evaluate(async ({ scenarios, altitudes }) => {
    const size = async (path: string) => {
      const image = new Image();
      image.src = new URL(path, location.href).href;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    };
    const sizeByPath: Record<string, string> = {};
    for (const scenario of scenarios) {
      for (const altitude of altitudes) {
        sizeByPath[`drafts/${scenario}-${altitude}`] = await size(`drafts/${scenario}-${altitude}.webp`);
        sizeByPath[`captures/current-${scenario}-${altitude}`] = await size(`captures/current-${scenario}-${altitude}.webp`);
      }
    }
    return sizeByPath;
  }, { scenarios: SCENARIOS, altitudes: ALTITUDES });
  expect(Object.keys(sizes)).toHaveLength(18);
  for (const [path, size] of Object.entries(sizes)) expect(size, path).toBe(path.startsWith("drafts/") ? "1672x941" : "1920x1080");
});

test("인게임 레이어 7장은 1920×1080 투명 이미지이고, 각 레이어는 제 위치(레인·노트·판정선·HUD·키)에서만 불투명하며, 기어 유리관은 고도 상에서 하늘색·하에서 어둡다", async ({ page }) => {
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
  // 각 레이어는 제 위치에서 불투명하다.
  expect(samples["layer-lanes"].laneArea).toBe(255);
  expect(samples["layer-judgment-line"].judgmentLineRow).toBe(255);
  expect(samples["layer-notes"].laneOneLongNote).toBe(255);
  expect(samples["layer-hud"].judgmentText).toBeGreaterThan(150);
  for (const altitude of ["high", "mid", "low"]) expect(samples[`layer-gear-${altitude}`].key).toBe(255);
  // 다른 레이어가 그리는 위치는 비어 있다(묶음이 겹치거나 섞이지 않음).
  expect(samples["layer-judgment-line"].laneArea).toBe(0);
  expect(samples["layer-notes"].judgmentLineRow).toBe(0);
  expect(samples["layer-gear-mid"].laneArea).toBe(0);
  expect(samples["layer-hud"].key).toBe(0);
  expect(samples["layer-lanes"].key).toBe(0);
  // 고도 상(100%)은 유리관이 액체로 가득 차 밝은 하늘색, 하(0%)는 빈 유리라 어둡다.
  const [highBlue, lowBlue] = [samples["layer-gear-high"].tube[2], samples["layer-gear-low"].tube[2]];
  expect(highBlue - lowBlue).toBeGreaterThan(150);
});
