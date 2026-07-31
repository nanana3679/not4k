import type { Chart } from "../types";
import { serializeChart, serializeExtraNotes, mainNotes, auxNotesAsExtra } from "../chart";
import {
  songChartExtraPath,
  songChartExtraRevisionPath,
  songChartManifestPath,
  songChartPath,
  songChartRevisionPath,
} from "../storage";
import { serializeChartAssetManifest } from "./chartAssetManifest";

export interface TextAssetUpload {
  path: string;
  content: string;
  contentType: string;
  upsert: boolean;
}

/**
 * 차트 에셋 메타 upsert 페이로드 (도메인 언어).
 * DB 스키마(snake_case 행 타입)는 adapter 구현이 소유한다.
 */
export interface ChartAssetUpsert {
  songId: string;
  difficulty: string;
  difficultyLevel: number;
  offsetMs: number;
}

export interface ChartAssetTarget {
  songId: string;
  difficulty: string;
}

export interface SongAssetPersistenceAdapter {
  createRevision: () => string;
  uploadText: (asset: TextAssetUpload) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
  upsertChartRow: (row: ChartAssetUpsert) => Promise<void>;
  deleteChartRow: (target: ChartAssetTarget) => Promise<void>;
  listSongFiles: (songId: string) => Promise<string[]>;
  deleteSongRow: (songId: string) => Promise<void>;
}

export interface SaveChartAssetInput extends ChartAssetTarget {
  /** 보조 노트(lane 5+)를 포함한 통합 차트. 저장 시 메인/보조 파일로 분리한다 (RFD 0018 ③). */
  chart: Chart;
  extraLaneCount: number;
}

export interface CreateChartAssetInput extends ChartAssetTarget {
  chart: Chart;
}

export interface ChartAssetWriteResult {
  chartPath: string;
  extraPath: string;
  manifestPath: string;
  revision: string;
  chartJson: string;
  extraJson: string;
  difficulty: string;
}

export interface CreatedChartAssetResult {
  chartPath: string;
  extraPath: string;
  chartJson: string;
  difficulty: string;
}

export async function saveChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: SaveChartAssetInput,
): Promise<ChartAssetWriteResult> {
  const payload = buildChartPayload(input);
  const revision = adapter.createRevision();
  const manifestJson = serializeChartAssetManifest(revision);
  const asset: ChartAssetWriteResult = {
    ...payload,
    chartPath: songChartRevisionPath(input.songId, payload.difficulty, revision),
    extraPath: songChartExtraRevisionPath(input.songId, payload.difficulty, revision),
    manifestPath: songChartManifestPath(input.songId, payload.difficulty),
    revision,
  };
  const stagedPaths = [asset.chartPath, asset.extraPath];
  const stagedWrites = await Promise.allSettled([
    adapter.uploadText({
      path: asset.chartPath,
      content: asset.chartJson,
      contentType: "application/json",
      upsert: false,
    }),
    adapter.uploadText({
      path: asset.extraPath,
      content: asset.extraJson,
      contentType: "application/json",
      upsert: false,
    }),
  ]);
  const failedStage = stagedWrites.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedStage) {
    await removeStagedFiles(adapter, stagedPaths);
    throw failedStage.reason;
  }

  try {
    await adapter.uploadText({
      path: asset.manifestPath,
      content: manifestJson,
      contentType: "application/json",
      upsert: true,
    });
  } catch (error) {
    await removeStagedFiles(adapter, stagedPaths);
    throw error;
  }

  await adapter.upsertChartRow(toChartUpsert(input.songId, asset.difficulty, input.chart));

  return asset;
}

export async function createChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: CreateChartAssetInput,
): Promise<CreatedChartAssetResult> {
  const payload = buildChartPayload({
    ...input,
    extraLaneCount: 0,
  });
  const asset = {
    ...payload,
    chartPath: songChartPath(input.songId, payload.difficulty),
    extraPath: songChartExtraPath(input.songId, payload.difficulty),
  };

  await adapter.uploadText({
    path: asset.chartPath,
    content: asset.chartJson,
    contentType: "application/json",
    upsert: true,
  });
  await adapter.upsertChartRow(toChartUpsert(input.songId, asset.difficulty, input.chart));

  return {
    chartPath: asset.chartPath,
    extraPath: asset.extraPath,
    chartJson: asset.chartJson,
    difficulty: asset.difficulty,
  };
}

