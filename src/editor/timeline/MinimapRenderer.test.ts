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
});
