import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";
import { beat } from "../../shared";
import type { BpmMarker, Chart, Lane, TimeSignatureMarker } from "../../shared";
import { MinimapRenderer, type MinimapHost } from "./MinimapRenderer";

/** 테스트에서 private 필드(_viewport·_violationTicks)에 접근하기 위한 캐스트. */
type MinimapRendererInternals = {
  _viewport: Graphics | null;
  _violationTicks: Graphics | null;
};
function internals(renderer: MinimapRenderer): MinimapRendererInternals {
  return renderer as unknown as MinimapRendererInternals;
}

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

  it("setViolations 경로(renderViolationTicks 단독 호출)는 노트 등 다른 자식을 재생성하지 않고 위반 틱만 추가한다", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    // 위반 Set을 mutable Set 참조로 주입 — setViolations가 내용을 바꾸는 상황을 시뮬레이션.
    const violSet = new Set<number>();
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer, {
      violatingNoteIndices: violSet,
    }));

    renderer.render(); // 위반 없음 → 위반 틱 자식 없음
    const childrenAfterRender = [...minimapLayer.children];

    // 위반 발생 → 틱만 경량 갱신(전체 render 아님)
    violSet.add(0);
    violSet.add(2);
    renderer.renderViolationTicks();

    // 기존 자식(배경·레인·노트 batch 등)이 모두 같은 인스턴스로 유지됨(재생성 안 됨)
    for (const c of childrenAfterRender) {
      expect(minimapLayer.children).toContain(c);
    }
    // 정확히 위반 틱 Graphics 1개만 추가됨
    expect(minimapLayer.children.length).toBe(childrenAfterRender.length + 1);

    // 재호출해도 같은 Graphics를 재사용 — 자식 수 불변
    renderer.renderViolationTicks();
    expect(minimapLayer.children.length).toBe(childrenAfterRender.length + 1);
  });

  it("위반 틱은 뷰포트 인디케이터보다 아래 z-order에 있다 (render 경로·setViolations 경로 모두)", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    // totalTimelineHeight(80_000) > canvasH(600)이라 뷰포트 인디케이터가 그려진다.
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer, {
      violatingNoteIndices: new Set([0, 2]),
    }));

    // render 경로: 위반 틱은 (4.5)에서, 뷰포트는 (5)에서 addChild → 틱이 아래
    renderer.render();
    const { _viewport, _violationTicks } = internals(renderer);
    expect(_viewport).not.toBeNull();
    expect(_violationTicks).not.toBeNull();
    expect(minimapLayer.getChildIndex(_violationTicks!)).toBeLessThan(
      minimapLayer.getChildIndex(_viewport!),
    );

    // setViolations 경로: 틱만 갱신해도 뷰포트가 여전히 틱 위에 유지됨
    renderer.renderViolationTicks();
    expect(minimapLayer.getChildIndex(internals(renderer)._violationTicks!)).toBeLessThan(
      minimapLayer.getChildIndex(internals(renderer)._viewport!),
    );
  });
});
