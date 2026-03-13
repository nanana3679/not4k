/**
 * SVG → PNG 빌드 스크립트
 *
 * assets-lab의 Vite dev server를 띄우고 Playwright로 각 스킨 요소를 개별 PNG로 캡처.
 * 사용: pnpm build:skins
 */

import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT = resolve(ROOT, "public/skins");

const SKIN_IDS = [
  "crystal",
  "prism",
  "classic",
];

const SCALES = [1, 2];

const ASSETS = [
  "note-single",
  "note-double",
  "terminal-single",
  "terminal-double",
  "body-single",
  "body-double",
  "body-single-held",
  "body-double-held",
  ...Array.from({ length: 16 }, (_, i) =>
    `bomb-${String(i).padStart(2, "0")}`
  ),
  ...Array.from({ length: 4 }, (_, i) => `button-idle-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `button-pressed-${i + 1}`),
  "gear-frame",
];

async function main() {
  console.log("🎨 Starting skin asset build...\n");

  // 1. Vite dev server 시작
  const server = await createServer({
    root: resolve(ROOT, "assets-lab"),
    configFile: resolve(ROOT, "assets-lab/vite.config.js"),
    server: { port: 4173, strictPort: true },
    logLevel: "silent",
  });
  await server.listen();
  const url = `http://localhost:4173/?export`;
  console.log(`  Vite server at ${url}`);

  // 2. Playwright 브라우저 시작
  const browser = await chromium.launch();

  let total = 0;
  for (const scale of SCALES) {
    const scaleLabel = scale === 1 ? "@1x" : `@${scale}x`;
    console.log(`\n  === ${scaleLabel} ===`);

    const context = await browser.newContext({ deviceScaleFactor: scale });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("#export-ready", { timeout: 10000, state: "attached" });

    // 3. 각 스킨의 각 에셋 캡처
    for (const skinId of SKIN_IDS) {
      const skinDir = scale === 1
        ? resolve(OUTPUT, skinId)
        : resolve(OUTPUT, skinId, `@${scale}x`);
      if (!existsSync(skinDir)) {
        mkdirSync(skinDir, { recursive: true });
      }

      const results = [];
      for (const asset of ASSETS) {
        const elId = `${skinId}--${asset}`;
        const el = page.locator(`#${elId}`);

        const count = await el.count();
        if (count === 0) {
          console.warn(`  ⚠ Missing: ${elId}`);
          continue;
        }

        const outPath = resolve(skinDir, `${asset}.png`);
        await el.screenshot({
          path: outPath,
          omitBackground: true,
        });
        results.push(asset);
        total++;
      }

      console.log(`  ✓ ${skinId} ${scaleLabel}: ${results.length} assets`);
    }

    await context.close();
  }

  // 4. 정리
  await browser.close();
  await server.close();

  console.log(`\n✅ Done! ${total} PNG files exported to public/skins/`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
