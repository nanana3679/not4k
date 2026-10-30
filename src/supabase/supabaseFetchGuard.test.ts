import { describe, expect, it, vi } from "vitest";
import { guardFetchAgainstSupabase, installSupabaseFetchGuard, isSupabaseFetchGuard } from "./supabaseFetchGuard";

// 이 파일은 실제 네트워크를 쓰지 않는다. guard 아래의 "원래 fetch"는 항상 vi.fn이다.
function recordingFetch() {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("from-underlying"));
}

const blockedFetchError = (hostname: string) =>
  new RegExp(
    `^\\[단위 테스트\\] Supabase 호스트로 가는 fetch는 단위 테스트에서 보낼 수 없습니다\\(요청한 호스트: ${hostname.replace(/\./g, "\\.")}\\)\\. ` +
      '이 테스트에서 vi\\.stubGlobal\\("fetch", vi\\.fn\\(\\.\\.\\.\\)\\)으로 fetch를 대체하거나, fetch를 인자로 받는 함수에는 mock fetch를 넘기세요\\. ' +
      "전역 차단: src/supabase/blockClientInUnitTests\\.ts\\(#373\\)$",
  );

describe("guardFetchAgainstSupabase가 막는 요청", () => {
  it("https://abcdefgh.supabase.co/storage/v1/object/public/assets/a.json 요청은 원래 fetch를 부르지 않고 \"요청한 호스트: abcdefgh.supabase.co\"와 고치는 방법을 담은 오류로 reject한다", async () => {
    const underlying = recordingFetch();
    const guarded = guardFetchAgainstSupabase(underlying);

    await expect(guarded("https://abcdefgh.supabase.co/storage/v1/object/public/assets/a.json")).rejects.toThrow(
      blockedFetchError("abcdefgh.supabase.co"),
    );
    expect(underlying).not.toHaveBeenCalled();
  });

  it.each([
    ["Supabase 프로젝트 하위 도메인", "https://abcdefgh.supabase.co/rest/v1/songs", "abcdefgh.supabase.co"],
    ["대문자로 쓴 하위 도메인", "https://ABCDEFGH.SUPABASE.CO/rest/v1/songs", "abcdefgh.supabase.co"],
    ["끝에 점이 붙은 하위 도메인", "https://abcdefgh.supabase.co./rest/v1/songs", "abcdefgh.supabase.co."],
    ["supabase.in 하위 도메인", "https://abcdefgh.supabase.in/rest/v1/songs", "abcdefgh.supabase.in"],
    ["supabase.co 자체", "https://supabase.co/", "supabase.co"],
    ["단위 테스트 더미 호스트", "https://unit-test-offline.invalid/rest/v1/songs", "unit-test-offline.invalid"],
  ])("%s(%s)로 가는 문자열 요청은 원래 fetch를 부르지 않고 reject한다", async (_case, url, hostname) => {
    const underlying = recordingFetch();

    await expect(guardFetchAgainstSupabase(underlying)(url)).rejects.toThrow(blockedFetchError(hostname));
    expect(underlying).not.toHaveBeenCalled();
  });

  it("URL 객체 new URL(\"https://abcdefgh.supabase.co/auth/v1/user\")와 Request 객체로 보낸 요청도 원래 fetch를 부르지 않고 reject한다", async () => {
    const underlying = recordingFetch();
    const guarded = guardFetchAgainstSupabase(underlying);

    await expect(guarded(new URL("https://abcdefgh.supabase.co/auth/v1/user"))).rejects.toThrow(blockedFetchError("abcdefgh.supabase.co"));
    await expect(guarded(new Request("https://abcdefgh.supabase.co/rest/v1/songs", { method: "POST", body: "{}" }))).rejects.toThrow(
      blockedFetchError("abcdefgh.supabase.co"),
    );
    expect(underlying).not.toHaveBeenCalled();
  });
});

describe("guardFetchAgainstSupabase가 그대로 넘기는 요청", () => {
  it.each([
    ["다른 호스트", "https://storage.test/songs/s1/chart.json"],
    ["supabase.co로 끝나지만 하위 도메인이 아닌 호스트", "https://notsupabase.co/a.json"],
    ["supabase.co가 앞에 붙은 다른 도메인", "https://abcdefgh.supabase.co.example.com/a.json"],
    ["상대 경로(해석할 수 없는 URL)", "songs/s1/chart.json"],
    ["data: URL", "data:application/json,{}"],
  ])("%s(%s) 요청은 원래 fetch에 같은 인자로 넘기고 그 응답을 돌려준다", async (_case, url) => {
    const underlying = recordingFetch();
    const init: RequestInit = { cache: "no-store" };

    const response = await guardFetchAgainstSupabase(underlying)(url, init);

    expect(underlying).toHaveBeenCalledExactlyOnceWith(url, init);
    await expect(response.text()).resolves.toBe("from-underlying");
  });
});

describe("installSupabaseFetchGuard", () => {
  it("target.fetch를 guard로 바꿔 isSupabaseFetchGuard(target.fetch)가 true가 되고, 원래 fetch였던 함수는 guard가 아니다", () => {
    const underlying = recordingFetch();
    const target = { fetch: underlying as typeof fetch };

    installSupabaseFetchGuard(target);

    expect(target.fetch).not.toBe(underlying);
    expect(isSupabaseFetchGuard(target.fetch)).toBe(true);
    expect(isSupabaseFetchGuard(underlying)).toBe(false);
  });

  it("같은 target에 두 번 설치해도 한 번만 감싸 다른 호스트 요청은 원래 fetch를 정확히 1번 부른다", async () => {
    const underlying = recordingFetch();
    const target = { fetch: underlying as typeof fetch };

    installSupabaseFetchGuard(target);
    const installedOnce = target.fetch;
    installSupabaseFetchGuard(target);

    expect(target.fetch).toBe(installedOnce);
    await target.fetch("https://storage.test/a.json");
    expect(underlying).toHaveBeenCalledTimes(1);
  });
});
