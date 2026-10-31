import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";
import { beat } from "../../shared";
import type { BpmChange, ChartDocument, Lane, TimeSignatureChange } from "../../shared";
import { MinimapRenderer, type MinimapHost } from "./MinimapRenderer";

/** 테스트에서 private 필드(_viewport·_violationIndicators)에 접근하기 위한 캐스트. */
type MinimapRendererInternals = {
  _viewport: Graphics | null;
  _violationIndicators: Graphics | null;
};
function internals(renderer: MinimapRenderer): MinimapRendererInternals {
  return renderer as unknown as MinimapRendererInternals;
}

function makeChart(noteCount: number): ChartDocument {
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
  chart: ChartDocument,
  minimapLayer: Container,
  overrides: Partial<MinimapHost> = {},
): MinimapHost {
  const bpmChanges: BpmChange[] = [{ beat: beat(0), bpm: 120 }];
  const timeSignatureChanges: TimeSignatureChange[] = [{ measure: 0, beatPerMeasure: beat(4) }];
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
    cachedBpmChanges: bpmChanges,
    cachedTimeSignatureChanges: timeSignatureChanges,
    getTotalTimelineMs: () => 640_000,
    timeToY: (timeMs: number) => 80_000 - timeMs / 10,
    minimapLayer,
    minimapVisible: true,
    violatingNoteIndices: new Set<number>(),
    violatingTrillZoneIndices: new Set<number>(),
    violatingRestZoneIndices: new Set<number>(),
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
      cachedTimeSignatureChanges: [{ measure: 0, beatPerMeasure: beat(0) }],
    }));

    // 무한루프면 이 호출이 반환되지 않아 테스트가 타임아웃으로 실패한다.
    renderer.render();

    // 마디선은 최대 1개(마디 0)만 그려지고 즉시 종료 — 유한함이 요점.
    expect(minimapLayer.children.length).toBeLessThan(50);
  });

  it("보조 레인(lane 5~8) 노트만 있는 차트는 노트 0개 차트와 미니맵 자식 수가 같다 (보조는 미니맵 미표시)", () => {
    const render = (chart: ChartDocument): number => {
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

  it("restZone 2개(L3·L4 beat 8~10)가 있는 차트는 restZone 없는 차트보다 미니맵 자식이 2개(밴드 Graphics) 많다", () => {
    const render = (chart: ChartDocument): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer)).render();
      return minimapLayer.children.length;
    };

    const withoutRest = makeChart(4);
    const withRest: ChartDocument = {
      ...makeChart(4),
      restZones: [
        { lane: 3 as Lane, beat: beat(8), endBeat: beat(10) },
        { lane: 4 as Lane, beat: beat(8), endBeat: beat(10) },
      ],
    };

    expect(render(withRest)).toBe(render(withoutRest) + 2);
  });

  it("restZones가 undefined인 차트(하위호환)도 render가 restZone 없는 차트와 동일하게 동작한다", () => {
    const render = (chart: ChartDocument): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer)).render();
      return minimapLayer.children.length;
    };

    const noField = makeChart(4); // restZones 필드 자체가 없음
    const emptyField: ChartDocument = { ...makeChart(4), restZones: [] };

    expect(render(noField)).toBe(render(emptyField));
  });

  it("위반 restZone Set만 주입해도 위반 지시자 Graphics가 자식으로 1개 추가된다", () => {
    const chart: ChartDocument = {
      ...makeChart(4),
      restZones: [{ lane: 2 as Lane, beat: beat(4), endBeat: beat(6) }],
    };
    const render = (overrides: Partial<MinimapHost>): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer, overrides)).render();
      return minimapLayer.children.length;
    };

    const withoutViolations = render({});
    const withViolations = render({
      violatingRestZoneIndices: new Set([0]),
    });

    expect(withViolations).toBe(withoutViolations + 1);
  });

  it("위반 노트·트릴존·이벤트 Set을 주입하면 위반 없는 렌더보다 자식이 정확히 1개(단일 batch Graphics) 많다", () => {
    const chart: ChartDocument = {
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

  it("위반 Set이 전부 비어 있으면 위반 지시자 Graphics를 추가하지 않는다", () => {
    const chart = makeChart(4);
    const render = (overrides: Partial<MinimapHost>): number => {
      const minimapLayer = new Container();
      new MinimapRenderer(makeHost(chart, minimapLayer, overrides)).render();
      return minimapLayer.children.length;
    };

    // 빈 Set(기본값) 렌더 두 번의 자식 수가 같음 — 위반 지시자 단계가 no-op.
    expect(render({})).toBe(render({
      violatingNoteIndices: new Set<number>(),
      violatingTrillZoneIndices: new Set<number>(),
      violatingEventIndices: new Set<number>(),
    }));
  });

  it("화면(뷰포트) 밖 beat의 위반 노트도 미니맵 위반 지시자로 그려진다 (클리핑 없음)", () => {
    // scrollY 0에서 timeToY(600_000ms) = 20_000 → 캔버스(600px) 밖이지만
    // 미니맵은 전체 타임라인을 축소하므로 지시자가 그려져야 한다.
    const chart: ChartDocument = {
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

  it("setViolations 경로(renderViolationIndicators 단독 호출)는 노트 등 다른 자식을 재생성하지 않고 위반 지시자만 추가한다", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    // 위반 Set을 mutable Set 참조로 주입 — setViolations가 내용을 바꾸는 상황을 시뮬레이션.
    const violSet = new Set<number>();
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer, {
      violatingNoteIndices: violSet,
    }));

    renderer.render(); // 위반 없음 → 위반 지시자 자식 없음
    const childrenAfterRender = [...minimapLayer.children];

    // 위반 발생 → 지시자만 경량 갱신(전체 render 아님)
    violSet.add(0);
    violSet.add(2);
    renderer.renderViolationIndicators();

    // 기존 자식(배경·레인·노트 batch 등)이 모두 같은 인스턴스로 유지됨(재생성 안 됨)
    for (const c of childrenAfterRender) {
      expect(minimapLayer.children).toContain(c);
    }
    // 정확히 위반 지시자 Graphics 1개만 추가됨
    expect(minimapLayer.children.length).toBe(childrenAfterRender.length + 1);

    // 재호출해도 같은 Graphics를 재사용 — 자식 수 불변
    renderer.renderViolationIndicators();
    expect(minimapLayer.children.length).toBe(childrenAfterRender.length + 1);
  });

  it("위반 지시자는 뷰포트 인디케이터보다 아래 z-order에 있다 (render 경로·setViolations 경로 모두)", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    // totalTimelineHeight(80_000) > canvasH(600)이라 뷰포트 인디케이터가 그려진다.
    const renderer = new MinimapRenderer(makeHost(chart, minimapLayer, {
      violatingNoteIndices: new Set([0, 2]),
    }));

    // render 경로: 위반 지시자는 (4.5)에서, 뷰포트는 (5)에서 addChild → 지시자가 아래
    renderer.render();
    const { _viewport, _violationIndicators } = internals(renderer);
    expect(_viewport).not.toBeNull();
    expect(_violationIndicators).not.toBeNull();
    expect(minimapLayer.getChildIndex(_violationIndicators!)).toBeLessThan(
      minimapLayer.getChildIndex(_viewport!),
    );

    // setViolations 경로: 지시자만 갱신해도 뷰포트가 여전히 지시자 위에 유지됨
    renderer.renderViolationIndicators();
    expect(minimapLayer.getChildIndex(internals(renderer)._violationIndicators!)).toBeLessThan(
      minimapLayer.getChildIndex(internals(renderer)._viewport!),
    );
  });
});
