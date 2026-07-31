import { supabase } from "./client";
import { STORAGE_BUCKET } from "../shared/storage";
import {
  createChartAsset as createChartAssetWithAdapter,
  deleteChartAsset as deleteChartAssetWithAdapter,
  deleteSongAsset as deleteSongAssetWithAdapter,
  saveChartAsset as saveChartAssetWithAdapter,
} from "../shared/songAssets";
import type {
  ChartAssetTarget,
  ChartAssetWriteResult,
  CreateChartAssetInput,
  DeleteSongAssetInput,
  SaveChartAssetInput,
  SongAssetPersistenceAdapter,
} from "../shared/songAssets";

const supabaseSongAssetAdapter: SongAssetPersistenceAdapter = {
  createRevision: () => globalThis.crypto.randomUUID(),
  uploadText: async (asset) => {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(asset.path, new Blob([asset.content], { type: asset.contentType }), {
        upsert: asset.upsert,
      });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },
  remove: async (paths) => {
    const batchSize = 1000;
    for (let offset = 0; offset < paths.length; offset += batchSize) {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(paths.slice(offset, offset + batchSize));
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    }
  },
  publishChartRow: async (row) => {
    // DB 행 스키마(snake_case)는 이 adapter가 소유한다 — shared 계약은 도메인 언어만 운반.
    const values = {
      song_id: row.songId,
      difficulty_label: row.difficulty,
      difficulty_level: row.difficultyLevel,
      offset_ms: row.offsetMs,
      asset_revision: row.revision,
    };
    const query = row.allowCreate
      ? supabase
          .from("charts")
          .upsert(values, { onConflict: "song_id,difficulty_label" })
          .select("id")
      : supabase
          .from("charts")
          .update(values)
          .eq("song_id", row.songId)
          .eq("difficulty_label", row.difficulty)
          .select("id");
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Chart DB save failed: ${error.message}`);
    if (!data) throw new Error("Chart DB save failed: chart no longer exists");
  },
  deleteChartRow: async (target) => {
    const { data, error } = await supabase
      .from("charts")
      .delete()
      .eq("song_id", target.songId)
      .eq("difficulty_label", target.difficulty)
      .select("asset_revision")
      .maybeSingle();
    if (error) throw new Error(`Chart DB delete failed: ${error.message}`);
    if (!data) throw new Error("Chart DB delete failed: chart no longer exists");
    return { revision: data.asset_revision as string | null };
  },
  listSongFiles: async (songId) => {
    const paths: string[] = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(`songs/${songId}`, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw new Error(`Storage list failed: ${error.message}`);
      const page = data ?? [];
      paths.push(...page.map((file) => `songs/${songId}/${file.name}`));
      if (page.length < pageSize) break;
    }
    return paths;
  },
  deleteSongRow: async (songId) => {
    const { error } = await supabase
      .from("songs")
      .delete()
      .eq("id", songId);
    if (error) throw new Error(`Song DB delete failed: ${error.message}`);
  },
};

export function saveChartAsset(input: SaveChartAssetInput): Promise<ChartAssetWriteResult> {
  return saveChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function createChartAsset(input: CreateChartAssetInput) {
  return createChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function deleteChartAsset(input: ChartAssetTarget) {
  return deleteChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function deleteSongAsset(input: DeleteSongAssetInput) {
  return deleteSongAssetWithAdapter(supabaseSongAssetAdapter, input);
}
