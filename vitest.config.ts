import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "assets-lab/**/*.test.ts"],
  },
});
