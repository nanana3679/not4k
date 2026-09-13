import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve(process.cwd(), "dist-lab");
const requiredPaths = [
  ".nojekyll",
  "404.html",
  "lab/index.html",
  "lab/flight-background-preview/index.html",
  "lab/geometric-background/index.html",
  "lab/perspective-surface-grid/index.html",
  "lab/gear-light/index.html",
  "lab/gear-measure-pulse/index.html",
  "lab/tutorial-pattern-diagram/index.html",
  "lab/judgment-playtest/index.html",
  "__lab/flight-background-preview/index.html",
  "__lab/flight-background-preview/flight/liftoff/index.html",
  "__lab/flight-background-preview/flight/infiltration/index.html",
  "__lab/flight-background-preview/flight/breakthrough/index.html",
  "skins/crystal/note-single.png",
  "gear/gear-frame.png",
];

await Promise.all(requiredPaths.map((pathname) => access(resolve(outputRoot, pathname))));

const labDocument = await readFile(resolve(outputRoot, "lab/index.html"), "utf8");
const flightDocument = await readFile(resolve(outputRoot, "__lab/flight-background-preview/index.html"), "utf8");

if (!labDocument.includes('/not4k/assets/')) throw new Error("Lab document is missing the GitHub Pages asset base");
if (!flightDocument.includes('/not4k/__lab/flight-background-preview/flight/liftoff/')) {
  throw new Error("Flight preview is missing the GitHub Pages scene base");
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

console.log(`Lab Pages artifact verified: ${requiredPaths.length} required paths`);
