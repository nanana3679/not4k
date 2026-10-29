import { loadEnv } from 'vite';

/**
 * Supabase 자격 증명이 없을 때 E2E dev 서버에 넣는 오프라인용 더미 값.
 * index.html CSP(connect-src·img-src·media-src)가 https://*.supabase.co만 허용하므로 그 안의 주소를 쓴다.
 * 다른 주소면 브라우저가 요청을 막아 Playwright의 page.route까지 오지 않는다.
 * 이 호스트는 DNS에 없어서 스펙이 응답하지 않은 요청은 네트워크 오류로 끝난다.
 */
export const E2E_OFFLINE_SUPABASE_ENV = {
  VITE_SUPABASE_URL: 'https://e2e-offline.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-offline-publishable-key',
};

/**
 * Playwright webServer(`npm run dev`)에 더할 환경 변수를 정한다.
 * - `VITE_DEV_ADMIN=true`는 항상 넣는다. E2E는 dev 빌드에서만 돌고, 배포 빌드에서는 이 우회가 빠진다.
 * - Supabase URL·키는 Vite dev 서버가 읽을 값에 둘 다 있으면 그대로 두고, 둘 중 하나라도 없으면(빈 값 포함)
 *   더미 값 한 쌍을 넣는다. `loadEnv`가 dev 서버와 같은 방식으로 process.env와 envDir의 `.env`·`.env.local`·
 *   `.env.development`·`.env.development.local`을 읽는다. Vite는 process.env를 `.env*`보다 우선하므로, 이렇게
 *   확인하지 않고 넣으면 `.env.local`의 실제 자격 증명을 덮는다. 하나만 있으면 `src/supabase/client.ts`가
 *   클라이언트를 만들 수 없으므로 둘 다 더미로 바꾼다. 한 쌍을 함께 바꾸므로 실제 URL과 더미 키가 섞이지 않는다.
 */
export function e2eDevServerEnv(envDir: string): Record<string, string> {
  // `npm run dev`(`vite`)의 모드는 development다.
  const viteEnv = loadEnv('development', envDir, 'VITE_');
  const hasSupabaseCredentials = Boolean(viteEnv.VITE_SUPABASE_URL && viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  return {
    VITE_DEV_ADMIN: 'true',
    ...(hasSupabaseCredentials ? {} : E2E_OFFLINE_SUPABASE_ENV),
  };
}
