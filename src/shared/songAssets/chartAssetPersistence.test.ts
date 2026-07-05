import { describe, expect, it } from "vitest";
import type { Chart, ExtraNoteEntity } from "../types";
import { beat } from "../types";
import {
  createChartAsset,
  deleteChartAsset,
  saveChartAsset,
  type SongAssetPersistenceAdapter,
} from "./chartAssetPersistence";

function makeChart(input: {
  difficultyLabel?: string;
  difficultyLevel?: number;
  offsetMs?: number;
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
    notes: [],
    trillZones: [],
    events: [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

function makeAdapter() {
  const calls: string[] = [];
  const uploads: { path: string; content: string; contentType: string; upsert: boolean }[] = [];
  const removes: string[][] = [];
  const upserts: unknown[] = [];
  const deletes: unknown[] = [];

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
  };

  return { adapter, calls, uploads, removes, upserts, deletes };
}

describe("saveChartAsset", () => {
  it("uploads chart JSON, removes stale extra JSON, and upserts the chart row", async () => {
    const fake = makeAdapter();

    const result = await saveChartAsset(fake.adapter, {
      songId: "song-one",
      difficulty: "Hard",
      chart: makeChart({ difficultyLevel: 13, offsetMs: -12 }),
      extraNotes: [],
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
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 2, beat: beat(1, 4) },
    ];

    await saveChartAsset(fake.adapter, {
      songId: "song-two",
      difficulty: "EXPERT",
      chart: makeChart({ difficultyLabel: "EXPERT" }),
      extraNotes,
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
