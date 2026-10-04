import { expect, test } from "@playwright/test";

const galleryPath = "/lab/images/frame-keywords-six-20260929/";

for (const width of [390, 1280]) {
  test(`${width}px Lab에서 백색광 버튼 수정 전후 2장을 비교하고 SVG 확대·다운로드 뒤 Lab 목록으로 돌아온다`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/lab");
    const galleryPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /^전체 프레임 · 백색광 버튼/ }).click();
    const gallery = await galleryPromise;
    await gallery.setViewportSize({ width, height: 900 });
    await expect(gallery).toHaveURL(new RegExp(`${galleryPath}$`));
    await expect(gallery.getByRole("heading", { level: 1 })).toHaveText("버튼 발광 · 백색광과 고유색 주변광");
    await expect(gallery.locator(".study")).toHaveCount(2);
    for (const image of await gallery.locator(".study .artwork img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 1024)).toBe(true);
    }
    await expect(gallery.getByText("버튼 발광 확대", { exact: true })).toHaveCount(2);
    await expect.poll(() => gallery.locator(".crop-key img").evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 1024))).toBe(true);
    expect(await gallery.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await gallery.getByText("기준 시안과 보존 영역", { exact: true }).click();
    await expect(gallery.getByRole("link", { name: "채택한 임시 시안 v15" })).toHaveAttribute("href", "52-restored-frame-v15.svg");
    await gallery.getByText("실제 전달한 요청", { exact: true }).click();
    await expect(gallery.locator("#principles")).toContainText("BRIGHT NEUTRAL WHITE");
    const originalPromise = context.waitForEvent("page");
    await gallery.getByRole("link", { name: "백색광 수정안 원본 확대", exact: true }).click();
    const original = await originalPromise;
    await expect(original).toHaveURL(/\/53-white-core-frame-v16\.svg$/);
    await original.close();
    const downloadPromise = gallery.waitForEvent("download");
    await gallery.getByRole("link", { name: "백색광 수정안 SVG 다운로드", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("53-white-core-frame-v16.svg");
    expect(await download.failure()).toBeNull();
    await gallery.getByRole("link", { name: "← Lab 목록", exact: true }).last().click();
    await expect(gallery).toHaveURL(/\/lab\/$/);
    await expect(gallery.getByRole("heading", { name: "Preview Archive" })).toBeVisible();
  });
}

test("복원 SVG의 버튼 영역 밖 1,422,055개 픽셀은 초기 B 프레임과 같고 버튼 영역만 달라진다", async ({ page }) => {
  await page.goto(galleryPath);
  const pixels = await page.evaluate(async () => {
    const loadPixels = async (file: string) => {
      const image = new Image();
      image.src = new URL(file, location.href).href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1536;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1024, 1536).data;
    };
    const [original, restored] = await Promise.all([
      loadPixels("22-free-b-v6.png"),
      loadPixels("52-restored-frame-v15.svg"),
    ]);
    let checkedOutside = 0;
    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < 1536; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const changed = original[i] !== restored[i] || original[i + 1] !== restored[i + 1]
          || original[i + 2] !== restored[i + 2] || original[i + 3] !== restored[i + 3];
        const insideButtonArea = x >= 198 && x <= 828 && y >= 1116 && y <= 1354;
        if (!insideButtonArea) {
          checkedOutside++;
          if (changed) changedOutside++;
        } else if (changed) changedInside++;
      }
    }
    return { checkedOutside, changedOutside, changedInside };
  });
  expect(pixels.checkedOutside).toBe(1422055);
  expect(pixels.changedOutside).toBe(0);
  expect(pixels.changedInside).toBeGreaterThan(100000);
});


test("백색광 수정 SVG의 버튼 주변 밖 1,539,033개 픽셀은 임시 시안 v15와 같다", async ({ page }) => {
  await page.goto(galleryPath);
  const pixels = await page.evaluate(async () => {
    const loadPixels = async (file: string) => {
      const image = new Image();
      image.src = new URL(file, location.href).href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1536;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1024, 1536).data;
    };
    const [original, edited] = await Promise.all([
      loadPixels("52-restored-frame-v15.svg"),
      loadPixels("53-white-core-frame-v16.svg"),
    ]);
    let checkedOutside = 0;
    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < 1536; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const changed = original[i] !== edited[i] || original[i + 1] !== edited[i + 1]
          || original[i + 2] !== edited[i + 2] || original[i + 3] !== edited[i + 3];
        const insideLightArea = x >= 348 && x <= 536 && y >= 1096 && y <= 1274;
        if (!insideLightArea) {
          checkedOutside++;
          if (changed) changedOutside++;
        } else if (changed) changedInside++;
      }
    }
    return { checkedOutside, changedOutside, changedInside };
  });
  expect(pixels.checkedOutside).toBe(1539033);
  expect(pixels.changedOutside).toBe(0);
  expect(pixels.changedInside).toBeGreaterThan(10000);
});

