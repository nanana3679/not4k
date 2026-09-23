import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handlePreviewRequest } from "./output/prototypes/flight-background-preview-20260913/preview-server.mjs";
import { mapLabImageGalleryDevRequest } from "./src/lab/labImageGalleryDevRequest";
import { labImageGalleryCatalog } from "./src/lab/labImageGalleryCatalog";


export default defineConfig({
  plugins: [
    react(),
    labImageGalleryPlugin(),
    flightBackgroundPreviewLabPlugin(),
    excludeLabFromBuildPlugin(),
  ],
  server: {
    port: 3000,
  },
});

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const flightBackgroundPreviewLabPath = "/__lab/flight-background-preview";
const labImageGalleryIds = new Set(labImageGalleryCatalog.map((gallery) => gallery.id));

function labImageGalleryPlugin() {
  return {
    name: "not4k-image-gallery-lab",
    apply: "serve" as const,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const mappedRequest = mapLabImageGalleryDevRequest(request.url ?? "", labImageGalleryIds);
        if (mappedRequest.kind === "pass") {
          next();
          return;
        }
        if (mappedRequest.kind === "reject") {
          response.statusCode = 400;
          response.end("Invalid Lab image gallery path");
          return;
        }

        request.url = mappedRequest.url;
        next();
      });
    },
  };
}

function flightBackgroundPreviewLabPlugin() {
  return {
    name: "not4k-flight-background-preview-lab",
    apply: "serve" as const,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const target = request.url ?? "";
        const insidePreview = target === flightBackgroundPreviewLabPath
          || target.startsWith(`${flightBackgroundPreviewLabPath}/`)
          || target.startsWith(`${flightBackgroundPreviewLabPath}?`);
        if (!insidePreview) {
          next();
          return;
        }
        handlePreviewRequest(request, response, { basePath: flightBackgroundPreviewLabPath });
      });
    },
  };
}

/**
 * 프로덕션 빌드에서 public/lab 에셋(dist/lab)을 제거한다.
 * lab 테스트 페이지는 개발 전용이며, vite는 public/을 무조건 dist로 복사하므로
 * 빌드 산출물에서만 lab 에셋을 제거해 배포 크기를 줄인다. dev 서버에는 영향이 없다.
 */
function excludeLabFromBuildPlugin() {
  return {
    name: "not4k-exclude-lab-from-build",
    apply: "build" as const,
    closeBundle() {
      rmSync(resolve(workspaceRoot, "dist/lab"), { recursive: true, force: true });
      // eslint-disable-next-line no-console
      console.log("[not4k] 프로덕션 빌드에서 dist/lab 에셋 제거됨");
    },
  };
}
