import { beforeEach, describe, expect, it } from "vitest";
import {
  beat,
  saveChartAsset,
  serializeChart,
  serializeExtraNotes,
  songChartExtraPath,
} from "../shared";
import type { Chart, SongAssetPersistenceAdapter } from "../shared";
import {
  fetchOptionalExtraChartText,
  getEditorAudioLoadingSurface,
  loadChartIntoEditor,
  loadEditorChartAssets,
  parseEditorChartAssets,
} from "./editorLoading";
import type { NoteEntity } from "../shared/types/chart";
import { useEditorStore } from "./stores";

function chartText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    meta: {},
    notes: [{ type: "single", lane: 1, beat: "0" }],
    trillZones: [],
    events: [],
    ...extra,
  });
}

/** Supabase Storage가 없는 객체에 실제로 주는 응답(2026-10-18 실측: HTTP 400 + 본문 statusCode "404") */
function supabaseObjectNotFound(): Response {
  return new Response(
    JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
}

describe("getEditorAudioLoadingSurface", () => {
  it("keeps the first audio load on a transparent page loading surface", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: true,
    })).toBe("transparentPage");

    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: true,
    })).toBe("transparentPage");
  });

  it("uses canvas overlay for later audio loads after editor boot", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: false,
    })).toBe("overlay");
  });

  it("does not show an audio loading surface when audio is ready", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: false,
    })).toBeNull();
  });
});

describe("fetchOptionalExtraChartText", () => {
  it("보조 파일 응답이 200이면 별도 파일 본문 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response('{"extraNotes":[]}', { status: 200 }),
    );

    expect(result).toBe('{"extraNotes":[]}');
  });

  it("보조 파일 응답이 404이면 기존 차트의 하위호환 데이터를 쓰도록 null 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("", { status: 404 }),
    );

    expect(result).toBeNull();
  });

  it("보조 파일 응답이 Supabase 배포 형식의 객체 없음(HTTP 400, 본문 statusCode \"404\"·code \"NoSuchKey\")이면 파일 없음으로 null 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => supabaseObjectNotFound(),
    );

    expect(result).toBeNull();
  });

  it("HTTP 400 본문의 error도 code와 같은 \"NoSuchKey\"인 형식(Storage render() 원래 출력)이면 파일 없음으로 null 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "404", code: "NoSuchKey", error: "NoSuchKey", message: "Object not found" }),
        { status: 400 },
      ),
    );

    expect(result).toBeNull();
  });

  it("HTTP 400 본문이 code 없는 이전 Storage 형식(statusCode \"404\", error \"not_found\")이면 파일 없음으로 null 반환", async () => {
    const result = await fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }),
        { status: 400 },
      ),
    );

    expect(result).toBeNull();
  });

  it("HTTP 400 본문에 code \"NoSuchUpload\"가 있으면 error가 \"not_found\"여도 code가 우선해 파일 없음으로 보지 않고 HTTP 400 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "404", code: "NoSuchUpload", error: "not_found", message: "Upload not found" }),
        { status: 400 },
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 400");
  });

  it("HTTP 400 본문이 statusCode \"404\"여도 code가 \"NoSuchBucket\"(버킷 없음)이면 파일 없음으로 보지 않고 HTTP 400 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "404", code: "NoSuchBucket", error: "Bucket not found", message: "Bucket not found" }),
        { status: 400 },
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 400");
  });

  it("HTTP 400 본문이 code 없이 statusCode \"404\"·error \"Bucket not found\"이면 파일 없음으로 보지 않고 HTTP 400 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }),
        { status: 400 },
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 400");
  });

  it("HTTP 400 본문의 statusCode가 \"403\"이면 파일 없음으로 보지 않고 HTTP 400 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response(
        JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }),
        { status: 400 },
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 400");
  });

  it("HTTP 400 본문이 JSON이 아니면 파일 없음으로 보지 않고 HTTP 400 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("Bad Request", { status: 400 }),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 400");
  });

  it("보조 파일 응답이 HTTP 500이면 파일 없음으로 보지 않고 HTTP 500 에러로 거부", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("", { status: 500 }),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 500");
  });

  it("보조 파일 요청이 네트워크 오류로 실패하면 파일 없음으로 보지 않고 네트워크 오류로 거부", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => {
        throw new TypeError("Failed to fetch");
      },
    )).rejects.toThrow("보조 차트 가져오기 실패: 네트워크 오류");
  });

  it("200 응답 본문 읽기가 실패하면 응답 읽기 오류로 거부", async () => {
    const response = new Response("", { status: 200 });
    response.text = async () => {
      throw new Error("stream failed");
    };

    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => response,
    )).rejects.toThrow("보조 차트 가져오기 실패: 응답 읽기 오류");
  });
});

