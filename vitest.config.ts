import { defineConfig } from "vitest/config";

export default defineConfig({
  // 단위 테스트는 .env·.env.local·.env.test* 파일을 하나도 읽지 않는다(#373). worktree마다 .env.local 유무가 달라도
  // 테스트가 보는 환경 변수가 같고, .env.local의 실제 자격 증명·VITE_DEV_ADMIN이 테스트에 들어오지 않는다.
  // 셸에서 export한 VITE_* 값은 Vite가 그대로 넘기므로 Supabase 키는 아래 test.env가 덮는다.
  envDir: false,
  test: {
    include: ["src/**/*.test.ts", "assets-lab/**/*.test.ts", "scripts/**/*.test.ts"],
    // 단위 테스트는 실제 Supabase에 닿지 않는다(#373). 이 setup이 src/supabase/client를 쓰면 던지게 바꾸고,
    // Supabase 호스트(*.supabase.co·*.supabase.in·아래 더미 호스트)로 가는 fetch를 보내기 전에 거부한다.
    setupFiles: ["src/supabase/blockClientInUnitTests.ts"],
    // 셸에서 실제 자격 증명을 export해도 테스트에는 이 더미 값만 보인다.
    // .invalid는 DNS로 풀리지 않는 예약 도메인이라, 차단을 우회한 요청이 있어도 supabase.co 같은 실제 호스트로 나가지 않는다.
    env: {
      VITE_SUPABASE_URL: "https://unit-test-offline.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "unit-test-offline-publishable-key",
    },
  },
});
