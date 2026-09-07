import { describe, expect, it } from "vitest";
import type { Chart, NoteEntity } from "../types";
import { beat } from "../types";
import {
  createChartAsset,
  deleteChartAsset,
  deleteSongAsset,
  saveChartAsset,
  SongHasChartsError,
  type SongAssetPersistenceAdapter,
} from "./chartAssetPersistence";

function makeChart(input: {
  difficultyLabel?: string;
  difficultyLevel?: number;
  offsetMs?: number;
  notes?: NoteEntity[];
} = {}): Chart {
  return {
    meta: {
      title: "Test Song",
      artist: "Tester",
      difficultyLabel: input.difficultyLabel ?? "HARD",
      difficultyLevel: input.difficultyLevel ?? 12,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: input.offsetMs ?? 34,
    },
    notes: input.notes ?? [],
    trillZones: [],
    events: [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

function makeAdapter(input: { songFiles?: string[] } = {}) {
  const calls: string[] = [];
  const uploads: { path: string; content: string; contentType: string; upsert: boolean }[] = [];
  const removes: string[][] = [];
  const upserts: unknown[] = [];
  const deletes: unknown[] = [];
  const songDeletes: string[] = [];

  const adapter: SongAssetPersistenceAdapter = {
    uploadText: async (asset) => {
      calls.push(`upload:${asset.path}`);
      uploads.push(asset);
    },
    remove: async (paths) => {
      calls.push(`remove:${paths.join(",")}`);
      removes.push(paths);
    },
    upsertChartRow: async (row) => {
      calls.push(`upsert:${row.songId}:${row.difficulty}`);
      upserts.push(row);
    },
    deleteChartRow: async (target) => {
      calls.push(`delete:${target.songId}:${target.difficulty}`);
      deletes.push(target);
    },
    listSongFiles: async (songId) => {
      calls.push(`list:${songId}`);
      return input.songFiles ?? [];
    },
    deleteSongRow: async (songId) => {
      calls.push(`deleteSong:${songId}`);
      songDeletes.push(songId);
    },
  };

  return { adapter, calls, uploads, removes, upserts, deletes, songDeletes };
}

describe("saveChartAsset", () => {
  it("uploads chart JSON, removes stale extra JSON, and upserts the chart row", async () => {
    const fake = makeAdapter();

    const result = await saveChartAsset(fake.adapter, {
      songId: "song-one",
      difficulty: "Hard",
      chart: makeChart({ difficultyLevel: 13, offsetMs: -12 }),
      extraLaneCount: 0,
    });

    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]).toMatchObject({
      path: "songs/song-one/hard.json",
      contentType: "application/json",
      upsert: true,
    });
    expect(JSON.parse(fake.uploads[0].content).meta.difficultyLevel).toBe(13);
    expect(fake.removes).toEqual([["songs/song-one/hard.extra.json"]]);
    expect(fake.upserts).toEqual([{
      songId: "song-one",
      difficulty: "hard",
      difficultyLevel: 13,
      offsetMs: -12,
    }]);
    expect(result).toMatchObject({
      chartPath: "songs/song-one/hard.json",
      extraPath: "songs/song-one/hard.extra.json",
      difficulty: "hard",
    });
    expect(JSON.parse(result.extraJson)).toEqual({ extraNotes: [], extraLaneCount: 0 });
  });

  it("uploads extra JSON when extra lanes or notes exist", async () => {
    const fake = makeAdapter();
    // 보조 노트는 chart.notes(lane 5+)에 산다 (RFD 0018 ③). extraLane 2 → lane 6.
    // buildChartAsset이 저장 시 메인/보조로 분리해 보조 파일에 extraLane으로 환원한다.
    await saveChartAsset(fake.adapter, {
      songId: "song-two",
      difficulty: "EXPERT",
      chart: makeChart({
        difficultyLabel: "EXPERT",
        notes: [{ type: "single", lane: 6, beat: beat(1, 4) }],
      }),
      extraLaneCount: 3,
    });

    expect(fake.removes).toEqual([]);
    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-two/expert.json",
      "songs/song-two/expert.extra.json",
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({
      extraNotes: [{ type: "single", extraLane: 2, beat: "1/4" }],
      extraLaneCount: 3,
    });
  });
});

describe("createChartAsset", () => {
  it("creates an empty chart asset without touching extra JSON", async () => {
    const fake = makeAdapter();

    await createChartAsset(fake.adapter, {
      songId: "song-three",
      difficulty: "Normal",
      chart: makeChart({ difficultyLevel: 5 }),
    });

    expect(fake.uploads.map((upload) => upload.path)).toEqual(["songs/song-three/normal.json"]);
    expect(fake.removes).toEqual([]);
    expect(fake.upserts).toEqual([{
      songId: "song-three",
      difficulty: "normal",
      difficultyLevel: 5,
      offsetMs: 34,
    }]);
  });
});

describe("deleteSongAsset", () => {
  it("차트가 2개 남아 있으면 SongHasChartsError를 던지고 어댑터를 일절 호출하지 않는다", async () => {
    const fake = makeAdapter({ songFiles: ["songs/song-five/audio.ogg"] });

    await expect(
      deleteSongAsset(fake.adapter, { songId: "song-five", chartCount: 2 }),
    ).rejects.toThrow(SongHasChartsError);
    expect(fake.calls).toEqual([]);
  });

  it("차트 0개면 songs 행을 먼저 지운 뒤 남은 파일(음원·자켓)을 제거한다", async () => {
    const fake = makeAdapter({
      songFiles: ["songs/song-six/audio.ogg", "songs/song-six/jacket.jpg"],
    });

    const result = await deleteSongAsset(fake.adapter, {
      songId: "song-six",
      chartCount: 0,
    });

    expect(fake.songDeletes).toEqual(["song-six"]);
    expect(fake.calls).toEqual([
      "deleteSong:song-six",
      "list:song-six",
      "remove:songs/song-six/audio.ogg,songs/song-six/jacket.jpg",
    ]);
    expect(result.removedPaths).toEqual([
      "songs/song-six/audio.ogg",
      "songs/song-six/jacket.jpg",
    ]);
  });

  it("Storage에 남은 파일이 없으면 remove를 호출하지 않는다", async () => {
    const fake = makeAdapter({ songFiles: [] });

    const result = await deleteSongAsset(fake.adapter, {
      songId: "song-seven",
      chartCount: 0,
    });

    expect(fake.calls).toEqual(["deleteSong:song-seven", "list:song-seven"]);
    expect(result.removedPaths).toEqual([]);
  });

  it("songs 행 삭제가 실패하면(FK restrict 등) Storage 파일은 건드리지 않는다", async () => {
    const fake = makeAdapter({ songFiles: ["songs/song-eight/audio.ogg"] });
    fake.adapter.deleteSongRow = async () => {
      throw new Error("violates foreign key constraint");
    };

    await expect(
      deleteSongAsset(fake.adapter, { songId: "song-eight", chartCount: 0 }),
    ).rejects.toThrow("foreign key");
    expect(fake.removes).toEqual([]);
  });
});

describe("deleteChartAsset", () => {
  it("deletes the chart row before removing chart and extra JSON assets", async () => {
    const fake = makeAdapter();

    await deleteChartAsset(fake.adapter, {
      songId: "song-four",
      difficulty: "HARD",
    });

    expect(fake.deletes).toEqual([{ songId: "song-four", difficulty: "hard" }]);
    expect(fake.removes).toEqual([[
      "songs/song-four/hard.json",
      "songs/song-four/hard.extra.json",
    ]]);
    expect(fake.calls).toEqual([
      "delete:song-four:hard",
      "remove:songs/song-four/hard.json,songs/song-four/hard.extra.json",
    ]);
  });
});
