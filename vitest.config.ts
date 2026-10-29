import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "assets-lab/**/*.test.ts", "scripts/**/*.test.ts"],
    // 단위 테스트는 실제 Supabase에 닿지 않는다(#373). 이 setup이 src/supabase/client를 쓰면 던지게 바꾼다.
    setupFiles: ["src/supabase/blockClientInUnitTests.ts"],
    // worktree의 .env.local에 실제 자격 증명이 있어도 테스트에는 이 더미 값만 보인다.
    // .invalid는 DNS로 풀리지 않는 예약 도메인이라, 차단을 우회한 요청이 있어도 supabase.co 같은 실제 호스트로 나가지 않는다.
    env: {
      VITE_SUPABASE_URL: "https://unit-test-offline.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "unit-test-offline-publishable-key",
    },
  },
});
