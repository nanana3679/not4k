import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beat } from "../shared";
import type { ChartDocument } from "../shared";
import { fetchEditorExtraText } from "../editor/chartAssetLoad";
// 이 파일은 일부러 ./client를 vi.mock하지 않는다. vitest.config.ts의 setupFiles(blockClientInUnitTests.ts)가 막은 상태를 검사한다.
import { supabase } from "./client";
import { getJacketUrl, saveChartAsset } from "./index";
import { installSupabaseFetchGuard, isSupabaseFetchGuard } from "./supabaseFetchGuard";

/** 차단 오류 메시지: 막혔다는 사실과 고치는 방법(vi.mock으로 대체)을 함께 알린다. */
const BLOCKED_FROM_ERROR =
  /^\[단위 테스트\] 실제 Supabase 클라이언트\(src\/supabase\/client\)는 단위 테스트에서 쓸 수 없습니다\(건드린 속성: from\)\. 이 테스트 파일에서 vi\.mock\("<상대 경로>\/supabase\/client", .*\)로 필요한 부분만 대체하세요\. 전역 차단: src\/supabase\/blockClientInUnitTests\.ts\(#373\)$/;
const BLOCKED = /\[단위 테스트\] 실제 Supabase 클라이언트\(src\/supabase\/client\)는 단위 테스트에서 쓸 수 없습니다/;
/** fetch guard 오류 메시지의 앞부분: 요청한 호스트와 고치는 방법(vi.stubGlobal·mock fetch)을 함께 알린다. */
const FETCH_GUARD_ERROR = (hostname: string) =>
  new RegExp(
    `^\\[단위 테스트\\] Supabase 호스트로 가는 fetch는 단위 테스트에서 보낼 수 없습니다\\(요청한 호스트: ${hostname.replace(/\./g, "\\.")}\\)\\. 이 테스트에서 vi\\.stubGlobal\\("fetch"`,
  );

const chart: ChartDocument = {
  meta: { title: "차단 확인", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
  notes: [{ type: "single", lane: 1, beat: beat(0) }],
  trillZones: [],
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }, { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) }],
};

describe("vi.mock 없이 src/supabase/client를 쓰는 단위 테스트", () => {
  // 차단이 깨져 실제 클라이언트가 만들어져도 요청이 밖으로 나가지 않게 fetch를 바꿔 둔다.
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("supabase.from을 읽으면 \"건드린 속성: from\"과 vi.mock으로 대체하라는 안내를 담은 오류를 throw한다", () => {
    expect(() => supabase.from).toThrow(BLOCKED_FROM_ERROR);
  });

  it("supabase.storage를 읽으면 업로드 메서드에 닿기 전에 throw한다", () => {
    expect(() => supabase.storage.from("assets").upload("songs/s1/jacket.png", new Blob())).toThrow(
      /건드린 속성: storage/,
    );
  });

  it("\"auth\" in supabase 검사와 supabase.auth 대입도 throw한다", () => {
    expect(() => "auth" in supabase).toThrow(/건드린 속성: auth/);
    expect(() => Object.assign(supabase, { auth: {} })).toThrow(/건드린 속성: auth/);
  });

  it("Reflect.deleteProperty(supabase, \"auth\")로 지우거나 Object.defineProperty(supabase, \"auth\", ...)로 정의해도 throw한다", () => {
    expect(() => Reflect.deleteProperty(supabase, "auth")).toThrow(/건드린 속성: auth/);
    expect(() => Object.defineProperty(supabase, "auth", { value: {} })).toThrow(/건드린 속성: auth/);
  });

  it("실제 저장 경로 saveChartAsset({ songId: \"song-1\", difficulty: \"NORMAL\" })은 fetch를 한 번도 부르지 않고 차단 오류로 reject한다", async () => {
    await expect(saveChartAsset({ songId: "song-1", difficulty: "NORMAL", chart, extraLaneCount: 0, row: { chartId: "chart-1", revision: 0 } })).rejects.toThrow(BLOCKED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getJacketUrl(\"song-1\")은 공개 URL을 만들기 전에 차단 오류를 throw한다", () => {
    expect(() => getJacketUrl("song-1")).toThrow(BLOCKED);
  });
});

describe("전역 setup이 설치한 Supabase 호스트 fetch guard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("테스트가 시작될 때 globalThis.fetch는 Supabase 호스트 guard이다", () => {
    expect(isSupabaseFetchGuard(globalThis.fetch)).toBe(true);
  });

  it("설치된 guard로 더미 호스트 https://unit-test-offline.invalid/rest/v1/songs를 fetch하면 보내기 전에 \"요청한 호스트: unit-test-offline.invalid\" 오류로 reject한다", async () => {
    // guard가 없으면 여기서 멈춘다. 더미 호스트는 DNS로 풀리지 않으므로 guard가 깨져도 Supabase에 닿지 않는다.
    expect(isSupabaseFetchGuard(globalThis.fetch)).toBe(true);

    await expect(fetch("https://unit-test-offline.invalid/rest/v1/songs")).rejects.toThrow(FETCH_GUARD_ERROR("unit-test-offline.invalid"));
  });

  it("vi.stubGlobal(\"fetch\", ...)로 바꾼 뒤 vi.unstubAllGlobals()하면 원래 Node fetch가 아니라 설치된 guard가 돌아온다", () => {
    const installedGuard = globalThis.fetch;
    const stub = vi.fn<typeof fetch>();

    vi.stubGlobal("fetch", stub);
    expect(globalThis.fetch).toBe(stub);
    vi.unstubAllGlobals();

    expect(globalThis.fetch).toBe(installedGuard);
    expect(isSupabaseFetchGuard(globalThis.fetch)).toBe(true);
  });

  it("복사한 공개 Storage URL을 fetchEditorExtraText(url)에 mock fetch 없이 넘기면 guard 오류로 reject하고 원래 fetch는 한 번도 부르지 않는다", async () => {
    // setup과 같은 방법(installSupabaseFetchGuard(globalThis))으로 기록용 fetch 위에 guard를 설치해, guard 아래의 fetch가 불리는지 본다.
    const underlying = vi.fn<typeof fetch>(async () => new Response('{"extraNotes":[]}'));
    vi.stubGlobal("fetch", underlying);
    installSupabaseFetchGuard(globalThis);
    const copiedPublicUrl = "https://abcdefgh.supabase.co/storage/v1/object/public/assets/songs/song-1/NORMAL.extra.json";

    await expect(fetchEditorExtraText(copiedPublicUrl)).rejects.toThrow(FETCH_GUARD_ERROR("abcdefgh.supabase.co"));
    expect(underlying).not.toHaveBeenCalled();
  });
});

describe("단위 테스트가 보는 VITE_SUPABASE_* 환경 변수", () => {
  it("VITE_SUPABASE_URL은 vitest.config.ts의 test.env가 고정한 DNS로 풀리지 않는 더미 값 https://unit-test-offline.invalid이다", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("https://unit-test-offline.invalid");
  });

  it("VITE_SUPABASE_PUBLISHABLE_KEY는 vitest.config.ts의 test.env가 고정한 더미 값 unit-test-offline-publishable-key이다", () => {
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("unit-test-offline-publishable-key");
  });
});
