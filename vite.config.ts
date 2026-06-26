import { rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH,
  PERSPECTIVE_SURFACE_GRID_PRESET_SAVE_ENDPOINT,
  formatPerspectiveSurfaceGridPresetModule,
} from "./src/lab/perspectiveSurfaceGridPreset";

export default defineConfig({
  plugins: [react(), perspectiveSurfaceGridPresetPlugin(), excludeLabFromBuildPlugin()],
  server: {
    port: 3000,
  },
});

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const perspectiveSurfaceGridPresetPath = resolve(workspaceRoot, PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH);

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

function perspectiveSurfaceGridPresetPlugin() {
  return {
    name: "not4k-perspective-surface-grid-preset",
    configureServer(server) {
      server.middlewares.use(PERSPECTIVE_SURFACE_GRID_PRESET_SAVE_ENDPOINT, async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { ok: false, error: "POST method required" });
          return;
        }

        try {
          const rawBody = await readRequestBody(request);
          const preset = JSON.parse(rawBody);
          const moduleSource = formatPerspectiveSurfaceGridPresetModule(preset);

          await mkdir(dirname(perspectiveSurfaceGridPresetPath), { recursive: true });
          await writeFile(perspectiveSurfaceGridPresetPath, moduleSource, "utf8");
          sendJson(response, 200, { ok: true, path: PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Preset save failed";
          sendJson(response, 400, { ok: false, error: message });
        }
      });
    },
  };
}

function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Uint8Array[] = [];

    request.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    request.on("end", () => {
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", rejectBody);
  });
}

function sendJson(
  response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void },
  statusCode: number,
  body: unknown,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}