describe("loadEditorChartAssets", () => {
  it("메인 파일이 500이면 Chart fetch failed: 500으로 거부", async () => {
    await expect(loadEditorChartAssets(
      "https://example.com/chart.json",
      "https://example.com/chart.extra.json",
      async (input) => (
        String(input).endsWith(".extra.json")
          ? new Response("", { status: 404 })
          : new Response("", { status: 500 })
      ),
    )).rejects.toThrow("Chart fetch failed: 500");
  });

  it("메인 파일은 200이어도 보조 파일이 500이면 병합 결과를 반환하지 않고 에러", async () => {
    await expect(loadEditorChartAssets(
      "https://example.com/chart.json",
      "https://example.com/chart.extra.json",
      async (input) => (
        String(input).endsWith(".extra.json")
          ? new Response("", { status: 500 })
          : new Response(chartText(), { status: 200 })
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 500");
  });

  it("메인과 보조 파일이 200이면 보조 노트를 병합해 반환", async () => {
    const result = await loadEditorChartAssets(
      "https://example.com/chart.json",
      "https://example.com/chart.extra.json",
      async (input) => new Response(
        String(input).endsWith(".extra.json")
          ? JSON.stringify({
              extraNotes: [{ type: "single", extraLane: 2, beat: "1" }],
              extraLaneCount: 2,
            })
          : chartText(),
        { status: 200 },
      ),
    );

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 6]);
    expect(result.extraLaneCount).toBe(2);
  });

  it("메인 파일 200·보조 파일이 Supabase 객체 없음이면 메인 노트만 반환하고 extraLaneCount=0", async () => {
    const result = await loadEditorChartAssets(
      "https://example.com/chart.json",
      "https://example.com/chart.extra.json",
      async (input) => (
        String(input).endsWith(".extra.json")
          ? supabaseObjectNotFound()
          : new Response(chartText(), { status: 200 })
      ),
    );

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1]);
    expect(result.extraLaneCount).toBe(0);
  });
});