const pressAnimationPath = `${galleryPath}press-animation.html`;
const layerOpacity = (page: import("@playwright/test").Page, layer: string) =>
  page.locator(`[data-layer="${layer}"]`).evaluate(node => getComputedStyle(node).opacity);

for (const width of [390, 1280]) {
  test(`${width}px 버튼 발광 비교에서 누름 애니메이션을 열어 둘째 키를 누르고 전체 프레임으로 바꾼 뒤 비교로 돌아온다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(galleryPath);
    await page.getByRole("link", { name: "버튼 누름과 게이지", exact: true }).first().click();
    await expect(page).toHaveURL(/\/press-animation\.html$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("버튼 누름과 게이지");
    await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

    const hit = page.getByRole("button", { name: "둘째 키 누르기 (F)" });
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(hit).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.key[data-key="2"]')).toHaveClass(/is-down/);
    await page.mouse.up();
    await expect(hit).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => layerOpacity(page, "tint-2-single")).toBe("0");

    await page.getByText("전체 프레임", { exact: true }).click();
    await expect(page.locator("#viewport")).toHaveAttribute("data-view", "full");
    await page.getByRole("link", { name: "버튼 발광 전후 비교", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("버튼 발광 · 백색광과 고유색 주변광");
  });
}

test("누름 애니메이션의 대기 레이어는 둘째 키 반전 영역과 가운데 틈 밖 1,521,728개 픽셀이 v16과 같고 셋째 키 레이어는 둘째 키의 x↔1022-x 반전이다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("53-white-core-frame-v16.svg", location.href).href;
    await image.decode();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1024;
    sourceCanvas.height = 1536;
    sourceCanvas.getContext("2d")!.drawImage(image, 0, 0);
    const source = sourceCanvas.getContext("2d")!.getImageData(0, 0, 1024, 1536).data;
    const read = (layer: string) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-layer="${layer}"]`)!;
      return { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, left: parseInt(canvas.style.left || "0") };
    };
    const idle = read("idle").data;
    const inPatch = (x: number, y: number) => x >= 338 && x <= 511 && y >= 1092 && y <= 1355;
    const inGap = (x: number, y: number) => x >= 486 && x <= 536 && y >= 1092 && y <= 1299;
    const rgbEqual = (a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number) => a[i] === b[j] && a[i + 1] === b[j + 1] && a[i + 2] === b[j + 2];
    let checkedOutside = 0;
    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < 1536; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const changed = !rgbEqual(idle, i, source, i) || idle[i + 3] !== source[i + 3];
        if (!inPatch(x, y) && !inGap(x, y)) {
          checkedOutside++;
          if (changed) changedOutside++;
        } else if (changed) changedInside++;
      }
    }
    let asymmetricIdle = 0;
    for (let y = 1104; y <= 1343; y++) {
      for (let x = 350; x <= 511; x++) {
        if (!rgbEqual(idle, (y * 1024 + x) * 4, idle, (y * 1024 + 1022 - x) * 4)) asymmetricIdle++;
      }
    }
    const glow2 = read("glow-2-single");
    let glowInteriorMismatch = 0;
    for (let y = 1104; y <= 1343; y++) {
      for (let x = 372; x <= 503; x++) {
        const local = ((y - 1092) * glow2.width + (x - glow2.left)) * 4;
        if (!rgbEqual(glow2.data, local, source, (y * 1024 + x) * 4) || glow2.data[local + 3] !== 255) glowInteriorMismatch++;
      }
    }
    const mirrorMismatch = (left: string, right: string) => {
      const a = read(left);
      const b = read(right);
      let mismatch = 0;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          const j = (y * b.width + (b.width - 1 - x)) * 4;
          if (!rgbEqual(a.data, i, b.data, j) || a.data[i + 3] !== b.data[j + 3]) mismatch++;
        }
      }
      return { mismatch, leftSum: a.left + a.width - 1 + b.left, sameSize: a.width === b.width && a.height === b.height };
    };
    return {
      checkedOutside, changedOutside, changedInside, asymmetricIdle, glowInteriorMismatch,
      glow: mirrorMismatch("glow-2-single", "glow-3-single"),
      tint: mirrorMismatch("tint-2-single", "tint-3-single"),
      glowDouble: mirrorMismatch("glow-2-double", "glow-3-double"),
      tintDouble: mirrorMismatch("tint-2-double", "tint-3-double"),
      cap: mirrorMismatch("cap-2", "cap-3"),
    };
  });
  expect(result.checkedOutside).toBe(1521728);
  expect(result.changedOutside).toBe(0);
  expect(result.changedInside).toBeGreaterThan(20000);
  expect(result.asymmetricIdle).toBe(0);
  expect(result.glowInteriorMismatch).toBe(0);
  for (const pair of [result.glow, result.tint, result.glowDouble, result.tintDouble, result.cap]) {
    expect(pair).toEqual({ mismatch: 0, leftSum: 1022, sameSize: true });
  }
});

