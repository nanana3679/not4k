import { beforeEach, describe, expect, it, vi } from "vitest";
import { beat, chartViolationIndices, validateChart } from "../shared";
import type { Chart, Lane, NoteEntity, TrillZone } from "../shared";
import { useEditorStore } from "./stores";
import { performPlayTest, type PerformPlayTestParams } from "./hooks/useFileOperations";

function chart(notes: readonly NoteEntity[], trillZones: readonly TrillZone[] = []): Chart {
  return {
    meta: { title: "constraints", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes: [...notes], trillZones: [...trillZones],
    events: [{ type: "bpm", beat: beat(0), bpm: 120 }, { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) }],
  };
}

const long = (lane: Lane, start: number, end: number, holdOnly = false): NoteEntity => ({ type: "long", lane, beat: beat(start), endBeat: beat(end), ...(holdOnly ? { holdOnly: true } : {}) });
const doubleLong = (lane: Lane, start: number, end: number): NoteEntity => ({ type: "doubleLong", lane, beat: beat(start), endBeat: beat(end) });
const point = (lane: Lane, at: number, type: "single" | "trill" = "single"): NoteEntity => ({ type, lane, beat: beat(at) });

const semanticCases = {
  "NJ-C01 양수 끝과 같은 시각 zero range": chart([long(1, 0, 2), long(1, 2, 2)]),
  "NJ-C01 holdOnly 끝과 Point": chart([long(1, 0, 2, true), point(1, 2)]),
  "NJ-C02 같은 unit connection head 없음": chart([long(1, 0, 2), long(1, 2, 4)]),
  "NJ-C03 zero trillLong head와 H": chart([point(1, 0, "trill"), { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(0), holdOnly: true }], [{ lane: 1, beat: beat(0), endBeat: beat(2) }]),
};

function playParams(candidate: Chart, addToast = vi.fn()): PerformPlayTestParams {
  return {
    fromCursor: false, audioBuffer: {} as AudioBuffer, isPlaying: false, pause: vi.fn(), chart: candidate,
    currentTimeMs: 0, returnUrl: "/editor", addToast,
    game: { setChartData: vi.fn(), setAudioBuffer: vi.fn(), setStartTimeMs: vi.fn(), setEditorReturnUrl: vi.fn(), setScreen: vi.fn() },
    closeMenu: vi.fn(), navigate: vi.fn(),
  };
}

describe("RFD 0019 NJ-C01~C03 editor integration gates", () => {
  beforeEach(() => {
    useEditorStore.setState({ chart: chart([]), historyPast: [], historyFuture: [], historyLastCaptureAt: 0 });
  });

  it.each(Object.entries(semanticCases))("%s는 store에 transient로 커밋되고 violation index로 표시된다", (_name, candidate) => {
    useEditorStore.getState().setChart(candidate);
    expect(useEditorStore.getState().chart.notes).toEqual(candidate.notes);
    const errors = validateChart(candidate);
    expect(errors.some((error) => error.rule === "noteConstraint")).toBe(true);
    const indices = chartViolationIndices(candidate);
    expect(indices.notes.size).toBeGreaterThan(0);
  });

  it.each(Object.entries(semanticCases))("%s는 performPlayTest에서 차단되고 게임 전환을 하지 않는다", (_name, candidate) => {
    const params = playParams(candidate);
    expect(performPlayTest(params)).toBe(false);
    expect(params.game.setScreen).not.toHaveBeenCalled();
    expect(params.navigate).not.toHaveBeenCalled();
    expect(params.addToast).toHaveBeenCalledWith(expect.stringContaining("배치 제약 위반"), "error");
  });

  it("NJ-C01: ordinary end와 같은 시각의 Point는 저장/플레이 의미상 허용된다", () => {
    const candidate = chart([long(1, 0, 2), point(1, 2)]);
    expect(validateChart(candidate).some((error) => error.rule === "noteConstraint")).toBe(false);
    const params = playParams(candidate);
    expect(performPlayTest(params)).toBe(true);
    expect(params.game.setScreen).toHaveBeenCalledWith("play");
  });

  it("NJ-C02: 같은 unit 수 연결은 head 또는 holdOnly가 있어야 하고 unit count 변화는 허용한다", () => {
    const missing = chart([long(1, 0, 2), long(1, 2, 4)]);
    const changed = chart([doubleLong(1, 0, 2), long(1, 2, 4)]);
    expect(validateChart(missing).some((error) => error.rule === "noteConstraint")).toBe(true);
    expect(validateChart(changed).some((error) => error.rule === "noteConstraint")).toBe(false);
  });

  it("NJ-C03: positive trillLong+holdOnly는 head와 zone 안에서 허용되고 zero trillLong은 금지된다", () => {
    const zone = [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }];
    const positive = chart([point(1, 0, "trill"), { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true }], zone);
    expect(validateChart(positive).some((error) => error.rule === "noteConstraint")).toBe(false);
    expect(validateChart(semanticCases["NJ-C03 zero trillLong head와 H"]).some((error) => error.rule === "noteConstraint")).toBe(true);
  });
});
