import { describe, expect, it } from "vitest";
import {
  assertChartAssetRevisionWritesEnabled,
  ChartAssetRevisionWritesDisabledError,
  parseChartAssetRevisionReadiness,
} from "./chartAssetRelease";

describe("chart asset release gate", () => {
  it("schema_ready=true·revision_writes_enabled=true면 revision 저장 허용", () => {
    const readiness = parseChartAssetRevisionReadiness({
      schema_ready: true,
      revision_writes_enabled: true,
    });

    expect(() => assertChartAssetRevisionWritesEnabled(readiness)).not.toThrow();
  });

  it("reader-first 배포에서 revision_writes_enabled=false면 저장 전에 전용 에러", () => {
    const readiness = parseChartAssetRevisionReadiness({
      schema_ready: true,
      revision_writes_enabled: false,
    });

    expect(() => assertChartAssetRevisionWritesEnabled(readiness))
      .toThrow(ChartAssetRevisionWritesDisabledError);
  });

  it("trigger 누락으로 schema_ready=false면 writer flag가 true여도 저장 거부", () => {
    const readiness = parseChartAssetRevisionReadiness({
      schema_ready: false,
      revision_writes_enabled: true,
    });

    expect(() => assertChartAssetRevisionWritesEnabled(readiness))
      .toThrow("migration is incomplete");
  });

  it("RPC 응답에 revision_writes_enabled가 없으면 fail-closed", () => {
    expect(() => parseChartAssetRevisionReadiness({
      schema_ready: true,
    })).toThrow("invalid response");
  });
});
