export interface ChartAssetRevisionReadiness {
  schemaReady: boolean;
  revisionWritesEnabled: boolean;
}

export class ChartAssetRevisionWritesDisabledError extends Error {
  constructor() {
    super("차트 revision writer가 아직 활성화되지 않았습니다. reader-first 배포 확인 후 다시 시도하세요.");
    this.name = "ChartAssetRevisionWritesDisabledError";
  }
}

export function parseChartAssetRevisionReadiness(
  value: unknown,
): ChartAssetRevisionReadiness {
  if (!value || typeof value !== "object") {
    throw new Error("Chart asset release gate returned an invalid response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.schema_ready !== "boolean"
    || typeof record.revision_writes_enabled !== "boolean"
  ) {
    throw new Error("Chart asset release gate returned an invalid response");
  }
  return {
    schemaReady: record.schema_ready,
    revisionWritesEnabled: record.revision_writes_enabled,
  };
}

export function assertChartAssetRevisionWritesEnabled(
  readiness: ChartAssetRevisionReadiness,
): void {
  if (!readiness.schemaReady) {
    throw new Error("Chart asset release migration is incomplete");
  }
  if (!readiness.revisionWritesEnabled) {
    throw new ChartAssetRevisionWritesDisabledError();
  }
}
