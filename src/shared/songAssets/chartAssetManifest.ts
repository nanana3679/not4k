const MANIFEST_VERSION = 1;
const SAFE_REVISION = /^[a-z0-9][a-z0-9._-]*$/;

export interface ChartAssetManifest {
  version: 1;
  revision: string;
}

export function serializeChartAssetManifest(revision: string): string {
  if (!SAFE_REVISION.test(revision)) {
    throw new Error("차트 manifest 생성 실패: 유효하지 않은 revision");
  }
  return JSON.stringify({
    version: MANIFEST_VERSION,
    revision,
  }, null, 2);
}

export function parseChartAssetManifest(text: string): ChartAssetManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("차트 manifest 파싱 실패: 유효한 JSON이 아닙니다");
  }

  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || !("version" in value)
    || value.version !== MANIFEST_VERSION
    || !("revision" in value)
    || typeof value.revision !== "string"
    || !SAFE_REVISION.test(value.revision)
  ) {
    throw new Error("차트 manifest 파싱 실패: 지원하지 않는 형식입니다");
  }

  return {
    version: MANIFEST_VERSION,
    revision: value.revision,
  };
}
