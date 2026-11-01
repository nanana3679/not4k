import { describe, expect, it } from "vitest";
import type { Chart, ChartDocument, NoteEntity } from "../types";
import { beat } from "../types";
import { auxNotesAsExtra, deserializeChartDocument, mainNotes, parseExtraNotesDocument, serializeChart, serializeExtraNotes, withAuxNotes } from "../chart";
import {
  createChartAsset,
  deleteChartAsset,
  deleteSongAsset,
  saveChartAsset,
  saveSonglessChartAsset,
  SongHasChartsError,
  type ChartRowCreate,
  type ChartRowSave,
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

function makeAdapter(input: { songFiles?: string[]; tokens?: string[] } = {}) {
  const calls: string[] = [];
  const uploads: { path: string; content: string; contentType: string; upsert: boolean }[] = [];
  const removes: string[][] = [];
  const rowSaves: ChartRowSave[] = [];
  const rowCreates: ChartRowCreate[] = [];
  const deletes: unknown[] = [];
  const songDeletes: string[] = [];
  const tokens = [...(input.tokens ?? ["token-1", "token-2"])];

  const adapter: SongAssetPersistenceAdapter = {
    uploadText: async (asset) => {
      calls.push(`upload:${asset.path}`);
      uploads.push(asset);
    },
    remove: async (paths) => {
      calls.push(`remove:${paths.join(",")}`);
      removes.push(paths);
    },
    saveChartRow: async (row) => {
      calls.push(`saveRow:${row.chartId}:${row.expectedRevision}`);
      rowSaves.push(row);
      return row.expectedRevision + 1;
    },
    createChartRow: async (row) => {
      calls.push(`createRow:${row.songId}:${row.difficulty}`);
      rowCreates.push(row);
      return { chartId: `created-${row.difficulty}`, revision: 0 };
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
    newPathToken: () => tokens.shift() ?? "token-x",
  };

  return { adapter, calls, uploads, removes, rowSaves, rowCreates, deletes, songDeletes };
}

const ROW = { chartId: "chart-uuid-1", revision: 3 };

describe("saveChartAsset", () => {
  it("혼합 main/aux 저장은 Grace·holdOnly·길이 0·독립 수량·메타데이터를 재불러오고 dirty 비교도 보존한다", async () => {
    const fake = makeAdapter();
    const chart: ChartDocument = { ...makeChart(), notes: [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true },
      { type: "tap", kind: "double", lane: 2, beat: beat(0), grace: true },
      { type: "body", lane: 2, beat: beat(0), endBeat: beat(2), holdCount: 1 },
      { type: "release", lane: 2, beat: beat(2), count: 2, grace: true },
      { type: "single", lane: 5, beat: beat(0), grace: true },
      { type: "doubleLong", lane: 6, beat: beat(0), endBeat: beat(0), holdOnly: true },
      { type: "body", lane: 7, beat: beat(1), endBeat: beat(1), holdCount: 2 },
      { type: "tick", lane: 7, beat: beat(1), count: 2 },
    ] };
    const saved = await saveChartAsset(fake.adapter, { songId: "mixed", difficulty: "Expert", chart, extraLaneCount: 4, row: ROW });
    const parsed = deserializeChartDocument(saved.chartJson);
    const extra = parseExtraNotesDocument(JSON.parse(saved.extraJson));
    const restored = { ...parsed, notes: withAuxNotes(parsed.notes, extra.extraNotes) };
    expect(restored.notes).toEqual(chart.notes);
    expect(restored.meta).toEqual(chart.meta);
    expect(restored.events).toEqual(chart.events);
    expect(JSON.parse(saved.chartJson).version).toBe(4);
    expect(JSON.parse(saved.extraJson).version).toBe(4);
    expect(extra.extraLaneCount).toBe(4);
    expect(serializeChart({ ...restored, notes: mainNotes(restored.notes) })).toBe(saved.chartJson);
    expect(serializeExtraNotes(auxNotesAsExtra(restored.notes), 4)).toBe(saved.extraJson);
    expect(fake.uploads.map((upload) => upload.content)).toEqual([saved.chartJson, saved.extraJson]);
    restored.notes[7] = { type: "tick", lane: 7, beat: beat(1), count: 1 };
    expect(serializeExtraNotes(auxNotesAsExtra(restored.notes), 4)).not.toBe(saved.extraJson);
  });

  it("신형 보조 노트만 있고 메인은 구형이면 메인 v3·보조 v4로 나누며 입력 차트를 변환하지 않는다", async () => {
    const fake = makeAdapter();
    const chart: ChartDocument = { ...makeChart(), notes: [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "release", lane: 5, beat: beat(0), count: 1 },
    ] };
    const before = serializeChart(chart);
    const saved = await saveChartAsset(fake.adapter, { songId: "aux-only", difficulty: "Easy", chart, extraLaneCount: 0, row: ROW });
    expect(JSON.parse(saved.chartJson).version).toBe(3);
    expect(JSON.parse(saved.extraJson).version).toBe(4);
    expect(fake.removes).toEqual([]);
    expect(serializeChart(chart)).toBe(before);
  });

  it("Hard 차트 저장은 메인·보조 JSON을 토큰 token-1의 새 경로에 upsert false로 올린 뒤 save_chart에 행 ID·예상 리비전 3·레벨 13·새 경로를 넘기고 리비전 4를 돌려준다", async () => {
    const fake = makeAdapter();

    const result = await saveChartAsset(fake.adapter, {
      songId: "song-one",
      difficulty: "Hard",
      chart: makeChart({ difficultyLevel: 13, offsetMs: -12 }),
      extraLaneCount: 2,
      row: ROW,
    });

    expect(fake.uploads.map(({ path, contentType, upsert }) => ({ path, contentType, upsert }))).toEqual([
      { path: "songs/song-one/hard-token-1.json", contentType: "application/json", upsert: false },
      { path: "songs/song-one/hard-token-1.extra.json", contentType: "application/json", upsert: false },
    ]);
    expect(JSON.parse(fake.uploads[0].content).meta.difficultyLevel).toBe(13);
    expect(fake.calls.at(-1)).toBe("saveRow:chart-uuid-1:3");
    expect(fake.rowSaves).toEqual([{
      chartId: "chart-uuid-1",
      expectedRevision: 3,
      difficultyLevel: 13,
      chartPath: "songs/song-one/hard-token-1.json",
      extraPath: "songs/song-one/hard-token-1.extra.json",
    }]);
    expect(fake.rowCreates).toEqual([]);
    expect(fake.removes).toEqual([]);
    expect(result).toMatchObject({
      chartPath: "songs/song-one/hard-token-1.json",
      extraPath: "songs/song-one/hard-token-1.extra.json",
      difficulty: "hard",
      row: { chartId: "chart-uuid-1", revision: 4 },
    });
  });

  it("보조 레인 수 0·보조 노트 없음이면 기존 보조 파일을 지우지 않고 새 보조 경로에 빈 보조 JSON {extraNotes:[], extraLaneCount:0}을 올린다", async () => {
    const fake = makeAdapter();

    const result = await saveChartAsset(fake.adapter, {
      songId: "song-one", difficulty: "Hard", chart: makeChart(), extraLaneCount: 0, row: ROW,
    });

    expect(fake.removes).toEqual([]);
    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-one/hard-token-1.json",
      "songs/song-one/hard-token-1.extra.json",
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({ extraNotes: [], extraLaneCount: 0 });
    expect(result.extraJson).toBe(fake.uploads[1].content);
  });

  it("보조 레인 3개·보조 노트 lane 6이 있으면 보조 JSON에 extraLane 2·extraLaneCount 3으로 올린다", async () => {
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
      row: ROW,
    });

    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-two/expert-token-1.json",
      "songs/song-two/expert-token-1.extra.json",
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({
      extraNotes: [{ type: "single", extraLane: 2, beat: "1/4" }],
      extraLaneCount: 3,
    });
  });

  it("같은 차트를 두 번 저장하면 매번 다른 토큰의 경로에 올려 이전 저장 파일을 덮지 않는다", async () => {
    const fake = makeAdapter({ tokens: ["first", "second"] });
    const input = { songId: "song-one", difficulty: "hard", chart: makeChart(), extraLaneCount: 2, row: ROW };

    await saveChartAsset(fake.adapter, input);
    await saveChartAsset(fake.adapter, { ...input, row: { ...ROW, revision: 4 } });

    expect(fake.uploads.map((upload) => upload.path)).toEqual([
      "songs/song-one/hard-first.json", "songs/song-one/hard-first.extra.json",
      "songs/song-one/hard-second.json", "songs/song-one/hard-second.extra.json",
    ]);
  });

  it("보조 JSON 업로드가 실패하면 save_chart를 부르지 않아 charts 행은 이전 파일을 계속 가리킨다", async () => {
    const fake = makeAdapter();
    fake.adapter.uploadText = async (asset) => {
      if (asset.path.endsWith(".extra.json")) throw new Error("Storage upload failed");
    };

    await expect(saveChartAsset(fake.adapter, {
      songId: "song-one", difficulty: "hard", chart: makeChart(), extraLaneCount: 2, row: ROW,
    })).rejects.toThrow("Storage upload failed");
    expect(fake.rowSaves).toEqual([]);
  });

  it("save_chart가 PT409로 거부하면 오류 code PT409를 그대로 던진다", async () => {
    const fake = makeAdapter();
    fake.adapter.saveChartRow = async () => { throw Object.assign(new Error("chart_revision_conflict"), { code: "PT409" }); };

    await expect(saveChartAsset(fake.adapter, {
      songId: "song-one", difficulty: "hard", chart: makeChart(), extraLaneCount: 2, row: ROW,
    })).rejects.toMatchObject({ code: "PT409" });
  });
});

