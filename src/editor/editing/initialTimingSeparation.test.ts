import { describe, expect, it } from "vitest";
import { beat, validateChart, validateNoEventOverlap } from "../../shared";
import type { Beat, ChartEvent } from "../../shared";
import { isInitialTimingEvent } from "./eventEditing";
import { separateInitialTimingEvents } from "./initialTimingSeparation";

const lane = (editorLane?: number) => (editorLane === undefined ? {} : { editorLane });
const bpm = (at: number | Beat, editorLane?: number, value = 120): ChartEvent =>
  ({ type: "bpm", beat: typeof at === "number" ? beat(at) : at, bpm: value, ...lane(editorLane) });
const signature = (at: number | Beat, editorLane?: number): ChartEvent =>
  ({ type: "timeSignature", beat: typeof at === "number" ? beat(at) : at, beatPerMeasure: beat(4), ...lane(editorLane) });
const text = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: "text", beat: beat(start), endBeat: beat(end), text: "text", ...lane(editorLane) });
const auto = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: "auto", beat: beat(start), endBeat: beat(end), ...lane(editorLane) });
const tutorialInput = (start: number, end: number, editorLane?: number): ChartEvent =>
  ({ type: "tutorialInput", beat: beat(start), endBeat: beat(end), lane: 1, keyCode: "KeyD", ...lane(editorLane) });

