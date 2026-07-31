import { supabase } from "./client";
import { STORAGE_BUCKET } from "../shared/storage";
import {
  createChartAsset as createChartAssetWithAdapter,
  deleteChartAsset as deleteChartAssetWithAdapter,
  deleteSongAsset as deleteSongAssetWithAdapter,
  saveLegacyChartAsset as saveLegacyChartAssetWithAdapter,
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
import {
  assertChartAssetReleaseSchemaReady,
  parseChartAssetRevisionReadiness,
} from "./chartAssetRelease";

export const supabaseSongAssetAdapter: SongAssetPersistenceAdapter = {
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
          .insert(values)
          .select("id")
      : (() => {
          const target = supabase
            .from("charts")
            .update(values)
            .eq("song_id", row.songId)
            .eq("difficulty_label", row.difficulty);
          if (!Object.prototype.hasOwnProperty.call(row, "expectedRevision")) {
            return target.select("id");
          }
          return (row.expectedRevision === null
            ? target.is("asset_revision", null)
            : target.eq("asset_revision", row.expectedRevision as string))
            .select("id");
        })();
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

async function getChartAssetReleaseReadiness() {
  const { data, error } = await supabase.rpc("chart_asset_revision_readiness");
  if (error) throw new Error(`Chart asset release gate failed: ${error.message}`);
  const readiness = parseChartAssetRevisionReadiness(data);
  assertChartAssetReleaseSchemaReady(readiness);
  return readiness;
}

export async function getChartAssetRevision(input: ChartAssetTarget): Promise<string | null> {
  const { data, error } = await supabase
    .from("charts")
    .select("asset_revision")
    .eq("song_id", input.songId)
    .eq("difficulty_label", input.difficulty.toLowerCase())
    .single();
  if (error) throw new Error(`Chart revision fetch failed: ${error.message}`);
  return data.asset_revision as string | null;
}

export async function saveChartAsset(input: SaveChartAssetInput): Promise<ChartAssetWriteResult> {
  const readiness = await getChartAssetReleaseReadiness();
  return readiness.revisionWritesEnabled
    ? saveChartAssetWithAdapter(supabaseSongAssetAdapter, input)
    : saveLegacyChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export async function createChartAsset(input: CreateChartAssetInput) {
  const readiness = await getChartAssetReleaseReadiness();
  return readiness.revisionWritesEnabled
    ? createChartAssetWithAdapter(supabaseSongAssetAdapter, input)
    : saveLegacyChartAssetWithAdapter(supabaseSongAssetAdapter, {
        ...input,
        extraLaneCount: 0,
        allowCreate: true,
      });
}

export function deleteChartAsset(input: ChartAssetTarget) {
  return deleteChartAssetWithAdapter(supabaseSongAssetAdapter, input);
}

export function deleteSongAsset(input: DeleteSongAssetInput) {
  return deleteSongAssetWithAdapter(supabaseSongAssetAdapter, input);
}
