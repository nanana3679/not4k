import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import { beat } from "../../shared";
import type { BpmMarker, Chart, Lane, TimeSignatureMarker } from "../../shared";
import { MinimapRenderer, type MinimapHost } from "./MinimapRenderer";

function makeChart(noteCount: number): Chart {
  return {
    meta: {
      title: "perf",
      artist: "perf",
      difficultyLabel: "HARD",
      difficultyLevel: 10,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes: Array.from({ length: noteCount }, (_, i) => ({
      type: "single",
      lane: ((i % 4) + 1) as Lane,
      beat: beat(i, 16),
    })),
    trillZones: [],
    events: [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ],
  };
}

function makeHost(
  chart: Chart,
  minimapLayer: Container,
  overrides: Partial<MinimapHost> = {},
): MinimapHost {
  const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
  const timeSignatures: TimeSignatureMarker[] = [{ measure: 0, beatPerMeasure: beat(4) }];
  return {
    chart,
    options: {
      canvas: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as HTMLCanvasElement,
      width: 800,
      height: 600,
    },
    scrollY: 0,
    totalTimelineHeight: 80_000,
    waveformDurationMs: 640_000,
    zoom: 200,
    cachedBpmMarkers: bpmMarkers,
    cachedTimeSignatures: timeSignatures,
    getTotalTimelineMs: () => 640_000,
    timeToY: (timeMs: number) => 80_000 - timeMs / 10,
    minimapLayer,
    minimapVisible: true,
    violatingNoteIndices: new Set<number>(),
    violatingTrillZoneIndices: new Set<number>(),
    violatingEventIndices: new Set<number>(),
    ...overrides,
  };
}

describe("MinimapRenderer", () => {
  it("2만개 노트를 렌더링해도 minimapLayer 자식 수는 400개 이하", () => {
    const chart = makeChart(20_000);
    const minimapLayer = new Container();
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer));

    renderer.render();

    expect(minimapLayer.children.length).toBeLessThanOrEqual(400);
  });

  it("0/4 박자표(마디 미전진)여도 render가 무한루프 없이 종료한다", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    // 분자 0 박자표: measureStartBeat가 전진하지 않아 가드가 없으면 measure-line 루프가 무한루프.
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer, {
      cachedTimeSignatures: [{ measure: 0, beatPerMeasure: beat(0) }],
    }));

    // 무한루프면 이 호출이 반환되지 않아 테스트가 타임아웃으로 실패한다.
    renderer.render();

    // 마디선은 최대 1개(마디 0)만 그려지고 즉시 종료 — 유한함이 요점.
    expect(minimapLayer.children.length).toBeLessThan(50);
  });

  it("보조 레인(lane 5~8) 노트만 있는 차트는 노트 0개 차트와 미니맵 자식 수가 같다 (보조는 미니맵 미표시)", () => {
    const render = (chart: Chart): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer)).render();
      return minimapLayer.children.length;
    };

    const emptyChart = { ...makeChart(0), notes: [] };
    const auxOnlyChart = {
      ...makeChart(0),
      notes: Array.from({ length: 8 }, (_, i) => ({
        type: "single" as const,
        lane: (i % 4) + 5, // lane 5~8
        beat: beat(i, 4),
      })),
    };

    expect(render(auxOnlyChart)).toBe(render(emptyChart));
  });

  it("위반 노트·트릴존·이벤트 Set을 주입하면 위반 없는 렌더보다 자식이 정확히 1개(단일 batch Graphics) 많다", () => {
    const chart: Chart = {
      ...makeChart(4),
      trillZones: [{ lane: 1 as Lane, beat: beat(8), endBeat: beat(10) }],
    };
    const render = (overrides: Partial<MinimapHost>): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer, overrides)).render();
      return minimapLayer.children.length;
    };

    const withoutViolations = render({});
    const withViolations = render({
      violatingNoteIndices: new Set([0, 2]),
      violatingTrillZoneIndices: new Set([0]),
      violatingEventIndices: new Set([0]),
    });

    expect(withViolations).toBe(withoutViolations + 1);
  });

  it("위반 Set이 전부 비어 있으면 위반 틱 Graphics를 추가하지 않는다", () => {
    const chart = makeChart(4);
    const render = (overrides: Partial<MinimapHost>): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer, overrides)).render();
      return minimapLayer.children.length;
    };

    // 빈 Set(기본값) 렌더 두 번의 자식 수가 같음 — 위반 틱 단계가 no-op.
    expect(render({})).toBe(render({
      violatingNoteIndices: new Set<number>(),
      violatingTrillZoneIndices: new Set<number>(),
      violatingEventIndices: new Set<number>(),
    }));
  });

  it("화면(뷰포트) 밖 beat의 위반 노트도 미니맵 위반 틱으로 그려진다 (클리핑 없음)", () => {
    // scrollY 0에서 timeToY(600_000ms) = 20_000 → 캔버스(600px) 밖이지만
    // 미니맵은 전체 타임라인을 축소하므로 틱이 그려져야 한다.
    const chart: Chart = {
      ...makeChart(0),
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(1200) }, // 600_000ms @ 120BPM
      ],
    };
    const render = (overrides: Partial<MinimapHost>): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer, overrides)).render();
      return minimapLayer.children.length;
    };

    expect(render({ violatingNoteIndices: new Set([0]) })).toBe(render({}) + 1);
  });
});