test("J를 누르는 즉시 셋째 키 발광 opacity 1·키 덮개 0이 되고, 10배 느리게 떼면 키 복귀 400ms가 끝난 뒤에도 연파랑 잔광이 남는다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await page.getByLabel("10배 느리게").check();
  await expect(page.locator("#viewport")).toHaveCSS("--cap-ms", "400ms");
  await expect(page.locator("#viewport")).toHaveCSS("--white-ms", "530ms");
  await expect(page.locator("#viewport")).toHaveCSS("--glow-ms", "1500ms");

  const pressed = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j" }));
    const opacity = (layer: string) => getComputedStyle(document.querySelector(`[data-layer="${layer}"]`)!).opacity;
    return { glow: opacity("glow-3-single"), tint: opacity("tint-3-single"), cap: opacity("cap-3"), otherKey: opacity("glow-2-single") };
  });
  expect(pressed).toEqual({ glow: "1", tint: "1", cap: "0", otherKey: "0" });

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ", key: "j" })));
  await expect.poll(() => layerOpacity(page, "cap-3"), { timeout: 1500 }).toBe("1");
  const lingering = Number(await layerOpacity(page, "tint-3-single"));
  expect(lingering).toBeGreaterThan(0);
  expect(lingering).toBeLessThan(1);
  await expect.poll(() => layerOpacity(page, "tint-3-single"), { timeout: 3000 }).toBe("0");
});

test("F와 포인터로 둘째 키를 함께 누르다 F만 떼면 계속 눌려 있고 포인터까지 떼야 풀린다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const hit = page.getByRole("button", { name: "둘째 키 누르기 (F)" });
  const box = (await hit.boundingBox())!;
  await page.keyboard.down("f");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.keyboard.up("f");
  await expect(hit).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(hit).toHaveAttribute("aria-pressed", "false");
});

test("잔광 고유색을 끄면 잔광 레이어가 숨고 백색광이 잔광 150ms 전체에 걸쳐 꺼진다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await expect(page.locator("#viewport")).toHaveCSS("--white-ms", "53ms");
  await page.getByLabel("잔광이 고유색으로 꺼짐").uncheck();
  await expect(page.locator("#viewport")).toHaveAttribute("data-tint", "off");
  await expect(page.locator('[data-layer="tint-2-single"]')).toBeHidden();
  await expect(page.locator("#viewport")).toHaveCSS("--white-ms", "150ms");
});

