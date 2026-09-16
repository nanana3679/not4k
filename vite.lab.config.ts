import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { staticPreviewEntriesAt } from "./output/prototypes/flight-background-preview-20260913/preview-server.mjs";
import { exportLabImageGalleries } from "./scripts/exportLabImageGalleries";
import { labImageGalleryCatalog } from "./src/lab/labImageGalleryCatalog";
import { labPreviewCatalog } from "./src/lab/labPreviewCatalog";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(workspaceRoot, "dist-lab");
const pagesBase = normalizeBase(process.env.LAB_PAGES_BASE ?? "/not4k/");

export default defineConfig({
  base: pagesBase,
  publicDir: resolve(workspaceRoot, "public"),
  plugins: [react(), staticLabPagesPlugin()],
  build: {
    emptyOutDir: true,
    outDir: outputRoot,
    rollupOptions: {
      input: resolve(workspaceRoot, "lab/index.html"),
    },
  },
});

function normalizeBase(value: string) {
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

function publicPathToOutputPath(pathname: string) {
  const baseWithoutTrailingSlash = pagesBase.slice(0, -1);
  if (!pathname.startsWith(`${baseWithoutTrailingSlash}/`)) {
    throw new Error(`Static path is outside Pages base ${pagesBase}: ${pathname}`);
  }
  return resolve(outputRoot, pathname.slice(baseWithoutTrailingSlash.length + 1));
}

function staticLabPagesPlugin(): Plugin {
  return {
    name: "not4k-static-lab-pages",
    apply: "build",
    async closeBundle() {
      const labDocument = await readFile(resolve(outputRoot, "lab/index.html"));

      for (const preview of labPreviewCatalog) {
        const routeDocument = resolve(outputRoot, preview.path.slice(1), "index.html");
        await mkdir(dirname(routeDocument), { recursive: true });
        await writeFile(routeDocument, labDocument);
      }

      await writeFile(resolve(outputRoot, "404.html"), labDocument);
      await writeFile(resolve(outputRoot, ".nojekyll"), "");

      await exportLabImageGalleries({
        workspaceRoot,
        outputRoot,
        galleryIds: labImageGalleryCatalog.map((gallery) => gallery.id),
      });

      const previewBase = `${pagesBase.slice(0, -1)}/__lab/flight-background-preview`;
      for (const entry of await staticPreviewEntriesAt(previewBase)) {
        const destination = publicPathToOutputPath(entry.pathname);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, entry.body);
      }
    },
  };
}