describe("parseEditorChartAssets", () => {
  it("별도 보조 파일이 있으면 legacy 내장 데이터 대신 별도 파일 노트를 lane 5+로 병합", () => {
    const mainText = chartText({
      extraNotes: [{ type: "single", extraLane: 1, beat: "1" }],
      extraLaneCount: 1,
    });
    const extraText = JSON.stringify({
      extraNotes: [{ type: "single", extraLane: 3, beat: "2" }],
      extraLaneCount: 3,
    });

    const result = parseEditorChartAssets(mainText, extraText);

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 7]);
    expect(result.extraLaneCount).toBe(3);
  });

  it("보조 파일이 404로 없으면 메인 차트에 내장된 legacy 보조 노트를 병합", () => {
    const mainText = chartText({
      extraNotes: [{ type: "single", extraLane: 2, beat: "1" }],
      extraLaneCount: 2,
    });

    const result = parseEditorChartAssets(mainText, null);

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 6]);
    expect(result.extraLaneCount).toBe(2);
  });

  it("200 응답의 보조 파일 본문이 \"not json\"이면 \"유효한 JSON이 아닙니다\" 오류로 거부", () => {
    expect(() => parseEditorChartAssets(chartText(), "not json"))
      .toThrow("보조 차트 파싱 실패: 유효한 JSON이 아닙니다");
  });

  it("200 응답의 보조 파일이 빈 문자열이면 legacy 데이터로 대체하지 않고 에러", () => {
    expect(() => parseEditorChartAssets(chartText(), ""))
      .toThrow("보조 차트 파싱 실패: 유효한 JSON이 아닙니다");
  });

  it.each(["null", "[]", '"text"'])(
    "보조 파일 최상위가 객체가 아닌 %s이면 에러",
    (extraText) => {
      expect(() => parseEditorChartAssets(chartText(), extraText))
        .toThrow("보조 차트 파싱 실패: 최상위 값이 객체가 아닙니다");
    },
  );

  it("별도 보조 파일에 extraNotes 필드가 없으면 빈 데이터로 대체하지 않고 에러", () => {
    expect(() => parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraLaneCount: 2, extraNote: [] }),
    )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  });

  it("별도 보조 파일에 extraLaneCount 필드가 없으면 빈 데이터로 대체하지 않고 에러", () => {
    expect(() => parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraNotes: [] }),
    )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  });

  it("legacy 차트에 보조 필드가 모두 없으면 빈 보조 데이터로 로드", () => {
    const result = parseEditorChartAssets(chartText(), null);

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1]);
    expect(result.extraLaneCount).toBe(0);
  });

  it("보조 노트 3개 중 extraNotes[1]의 beat가 \"12junk\"이고 extraNotes[2]의 extraLane이 0이면 오류 메시지에는 처음 어긋난 extraNotes[1]이 들어간다", () => {
    expect(() => parseEditorChartAssets(
      chartText(),
      JSON.stringify({
        extraNotes: [
          { type: "single", extraLane: 1, beat: "1" },
          { type: "single", extraLane: 1, beat: "12junk" },
          { type: "single", extraLane: 0, beat: "3" },
        ],
        extraLaneCount: 2,
      }),
    )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다 (Extra chart: invalid extraNotes[1])");
  });

  it("extraNotes가 배열이 아니면 데이터 형식 오류로 변환", () => {
    expect(() => parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraNotes: {}, extraLaneCount: 1 }),
    )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  });

  it("보조 노트 0개이고 extraLaneCount=4이면 빈 보조 레인 4개 유지", () => {
    const result = parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraNotes: [], extraLaneCount: 4 }),
    );

    expect(result.extraLaneCount).toBe(4);
  });

  it("extraLaneCount=0이어도 extraLane=3 노트가 있으면 3으로 자동 확장", () => {
    const result = parseEditorChartAssets(
      chartText(),
      JSON.stringify({
        extraNotes: [{ type: "single", extraLane: 3, beat: "1" }],
        extraLaneCount: 0,
      }),
    );

    expect(result.extraLaneCount).toBe(3);
  });

  it.each([
    ["알 수 없는 type", { type: "unknown", extraLane: 1, beat: "1" }],
    ["숫자 beat", { type: "single", extraLane: 1, beat: 1 }],
    ["뒤에 문자가 붙은 beat", { type: "single", extraLane: 1, beat: "12junk" }],
    ["single에 endBeat 존재", { type: "single", extraLane: 1, beat: "1", endBeat: "2" }],
    ["long에 endBeat 누락", { type: "long", extraLane: 1, beat: "1" }],
    ["long의 endBeat가 유효하지 않음", { type: "long", extraLane: 1, beat: "1", endBeat: "2junk" }],
  ])("%s 보조 노트이면 데이터 형식 오류", (_label, note) => {
    expect(() => parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraNotes: [note], extraLaneCount: 1 }),
    )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  });

  it.each([
    {
      label: "extraLane=0",
      extra: {
        extraNotes: [{ type: "single", extraLane: 0, beat: "1" }],
        extraLaneCount: 1,
      },
    },
    {
      label: "extraLane=11",
      extra: {
        extraNotes: [{ type: "single", extraLane: 11, beat: "1" }],
        extraLaneCount: 10,
      },
    },
    {
      label: "extraLaneCount=1000000000",
      extra: {
        extraNotes: [],
        extraLaneCount: 1_000_000_000,
      },
    },
  ])("$label이면 허용 범위 밖 보조 레인 데이터로 에러", ({ extra }) => {
    expect(() => parseEditorChartAssets(chartText(), JSON.stringify(extra)))
      .toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  });

  it.each([-1, 1.5, "1"])(
    "extraLaneCount=%s이면 정수가 아닌 허용 범위 밖 데이터로 에러",
    (extraLaneCount) => {
      expect(() => parseEditorChartAssets(
        chartText(),
        JSON.stringify({ extraNotes: [], extraLaneCount }),
      )).toThrow("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
    },
  );

  it("extraLaneCount=10이면 최대 허용 경계로 로드", () => {
    const result = parseEditorChartAssets(
      chartText(),
      JSON.stringify({ extraNotes: [], extraLaneCount: 10 }),
    );

    expect(result.extraLaneCount).toBe(10);
  });
});

