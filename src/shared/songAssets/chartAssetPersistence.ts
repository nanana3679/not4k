import type { Chart, ExtraNoteEntity } from "../types";
import { serializeChart, serializeExtraNotes } from "../chart";
import { songChartExtraPath, songChartPath } from "../storage";

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
  uploadText: (asset: TextAssetUpload) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
  upsertChartRow: (row: ChartAssetUpsert) => Promise<void>;
  deleteChartRow: (target: ChartAssetTarget) => Promise<void>;
  listSongFiles: (songId: string) => Promise<string[]>;
  deleteSongRow: (songId: string) => Promise<void>;
}

export interface SaveChartAssetInput extends ChartAssetTarget {
  chart: Chart;
  extraNotes: ExtraNoteEntity[];
  extraLaneCount: number;
}

export interface CreateChartAssetInput extends ChartAssetTarget {
  chart: Chart;
}

export interface ChartAssetWriteResult {
  chartPath: string;
  extraPath: string;
  chartJson: string;
  extraJson: string;
  difficulty: string;
}

export async function saveChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: SaveChartAssetInput,
): Promise<ChartAssetWriteResult> {
  const asset = buildChartAsset(input);
  const hasExtra = input.extraLaneCount > 0 || input.extraNotes.length > 0;

  const chartUpload = adapter.uploadText({
    path: asset.chartPath,
    content: asset.chartJson,
    contentType: "application/json",
    upsert: true,
  });
  const extraWrite = hasExtra
    ? adapter.uploadText({
        path: asset.extraPath,
        content: asset.extraJson,
        contentType: "application/json",
        upsert: true,
      })
    : adapter.remove([asset.extraPath]);

  await Promise.all([chartUpload, extraWrite]);
  await adapter.upsertChartRow(toChartUpsert(input.songId, asset.difficulty, input.chart));

  return asset;
}

export async function createChartAsset(
  adapter: SongAssetPersistenceAdapter,
  input: CreateChartAssetInput,
): Promise<Omit<ChartAssetWriteResult, "extraJson">> {
  const asset = buildChartAsset({
    ...input,
    extraNotes: [],
    extraLaneCount: 0,
  });

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
  await adapter.remove([chartPath, extraPath]);

  return { chartPath, extraPath, difficulty };
}

function buildChartAsset(input: SaveChartAssetInput): ChartAssetWriteResult {
  const difficulty = normalizeDifficulty(input.difficulty);
  return {
    chartPath: songChartPath(input.songId, difficulty),
    extraPath: songChartExtraPath(input.songId, difficulty),
    chartJson: serializeChart(input.chart),
    extraJson: serializeExtraNotes(input.extraNotes, input.extraLaneCount),
    difficulty,
  };
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
