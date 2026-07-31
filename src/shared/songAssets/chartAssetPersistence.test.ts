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

function makeAdapter(input: {
  songFiles?: string[];
  revision?: string;
  failUploadPath?: string;
  failPublish?: boolean;
  deletedRevision?: string | null;
} = {}) {
  const calls: string[] = [];
  const uploads: { path: string; content: string; contentType: string; upsert: boolean }[] = [];
  const removes: string[][] = [];
  const upserts: unknown[] = [];
  const deletes: unknown[] = [];
  const songDeletes: string[] = [];

  const adapter: SongAssetPersistenceAdapter = {
    createRevision: () => input.revision ?? "rev-123",
    uploadText: async (asset) => {
      calls.push(`upload:${asset.path}`);
      uploads.push(asset);
      if (asset.path === input.failUploadPath) {
        throw new Error(`upload failed: ${asset.path}`);
      }
    },
    remove: async (paths) => {
      calls.push(`remove:${paths.join(",")}`);
      removes.push(paths);
    },
    publishChartRow: async (row) => {
      calls.push(`publish:${row.songId}:${row.difficulty}`);
      if (input.failPublish) throw new Error("publish failed");
      upserts.push(row);
    },
    deleteChartRow: async (target) => {
      calls.push(`delete:${target.songId}:${target.difficulty}`);
      deletes.push(target);
      return { revision: input.deletedRevision ?? null };
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
  it("보조 노트가 없어도 같은 revision의 메인·빈 보조 파일을 올린 뒤 DB revision과 메타데이터를 원자 게시", async () => {
    const fake = makeAdapter();

    const result = await saveChartAsset(fake.adapter, {
      songId: "song-one",
      difficulty: "Hard",
      chart: makeChart({ difficultyLevel: 13, offsetMs: -12 }),
      extraLaneCount: 0,
    });

    expect(fake.uploads).toHaveLength(2);
    expect(fake.uploads[0]).toMatchObject({
      path: "songs/song-one/hard.rev-123.json",
      contentType: "application/json",
      upsert: false,
    });
    expect(JSON.parse(fake.uploads[0].content).meta.difficultyLevel).toBe(13);
    expect(fake.uploads[1]).toMatchObject({
      path: "songs/song-one/hard.rev-123.extra.json",
      contentType: "application/json",
      upsert: false,
    });
    expect(JSON.parse(fake.uploads[1].content)).toEqual({
      extraNotes: [],
      extraLaneCount: 0,
    });
    expect(fake.removes).toEqual([]);
    expect(fake.upserts).toEqual([{
      songId: "song-one",
      difficulty: "hard",
      difficultyLevel: 13,
      offsetMs: -12,
      revision: "rev-123",
      allowCreate: false,
    }]);
    expect(result).toMatchObject({
      chartPath: "songs/song-one/hard.rev-123.json",
      extraPath: "songs/song-one/hard.rev-123.extra.json",
      revision: "rev-123",
      difficulty: "hard",
    });
    expect(JSON.parse(result.extraJson)).toEqual({ extraNotes: [], extraLaneCount: 0 });
    expect(fake.calls).toEqual([
      "upload:songs/song-one/hard.rev-123.json",
      "upload:songs/song-one/hard.rev-123.extra.json",
      "publish:song-one:hard",
    ]);
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
      "songs/song-two/expert.rev-123.json",
      "songs/song-two/expert.rev-123.extra.json",
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({
      extraNotes: [{ type: "single", extraLane: 2, beat: "1/4" }],
      extraLaneCount: 3,
    });
  });

  it("보조 세대 파일 업로드가 실패하면 DB를 갱신하지 않고 staging 세대만 정리", async () => {
    const fake = makeAdapter({
      failUploadPath: "songs/song-two/hard.rev-123.extra.json",
    });

    await expect(saveChartAsset(fake.adapter, {
      songId: "song-two",
      difficulty: "HARD",
      chart: makeChart(),
      extraLaneCount: 2,
    })).rejects.toThrow("upload failed");

    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-two/hard.rev-123.json",
      "songs/song-two/hard.rev-123.extra.json",
    ]);
    expect(fake.removes).toEqual([[
      "songs/song-two/hard.rev-123.json",
      "songs/song-two/hard.rev-123.extra.json",
    ]]);
    expect(fake.upserts).toEqual([]);
  });

  it("DB publish 응답이 실패하면 커밋 여부가 불명확하므로 staging 세대를 삭제하지 않음", async () => {
    const fake = makeAdapter({ failPublish: true });

    await expect(saveChartAsset(fake.adapter, {
      songId: "song-two",
      difficulty: "HARD",
      chart: makeChart(),
      extraLaneCount: 2,
    })).rejects.toThrow("publish failed");

    expect(fake.removes).toEqual([]);
    expect(fake.upserts).toEqual([]);
  });

  it('revision="REV-123"이 asset 규칙에 맞지 않으면 파일 업로드 전에 에러', async () => {
    const fake = makeAdapter({ revision: "REV-123" });

    await expect(saveChartAsset(fake.adapter, {
      songId: "song-two",
      difficulty: "HARD",
      chart: makeChart(),
      extraLaneCount: 0,
    })).rejects.toThrow("차트 asset revision이 유효하지 않습니다");

    expect(fake.calls).toEqual([]);
  });
});

describe("createChartAsset", () => {
  it("신규 차트도 고유 revision의 메인·빈 보조 파일을 게시해 동시 생성 간 stable 경합 방지", async () => {
    const fake = makeAdapter();

    await createChartAsset(fake.adapter, {
      songId: "song-three",
      difficulty: "Normal",
      chart: makeChart({ difficultyLevel: 5 }),
    });

    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-three/normal.rev-123.json",
      "songs/song-three/normal.rev-123.extra.json",
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({
      extraNotes: [],
      extraLaneCount: 0,
    });
    expect(fake.removes).toEqual([]);
    expect(fake.upserts).toEqual([{
      songId: "song-three",
      difficulty: "normal",
      difficultyLevel: 5,
      offsetMs: 34,
      revision: "rev-123",
      allowCreate: true,
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
  it("차트 행이 가리킨 rev-a와 legacy 파일만 제거하고 동시 save staging·이전 세대는 건드리지 않음", async () => {
    const fake = makeAdapter({
      deletedRevision: "rev-a",
    });

    await deleteChartAsset(fake.adapter, {
      songId: "song-four",
      difficulty: "HARD",
    });

    expect(fake.deletes).toEqual([{ songId: "song-four", difficulty: "hard" }]);
    expect(fake.removes).toEqual([[
      "songs/song-four/hard.json",
      "songs/song-four/hard.extra.json",
      "songs/song-four/hard.rev-a.json",
      "songs/song-four/hard.rev-a.extra.json",
    ]]);
    expect(fake.calls).toEqual([
      "delete:song-four:hard",
      "remove:songs/song-four/hard.json,songs/song-four/hard.extra.json,songs/song-four/hard.rev-a.json,songs/song-four/hard.rev-a.extra.json",
    ]);
  });
});
