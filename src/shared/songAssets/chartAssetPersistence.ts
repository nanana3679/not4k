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