// 저장(saveChartAsset)이 chart.notes를 메인/보조 파일로 나누고, 로드(parseEditorChartAssets)가
// 두 파일을 다시 chart.notes 하나로 합치는 왕복 (RFD 0018 ③). 실제 저장·로드 함수를 그대로 잇는다.
describe("보조 노트 grace·holdOnly 저장 분리→로드 병합 왕복", () => {
  const noopAdapter: SongAssetPersistenceAdapter = {
    uploadText: async () => {},
    remove: async () => {},
    upsertChartRow: async () => {},
    deleteChartRow: async () => {},
    listSongFiles: async () => [],
    deleteSongRow: async () => {},
  };

  function makeChart(notes: NoteEntity[]): Chart {
    return {
      meta: {
        title: "Test Song",
        artist: "Tester",
        difficultyLabel: "HARD",
        difficultyLevel: 10,
        imageFile: "",
        audioFile: "",
        previewAudioFile: "",
        offsetMs: 0,
      },
      notes,
      trillZones: [],
      events: [],
    };
  }

  function save(chart: Chart, extraLaneCount: number) {
    return saveChartAsset(noopAdapter, { songId: "song", difficulty: "HARD", chart, extraLaneCount });
  }

  // 로드 병합 결과와 같은 [...메인, ...보조] 순서. 메인 노트의 grace·holdOnly는 메인 파일 경로 대조군이다.
  const notes: NoteEntity[] = [
    { type: "single", lane: 1, beat: beat(0), grace: true },
    { type: "long", lane: 2, beat: beat(1), endBeat: beat(2), holdOnly: true },
    { type: "single", lane: 5, beat: beat(0) },
    { type: "single", lane: 6, beat: beat(1, 2), grace: true },
    { type: "long", lane: 7, beat: beat(1), endBeat: beat(3), holdOnly: true },
  ];

  it("lane 6 grace single과 lane 7 holdOnly long은 저장 분리→로드 병합 후 grace=true·holdOnly=true 유지", async () => {
    const saved = await save(makeChart(notes), 3);

    const loaded = parseEditorChartAssets(saved.chartJson, saved.extraJson);

    expect(loaded.chart.notes).toEqual(notes);
    expect(loaded.extraLaneCount).toBe(3);
  });

  it("extraLane 2 grace·extraLane 3 holdOnly가 기록된 보조 파일을 로드해 그대로 다시 저장하면 extraJson이 원본과 바이트 동일", async () => {
    // Storage에 있는 보조 파일 본문 그대로 (serializeExtraNotes와 같은 키 순서·들여쓰기)
    const extraText = JSON.stringify({
      extraNotes: [
        { type: "single", extraLane: 2, beat: "1/2", grace: true },
        { type: "long", extraLane: 3, beat: "1", endBeat: "3", holdOnly: true },
      ],
      extraLaneCount: 3,
    }, null, 2);
    const loaded = parseEditorChartAssets(chartText(), extraText);

    const resaved = await save(loaded.chart, loaded.extraLaneCount);

    expect(resaved.extraJson).toBe(extraText);
  });
});

const SONG_ID = "song-1";
const OPEN_TARGET = {
  songId: SONG_ID,
  chartUrl: "https://storage.test/songs/song-1/hard.json",
  extraUrl: "https://storage.test/songs/song-1/hard.extra.json",
};
const STORED_EXTRA_PATH = songChartExtraPath(SONG_ID, "hard");