test("더블 금색 발광에서 싱글 연파랑 주변광 픽셀은 99% 이상이 연파랑을 벗어나고 90% 이상이 금색(R>B)이 되며 흰 중심(250 이상)과 무채색 픽셀은 싱글 그대로다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const stats = await page.evaluate(() => {
    const read = (layer: string) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-layer="${layer}"]`)!;
      return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const single = read("glow-2-single");
    const double = read("glow-2-double");
    const isCyan = (data: Uint8ClampedArray, i: number) => data[i + 2] > data[i] + 60 && data[i + 2] > 120;
    let cyanSingle = 0, cyanDouble = 0, goldFromCyan = 0, white = 0, whiteDimmed = 0, gray = 0, grayChanged = 0;
    for (let i = 0; i < single.length; i += 4) {
      if (single[i + 3] < 255) continue;
      if (isCyan(single, i)) {
        cyanSingle++;
        if (double[i] > double[i + 2]) goldFromCyan++;
      }
      if (isCyan(double, i)) cyanDouble++;
      if (single[i] >= 250 && single[i + 1] >= 250 && single[i + 2] >= 250) {
        white++;
        if (Math.min(double[i], double[i + 1], double[i + 2]) < 250) whiteDimmed++;
      }
      if (single[i] === single[i + 1] && single[i + 1] === single[i + 2]) {
        gray++;
        if (double[i] !== single[i] || double[i + 1] !== single[i + 1] || double[i + 2] !== single[i + 2]) grayChanged++;
      }
    }
    return { cyanSingle, cyanDouble, goldFromCyan, white, whiteDimmed, gray, grayChanged };
  });
  expect(stats.cyanSingle).toBeGreaterThan(10000);
  expect(stats.cyanDouble).toBeLessThan(stats.cyanSingle * 0.01);
  expect(stats.goldFromCyan).toBeGreaterThan(stats.cyanSingle * 0.9);
  expect(stats.white).toBeGreaterThan(5000);
  expect(stats.whiteDimmed).toBe(0);
  expect(stats.gray).toBeGreaterThan(1000);
  expect(stats.grayChanged).toBe(0);
});

test("Shift+J는 셋째 키를 즉시 더블 금색으로, 이어서 J만 누르면 싱글 연파랑으로 바꾸고 기본 색을 더블로 두면 반대로 동작한다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const press = (shiftKey: boolean) => page.evaluate((shiftKey) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j", shiftKey }));
    const key = document.querySelector<HTMLElement>('.key[data-key="3"]')!;
    const style = (layer: string) => getComputedStyle(document.querySelector(`[data-layer="${layer}"]`)!);
    const state = {
      color: key.dataset.color,
      doubleOpacity: style("glow-3-double").opacity,
      singleOpacity: style("glow-3-single").opacity,
      singleDisplay: style("glow-3-single").display,
      doubleDisplay: style("glow-3-double").display,
    };
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ", key: "j", shiftKey }));
    return state;
  }, shiftKey);
  expect(await press(true)).toEqual({ color: "double", doubleOpacity: "1", singleOpacity: "1", singleDisplay: "none", doubleDisplay: "block" });
  expect(await press(false)).toEqual({ color: "single", doubleOpacity: "1", singleOpacity: "1", singleDisplay: "block", doubleDisplay: "none" });
  await page.getByText("더블 금색", { exact: true }).click();
  expect((await press(false)).color).toBe("double");
  expect((await press(true)).color).toBe("single");
});

test("1번 키 발광 레이어 안쪽은 생성 이미지 key1-press-insert-v17.png와 같고 4번 키는 그 x↔1022-x 반전이며 네 키의 키 덮개는 각자의 대기 픽셀이다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("key1-press-insert-v17.png", location.href).href;
    await image.decode();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1024;
    sourceCanvas.height = 1536;
    sourceCanvas.getContext("2d")!.drawImage(image, 0, 0);
    const insert = sourceCanvas.getContext("2d")!.getImageData(0, 0, 1024, 1536).data;
    const read = (layer: string) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-layer="${layer}"]`)!;
      return { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, left: parseInt(canvas.style.left), top: parseInt(canvas.style.top) };
    };
    const rgbEqual = (a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number) => a[i] === b[j] && a[i + 1] === b[j + 1] && a[i + 2] === b[j + 2];
    const glow1 = read("glow-1-single");
    let insertMismatch = 0;
    for (let y = 1104; y <= 1343; y++) {
      for (let x = 212; x <= 362; x++) {
        const local = ((y - glow1.top) * glow1.width + (x - glow1.left)) * 4;
        if (!rgbEqual(glow1.data, local, insert, (y * 1024 + x) * 4) || glow1.data[local + 3] !== 255) insertMismatch++;
      }
    }
    const mirrorMismatch = (left: string, right: string) => {
      const a = read(left);
      const b = read(right);
      let mismatch = 0;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          const j = (y * b.width + (b.width - 1 - x)) * 4;
          if (!rgbEqual(a.data, i, b.data, j) || a.data[i + 3] !== b.data[j + 3]) mismatch++;
        }
      }
      return { mismatch, leftSum: a.left + a.width - 1 + b.left };
    };
    const idle = read("idle").data;
    const capMismatch: Record<string, number> = {};
    for (const key of [1, 2, 3, 4]) {
      const cap = read(`cap-${key}`);
      let mismatch = 0;
      for (let y = 0; y < cap.height; y++) {
        for (let x = 0; x < cap.width; x++) {
          const i = (y * cap.width + x) * 4;
          if (cap.data[i + 3] === 255 && !rgbEqual(cap.data, i, idle, ((cap.top + y) * 1024 + cap.left + x) * 4)) mismatch++;
        }
      }
      capMismatch[key] = mismatch;
    }
    return {
      insertMismatch,
      mirrors: ["glow-%-single", "tint-%-single", "glow-%-double", "tint-%-double"].map((name) => mirrorMismatch(name.replace("%", "1"), name.replace("%", "4"))),
      capMismatch,
    };
  });
  expect(result.insertMismatch).toBe(0);
  for (const pair of result.mirrors) expect(pair).toEqual({ mismatch: 0, leftSum: 1022 });
  expect(result.capMismatch).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
});

