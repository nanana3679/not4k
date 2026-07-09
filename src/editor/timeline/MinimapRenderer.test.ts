import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import { beat } from "../../shared";
import type { BpmMarker, Chart, Lane, TimeSignatureMarker } from "../../shared";
import { MinimapRenderer } from "./MinimapRenderer";

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

describe("MinimapRenderer", () => {
  it("2만개 노트를 렌더링해도 minimapLayer 자식 수는 400개 이하", () => {
    const chart = makeChart(20_000);
    const minimapLayer = new Container();
    const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
    const timeSignatures: TimeSignatureMarker[] = [{ measure: 0, beatPerMeasure: beat(4) }];
    const renderer = new MinimapRenderer({
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
    });

    renderer.render();

    expect(minimapLayer.children.length).toBeLessThanOrEqual(400);
  });

  it("0/4 박자표(마디 미전진)여도 render가 무한루프 없이 종료한다", () => {
    const chart = makeChart(4);
    const minimapLayer = new Container();
    const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
    // 분자 0 박자표: measureStartBeat가 전진하지 않아 가드가 없으면 measure-line 루프가 무한루프.
    const timeSignatures: TimeSignatureMarker[] = [{ measure: 0, beatPerMeasure: beat(0) }];
    const renderer = new MinimapRenderer({
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
    });

    // 무한루프면 이 호출이 반환되지 않아 테스트가 타임아웃으로 실패한다.
    renderer.render();

    // 마디선은 최대 1개(마디 0)만 그려지고 즉시 종료 — 유한함이 요점.
    expect(minimapLayer.children.length).toBeLessThan(50);
  });
});
