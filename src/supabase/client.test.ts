import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSupabaseFetchGuard, isSupabaseFetchGuard } from "./supabaseFetchGuard";

// 이 파일은 실제 client.ts 자체를 검사하므로 전역 setup(blockClientInUnitTests.ts)의 클라이언트 차단을 푼다.
// 네트워크 요청은 보내지 않는다: 주소 계산(url·getPublicUrl)과 인스턴스 동일성만 확인한다.
// 요청이 생겨도 같은 setup이 설치한 fetch guard는 그대로 남아 TEST_URL(*.supabase.co)·더미 호스트로 보내기 전에 거부한다.
vi.unmock("./client");

const MISSING_ENV_ERROR =
  "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경 변수가 설정되지 않았습니다.";
const TEST_URL = "https://example.supabase.co";
const TEST_KEY = "test-publishable-key";

function stubSupabaseEnv(url: string | undefined, key: string | undefined) {
  vi.stubEnv("VITE_SUPABASE_URL", url);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
}

// client.ts는 처음 만든 클라이언트를 모듈 안에 보관하므로 테스트마다 모듈을 새로 읽는다.
async function importFreshClient() {
  vi.resetModules();
  return import("./client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("환경 변수가 없을 때 supabase 클라이언트", () => {
  it("VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY가 없어도 client.ts import는 throw하지 않는다", async () => {
    stubSupabaseEnv(undefined, undefined);

    await expect(importFreshClient()).resolves.toHaveProperty("supabase");
  });

  it("VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY가 없어도 supabase barrel(index.ts) import는 throw하지 않는다", async () => {
    stubSupabaseEnv(undefined, undefined);
    vi.resetModules();

    await expect(import("./index")).resolves.toHaveProperty("saveChartAsset");
  });

  it.each([
    ["VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY가 둘 다 없으면", undefined, undefined],
    ["VITE_SUPABASE_URL만 없으면", undefined, TEST_KEY],
    ["VITE_SUPABASE_PUBLISHABLE_KEY만 없으면", TEST_URL, undefined],
  ])("%s supabase.from에 처음 접근할 때 \"환경 변수가 설정되지 않았습니다\" 오류를 throw한다", async (_case, url, key) => {
    stubSupabaseEnv(url, key);
    const { supabase } = await importFreshClient();

    expect(() => supabase.from).toThrow(MISSING_ENV_ERROR);
  });
});

describe("VITE_SUPABASE_URL이 https://example.supabase.co이고 key가 있을 때 supabase 클라이언트", () => {
  beforeEach(() => {
    stubSupabaseEnv(TEST_URL, TEST_KEY);
  });

  it("supabase.from(\"songs\")는 https://example.supabase.co/rest/v1/songs query builder를 돌려준다", async () => {
    const { supabase } = await importFreshClient();

    expect(supabase.from("songs").url.href).toBe("https://example.supabase.co/rest/v1/songs");
  });

  it("supabase에서 구조 분해로 꺼낸 from(\"charts\")도 실제 클라이언트에 bind되어 /rest/v1/charts query builder를 돌려준다", async () => {
    const { supabase } = await importFreshClient();
    const { from } = supabase;

    expect(from("charts").url.href).toBe("https://example.supabase.co/rest/v1/charts");
  });

  it("supabase.storage.from(\"assets\").getPublicUrl(\"songs/s1/jacket.png\")는 /storage/v1/object/public/assets/songs/s1/jacket.png 주소를 돌려준다", async () => {
    const { supabase } = await importFreshClient();

    const { data } = supabase.storage.from("assets").getPublicUrl("songs/s1/jacket.png");

    expect(data.publicUrl).toBe(
      "https://example.supabase.co/storage/v1/object/public/assets/songs/s1/jacket.png",
    );
  });

  it("supabase.auth를 두 번 읽으면 같은 auth 인스턴스를 돌려준다", async () => {
    const { supabase } = await importFreshClient();

    expect(supabase.auth).toBe(supabase.auth);
  });
});

describe("vi.unmock으로 클라이언트 차단을 푼 실제 supabase 클라이언트의 요청", () => {
  const FETCH_GUARD_ERROR = (hostname: string) =>
    new RegExp(`^\\[단위 테스트\\] Supabase 호스트로 가는 fetch는 단위 테스트에서 보낼 수 없습니다\\(요청한 호스트: ${hostname.replace(/\./g, "\\.")}\\)`);

  it("더미 VITE_SUPABASE_URL(https://unit-test-offline.invalid)로 보내는 from(\"songs\").select(\"id\")는 전역 fetch guard가 보내기 전에 거부해 reject한다", async () => {
    // guard가 없으면 여기서 멈춘다. 더미 호스트는 DNS로 풀리지 않으므로 guard가 깨져도 Supabase에 닿지 않는다.
    expect(isSupabaseFetchGuard(globalThis.fetch)).toBe(true);
    const { supabase } = await importFreshClient();

    await expect(supabase.from("songs").select("id").throwOnError()).rejects.toThrow(FETCH_GUARD_ERROR("unit-test-offline.invalid"));
  });

  it("VITE_SUPABASE_URL이 https://example.supabase.co여도 from(\"songs\").select(\"id\")는 fetch guard가 막아 guard 아래의 fetch를 한 번도 부르지 않는다", async () => {
    // setup과 같은 방법으로 기록용 fetch 위에 guard를 설치한다. guard 아래로 내려가도 기록용 fetch라 밖으로 나가지 않는다.
    const underlying = vi.fn<typeof fetch>(async () => new Response("[]"));
    vi.stubGlobal("fetch", underlying);
    installSupabaseFetchGuard(globalThis);
    stubSupabaseEnv(TEST_URL, TEST_KEY);
    const { supabase } = await importFreshClient();

    await expect(supabase.from("songs").select("id").throwOnError()).rejects.toThrow(FETCH_GUARD_ERROR("example.supabase.co"));
    expect(underlying).not.toHaveBeenCalled();
  });
});