test("D·F·J·K는 1–4번 키를 각각 누르고 Shift+K는 4번 키를 더블 금색으로 누른다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  for (const [letter, key] of [["d", 1], ["f", 2], ["j", 3], ["k", 4]] as const) {
    await page.keyboard.down(letter);
    await expect(page.locator(`.key[data-key="${key}"]`)).toHaveClass(/is-down/);
    await expect(page.locator(".key.is-down")).toHaveCount(1);
    await page.keyboard.up(letter);
    await expect(page.locator(`.key[data-key="${key}"]`)).not.toHaveClass(/is-down/);
  }
  await page.keyboard.down("Shift");
  await page.keyboard.down("k");
  await expect(page.locator('.key[data-key="4"]')).toHaveAttribute("data-color", "double");
  expect(await layerOpacity(page, "glow-4-double")).toBe("1");
  await page.keyboard.up("k");
  await page.keyboard.up("Shift");
});

test("게이지 채움 50%면 양쪽 빈 게이지 레이어가 유리 821px의 절반 410.5px+경계 4px을 덮고 0%는 829px, 100%는 0px이며 조절하면 전체 프레임 보기로 바뀐다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await expect(page.locator("#viewport")).toHaveAttribute("data-view", "deck");
  const setGauge = (value: number) => page.locator("#gauge").evaluate((element, value) => {
    (element as HTMLInputElement).value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const heights = () => page.locator(".gauge").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.height));
  await setGauge(50);
  expect(await heights()).toEqual(["414.5px", "414.5px"]);
  await expect(page.locator("#viewport")).toHaveAttribute("data-view", "full");
  await expect(page.locator("#gauge-value")).toHaveText("50%");
  await setGauge(0);
  expect(await heights()).toEqual(["829px", "829px"]);
  await setGauge(100);
  expect(await heights()).toEqual(["0px", "0px"]);
});

test("빈 유리 생성 이미지 체크를 끄면 계산 방식으로 바뀌어 유리 안 연파랑 발광 픽셀(B>R+60, B>150)의 평균 밝기가 v16의 절반 이하가 된다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await page.getByLabel("빈 유리를 생성 이미지로").uncheck();
  const stats = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("53-white-core-frame-v16.svg", location.href).href;
    await image.decode();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1024;
    sourceCanvas.height = 1536;
    sourceCanvas.getContext("2d")!.drawImage(image, 0, 0);
    const source = sourceCanvas.getContext("2d")!.getImageData(0, 0, 1024, 1536).data;
    const luma = (data: Uint8ClampedArray, i: number) => .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    const result: Record<string, { cyan: number; cyanLumaRatio: number }> = {};
    for (const wrapper of document.querySelectorAll<HTMLElement>(".gauge")) {
      const canvas = wrapper.querySelector("canvas")!;
      const empty = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const left = parseInt(wrapper.style.left);
      const top = parseInt(wrapper.style.top);
      let cyan = 0, sourceLuma = 0, emptyLuma = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const j = ((top + y) * 1024 + left + x) * 4;
          if (empty[i + 3] < 255 || !(source[j + 2] > source[j] + 60 && source[j + 2] > 150)) continue;
          cyan++;
          sourceLuma += luma(source, j);
          emptyLuma += luma(empty, i);
        }
      }
      result[wrapper.dataset.gauge!] = { cyan, cyanLumaRatio: emptyLuma / sourceLuma };
    }
    return result;
  });
  for (const side of ["left", "right"]) {
    expect(stats[side].cyan).toBeGreaterThan(20000);
    expect(stats[side].cyanLumaRatio).toBeLessThan(0.5);
  }
});

