import { supabase } from "./client";
import { STORAGE_BUCKET } from "../shared/storage";
import {
  createChartAsset as createChartAssetWithAdapter,
  deleteChartAsset as deleteChartAssetWithAdapter,
  deleteSongAsset as deleteSongAssetWithAdapter,
  saveChartAsset as saveChartAssetWithAdapter,
  saveSonglessChartAsset as saveSonglessChartAssetWithAdapter,
} from "../shared/songAssets";
import type {
  ChartAssetFiles,
  DeleteChartAssetInput,
  ChartAssetWriteResult,
  CreateChartAssetInput,
  DeleteSongAssetInput,
  SaveChartAssetInput,
  SaveSonglessChartAssetInput,
  SongAssetPersistenceAdapter,
} from "../shared/songAssets";

/** PostgREST 오류를 일반 Error로 전달하되 호출자가 SQLSTATE로 안내를 고를 수 있게 한다. */
export class ChartRowError extends Error {
  readonly code: string;

  constructor(error: { code: string; message: string }) {
    super(error.message, { cause: error });
    this.name = 'ChartRowError';
    this.code = error.code;
  }
}

const supabaseSongAssetAdapter: SongAssetPersistenceAdapter = {
  uploadText: async (asset) => {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(asset.path, new Blob([asset.content], { type: asset.contentType }), {
        upsert: asset.upsert,
      });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },
  remove: async (paths) => {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(paths);
    if (error) throw new Error(`Storage remove failed: ${error.message}`);
  },
  // DB 함수 인자 이름(snake_case)은 이 adapter가 소유한다 — shared 계약은 도메인 언어만 운반.
  // Error에 SQLSTATE(`code`: 42501·PT404·PT409·23505)를 보존해 호출자가 안내에 쓰게 한다.
  saveChartRow: async (row) => {
    const { data, error } = await supabase.rpc("save_chart", {
      p_chart_id: row.chartId,
      p_expected_revision: row.expectedRevision,
      p_difficulty_level: row.difficultyLevel,
      p_chart_path: row.chartPath,
      p_chart_extra_path: row.extraPath,
    });
    if (error) throw new ChartRowError(error);
    return toChartRevision(data);
  },
  createChartRow: async (row) => {
    const { data, error } = await supabase.rpc("create_chart", {
      p_song_id: row.songId,
      p_difficulty_label: row.difficulty,
      p_difficulty_level: row.difficultyLevel,
      p_chart_path: row.chartPath,
      p_chart_extra_path: row.extraPath,
    });
    if (error) throw new ChartRowError(error);
    // returns table이라 PostgREST는 한 행짜리 배열로 돌려준다.
    const created = Array.isArray(data) ? data[0] : data;
    if (!created || typeof created.chart_id !== "string") throw new Error("Invalid created chart");
    return { chartId: created.chart_id, revision: toChartRevision(created.revision) };
  },
  deleteChartRow: async (target) => {
    const query = supabase.from("charts").delete();
    const { error } = await (target.chartId
      ? query.eq("id", target.chartId)
      : query.eq("song_id", target.songId).eq("difficulty_label", target.difficulty));
    if (error) throw new Error(`Chart DB delete failed: ${error.message}`);
  },
  listSongFiles: async (songId) => {
    const paths: string[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(`songs/${songId}`, {
        limit, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Storage list failed: ${error.message}`);
      const page = data ?? [];
      paths.push(...page.map(file => `songs/${songId}/${file.name}`));
      if (page.length < limit) return paths;
    }
  },
  deleteSongRow: async (songId) => {
    const { error } = await supabase
      .from("songs")
      .delete()
      .eq("id", songId);
    if (error) throw new Error(`Song DB delete failed: ${error.message}`);
  },
  newPathToken: () => crypto.randomUUID(),
};

function toChartRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid chart revision");
  return value;
}

export function saveChartAsset(input: SaveChartAssetInput): Promise<ChartAssetWriteResult> {
  return saveChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

/** 곡 행 없이 연 차트를 결정적 경로에 덮어쓴다. `charts` 행은 쓰지 않는다(곡 행이 없어 만들 수 없다). */
export function saveSonglessChartAsset(input: SaveSonglessChartAssetInput): Promise<ChartAssetFiles> {
  return saveSonglessChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function createChartAsset(input: CreateChartAssetInput) {
  return createChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function deleteChartAsset(input: DeleteChartAssetInput) {
  return deleteChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function deleteSongAsset(input: DeleteSongAssetInput) {
  return deleteSongAssetWithAdapter(supabaseSongAssetAdapter, input);
}
