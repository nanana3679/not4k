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

  it("column·trigger·release state가 준비되면 release gate 통과", () => {
    expect(() => assertChartRevisionProbeSucceeded(
      200,
      '{"schema_ready":true,"revision_writes_enabled":false}',
    )).not.toThrow();
  });

  it("readiness RPC가 HTTP 400이면 migration 미적용으로 배포 중단", () => {
    expect(() => assertChartRevisionProbeSucceeded(
      400,
      '{"message":"function chart_asset_revision_readiness does not exist"}',
    )).toThrow("chart asset readiness RPC failed");
  });

  it("column은 있어도 trigger가 없어서 schema_ready=false면 배포 중단", () => {
    expect(() => assertChartRevisionProbeSucceeded(
      200,
      '{"schema_ready":false,"revision_writes_enabled":false}',
    )).toThrow("column/trigger/release-state migration is incomplete");
  });

  it("PR #157 배포에서 revision_writes_enabled=true면 reader-first 위반으로 중단", () => {
    expect(() => assertChartRevisionProbeSucceeded(
      200,
      '{"schema_ready":true,"revision_writes_enabled":true}',
    )).toThrow("reader-first only");
  });

  it("VERCEL=1에서 readiness RPC가 HTTP 400이면 실제 build 검증 함수가 실패", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 400,
      text: async () => '{"message":"function chart_asset_revision_readiness does not exist"}',
    });

    await expect(verifyChartAssetRevisionSchema({
      VERCEL: "1",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-key",
    }, fetcher)).rejects.toThrow("chart asset readiness RPC failed");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/chart_asset_revision_readiness",
      {
        method: "POST",
        headers: {
          apikey: "test-key",
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("readiness RPC가 HTTP 503 뒤 200이면 bounded retry 후 배포 통과", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        status: 503,
        text: async () => "temporarily unavailable",
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => '{"schema_ready":true,"revision_writes_enabled":false}',
      });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(verifyChartAssetRevisionSchema({
      VERCEL: "1",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-key",
    }, fetcher, wait)).resolves.toMatchObject({ schema_ready: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });
});
