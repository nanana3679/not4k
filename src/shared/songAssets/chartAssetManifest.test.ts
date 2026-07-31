import { describe, expect, it } from "vitest";
import {
  parseChartAssetManifest,
  serializeChartAssetManifest,
} from "./chartAssetManifest";

describe("chart asset manifest", () => {
  it("revision=rev-123을 version 1 manifest로 저장→로드하면 동일 revision 유지", () => {
    const text = serializeChartAssetManifest("rev-123");

    expect(JSON.parse(text)).toEqual({ version: 1, revision: "rev-123" });
    expect(parseChartAssetManifest(text)).toEqual({ version: 1, revision: "rev-123" });
  });

  it.each([
    "not json",
    "null",
    "{}",
    '{"version":2,"revision":"rev-123"}',
    '{"version":1,"revision":"../escape"}',
    '{"version":1,"revision":""}',
  ])("manifest=%s이면 지원하지 않는 포인터로 에러", (text) => {
    expect(() => parseChartAssetManifest(text)).toThrow("차트 manifest 파싱 실패");
  });
});
