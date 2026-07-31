import { describe, expect, it, vi } from "vitest";
// @ts-expect-error 배포 gate는 Node에서 직접 실행하는 ESM 스크립트다.
import {
  assertChartRevisionProbeSucceeded,
  buildChartRevisionProbeConfig,
  verifyChartAssetRevisionSchema,
} from "./verify-chart-asset-revision.mjs";

describe("chart asset revision Vercel release gate", () => {
  it("VERCEL이 아니면 Supabase 환경 변수가 없어도 probe를 실행하지 않음", async () => {
    const fetcher = vi.fn();

    await verifyChartAssetRevisionSchema({}, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("VERCEL=1인데 VITE_SUPABASE_URL이 없으면 배포를 중단", () => {
    expect(() => buildChartRevisionProbeConfig({
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-key",
    })).toThrow("Supabase URL/key");
  });

  it("charts.asset_revision 조회가 HTTP 200이면 release gate 통과", () => {
    expect(() => assertChartRevisionProbeSucceeded(200, "[]")).not.toThrow();
  });

  it("charts.asset_revision 조회가 HTTP 400이면 migration 미적용으로 배포 중단", () => {
    expect(() => assertChartRevisionProbeSucceeded(
      400,
      '{"message":"column charts.asset_revision does not exist"}',
    )).toThrow("charts.asset_revision is not queryable");
  });

  it("VERCEL=1에서 probe가 HTTP 400이면 실제 build 검증 함수가 실패", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 400,
      text: async () => '{"message":"column charts.asset_revision does not exist"}',
    });

    await expect(verifyChartAssetRevisionSchema({
      VERCEL: "1",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-key",
    }, fetcher)).rejects.toThrow("charts.asset_revision is not queryable");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/charts?select=asset_revision&limit=1",
      {
        headers: {
          apikey: "test-key",
          Authorization: "Bearer test-key",
        },
      },
    );
  });
});
