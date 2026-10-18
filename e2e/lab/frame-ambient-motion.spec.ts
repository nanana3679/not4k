import { expect, test } from "@playwright/test";

const ambientPath = "/lab/images/frame-keywords-six-20260929/ambient-motion.html";
const svgPath = "/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg";

test("버튼 발광 비교의 프레임 움직임 링크로 열면 애니메이션 SVG의 A–D 레이어 4개가 움직이고, 체크를 끄면 그 레이어만 숨는다", async ({ page }) => {
  await page.goto("/lab/images/frame-keywords-six-20260929/");
  await page.getByRole("link", { name: "프레임 움직임", exact: true }).first().click();
  await expect(page).toHaveURL(/\/ambient-motion\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("프레임 움직임");
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  for (const id of ["fm-armor", "fm-gauge", "fm-accent", "fm-bar"]) {
    await expect(page.locator(`#viewer svg #${id}`)).toBeVisible();
  }
  const runningLayers = await page.evaluate(() => {
    const layers = new Set<string>();
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
      const layer = target?.closest("#fm-armor, #fm-gauge, #fm-accent, #fm-bar");
      if (layer && animation.playState === "running") layers.add(layer.id);
    }
    return [...layers].sort();
  });
  expect(runningLayers).toEqual(["fm-accent", "fm-armor", "fm-bar", "fm-gauge"]);
  const orbitTimes = await page.evaluate(() => document.querySelector("#viewer svg")!.getAnimations({ subtree: true })
    .filter((animation) => ((animation.effect as KeyframeEffect | null)?.target as Element | null)?.classList.contains("fm-orbit"))
    .map((animation) => Math.round(Number(animation.currentTime))));
  expect(orbitTimes).toHaveLength(4);
  expect(new Set(orbitTimes).size).toBe(1);

  await page.getByLabel("A 큰 광원").uncheck();
  await expect(page.locator("#viewer svg #fm-armor")).toBeHidden();
  await expect(page.locator("#viewer svg #fm-gauge")).toBeVisible();
  await page.getByLabel("A 큰 광원").check();
  await expect(page.locator("#viewer svg #fm-armor")).toBeVisible();
});

test("움직임 마스크는 레인(x 222–801, y 0–1094)과 버튼부(x 196–827, y 1095–1345)에서 모두 0이고 하단 바 마스크는 바 상자(x 360–663, y 1355–1420) 밖에서 0이다", async ({ page }) => {
  await page.goto(ambientPath);
  const result = await page.evaluate(async (svgUrl) => {
    const markup = await (await fetch(svgUrl)).text();
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    const decode = async (selector: string) => {
      const href = doc.querySelector(selector)!.getAttribute("href")!;
      const image = new Image();
      image.src = href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1536;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1024, 1536).data;
    };
    const armor = await decode("#fm-armor-mask image");
    const bar = await decode("#fm-bar-mask image");
    const accent = await decode("#fm-accent-image");
    const inBox = (x: number, y: number, x0: number, x1: number, y0: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    let armorInside = 0, accentInside = 0, barOutside = 0, armorTotal = 0, accentTotal = 0, barTotal = 0;
    for (let y = 0; y < 1536; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const forbidden = inBox(x, y, 222, 801, 0, 1094) || inBox(x, y, 196, 827, 1095, 1345);
        if (armor[i] > 0) { armorTotal++; if (forbidden) armorInside++; }
        if (accent[i + 3] > 0) { accentTotal++; if (forbidden) accentInside++; }
        if (bar[i] > 0) { barTotal++; if (!inBox(x, y, 360, 663, 1355, 1420)) barOutside++; }
      }
    }
    return { armorInside, accentInside, barOutside, armorTotal, accentTotal, barTotal };
  }, svgPath);
  expect(result.armorInside).toBe(0);
  expect(result.accentInside).toBe(0);
  expect(result.barOutside).toBe(0);
  expect(result.armorTotal).toBeGreaterThan(50000);
  expect(result.accentTotal).toBeGreaterThan(2000);
  expect(result.barTotal).toBeGreaterThan(2000);
});

test("보관한 시연 페이지 ambient-motion.html은 당시 동작 그대로 모션 감소 설정(prefers-reduced-motion: reduce)이면 애니메이션 SVG의 애니메이션이 하나도 돌지 않는다(RFD 0030 결정 5, Lab Gear 비교 화면과 다름)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(ambientPath);
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);
  expect(running).toBe(0);
});