describe("createChartAsset", () => {
  it("Normal 새 차트는 메인·빈 보조 JSON을 새 경로에 올린 뒤 create_chart에 곡·소문자 난이도 normal·레벨 5·새 경로를 넘기고 새 행 ID·리비전 0을 돌려준다", async () => {
    const fake = makeAdapter();

    const result = await createChartAsset(fake.adapter, {
      songId: "song-three",
      difficulty: "Normal",
      chart: makeChart({ difficultyLevel: 5 }),
    });

    expect(fake.uploads.map(({ path, upsert }) => ({ path, upsert }))).toEqual([
      { path: "songs/song-three/normal-token-1.json", upsert: false },
      { path: "songs/song-three/normal-token-1.extra.json", upsert: false },
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({ extraNotes: [], extraLaneCount: 0 });
    expect(fake.removes).toEqual([]);
    expect(fake.calls.at(-1)).toBe("createRow:song-three:normal");
    expect(fake.rowCreates).toEqual([{
      songId: "song-three",
      difficulty: "normal",
      difficultyLevel: 5,
      chartPath: "songs/song-three/normal-token-1.json",
      extraPath: "songs/song-three/normal-token-1.extra.json",
    }]);
    expect(fake.rowSaves).toEqual([]);
    expect(result.row).toEqual({ chartId: "created-normal", revision: 0 });
  });

  it("Save As처럼 보조 레인 3개를 넘기면 보조 JSON에 extraLaneCount 3을 담아 만든다", async () => {
    const fake = makeAdapter();

    const result = await createChartAsset(fake.adapter, {
      songId: "song-three", difficulty: "LIFTOFF", chart: makeChart(), extraLaneCount: 3,
    });

    expect(JSON.parse(result.extraJson)).toEqual({ extraNotes: [], extraLaneCount: 3 });
    expect(result.difficulty).toBe("liftoff");
  });

  it("create_chart가 23505(같은 곡·난이도 행 있음)로 거부하면 code 23505를 그대로 던진다", async () => {
    const fake = makeAdapter();
    fake.adapter.createChartRow = async () => { throw Object.assign(new Error("duplicate key"), { code: "23505" }); };

    await expect(createChartAsset(fake.adapter, {
      songId: "song-three", difficulty: "normal", chart: makeChart(),
    })).rejects.toMatchObject({ code: "23505" });
  });
});

describe("saveSonglessChartAsset", () => {
  it("곡 행 없는 Hard 차트에 보조 레인 2개가 있으면 결정적 경로 hard.json·hard.extra.json에 upsert true로 덮어쓰고 charts 행은 만들거나 고치지 않는다", async () => {
    const fake = makeAdapter();

    const result = await saveSonglessChartAsset(fake.adapter, {
      songId: "song-three", difficulty: "Hard", chart: makeChart(), extraLaneCount: 2,
    });

    expect(fake.uploads.map(({ path, upsert }) => ({ path, upsert }))).toEqual([
      { path: "songs/song-three/hard.json", upsert: true },
      { path: "songs/song-three/hard.extra.json", upsert: true },
    ]);
    expect(JSON.parse(fake.uploads[1].content)).toEqual({ extraNotes: [], extraLaneCount: 2 });
    expect(fake.rowSaves).toEqual([]);
    expect(fake.rowCreates).toEqual([]);
    expect(fake.removes).toEqual([]);
    expect(result).toMatchObject({ chartPath: "songs/song-three/hard.json", extraPath: "songs/song-three/hard.extra.json", difficulty: "hard" });
    expect(result).not.toHaveProperty("row");
  });

  it("곡 행 없는 차트에 보조 레인 0·보조 노트가 없으면 메인만 덮어쓰고 결정적 경로의 보조 파일 hard.extra.json을 지운다", async () => {
    const fake = makeAdapter();

    await saveSonglessChartAsset(fake.adapter, {
      songId: "song-three", difficulty: "hard", chart: makeChart(), extraLaneCount: 0,
    });

    expect(fake.uploads.map(({ path }) => path)).toEqual(["songs/song-three/hard.json"]);
    expect(fake.removes).toEqual([["songs/song-three/hard.extra.json"]]);
    expect(fake.rowSaves).toEqual([]);
    expect(fake.rowCreates).toEqual([]);
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
