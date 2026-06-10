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
  plugins: [react(), perspectiveSurfaceGridPresetPlugin()],
  server: {
    port: 3000,
  },
});

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const perspectiveSurfaceGridPresetPath = resolve(workspaceRoot, PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH);

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