function storedChart(): Chart {
  return {
    meta: {
      title: "Stored Song",
      artist: "Tester",
      difficultyLabel: "HARD",
      difficultyLevel: 12,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes: [{ type: "single", lane: 1, beat: beat(0, 1) }],
    trillZones: [],
    events: [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

/** 저장소에 이미 있는 보조 파일: 보조 노트 2개, 보조 레인 3개 */
const STORED_EXTRA_JSON = serializeExtraNotes(
  [
    { type: "single", extraLane: 1, beat: beat(1, 1) },
    { type: "long", extraLane: 2, beat: beat(2, 1), endBeat: beat(3, 1) },
  ],
  3,
);

/** 메인 파일은 항상 200, 보조 파일 응답만 바꿔 끼우는 저장소 fetch */
function storageFetcher(extraResponse: () => Response): typeof fetch {
  return async (input) => (
    String(input) === OPEN_TARGET.extraUrl
      ? extraResponse()
      : new Response(serializeChart(storedChart()), { status: 200 })
  );
}

describe("loadChartIntoEditor", () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  it("보조 파일이 HTTP 500이면 거부하고 store의 chart·extraLaneCount=2·activeSongId=null을 바꾸지 않는다", async () => {
    const before = useEditorStore.getState();

    await expect(loadChartIntoEditor(
      OPEN_TARGET,
      storageFetcher(() => new Response("", { status: 500 })),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 500");

    const after = useEditorStore.getState();
    expect(after.chart).toBe(before.chart);
    expect(after.extraLaneCount).toBe(2);
    expect(after.activeSongId).toBeNull();
  });

  it("보조 파일이 Supabase 객체 없음이면 메인 노트 1개만 열고 activeSongId를 설정하며 extraLaneCount=2를 유지", async () => {
    await loadChartIntoEditor(OPEN_TARGET, storageFetcher(supabaseObjectNotFound));

    const state = useEditorStore.getState();
    expect(state.chart.notes.map((note) => note.lane)).toEqual([1]);
    expect(state.extraLaneCount).toBe(2);
    expect(state.activeSongId).toBe(SONG_ID);
  });

  it("보조 파일 200이면 보조 노트 2개를 lane 5·6으로 병합해 열고 extraLaneCount=3으로 설정한 뒤 undo 기록을 비운다", async () => {
    await loadChartIntoEditor(
      OPEN_TARGET,
      storageFetcher(() => new Response(STORED_EXTRA_JSON, { status: 200 })),
    );

    const state = useEditorStore.getState();
    expect(state.chart.notes.map((note) => note.lane)).toEqual([1, 5, 6]);
    expect(state.extraLaneCount).toBe(3);
    expect(state.activeSongId).toBe(SONG_ID);
    expect(state.historyPast).toEqual([]);
  });
});

describe("보조 파일 로드 실패 뒤 저장", () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  function recordingAdapter() {
    const calls: string[] = [];
    const uploadedContentByPath = new Map<string, string>();
    const adapter: SongAssetPersistenceAdapter = {
      uploadText: async (asset) => {
        calls.push(`upload:${asset.path}`);
        uploadedContentByPath.set(asset.path, asset.content);
      },
      remove: async (paths) => {
        calls.push(`remove:${paths.join(",")}`);
      },
      upsertChartRow: async (row) => {
        calls.push(`upsert:${row.songId}:${row.difficulty}`);
      },
      deleteChartRow: async () => {
        calls.push("deleteChartRow");
      },
      listSongFiles: async () => [],
      deleteSongRow: async () => {
        calls.push("deleteSongRow");
      },
    };
    return { adapter, calls, uploadedContentByPath };
  }

  /**
   * useFileOperations의 handleSaveChart와 같은 전제·입력으로 저장한다.
   * activeSongId가 없으면 저장하지 않고, 저장 입력은 store의 chart·extraLaneCount를 그대로 쓴다.
   */
  async function saveLikeEditor(adapter: SongAssetPersistenceAdapter): Promise<"saved" | "refused"> {
    const { activeSongId, chart, extraLaneCount } = useEditorStore.getState();
    if (!activeSongId) return "refused";
    await saveChartAsset(adapter, {
      songId: activeSongId,
      difficulty: chart.meta.difficultyLabel.toLowerCase(),
      chart,
      extraLaneCount,
    });
    return "saved";
  }

  it.each<[string, () => Response]>([
    ["HTTP 500", () => new Response("", { status: 500 })],
    ["HTTP 503", () => new Response("", { status: 503 })],
    ["네트워크 오류", () => {
      throw new TypeError("Failed to fetch");
    }],
    ["HTTP 200이지만 JSON이 아닌 본문", () => new Response("<html>gateway error</html>", { status: 200 })],
    ["HTTP 400 statusCode \"403\"", () => new Response(JSON.stringify({ statusCode: "403", error: "Unauthorized" }), { status: 400 })],
    ["HTTP 400 statusCode \"404\"·code \"NoSuchBucket\"", () => new Response(JSON.stringify({ statusCode: "404", code: "NoSuchBucket", error: "Bucket not found", message: "Bucket not found" }), { status: 400 })],
  ])("저장소에 보조 노트 2개가 있는데 보조 파일 요청이 %s이면 activeSongId가 설정되지 않아 이어진 저장 시도가 거부되고 보조 파일 remove·덮어쓰기가 없다", async (_label, extraResponse) => {
    const { adapter, calls } = recordingAdapter();

    const opened = await loadChartIntoEditor(OPEN_TARGET, storageFetcher(extraResponse)).then(() => true, () => false);
    const saved = await saveLikeEditor(adapter);

    expect(calls.filter((call) => call.startsWith("remove:") || call === `upload:${STORED_EXTRA_PATH}`)).toEqual([]);
    expect({ opened, saved }).toEqual({ opened: false, saved: "refused" });
  });

  it("보조 파일을 200으로 열고 바로 저장하면 보조 파일을 원본과 같은 바이트로 다시 쓴다", async () => {
    const { adapter, uploadedContentByPath } = recordingAdapter();

    await loadChartIntoEditor(
      OPEN_TARGET,
      storageFetcher(() => new Response(STORED_EXTRA_JSON, { status: 200 })),
    );

    expect(await saveLikeEditor(adapter)).toBe("saved");
    expect(uploadedContentByPath.get(STORED_EXTRA_PATH)).toBe(STORED_EXTRA_JSON);
  });
});