test("게이지 자동 변화를 켜면 전체 프레임 보기로 바뀌고 채움이 82%에서 700ms 뒤 60%로 바뀌며 끄면 멈춘다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await page.getByLabel("게이지 자동 변화").check();
  await expect(page.locator("#viewport")).toHaveAttribute("data-view", "full");
  await expect(page.locator("#gauge-value")).toHaveText("82%");
  await expect(page.locator("#gauge-value")).toHaveText("60%", { timeout: 2000 });
  await page.getByLabel("게이지 자동 변화").uncheck();
  const stopped = await page.locator("#gauge").inputValue();
  await page.waitForTimeout(900);
  expect(await page.locator("#gauge").inputValue()).toBe(stopped);
});

test("게이지를 0%로 비워도 유리 안쪽(x 136–208·815–887, y 196–1016) 밖의 픽셀은 하나도 바뀌지 않고 금속 마개 테두리(172,198)는 덮지 않는다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const result = await page.evaluate(() => {
    const idle = document.querySelector<HTMLCanvasElement>('[data-layer="idle"]')!;
    const composite = (withGauges: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1536;
      const context = canvas.getContext("2d")!;
      context.drawImage(idle, 0, 0);
      if (withGauges) {
        for (const wrapper of document.querySelectorAll<HTMLElement>(".gauge")) {
          context.drawImage(wrapper.querySelector("canvas")!, parseInt(wrapper.style.left), parseInt(wrapper.style.top));
        }
      }
      return context.getImageData(0, 0, 1024, 1536).data;
    };
    const full = composite(false);
    const empty = composite(true);
    const insideGlassBox = (x: number, y: number) => y >= 196 && y <= 1016 && ((x >= 136 && x <= 208) || (x >= 815 && x <= 887));
    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < 1536; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const changed = full[i] !== empty[i] || full[i + 1] !== empty[i + 1] || full[i + 2] !== empty[i + 2];
        if (!changed) continue;
        if (insideGlassBox(x, y)) changedInside++; else changedOutside++;
      }
    }
    const left = document.querySelector<HTMLElement>('.gauge[data-gauge="left"]')!;
    const leftCanvas = left.querySelector("canvas")!;
    const alphaAt = (x: number, y: number) => leftCanvas.getContext("2d")!.getImageData(x - parseInt(left.style.left), y - parseInt(left.style.top), 1, 1).data[3];
    return { changedOutside, changedInside, capRim: alphaAt(172, 198), glass: alphaAt(172, 600) };
  });
  expect(result.changedOutside).toBe(0);
  expect(result.changedInside).toBeGreaterThan(50000);
  expect(result.capRim).toBe(0);
  expect(result.glass).toBe(255);
});

test("빈 유리 기본값은 생성 이미지 gauge-empty-insert-v18.png의 유리 안쪽 픽셀을 그대로 쓴다", async ({ page }) => {
  await page.goto(pressAnimationPath);
  await expect(page.locator("#viewport")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  await expect(page.getByLabel("빈 유리를 생성 이미지로")).toBeChecked();
  const result = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("gauge-empty-insert-v18.png", location.href).href;
    await image.decode();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1024;
    sourceCanvas.height = 1536;
    sourceCanvas.getContext("2d")!.drawImage(image, 0, 0);
    const generated = sourceCanvas.getContext("2d")!.getImageData(0, 0, 1024, 1536).data;
    const counts: Record<string, { opaque: number; mismatch: number }> = {};
    for (const wrapper of document.querySelectorAll<HTMLElement>(".gauge")) {
      const canvas = wrapper.querySelector("canvas")!;
      const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const left = parseInt(wrapper.style.left);
      const top = parseInt(wrapper.style.top);
      let opaque = 0;
      let mismatch = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] < 255) continue;
          opaque++;
          const j = ((top + y) * 1024 + left + x) * 4;
          if (data[i] !== generated[j] || data[i + 1] !== generated[j + 1] || data[i + 2] !== generated[j + 2]) mismatch++;
        }
      }
      counts[wrapper.dataset.gauge!] = { opaque, mismatch };
    }
    return counts;
  });
  for (const side of ["left", "right"]) {
    expect(result[side].opaque).toBeGreaterThan(50000);
    expect(result[side].mismatch).toBe(0);
  }
});
