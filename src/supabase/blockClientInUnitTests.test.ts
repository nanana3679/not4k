import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beat } from "../shared";
import type { ChartDocument } from "../shared";
// 이 파일은 일부러 ./client를 vi.mock하지 않는다. vitest.config.ts의 setupFiles(blockClientInUnitTests.ts)가 막은 상태를 검사한다.
import { supabase } from "./client";
import { getJacketUrl, saveChartAsset } from "./index";

/** 차단 오류 메시지: 막혔다는 사실과 고치는 방법(vi.mock으로 대체)을 함께 알린다. */
const BLOCKED_FROM_ERROR =
  /^\[단위 테스트\] 실제 Supabase 클라이언트\(src\/supabase\/client\)는 단위 테스트에서 쓸 수 없습니다\(건드린 속성: from\)\. 이 테스트 파일에서 vi\.mock\("<상대 경로>\/supabase\/client", .*\)로 필요한 부분만 대체하세요\. 전역 차단: src\/supabase\/blockClientInUnitTests\.ts\(#373\)$/;
const BLOCKED = /\[단위 테스트\] 실제 Supabase 클라이언트\(src\/supabase\/client\)는 단위 테스트에서 쓸 수 없습니다/;

const chart: ChartDocument = {
  meta: { title: "차단 확인", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
  notes: [{ type: "single", lane: 1, beat: beat(0) }],
  trillZones: [],
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }, { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) }],
};

describe("vi.mock 없이 src/supabase/client를 쓰는 단위 테스트", () => {
  // 차단이 깨져 실제 클라이언트가 만들어져도 요청이 밖으로 나가지 않게 fetch를 바꿔 둔다.
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
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

  it("실제 저장 경로 saveChartAsset({ songId: \"song-1\", difficulty: \"NORMAL\" })은 fetch를 한 번도 부르지 않고 차단 오류로 reject한다", async () => {
    await expect(saveChartAsset({ songId: "song-1", difficulty: "NORMAL", chart, extraLaneCount: 0 })).rejects.toThrow(BLOCKED);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("getJacketUrl(\"song-1\")은 공개 URL을 만들기 전에 차단 오류를 throw한다", () => {
    expect(() => getJacketUrl("song-1")).toThrow(BLOCKED);
  });
});

describe("단위 테스트가 보는 VITE_SUPABASE_* 환경 변수", () => {
  it("VITE_SUPABASE_URL은 .env.local과 관계없이 DNS로 풀리지 않는 더미 값 https://unit-test-offline.invalid이다", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("https://unit-test-offline.invalid");
  });

  it("VITE_SUPABASE_PUBLISHABLE_KEY는 .env.local과 관계없이 더미 값 unit-test-offline-publishable-key이다", () => {
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("unit-test-offline-publishable-key");
  });
});