describe("separateInitialTimingEvents 불러올 때 겹친 초기 설정 분리", () => {
  it("editorLane 없는 0박 BPM 120·박자 4/4가 겹치면 박자만 보조 레인2로 옮기고 값·박·보조 레인 수 2를 유지한다", () => {
    const events = [bpm(0), signature(0)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events).toEqual([
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]);
    expect(separated.events[0]).toBe(events[0]);
    expect("editorLane" in separated.events[0]).toBe(false);
    expect(separated.extraLaneCount).toBe(2);
  });

  it("이미 보조 레인1·2로 나뉜 초기 설정은 같은 events 배열 참조와 보조 레인 수 2를 그대로 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2), bpm(4, 1)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events).toBe(events);
    expect(separated.extraLaneCount).toBe(2);
  });

  it("분리 결과에 다시 적용하면 같은 배열 참조·보조 레인 수 3을 돌려준다", () => {
    const first = separateInitialTimingEvents([bpm(0), signature(0), text(0, 4, 2)], 2);
    expect(first.extraLaneCount).toBe(3);

    const second = separateInitialTimingEvents(first.events, first.extraLaneCount);

    expect(second.events).toBe(first.events);
    expect(second.extraLaneCount).toBe(3);
  });

  it("[박자, BPM] 순서로 들어와도 BPM이 보조 레인1에 남고 박자가 보조 레인2로 옮긴다", () => {
    const events = [signature(0), bpm(0)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events).toEqual([
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: "bpm", beat: beat(0), bpm: 120 },
    ]);
    expect(separated.events[1]).toBe(events[1]);
    expect(separated.extraLaneCount).toBe(2);
  });

  it("보조 레인1 text [0,4)와 겹친 BPM은 보조 레인2 박자를 밀어내지 않고 레인3으로 옮겨 보조 레인 수가 2 → 3이 된다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(0, 4, 1)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[0]).toEqual({ type: "bpm", beat: beat(0), bpm: 120, editorLane: 3 });
    expect(separated.events[1]).toBe(events[1]);
    expect(separated.events[2]).toBe(events[2]);
    expect(separated.extraLaneCount).toBe(3);
  });

  it("보조 레인1 tutorialInput [0,2)와 겹친 BPM만 레인3으로 옮기고 튜토리얼 입력은 그대로 둔다", () => {
    const events = [tutorialInput(0, 2, 1), bpm(0, 1), signature(0, 2)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[0]).toBe(events[0]);
    expect(separated.events[1]).toEqual({ type: "bpm", beat: beat(0), bpm: 120, editorLane: 3 });
    expect(separated.events[2]).toBe(events[2]);
    expect(separated.extraLaneCount).toBe(3);
  });

  it("보조 레인1 text [4,8)·auto [6,10)과 보조 레인2 4박 BPM·박자의 겹침은 옮기지 않고 eventOverlap 2건으로 남는다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(4, 8, 1), auto(6, 10, 1), bpm(4, 2, 180), signature(4, 2)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events).toBe(events);
    expect(separated.extraLaneCount).toBe(2);
    expect(validateNoEventOverlap(separated.events).map(error => error.refs)).toEqual([
      [{ kind: "event", index: 2 }, { kind: "event", index: 3 }],
      [{ kind: "event", index: 4 }, { kind: "event", index: 5 }],
    ]);
  });

  it("보조 레인1의 0박 BPM 120·150 중복은 둘째 BPM을 레인3으로 옮기지만 eventDuplicate 진단은 남는다", () => {
    const events = [bpm(0, 1), bpm(0, 1, 150), signature(0, 2)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[1]).toEqual({ type: "bpm", beat: beat(0), bpm: 150, editorLane: 3 });
    expect(separated.extraLaneCount).toBe(3);
    expect(validateChart({ notes: [], trillZones: [], events: [...separated.events] }).map(error => error.rule))
      .toEqual(["eventDuplicate"]);
  });

  it("0박에 보조 레인1 BPM·레인2 text [0,4)·레인3 auto [0,4)가 있으면 레인2 박자를 레인4로 옮겨 보조 레인 수가 3 → 4가 된다", () => {
    const events = [bpm(0, 1), text(0, 4, 2), auto(0, 4, 3), signature(0, 2)];

    const separated = separateInitialTimingEvents(events, 3);

    expect(separated.events[3]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 4 });
    expect(separated.extraLaneCount).toBe(4);
  });

  it("보조 레인 수 2에서 숨은 레인3의 text [0,4)는 피해 박자를 레인4로 옮기고 보조 레인 수를 4로 늘린다", () => {
    const events = [bpm(0, 1), auto(0, 4, 2), signature(0, 1), text(0, 4, 3)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[2]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 4 });
    expect(separated.events[3]).toBe(events[3]);
    expect(separated.extraLaneCount).toBe(4);
  });

  it("보조 레인 수 2에서 숨은 레인3의 text가 [8,12)이면 0박을 막지 않아 박자를 레인3으로 옮기고 보조 레인 수를 3으로 늘린다", () => {
    const events = [bpm(0, 1), auto(0, 4, 2), signature(0, 1), text(8, 12, 3)];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[2]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 3 });
    expect(separated.extraLaneCount).toBe(3);
  });

  it("beat {n:0,d:4}의 박자도 0박 초기 설정으로 보고 보조 레인2로 옮긴다", () => {
    const events = [bpm(0), signature({ n: 0, d: 4 })];

    const separated = separateInitialTimingEvents(events, 2);

    expect(separated.events[1]).toEqual({ type: "timeSignature", beat: { n: 0, d: 4 }, beatPerMeasure: beat(4), editorLane: 2 });
  });

  it("보조 레인 수 0에서 겹친 박자를 레인2로 옮기면 보조 레인 수를 0 → 2로 늘린다", () => {
    const separated = separateInitialTimingEvents([bpm(0), signature(0)], 0);

    expect(separated.events[1].editorLane).toBe(2);
    expect(separated.extraLaneCount).toBe(2);
  });

  it("보조 레인 수 5에서 박자를 레인2로 옮겨도 보조 레인 수 5를 줄이지 않는다", () => {
    expect(separateInitialTimingEvents([bpm(0), signature(0)], 5).extraLaneCount).toBe(5);
  });

  it.each([
    { name: "레인 없는 BPM·박자", events: [bpm(0), signature(0)] },
    { name: "레인1 text [0,4)·BPM·박자", events: [text(0, 4), bpm(0), signature(0)] },
    { name: "레인1·2 text·auto [0,4)와 레인2 BPM·박자·레인1 BPM 중복", events: [text(0, 4, 1), auto(0, 4, 2), bpm(0, 2), signature(0, 2), bpm(0, 1, 150)] },
    { name: "레인1 tutorialInput [0,2)·레인3 BPM·레인3 박자", events: [tutorialInput(0, 2, 1), bpm(0, 3), signature(0, 3)] },
  ])("$name을 분리하면 초기 설정 인덱스를 가리키는 eventOverlap ref가 없다", ({ events }) => {
    const separated = separateInitialTimingEvents(events, 2);

    const initialRefs = validateNoEventOverlap(separated.events)
      .flatMap(error => error.refs ?? [])
      .filter(ref => isInitialTimingEvent(separated.events[ref.index]));
    expect(initialRefs).toEqual([]);
  });
});
