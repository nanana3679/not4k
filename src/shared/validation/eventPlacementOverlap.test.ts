import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type { ChartEvent } from "../types/chart";
import { eventPlacementsOverlap, validateChart, validateNoEventOverlap } from "./index";
import { validateChartDocument } from "./documentValidation";

const text = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: "text", beat: beat(start), endBeat: beat(end), text: "text", editorLane });
const auto = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: "auto", beat: beat(start), endBeat: beat(end), editorLane });
const bpm = (at: number, editorLane?: number): ChartEvent =>
  ({ type: "bpm", beat: beat(at), bpm: 120, editorLane });
const signature = (at: number, editorLane?: number): ChartEvent =>
  ({ type: "timeSignature", beat: beat(at), beatPerMeasure: beat(4), editorLane });

describe("같은 보조 레인의 이벤트 배치 겹침", () => {
  it.each([
    { name: "보조 레인1의 4박 BPM·박자 변경은 같은 점이므로 위반", events: [bpm(4, 1), signature(4, 1)] },
    { name: "editorLane 생략과 명시적 레인1의 4박 시점 이벤트는 같은 레인으로 위반", events: [bpm(4), signature(4, 1)] },
    { name: "보조 레인2의 text [4,8)·auto [6,10)은 종류가 달라도 위반", events: [text(4, 8, 2), auto(6, 10, 2)] },
    { name: "보조 레인1의 text·auto [4,8)은 시작·끝이 모두 같아도 위반", events: [text(4, 8, 1), auto(4, 8, 1)] },
    { name: "보조 레인1의 text [4,12)가 auto [6,8)을 완전히 감싸면 위반", events: [text(4, 12, 1), auto(6, 8, 1)] },
    { name: "보조 레인1의 text [4,8) 시작 4박에 BPM을 놓으면 위반", events: [text(4, 8, 1), bpm(4, 1)] },
    { name: "보조 레인1의 text [4,8) 내부 6박에 BPM을 놓으면 위반", events: [bpm(6, 1), text(4, 8, 1)] },
    { name: "보조 레인1의 길이0 text 4박·auto 4박은 같은 점으로 위반", events: [text(4, 4, 1), auto(4, 4, 1)] },
    { name: "보조 레인1의 길이0 auto 6박은 text [4,8) 내부여서 위반", events: [text(4, 8, 1), auto(6, 6, 1)] },
    { name: "보조 레인1의 tutorialDiagram [4,8)·text [6,10)은 위반", events: [
      { type: "tutorialDiagram", beat: beat(4), endBeat: beat(8), diagramId: "connected-switch", editorLane: 1 } as ChartEvent,
      text(6, 10, 1),
    ] },
    { name: "같은 보조 레인의 tutorialInput [4,8)·[6,10)은 요구 키가 달라도 배치 위반", events: [
      { type: "tutorialInput", beat: beat(4), endBeat: beat(8), lane: 1, keyCode: "KeyD", editorLane: 1 } as ChartEvent,
      { type: "tutorialInput", beat: beat(6), endBeat: beat(10), lane: 2, keyCode: "KeyF", editorLane: 1 } as ChartEvent,
    ] },
    { name: "같은 보조 레인의 8/4박 BPM·2/1박 박자는 분수 표현이 달라도 위반", events: [
      { ...bpm(2, 1), beat: { n: 8, d: 4 } }, signature(2, 1),
    ] },
  ])("$name", ({ events }) => {
    for (const order of [events, [...events].reverse()]) {
      expect(validateNoEventOverlap(order)).toEqual([
        expect.objectContaining({ rule: "eventOverlap", refs: [{ kind: "event", index: 0 }, { kind: "event", index: 1 }] }),
      ]);
    }
  });

  it.each([
    { name: "보조 레인1·2의 0박 BPM·박자는 동시 배치 허용", events: [bpm(0, 1), signature(0, 2)] },
    { name: "보조 레인1·2의 text·auto [4,8)은 서로 겹쳐도 배치 허용", events: [text(4, 8, 1), auto(4, 8, 2)] },
    { name: "보조 레인1의 text [4,8)·auto [8,12)는 끝과 시작이 맞닿아 허용", events: [text(4, 8, 1), auto(8, 12, 1)] },
    { name: "보조 레인1의 text [4,8) 끝 8박에 BPM을 놓으면 허용", events: [text(4, 8, 1), bpm(8, 1)] },
    { name: "보조 레인1의 4박 BPM·8박 박자는 다른 점으로 허용", events: [bpm(4, 1), signature(8, 1)] },
    { name: "보조 레인1의 길이0 auto 8박은 text [4,8) 끝이라 허용", events: [auto(8, 8, 1), text(4, 8, 1)] },
    { name: "보조 레인1·2의 길이0 text 4박은 다른 레인·빈 시간 구간이라 허용", events: [text(4, 4, 1), text(4, 4, 2)] },
    { name: "보조 레인1의 길이0 text 4박과 레인2의 text [4,8)은 열린 시간 구간이 겹치지 않아 허용", events: [text(4, 4, 1), text(4, 8, 2)] },
  ])("$name", ({ events }) => {
    expect(validateNoEventOverlap(events)).toEqual([]);
  });

  it("보조 레인1·2의 같은 text [4,8)은 기존 종류별 시간 겹침 위반을 유지한다", () => {
    expect(validateNoEventOverlap([text(4, 8, 1), text(4, 8, 2)])).toHaveLength(1);
  });

  it("앞의 비위반 BPM을 건너뛰고 겹친 text·auto의 원본 인덱스1·2를 refs로 반환한다", () => {
    const events = [bpm(0, 1), text(4, 8, 2), auto(6, 10, 2)];
    expect(validateNoEventOverlap(events)[0].refs).toEqual([{ kind: "event", index: 1 }, { kind: "event", index: 2 }]);
  });

  it("0박 BPM 중복은 eventDuplicate 하나로 진단하고 eventOverlap을 중복 추가하지 않는다", () => {
    const errors = validateChart({ notes: [], trillZones: [], events: [bpm(0, 1), bpm(0, 1)] });
    expect(errors.map(error => error.rule)).toEqual(["eventDuplicate"]);
  });

  it("같은 보조 레인·입력 키의 tutorialInput 겹침은 tutorialInputOverlap 하나로 진단한다", () => {
    const events: ChartEvent[] = [bpm(0, 1),
      { type: "tutorialInput", beat: beat(4), endBeat: beat(8), lane: 1, keyCode: "KeyD", editorLane: 2 },
      { type: "tutorialInput", beat: beat(6), endBeat: beat(10), lane: 1, keyCode: "KeyD", editorLane: 2 },
    ];
    expect(validateChart({ notes: [], trillZones: [], events }).map(error => error.rule)).toEqual(["tutorialInputOverlap"]);
  });

  it("명시 문서에서 text·auto 배치 겹침은 구조 위반 없이 저장·플레이를 막고 레인 분리 후 해소된다", () => {
    const chart = { notes: [{ type: "tap", kind: "single", lane: 1, beat: beat(2) }] as const,
      trillZones: [], events: [bpm(0, 1), text(4, 8, 2), auto(6, 10, 2)] };
    const invalid = validateChartDocument(chart);
    expect(invalid.structural).toEqual([]);
    expect(invalid.semantic.map(error => error.rule)).toEqual(["eventOverlap"]);
    expect(invalid.canSave).toBe(false);
    expect(invalid.canPlayExplicit).toBe(false);
    const repaired = validateChartDocument({ ...chart, events: [...chart.events.slice(0, 2), auto(6, 10, 3)] });
    expect(repaired.semantic).toEqual([]);
    expect(repaired.canSave).toBe(true);
    expect(repaired.canPlayExplicit).toBe(true);
  });
});

