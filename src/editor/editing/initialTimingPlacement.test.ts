import { describe, expect, it } from "vitest";
import { beat, validateChart, validateNoEventOverlap } from "../../shared";
import type { Beat, ChartEvent } from "../../shared";
import { isInitialTimingEvent } from "./eventEditing";
import { placeInitialTimingEvents } from "./initialTimingPlacement";

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

describe("placeInitialTimingEvents 초기 설정을 고정 보조 레인에 두기", () => {
  it("보조 레인3의 0박 BPM 120은 보조 레인1로 옮기고 값·박과 보조 레인2 박자는 그대로다", () => {
    const events = [bpm(0, 3), signature(0, 2)];

    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events).toEqual([
      { type: "bpm", beat: beat(0), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]);
    expect(placed.events[1]).toBe(events[1]);
    expect(placed.extraLaneCount).toBe(3);
  });

  it.each([
    { name: "보조 레인1", editorLane: 1 },
    { name: "editorLane 없음(보조 레인1)", editorLane: undefined },
  ])("$name의 0박 박자 4/4는 보조 레인2로 옮긴다", ({ editorLane }) => {
    const placed = placeInitialTimingEvents([bpm(0, 1), signature(0, editorLane)], 2);

    expect(placed.events[1]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 });
    expect(placed.extraLaneCount).toBe(2);
  });

  it("editorLane 없는 0박 BPM은 이미 보조 레인1이라 같은 객체로 두고 editorLane을 새로 쓰지 않는다", () => {
    const events = [bpm(0), signature(0)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events[0]).toBe(events[0]);
    expect("editorLane" in placed.events[0]).toBe(false);
    expect(placed.events[1].editorLane).toBe(2);
  });

  it("BPM이 보조 레인2·박자가 보조 레인1로 뒤바뀌어 있으면 BPM은 1·박자는 2로 바로잡는다", () => {
    const placed = placeInitialTimingEvents([signature(0, 1), bpm(0, 2)], 2);

    expect(placed.events.map(event => [event.type, event.editorLane])).toEqual([["timeSignature", 2], ["bpm", 1]]);
  });

  it.each([
    { name: "숨은 보조 레인5", editorLane: 5 },
    { name: "보조 레인0", editorLane: 0 },
    { name: "보조 레인-1", editorLane: -1 },
    { name: "보조 레인1.5", editorLane: 1.5 },
  ])("$name의 초기 BPM·박자는 BPM 보조 레인1·박자 보조 레인2로 옮기고 보조 레인 수 2를 유지한다", ({ editorLane }) => {
    const placed = placeInitialTimingEvents([bpm(0, editorLane), signature(0, editorLane)], 2);

    expect(placed.events.map(event => event.editorLane)).toEqual([1, 2]);
    expect(placed.extraLaneCount).toBe(2);
  });

  it("beat {n:0,d:4}의 보조 레인1 박자도 초기 설정으로 보고 보조 레인2로 옮긴다", () => {
    const placed = placeInitialTimingEvents([bpm(0, 1), signature({ n: 0, d: 4 }, 1)], 2);

    expect(placed.events[1]).toEqual({ type: "timeSignature", beat: { n: 0, d: 4 }, beatPerMeasure: beat(4), editorLane: 2 });
  });

  it("보조 레인3의 0박 BPM 120·150 중복은 둘 다 보조 레인1로 옮기고 eventDuplicate 진단은 남는다", () => {
    const placed = placeInitialTimingEvents([bpm(0, 3), bpm(0, 3, 150), signature(0, 2)], 3);

    expect(placed.events.map(event => event.editorLane)).toEqual([1, 1, 2]);
    expect(validateChart({ notes: [], trillZones: [], events: [...placed.events] }).map(error => error.rule))
      .toEqual(["eventDuplicate"]);
  });

  it("보조 레인1의 text [0,4)는 초기 BPM 자리와 겹쳐 보조 레인3으로 옮기고 보조 레인 수가 2 → 3이 된다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(0, 4, 1)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events[0]).toBe(events[0]);
    expect(placed.events[1]).toBe(events[1]);
    expect(placed.events[2]).toEqual({ type: "text", beat: beat(0), endBeat: beat(4), text: "text", editorLane: 3 });
    expect(placed.extraLaneCount).toBe(3);
  });

  it("BPM이 보조 레인3·text [0,4)가 보조 레인1이면 BPM을 1로 옮긴 자리 기준으로 text를 빈 보조 레인3으로 옮긴다", () => {
    const placed = placeInitialTimingEvents([text(0, 4, 1), bpm(0, 3), signature(0, 2)], 3);

    expect(placed.events.map(event => event.editorLane)).toEqual([3, 1, 2]);
    expect(placed.extraLaneCount).toBe(3);
  });

  it("보조 레인2의 0박 auto [0,2)는 보조 레인3 auto [0,4)를 피해 보조 레인4로 옮기고 레인3 auto는 그대로다", () => {
    const events = [bpm(0, 1), signature(0, 2), auto(0, 2, 2), text(0, 4, 3)];

    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events[2]).toEqual({ type: "auto", beat: beat(0), endBeat: beat(2), editorLane: 4 });
    expect(placed.events[3]).toBe(events[3]);
    expect(placed.extraLaneCount).toBe(4);
    expect(validateNoEventOverlap(placed.events)).toEqual([]);
  });

  it("보조 레인1·2의 text·auto [0,4)는 배열 순서대로 보조 레인3·4로 옮겨 보조 레인 수가 2 → 4가 된다", () => {
    const placed = placeInitialTimingEvents([text(0, 4, 1), auto(0, 4, 2), bpm(0, 1), signature(0, 2)], 2);

    expect(placed.events.map(event => event.editorLane)).toEqual([3, 4, 1, 2]);
    expect(placed.extraLaneCount).toBe(4);
  });

  it("보조 레인 수 2에서 숨은 보조 레인3의 text [0,4)도 차지한 자리로 보고 보조 레인1 auto [0,2)를 레인4로 옮긴다", () => {
    const events = [bpm(0, 1), signature(0, 2), auto(0, 2, 1), text(0, 4, 3)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events[2].editorLane).toBe(4);
    expect(placed.events[3]).toBe(events[3]);
    expect(placed.extraLaneCount).toBe(4);
  });

  it("보조 레인1의 tutorialInput [0,2)는 editorLane만 보조 레인3으로 바꾸고 lane 1·keyCode KeyD는 그대로다", () => {
    const placed = placeInitialTimingEvents([tutorialInput(0, 2, 1), bpm(0, 1), signature(0, 2)], 2);

    expect(placed.events[0]).toEqual({
      type: "tutorialInput", beat: beat(0), endBeat: beat(2), lane: 1, keyCode: "KeyD", editorLane: 3,
    });
  });

  it("초기 설정 자리와 겹치지 않는 보조 레인1 text [4,8)·auto [6,10)과 보조 레인2의 4박 BPM·박자는 옮기지 않고 eventOverlap 2건으로 남는다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(4, 8, 1), auto(6, 10, 1), bpm(4, 2, 180), signature(4, 2)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(2);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs)).toEqual([
      [{ kind: "event", index: 2 }, { kind: "event", index: 3 }],
      [{ kind: "event", index: 4 }, { kind: "event", index: 5 }],
    ]);
  });

  it("이미 BPM 보조 레인1·박자 보조 레인2이고 그 자리에 겹친 일반 이벤트가 없으면 같은 events 참조와 보조 레인 수 5를 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2), bpm(4, 1), text(0, 4, 3)];

    const placed = placeInitialTimingEvents(events, 5);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(5);
  });

  it("옮길 것이 없으면 보조 레인 수 1도 그대로 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2)];

    expect(placeInitialTimingEvents(events, 1)).toEqual({ events, extraLaneCount: 1 });
  });

  it("한 번 배치한 결과에 다시 적용하면 같은 events 참조와 보조 레인 수 4를 돌려준다", () => {
    const first = placeInitialTimingEvents([text(0, 4, 1), auto(0, 4, 2), bpm(0, 3), signature(0)], 2);
    expect(first.extraLaneCount).toBe(4);

    const second = placeInitialTimingEvents(first.events, first.extraLaneCount);

    expect(second.events).toBe(first.events);
    expect(second.extraLaneCount).toBe(4);
  });

  it("배열 순서대로 보조 레인2 auto [0,2)가 레인3을, 보조 레인1 text [0,4)가 레인3 auto·레인4 text [0,1)을 피해 레인5를 받고 두 번 배치해도 같다", () => {
    const events = [auto(0, 2, 2), text(0, 4, 1), signature(0, 1), bpm(0, 4), text(0, 1, 4)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events.map(event => event.editorLane)).toEqual([3, 5, 2, 1, 4]);
    expect(placed.extraLaneCount).toBe(5);
    expect(placeInitialTimingEvents(events, 2)).toEqual(placed);
  });

  it("보조 레인 수 5에서 BPM을 보조 레인1로 옮겨도 보조 레인 수 5를 줄이지 않는다", () => {
    expect(placeInitialTimingEvents([bpm(0, 3), signature(0, 2)], 5).extraLaneCount).toBe(5);
  });

  it("보조 레인 수 0에서 박자를 보조 레인2로 옮기면 보조 레인1·2가 보이게 보조 레인 수를 0 → 2로 늘린다", () => {
    expect(placeInitialTimingEvents([bpm(0), signature(0)], 0).extraLaneCount).toBe(2);
  });

  it.each([
    { name: "editorLane 없는 BPM·박자", events: [bpm(0), signature(0)] },
    { name: "보조 레인1 text [0,4)·editorLane 없는 BPM·박자", events: [text(0, 4), bpm(0), signature(0)] },
    { name: "보조 레인1·2 text·auto [0,4)·보조 레인2 BPM·박자·보조 레인1 BPM 중복", events: [text(0, 4, 1), auto(0, 4, 2), bpm(0, 2), signature(0, 2), bpm(0, 1, 150)] },
    { name: "보조 레인1 tutorialInput [0,2)·보조 레인3 BPM·박자", events: [tutorialInput(0, 2, 1), bpm(0, 3), signature(0, 3)] },
  ])("$name을 배치하면 초기 설정 인덱스를 가리키는 eventOverlap ref가 없다", ({ events }) => {
    const placed = placeInitialTimingEvents(events, 2);

    const initialRefs = validateNoEventOverlap(placed.events)
      .flatMap(error => error.refs ?? [])
      .filter(ref => isInitialTimingEvent(placed.events[ref.index]));
    expect(initialRefs).toEqual([]);
  });
});
