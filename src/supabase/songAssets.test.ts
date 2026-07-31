import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartAssetUpsert } from "../shared/songAssets";
import { beat, type Chart } from "../shared";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("./client", () => ({
  supabase: {
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
    storage: {
      from: supabaseMocks.storageFrom,
    },
  },
}));

import {
  saveChartAsset,
  supabaseSongAssetAdapter,
} from "./songAssets";

const chart: Chart = {
  meta: {
    title: "Test",
    artist: "Tester",
    difficultyLabel: "HARD",
    difficultyLevel: 12,
    imageFile: "",
    audioFile: "",
    previewAudioFile: "",
    offsetMs: 0,
  },
  notes: [],
  trillZones: [],
  events: [
    { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
    { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
  ],
};

function chartRow(allowCreate: boolean): ChartAssetUpsert {
  return {
    songId: "song-one",
    difficulty: "hard",
    difficultyLevel: 12,
    offsetMs: 0,
    revision: "rev-1",
    allowCreate,
  };
}

describe("supabase chart asset adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allowCreate=true이고 대상 행이 없으면 charts insert로 신규 난이도 생성", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "chart-one" }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const insert = vi.fn().mockReturnValue({ select });
    const update = vi.fn();
    supabaseMocks.from.mockReturnValue({ insert, update });

    await supabaseSongAssetAdapter.publishChartRow(chartRow(true));

    expect(supabaseMocks.from).toHaveBeenCalledWith("charts");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      song_id: "song-one",
      difficulty_label: "hard",
      asset_revision: "rev-1",
    }));
    expect(update).not.toHaveBeenCalled();
  });

  it("allowCreate=false이고 대상 행이 없으면 insert하지 않고 chart no longer exists 에러", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eqDifficulty = vi.fn().mockReturnValue({ select });
    const eqSong = vi.fn().mockReturnValue({ eq: eqDifficulty });
    const update = vi.fn().mockReturnValue({ eq: eqSong });
    const insert = vi.fn();
    supabaseMocks.from.mockReturnValue({ insert, update });

    await expect(supabaseSongAssetAdapter.publishChartRow(chartRow(false)))
      .rejects.toThrow("chart no longer exists");
    expect(update).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("Save As overwrite의 expectedRevision=rev-old이 바뀌었으면 CAS update가 0행이라 저장 거부", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const revisionEq = vi.fn().mockReturnValue({ select });
    const target = {
      eq: revisionEq,
      is: vi.fn(),
      select,
    };
    const eqDifficulty = vi.fn().mockReturnValue(target);
    const eqSong = vi.fn().mockReturnValue({ eq: eqDifficulty });
    const update = vi.fn().mockReturnValue({ eq: eqSong });
    supabaseMocks.from.mockReturnValue({ insert: vi.fn(), update });

    await expect(supabaseSongAssetAdapter.publishChartRow({
      ...chartRow(false),
      expectedRevision: "rev-old",
    })).rejects.toThrow("chart no longer exists");
    expect(revisionEq).toHaveBeenCalledWith("asset_revision", "rev-old");
  });

  it("reader-first 단계에서 revision writer가 disabled면 Storage 업로드 전에 저장 거부", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        schema_ready: true,
        revision_writes_enabled: false,
      },
      error: null,
    });

    await expect(saveChartAsset({
      songId: "song-one",
      difficulty: "hard",
      chart,
      extraLaneCount: 0,
    })).rejects.toThrow("아직 활성화되지 않았습니다");
    expect(supabaseMocks.storageFrom).not.toHaveBeenCalled();
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
