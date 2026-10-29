/**
 * 단위 테스트용 fetch guard(#373): Supabase 호스트로 가는 `fetch`를 보내기 전에 거부한다.
 *
 * 전역 setup(`blockClientInUnitTests.ts`)이 `installSupabaseFetchGuard(globalThis)`로 설치한다.
 * `src/supabase/client`를 거치지 않는 요청도 막기 위한 것이다. 예를 들어 복사한 공개 Storage URL을
 * `fetchEditorExtraText(url)`에 mock fetch 없이 넘기면 클라이언트 차단은 닿지 않지만 이 guard가 막는다.
 *
 * - 막는 호스트: `supabase.co`·`supabase.in`과 그 하위 도메인, 단위 테스트 더미 호스트 `unit-test-offline.invalid`
 * - 다른 호스트·해석할 수 없는 URL은 원래 fetch로 그대로 넘긴다
 * - 막는 것은 `fetch`뿐이다. `node:http`·WebSocket 같은 다른 전송은 이 guard 밖이다
 * - 테스트가 `vi.stubGlobal("fetch", ...)`로 fetch를 바꾸면 그 테스트 동안은 stub이 쓰인다.
 *   setup이 `globalThis.fetch`에 직접 대입하므로 `vi.unstubAllGlobals()`는 원래 fetch가 아니라 이 guard를 되돌린다
 */

/** 단위 테스트의 `VITE_SUPABASE_URL` 더미 값(`vitest.config.ts`의 `test.env`)이 가리키는 호스트. */
export const UNIT_TEST_SUPABASE_HOST = "unit-test-offline.invalid";

const SUPABASE_DOMAINS = ["supabase.co", "supabase.in"] as const;

/** guard로 감싼 fetch에 붙이는 표시. 같은 대상에 두 번 설치해도 한 번만 감싼다. */
const SUPABASE_FETCH_GUARD = Symbol.for("not4k.supabaseFetchGuard");

/** `abcd.supabase.co`처럼 Supabase 도메인(하위 도메인 포함)이거나 단위 테스트 더미 호스트면 true. */
export function isBlockedSupabaseHost(hostname: string): boolean {
  // URL은 호스트를 소문자로 바꾸지만 끝의 점(`abcd.supabase.co.`)은 남긴다.
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === UNIT_TEST_SUPABASE_HOST) return true;
  return SUPABASE_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function requestHostname(input: RequestInfo | URL): string | null {
  const raw = typeof input === "string" ? input : "url" in input ? input.url : input.href;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function blockedFetchError(hostname: string): Error {
  return new Error(
    `[단위 테스트] Supabase 호스트로 가는 fetch는 단위 테스트에서 보낼 수 없습니다(요청한 호스트: ${hostname}). ` +
      '이 테스트에서 vi.stubGlobal("fetch", vi.fn(...))으로 fetch를 대체하거나, fetch를 인자로 받는 함수에는 mock fetch를 넘기세요. ' +
      "전역 차단: src/supabase/blockClientInUnitTests.ts(#373)",
  );
}

/** `underlying`을 감싸 Supabase 호스트 요청은 `underlying`을 부르지 않고 reject하고, 나머지는 그대로 넘긴다. */
export function guardFetchAgainstSupabase(underlying: typeof fetch): typeof fetch {
  const guarded = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const hostname = requestHostname(input);
    if (hostname !== null && isBlockedSupabaseHost(hostname)) return Promise.reject(blockedFetchError(hostname));
    return underlying(input, init);
  };
  Object.defineProperty(guarded, SUPABASE_FETCH_GUARD, { value: true });
  return guarded;
}

export function isSupabaseFetchGuard(value: unknown): boolean {
  return typeof value === "function" && SUPABASE_FETCH_GUARD in value;
}

/** `target.fetch`를 guard로 바꾼다. 이미 guard면 그대로 둔다(격리 없이 setup이 파일마다 다시 돌아도 한 겹만 감싼다). */
export function installSupabaseFetchGuard(target: { fetch: typeof fetch }): void {
  if (isSupabaseFetchGuard(target.fetch)) return;
  target.fetch = guardFetchAgainstSupabase(target.fetch);
}
