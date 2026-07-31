import { describe, expect, it } from "vitest";
import { assertValidChartAssetRevision } from "./chartAssetRevision";

describe("assertValidChartAssetRevision", () => {
  it('revision="rev-123"이면 에러 없이 통과', () => {
    expect(() => assertValidChartAssetRevision("rev-123")).not.toThrow();
  });

  it.each(["", "REV-123", "../escape", "rev/123"])(
    'revision="%s"이면 경로에 사용할 수 없어 에러',
    (revision) => {
      expect(() => assertValidChartAssetRevision(revision))
        .toThrow("차트 asset revision이 유효하지 않습니다");
    },
  );
});
