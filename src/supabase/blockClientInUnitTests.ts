/**
 * Vitest 전역 setup(`vitest.config.ts`의 `setupFiles`): 단위 테스트가 실제 Supabase에 요청하지 않게 막는다(#373).
 *
 * 1. 모든 테스트 파일에서 `src/supabase/client`의 `supabase`를 속성 읽기·대입·`in`·삭제·정의를 하는 순간 던지는 객체로 바꾼다.
 *    그래서 테스트가 실수로 `storage.ts`·`songAssets.ts` 같은 실제 저장 경로를 타도 네트워크 요청 전에 멈춘다.
 *    `typeof`·`Object.keys`·전개(`{ ...supabase }`)·`Object.getOwnPropertyDescriptor`는 던지지 않는다(빈 객체로 보인다).
 * 2. `globalThis.fetch`를 Supabase 호스트(`*.supabase.co`·`*.supabase.in`·더미 `unit-test-offline.invalid`) 요청을
 *    보내기 전에 거부하는 guard로 감싼다(`supabaseFetchGuard.ts`). 클라이언트를 거치지 않는 요청
 *    (복사한 Storage URL을 직접 fetch하는 코드)과 `vi.unmock`으로 차단을 푼 실제 클라이언트의 요청도 막는다.
 *    `vi.stubGlobal`이 아니라 직접 대입하므로 테스트의 `vi.unstubAllGlobals()`는 이 guard를 되돌린다.
 *
 * - 클라이언트가 필요한 테스트는 그 파일에서 `vi.mock("<상대 경로>/supabase/client", () => ({ supabase: ... }))`로
 *   필요한 부분만 직접 대체한다. 테스트 파일의 `vi.mock`이 이 setup의 `vi.mock`을 덮는다.
 *   fetch가 필요한 테스트는 `vi.stubGlobal("fetch", ...)`로 대체한다.
 * - 실제 `client.ts` 자체를 검사하는 `client.test.ts`만 `vi.unmock("./client")`로 클라이언트 차단을 푼다. fetch guard는 그대로 남는다.
 * - `vitest.config.ts`는 `.env*` 파일을 읽지 않고(`envDir: false`) `VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`를
 *   더미 값으로 고정하므로 worktree의 `.env.local`이 새지 않는다.
 */

import { vi } from "vitest";
import { installSupabaseFetchGuard } from "./supabaseFetchGuard";

// vi.mock은 파일 맨 위로 올라가므로 factory 안에서 필요한 것을 모두 만든다.
vi.mock("./client", () => {
  const blocked = (property: PropertyKey): never => {
    throw new Error(
      `[단위 테스트] 실제 Supabase 클라이언트(src/supabase/client)는 단위 테스트에서 쓸 수 없습니다(건드린 속성: ${String(property)}). ` +
        '이 테스트 파일에서 vi.mock("<상대 경로>/supabase/client", () => ({ supabase: { ... } }))로 필요한 부분만 대체하세요. ' +
        "전역 차단: src/supabase/blockClientInUnitTests.ts(#373)",
    );
  };

  const supabase = new Proxy(
    {},
    {
      get: (_target, property) => blocked(property),
      set: (_target, property) => blocked(property),
      has: (_target, property) => blocked(property),
      deleteProperty: (_target, property) => blocked(property),
      defineProperty: (_target, property) => blocked(property),
    },
  );

  return { supabase };
});

installSupabaseFetchGuard(globalThis);