describe("eventPlacementsOverlap 배치 겹침 판정", () => {
  it.each([
    { name: "editorLane 생략과 보조 레인1의 0박 BPM·박자는 같은 레인 같은 점이라 겹친다", a: bpm(0), b: signature(0, 1) },
    { name: "보조 레인1의 0박 BPM 두 개는 같은 종류여도 겹친다", a: bpm(0, 1), b: bpm(0, 1) },
    { name: "보조 레인1의 text [0,4)는 시작 0박의 BPM과 겹친다", a: text(0, 4, 1), b: bpm(0, 1) },
    { name: "보조 레인2의 text [4,8)·auto [6,10)은 종류가 달라도 겹친다", a: text(4, 8, 2), b: auto(6, 10, 2) },
  ])("$name", ({ a, b }) => {
    expect(eventPlacementsOverlap(a, b)).toBe(true);
    expect(eventPlacementsOverlap(b, a)).toBe(true);
  });

  it.each([
    { name: "보조 레인1·2의 0박 BPM·박자는 레인이 달라 겹치지 않는다", a: bpm(0, 1), b: signature(0, 2) },
    { name: "보조 레인1의 text [4,8) 끝 8박의 BPM은 겹치지 않는다", a: text(4, 8, 1), b: bpm(8, 1) },
    { name: "보조 레인1·2의 text·auto [4,8)은 시간이 같아도 레인이 달라 겹치지 않는다", a: text(4, 8, 1), b: auto(4, 8, 2) },
  ])("$name", ({ a, b }) => {
    expect(eventPlacementsOverlap(a, b)).toBe(false);
    expect(eventPlacementsOverlap(b, a)).toBe(false);
  });
});
