import { supabase } from "./client";
import { STORAGE_BUCKET } from "../shared/storage";
import {
  createChartAsset as createChartAssetWithAdapter,
  deleteChartAsset as deleteChartAssetWithAdapter,
  saveChartAsset as saveChartAssetWithAdapter,
} from "../shared/songAssets";
import type {
  ChartAssetTarget,
  ChartAssetWriteResult,
  CreateChartAssetInput,
  SaveChartAssetInput,
  SongAssetPersistenceAdapter,
} from "../shared/songAssets";

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
  upsertChartRow: async (row) => {
    // DB 행 스키마(snake_case)는 이 adapter가 소유한다 — shared 계약은 도메인 언어만 운반.
    const { error } = await supabase
      .from("charts")
      .upsert(
        {
          song_id: row.songId,
          difficulty_label: row.difficulty,
          difficulty_level: row.difficultyLevel,
          offset_ms: row.offsetMs,
        },
        { onConflict: "song_id,difficulty_label" },
      );
    if (error) throw new Error(`Chart DB save failed: ${error.message}`);
  },
  deleteChartRow: async (target) => {
    const { error } = await supabase
      .from("charts")
      .delete()
      .eq("song_id", target.songId)
      .eq("difficulty_label", target.difficulty);
    if (error) throw new Error(`Chart DB delete failed: ${error.message}`);
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
