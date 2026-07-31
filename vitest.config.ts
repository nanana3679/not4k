import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      VITE_SUPABASE_URL: "http://localhost",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test",
    },
    include: [
      "src/**/*.test.ts",
      "assets-lab/**/*.test.ts",
      "scripts/**/*.test.ts",
      "supabase/**/*.test.ts",
    ],
  },
});