export interface DeleteSongAssetInput {
  songId: string;
  /** 호출 시점에 이 곡에 남아 있는 차트 수. 0이 아니면 삭제를 거부한다. */
  chartCount: number;
}

/** 차트가 남아 있는 곡을 지우려 할 때 던져진다. DB의 FK restrict와 같은 규칙의 앱 레벨 표현. */
export class SongHasChartsError extends Error {
  readonly chartCount: number;

  constructor(chartCount: number) {
    super(`차트 ${chartCount}개가 남아 있어 곡을 삭제할 수 없습니다. 에디터에서 차트를 먼저 삭제하세요.`);
    this.name = "SongHasChartsError";
    this.chartCount = chartCount;
  }
}

/**
 * 곡을 삭제한다. 차트가 전부 지워진 곡만 삭제할 수 있다.
 *
 * songs 행을 Storage 파일보다 먼저 지운다: 클라이언트가 세는 chartCount가
 * 낡았더라도 DB의 FK restrict가 행 삭제 단계에서 거부하므로, 그 시점에는
 * 아직 아무 파일도 파괴되지 않은 상태다.
 */
export async function deleteSongAsset(
  adapter: SongAssetPersistenceAdapter,
  input: DeleteSongAssetInput,
): Promise<{ removedPaths: string[] }> {
  if (input.chartCount > 0) {
    throw new SongHasChartsError(input.chartCount);
  }

  await adapter.deleteSongRow(input.songId);

  const paths = await adapter.listSongFiles(input.songId);
  if (paths.length > 0) {
    await adapter.remove(paths);
  }
  return { removedPaths: paths };
}

export async function deleteChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: ChartAssetTarget,
): Promise<{ chartPath: string; extraPath: string; difficulty: string }> {
  const difficulty = normalizeDifficulty(input.difficulty);
  const chartPath = songChartPath(input.songId, difficulty);
  const extraPath = songChartExtraPath(input.songId, difficulty);

  await adapter.deleteChartRow({ songId: input.songId, difficulty });
  const songFiles = await adapter.listSongFiles(input.songId);
  const chartStem = chartPath.slice(0, -".json".length);
  const paths = songFiles.filter((path) => (
    path === chartPath
    || path === extraPath
    || (path.startsWith(`${chartStem}.`) && path.endsWith(".json"))
  ));
  if (paths.length > 0) {
    await adapter.remove(paths);
  }

  return { chartPath, extraPath, difficulty };
}

function buildChartPayload(input: SaveChartAssetInput): Pick<
  ChartAssetWriteResult,
  "chartJson" | "extraJson" | "difficulty"
> {
  const difficulty = normalizeDifficulty(input.difficulty);
  return {
    // 저장 분리 (RFD 0018 §3-4): 메인 파일엔 메인 노트만, 보조 파일엔 lane 5+를 extraLane으로 환원.
    // auxNotesAsExtra가 chart.notes 순서(=[...main, ...aux])를 보존하므로 재저장이 원본과 바이트 동일.
    chartJson: serializeChart({ ...input.chart, notes: mainNotes(input.chart.notes) }),
    extraJson: serializeExtraNotes(auxNotesAsExtra(input.chart.notes), input.extraLaneCount),
    difficulty,
  };
}

async function removeStagedFiles(
  adapter: SongAssetPersistenceAdapter,
  paths: string[],
): Promise<void> {
  try {
    await adapter.remove(paths);
  } catch {
    // staging 경로는 manifest가 가리키지 않는 고유 revision이다.
    // 정리 실패는 원래 저장 오류를 가리지 않으며 활성 차트 일관성에도 영향을 주지 않는다.
  }
}

function toChartUpsert(songId: string, difficulty: string, chart: Chart): ChartAssetUpsert {
  return {
    songId,
    difficulty,
    difficultyLevel: chart.meta.difficultyLevel,
    offsetMs: chart.meta.offsetMs,
  };
}

function normalizeDifficulty(difficulty: string): string {
  return difficulty.toLowerCase();
}
