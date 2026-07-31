import { describe, expect, it } from "vitest";
import {
  fetchOptionalExtraChartText,
  getEditorAudioLoadingSurface,
  loadEditorChartAssets,
  loadPublishedEditorChartAssets,
  parseEditorChartAssets,
} from "./editorLoading";

function chartText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    meta: {},
    notes: [{ type: "single", lane: 1, beat: "0" }],
    trillZones: [],
    events: [],
    ...extra,
  });
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

  it("보조 파일 응답이 500이면 메인 차트만 연 상태로 진입하지 않고 에러", async () => {
    await expect(fetchOptionalExtraChartText(
      "https://example.com/chart.extra.json",
      async () => new Response("", { status: 500 }),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 500");
  });

  it("보조 파일 요청이 네트워크 오류로 실패하면 메인 차트만 연 상태로 진입하지 않고 에러", async () => {
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
});

describe("loadPublishedEditorChartAssets", () => {
  it("DB revision=rev-123이면 같은 revision의 메인·보조 파일을 병합", async () => {
    const requested: string[] = [];
    const result = await loadPublishedEditorChartAssets(
      { songId: "song-one", difficulty: "HARD" },
      async () => "rev-123",
      (path) => `https://cdn.example/${path}`,
      async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith("hard.rev-123.extra.json")) {
          return new Response(JSON.stringify({
            extraNotes: [{ type: "single", extraLane: 1, beat: "1" }],
            extraLaneCount: 1,
          }));
        }
        return new Response(chartText());
      },
    );

    expect(new Set(requested)).toEqual(new Set([
      "https://cdn.example/songs/song-one/hard.rev-123.json",
      "https://cdn.example/songs/song-one/hard.rev-123.extra.json",
    ]));
    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 5]);
    expect(result.extraLaneCount).toBe(1);
  });

  it("DB revision=rev-123인데 보조 파일이 404이면 메인만 열지 않고 에러", async () => {
    await expect(loadPublishedEditorChartAssets(
      { songId: "song-one", difficulty: "HARD" },
      async () => "rev-123",
      (path) => `https://cdn.example/${path}`,
      async (input) => (
        String(input).endsWith(".extra.json")
          ? new Response("", { status: 404 })
          : new Response(chartText())
      ),
    )).rejects.toThrow("보조 차트 가져오기 실패: HTTP 404");
  });

  it("DB revision=null이고 stable 보조 파일이 404이면 메인에 내장된 legacy 보조 노트를 병합", async () => {
    const result = await loadPublishedEditorChartAssets(
      { songId: "song-one", difficulty: "HARD" },
      async () => null,
      (path) => `https://cdn.example/${path}`,
      async (input) => (
        String(input).endsWith(".extra.json")
          ? new Response("", { status: 404 })
          : new Response(chartText({
              extraNotes: [{ type: "single", extraLane: 2, beat: "1" }],
              extraLaneCount: 2,
            }))
      ),
    );

    expect(result.chart.notes.map((note) => note.lane)).toEqual([1, 6]);
    expect(result.extraLaneCount).toBe(2);
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

  it("200 응답의 보조 파일이 유효하지 않은 JSON이면 메인 차트만 연 상태로 진입하지 않고 에러", () => {
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