test("보기를 왼쪽 장갑·하단으로 바꾸면 SVG viewBox가 0 420 320 480·300 1240 424 212가 되고 전체로 돌아오면 0 0 1024 1536이다", async ({ page }) => {
  await page.goto(ambientPath);
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const svg = page.locator("#viewer svg");
  await page.getByText("왼쪽 장갑", { exact: true }).click();
  await expect(svg).toHaveAttribute("viewBox", "0 420 320 480");
  await page.getByText("하단", { exact: true }).click();
  await expect(svg).toHaveAttribute("viewBox", "300 1240 424 212");
  await page.getByText("전체", { exact: true }).click();
  await expect(svg).toHaveAttribute("viewBox", "0 0 1024 1536");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("프레임 움직임 SVG 파일은 이미지로 열어도 1024×1536으로 디코드된다", async ({ page }) => {
  await page.goto(ambientPath);
  const size = await page.evaluate(async (svgUrl) => {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, svgPath);
  expect(size).toEqual([1024, 1536]);
});

test("A 큰 광원 띠는 가로 중앙(x 512)에서 0초에 프레임 위(-841), 30초에 가운데(768), 59.9초에 아래(2370 넘게)로 한 방향으로만 내려가고 60초에 다시 위에서 시작하며 시작·끝에서 기울어진 띠가 프레임에 걸치지 않는다", async ({ page }) => {
  await page.goto(ambientPath);
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const samples = await page.evaluate(() => {
    const svg = document.querySelector("#viewer svg")!;
    const viewer = svg.getBoundingClientRect();
    const marker = svg.querySelector("#fm-light-marker")!;
    return [0, 30000, 59900, 60000].map((time) => {
      for (const animation of svg.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = time; }
      const box = marker.getBoundingClientRect();
      return { x: (box.left + box.width / 2 - viewer.left) * 1024 / viewer.width, y: (box.top + box.height / 2 - viewer.top) * 1536 / viewer.height };
    });
  });
  const [top, middle, bottom, restart] = samples;
  for (const sample of samples) expect(Math.abs(sample.x - 512)).toBeLessThan(2);
  expect(Math.abs(top.y + 841)).toBeLessThan(3);
  expect(Math.abs(middle.y - 768)).toBeLessThan(3);
  expect(bottom.y).toBeGreaterThan(2370);
  expect(Math.abs(restart.y + 841)).toBeLessThan(3);

  const geometry = await page.evaluate(async (svgUrl) => {
    const markup = await (await fetch(svgUrl)).text();
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    const height = Number(doc.querySelector("#fm-lit-mask rect")!.getAttribute("height"));
    const tilt = Number(doc.querySelector("#fm-lit-mask [transform^='rotate']")!.getAttribute("transform")!.match(/rotate\((-?[\d.]+)/)![1]);
    const [, from, to] = markup.match(/@keyframes fm-orbit \{ from \{ transform: translateY\((-?[\d.]+)px\); \} to \{ transform: translateY\((-?[\d.]+)px\); \} \}/)!.map(Number);
    return { height, tilt, from, to };
  }, svgPath);
  const radians = Math.abs(geometry.tilt) * Math.PI / 180;
  const reach = (geometry.height / 2) / Math.cos(radians) + 512 * Math.tan(radians);
  expect(-geometry.from).toBeGreaterThan(reach);
  expect(geometry.to - 1536).toBeGreaterThan(reach);
});

test("빛 받는 레이어는 채도 0.9 뒤 대비 1.1배(기준 밝기 0.32)로 높인 원래 프레임 복사본이고 곧은 경계의 사선 띠 두 단계(1380·840px)로 잘리며 띠 밖 장갑은 0.07만큼 어두워진다", async ({ page }) => {
  await page.goto(ambientPath);
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const result = await page.evaluate(async (svgUrl) => {
    const doc = new DOMParser().parseFromString(await (await fetch(svgUrl)).text(), "image/svg+xml");
    const saturation = doc.querySelector("#fm-contrast feColorMatrix")!.getAttribute("values");
    const funcs = [...doc.querySelectorAll("#fm-contrast feFuncR, #fm-contrast feFuncG, #fm-contrast feFuncB")].map((node) => [node.getAttribute("slope"), node.getAttribute("intercept")]);
    const bands = [...doc.querySelectorAll("#fm-lit-mask rect")].map((rect) => ({ height: rect.getAttribute("height"), fill: rect.getAttribute("fill") }));
    const tilt = doc.querySelector("#fm-lit-mask [transform^='rotate']")!.getAttribute("transform");
    const curved = doc.querySelectorAll("#fm-lit-mask circle, #fm-lit-mask ellipse, #fm-lit-mask [fill^='url']").length;
    const usesBase = doc.querySelector("#fm-lit use")!.getAttribute("href");
    const unlit = getComputedStyle(document.querySelector("#viewer svg #fm-unlit")!).opacity;
    return { saturation, funcs, bands, tilt, curved, usesBase, unlit };
  }, svgPath);
  expect(result.saturation).toBe("0.9");
  expect(result.funcs).toEqual([["1.1", "-0.032"], ["1.1", "-0.032"], ["1.1", "-0.032"]]);
  expect(result.bands).toEqual([{ height: "1380", fill: "#808080" }, { height: "840", fill: "#fff" }]);
  expect(result.tilt).toBe("rotate(-14 512 0)");
  expect(result.curved).toBe(0);
  expect(result.usesBase).toBe("#fm-base");
  expect(result.unlit).toBe("0.07");
});

test("모든 애니메이션을 5초에 멈춘 뒤 처음부터 재생을 누르면 SVG의 모든 애니메이션이 0초부터 다시 재생된다", async ({ page }) => {
  await page.goto(ambientPath);
  await expect(page.locator("#viewer")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const result = await page.evaluate(() => {
    const svg = document.querySelector("#viewer svg")!;
    for (const animation of svg.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 5000; }
    (document.getElementById("restart") as HTMLButtonElement).click();
    const animations = svg.getAnimations({ subtree: true });
    return { count: animations.length, maxTime: Math.max(...animations.map((animation) => Number(animation.currentTime))), allRunning: animations.every((animation) => animation.playState === "running") };
  });
  expect(result.count).toBeGreaterThan(10);
  expect(result.maxTime).toBeLessThan(100);
  expect(result.allRunning).toBe(true);
});
