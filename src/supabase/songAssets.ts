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
    const { error } = await supabase
      .from("charts")
      .upsert(row, { onConflict: "song_id,difficulty_label" });
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
  listSongFiles: async (songId) => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`songs/${songId}`);
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    return (data ?? []).map((f) => `songs/${songId}/${f.name}`);
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
