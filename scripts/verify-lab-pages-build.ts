import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve(process.cwd(), "dist-lab");
const requiredPaths = [
  ".nojekyll",
  "404.html",
  "lab/index.html",
  "lab/flight-background-preview/index.html",
  "lab/facility-passage/index.html",
  "lab/note-assets/index.html",
  "lab/gear/index.html",
  "lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg",
  "lab/tutorial-pattern-diagram/index.html",
  "lab/judgment-playtest/index.html",
  "lab/images/module-size-distance-20260910/index.html",
  "lab/images/size-distance-altitude-eight-20260910/index.html",
  "__lab/flight-background-preview/index.html",
  "__lab/flight-background-preview/flight/liftoff/index.html",
  "__lab/flight-background-preview/flight/infiltration/index.html",
  "__lab/flight-background-preview/flight/breakthrough/index.html",
  "__lab/flight-background-preview/flight/breakthrough/study.html",
  "__lab/flight-background-preview/flight/breakthrough/passage.mjs",
  "__lab/flight-background-preview/flight/breakthrough/render-quality.mjs",
  "skins/crystal/note-single.png",
  "gear/gear.png",
  // 고도 게이지 빈 유리(스킨 공통 gearGaugeEmpty). /lab/gear와 Lab 재생기의 스킨 읽기가 함께 받는다.
  "gear/gear-gauge-empty.png",
  // `gearMotion` 에셋은 기어 그림 옆 공용 경로에 있고 게임과 Lab이 함께 읽는다(RFD 0029).
  "gear/gear-motion/gear-motion.json",
  "gear/gear-motion/armor-lit.png",
  "gear/gear-motion/armor-core.png",
  "gear/gear-motion/accent-glow.png",
  "gear/gear-motion/accent-overlap.png",
  "gear/gear-motion/liquid-tile.png",
  "gear/gear-motion/bar-mask.png",
  "gear/gear-motion/bar-base.png",
  "gear/gear-motion/glint.png",
  "gear/gear-motion/bubbles.png",
  "lab/skin-versions/classic/v001/skin/note-single.png",
  "lab/skin-versions/classic/v002/skin/note-single.png",
  "lab/skin-versions/classic/v001/svg/body-double-idle.svg",
  "lab/skin-versions/classic/v002/svg/body-double-idle.svg",
  "lab/skin-versions/classic/v012/skin/terminal-trill.png",
  "lab/skin-versions/classic/v012/skin/point-contact-shadow.png",
  "lab/skin-versions/classic/v012/svg/terminal-trill-failed.svg",
  "lab/skin-versions/classic/v013/skin/point-contact-shadow-trill.png",
  "lab/skin-versions/classic/v013/svg/point-contact-shadow-trill.svg",
  "lab/skin-versions/classic/v014/skin/body-trill-held.png",
  "lab/skin-versions/classic/v014/svg/body-trill-on.svg",
];

await Promise.all(requiredPaths.map((pathname) => access(resolve(outputRoot, pathname))));

for (const retiredPath of [
  'lab/geometric-background', 'lab/perspective-surface-grid', 'lab/gear-light', 'lab/gear-measure-pulse', 'lab/gear-samples',
  'gear/gear-frame.png', 'gear/gear-gauge-left.png', 'lab/skin-versions/classic/v014/gear',
  // #231에서 장식 그림의 이름을 frame에서 gear(기어)로 바꿨다. 옛 Lab 경로(옛 컷아웃·`gearMotion` 에셋 복사본 포함)와 에셋 경로는 공개하지 않는다.
  // 옛 Lab 주소는 클라이언트 라우트가 /lab/gear로 넘기므로 정적 폴더가 없어야 한다.
  'lab/classic-frame-fit', 'gear/classic-frame.png', 'gear/classic-frame-motion',
  // 기어는 스킨 공용이라 Classic 스킨 이름을 붙이지 않는다. 그 전 이름의 Lab·에셋 경로도 공개하지 않는다.
  'lab/classic-gear', 'gear/classic-gear.png', 'gear/classic-gear-motion',
]) {
  await access(resolve(outputRoot, retiredPath)).then(
    () => { throw new Error(`Retired Lab asset must not be published: ${retiredPath}`); },
    error => { if (error.code !== 'ENOENT') throw error; },
  );
}

const labDocument = await readFile(resolve(outputRoot, "lab/index.html"), "utf8");
const flightDocument = await readFile(resolve(outputRoot, "__lab/flight-background-preview/index.html"), "utf8");

if (!labDocument.includes('/not4k/assets/')) throw new Error("Lab document is missing the GitHub Pages asset base");
if (!flightDocument.includes('/not4k/__lab/flight-background-preview/flight/liftoff/')) {
  throw new Error("Flight preview is missing the GitHub Pages scene base");
}

const galleryRoot = resolve(outputRoot, "lab/images");
const galleryDirectories = (await readdir(galleryRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
for (const galleryEntry of galleryDirectories) {
  const galleryDirectory = resolve(galleryRoot, galleryEntry.name);
  const galleryDocument = await readFile(resolve(galleryDirectory, "index.html"), "utf8");
  const localAssetPaths = [...galleryDocument.matchAll(/\b(?:src|data-src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((pathname) => !/^(?:[a-z]+:|\/\/|\/|#)/i.test(pathname))
    .map((pathname) => pathname.split(/[?#]/, 1)[0]);

  if (localAssetPaths.length === 0) throw new Error(`Image gallery has no relative assets: ${galleryEntry.name}`);
  await Promise.all(localAssetPaths.map((pathname) => access(resolve(galleryDirectory, pathname))));
}

const javascriptFiles = (await readdir(resolve(outputRoot, "assets"))).filter((name) => name.endsWith(".js"));
const javascriptSource = (
  await Promise.all(javascriptFiles.map((name) => readFile(resolve(outputRoot, "assets", name), "utf8")))
).join("\n");
if (javascriptSource.includes("VITE_SUPABASE_URL") || javascriptSource.includes("supabase.co")) {
  throw new Error("The public Lab bundle must not initialize Supabase");
}

try {
  await access(resolve(outputRoot, "__lab/flight-background-preview/preview-server.mjs"));
  throw new Error("The Node preview server must not be published");
} catch (error) {
  if (error instanceof Error && error.message === "The Node preview server must not be published") throw error;
}

console.log(
  `Lab Pages artifact verified: ${requiredPaths.length} required paths and ${galleryDirectories.length} image galleries`,
);
