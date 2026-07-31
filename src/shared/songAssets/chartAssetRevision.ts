const SAFE_REVISION = /^[a-z0-9][a-z0-9._-]*$/;

export function assertValidChartAssetRevision(revision: string): void {
  if (!SAFE_REVISION.test(revision)) {
    throw new Error("차트 asset revision이 유효하지 않습니다");
  }
}
