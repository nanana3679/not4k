import { describe, expect, it } from "vitest";
import { beat, validateChart, validateNoEventOverlap } from "../../shared";
import type { Beat, ChartEvent } from "../../shared";
import { isInitialTimingEvent } from "./eventEditing";
import { placeEditedInitialTiming, placeInitialTimingEvents, withInitialTimingLane } from "./initialTimingPlacement";

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

describe("placeInitialTimingEvents 차트를 열 때 초기 BPM·박자만 고정 보조 레인과 이벤트 목록 맨 앞에 두기", () => {
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

  it("[보조 레인1 박자, 보조 레인2 BPM]으로 뒤바뀌어 있으면 BPM은 1·박자는 2로 바로잡고 [BPM, 박자] 순서로 둔다", () => {
    const placed = placeInitialTimingEvents([signature(0, 1), bpm(0, 2)], 2);

    expect(placed.events.map(event => [event.type, event.editorLane])).toEqual([["bpm", 1], ["timeSignature", 2]]);
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

  it("보조 레인1의 text [0,4)는 초기 BPM 자리와 겹쳐도 레인1에 그대로 두고 text·BPM eventOverlap 1건만 남으며 보조 레인 수 2를 유지한다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(0, 4, 1)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(2);
    expect(validateChart({ notes: [], trillZones: [], events: [...placed.events] }).map(error => error.rule))
      .toEqual(["eventOverlap"]);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs))
      .toEqual([[{ kind: "event", index: 0 }, { kind: "event", index: 2 }]]);
  });

  it("보조 레인2의 0박 auto [0,2)는 초기 박자 자리와 겹쳐도 레인2에 그대로 두고 auto·박자 eventOverlap 1건으로 남는다", () => {
    const events = [bpm(0, 1), signature(0, 2), auto(0, 2, 2)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events).toBe(events);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs))
      .toEqual([[{ kind: "event", index: 1 }, { kind: "event", index: 2 }]]);
  });

  it("[보조 레인1 text [0,4), 보조 레인2 auto [0,4), BPM, 박자]는 text·auto의 레인을 그대로 두고 [BPM, 박자, text, auto] 순서로 두며 보조 레인 수 2를 늘리지 않고 BPM·text와 박자·auto eventOverlap 2건으로 남는다", () => {
    const events = [text(0, 4, 1), auto(0, 4, 2), bpm(0, 1), signature(0, 2)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events).toEqual([events[2], events[3], events[0], events[1]]);
    expect(placed.events[2]).toBe(events[0]);
    expect(placed.events[3]).toBe(events[1]);
    expect(placed.extraLaneCount).toBe(2);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs)).toEqual([
      [{ kind: "event", index: 0 }, { kind: "event", index: 2 }],
      [{ kind: "event", index: 1 }, { kind: "event", index: 3 }],
    ]);
  });

  it("[보조 레인1 text [0,4), 보조 레인1 박자, 보조 레인3 BPM]은 [보조 레인1 BPM, 보조 레인2 박자, 보조 레인1 text]가 되고 text는 같은 객체로 BPM과 eventOverlap 1건이 된다", () => {
    const events = [text(0, 4, 1), signature(0, 1), bpm(0, 3)];

    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events).toEqual([bpm(0, 1), signature(0, 2), text(0, 4, 1)]);
    expect(placed.events[2]).toBe(events[0]);
    expect(placed.extraLaneCount).toBe(3);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs))
      .toEqual([[{ kind: "event", index: 0 }, { kind: "event", index: 2 }]]);
  });

  it("보조 레인1의 tutorialInput [0,2)는 초기 BPM 자리와 겹쳐도 editorLane 1·lane 1·keyCode KeyD 그대로 같은 객체다", () => {
    const events = [tutorialInput(0, 2, 1), bpm(0, 1), signature(0, 2)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events[2]).toBe(events[0]);
    expect(placed.events[2]).toEqual({ type: "tutorialInput", beat: beat(0), endBeat: beat(2), lane: 1, keyCode: "KeyD", editorLane: 1 });
  });

  it("보조 레인1 text [4,8)·auto [6,10)과 보조 레인2의 4박 BPM·박자는 옮기지 않고 eventOverlap 2건으로 남는다", () => {
    const events = [bpm(0, 1), signature(0, 2), text(4, 8, 1), auto(6, 10, 1), bpm(4, 2, 180), signature(4, 2)];

    const placed = placeInitialTimingEvents(events, 2);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(2);
    expect(validateNoEventOverlap(placed.events).map(error => error.refs)).toEqual([
      [{ kind: "event", index: 2 }, { kind: "event", index: 3 }],
      [{ kind: "event", index: 4 }, { kind: "event", index: 5 }],
    ]);
  });

  it.each([
    { name: "보조 레인1 text [0,4)·editorLane 없는 BPM·박자", events: [text(0, 4), bpm(0), signature(0)] },
    { name: "보조 레인1·2 text·auto [0,4)·보조 레인2 BPM·박자·보조 레인1 BPM 중복", events: [text(0, 4, 1), auto(0, 4, 2), bpm(0, 2), signature(0, 2), bpm(0, 1, 150)] },
    { name: "보조 레인1 tutorialInput [0,2)·보조 레인3 BPM·박자", events: [tutorialInput(0, 2, 1), bpm(0, 3), signature(0, 3)] },
    { name: "숨은 보조 레인5 auto [0,4)·보조 레인0 4박 BPM·보조 레인5 BPM·박자", events: [auto(0, 4, 5), bpm(4, 0, 180), bpm(0, 5), signature(0, 5)] },
  ])("$name을 배치해도 초기 설정이 아닌 이벤트는 모두 같은 객체로 원래 순서대로 초기 설정 뒤에 남는다", ({ events }) => {
    const placed = placeInitialTimingEvents(events, 2);

    const ordinaryEvents = events.filter(event => !isInitialTimingEvent(event));
    const initialCount = events.length - ordinaryEvents.length;
    expect(placed.events.slice(0, initialCount).every(isInitialTimingEvent)).toBe(true);
    ordinaryEvents.forEach((event, offset) => expect(placed.events[initialCount + offset]).toBe(event));
  });

  it("이미 BPM 보조 레인1·박자 보조 레인2로 이벤트 목록 맨 앞에 있으면 같은 events 참조와 보조 레인 수 5를 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2), bpm(4, 1), text(0, 4, 3)];

    const placed = placeInitialTimingEvents(events, 5);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(5);
  });

  it("옮길 것이 없어도 보조 레인 수 1은 보조 레인2가 보이도록 2로 늘리고 같은 events 참조를 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2)];

    const placed = placeInitialTimingEvents(events, 1);

    expect(placed.events).toBe(events);
    expect(placed.extraLaneCount).toBe(2);
  });

  it("옮길 것이 없는 보조 레인 수 0을 2로 늘린 결과에 다시 적용하면 같은 events 참조와 보조 레인 수 2를 돌려준다", () => {
    const events = [bpm(0), signature(0, 2)];

    const first = placeInitialTimingEvents(events, 0);
    const second = placeInitialTimingEvents(first.events, first.extraLaneCount);

    expect(first).toEqual({ events, extraLaneCount: 2 });
    expect(second.events).toBe(events);
    expect(second.extraLaneCount).toBe(2);
  });

  it("보조 레인1·2 text·auto [0,4)와 보조 레인3 BPM·editorLane 없는 박자를 한 번 배치한 결과에 다시 적용하면 같은 events 참조와 보조 레인 수 2를 돌려준다", () => {
    const first = placeInitialTimingEvents([text(0, 4, 1), auto(0, 4, 2), bpm(0, 3), signature(0)], 2);
    expect(first.events.map(event => [event.type, event.editorLane]))
      .toEqual([["bpm", 1], ["timeSignature", 2], ["text", 1], ["auto", 2]]);
    expect(first.extraLaneCount).toBe(2);

    const second = placeInitialTimingEvents(first.events, first.extraLaneCount);

    expect(second.events).toBe(first.events);
    expect(second.extraLaneCount).toBe(2);
  });

  it("보조 레인 수 5에서 BPM을 보조 레인1로 옮겨도 보조 레인 수 5를 줄이지 않는다", () => {
    expect(placeInitialTimingEvents([bpm(0, 3), signature(0, 2)], 5).extraLaneCount).toBe(5);
  });

  it("보조 레인 수 0에서 박자를 보조 레인2로 옮기면 보조 레인1·2가 보이게 보조 레인 수를 0 → 2로 늘린다", () => {
    expect(placeInitialTimingEvents([bpm(0), signature(0)], 0).extraLaneCount).toBe(2);
  });
});

describe("placeInitialTimingEvents 초기 설정을 이벤트 목록 맨 앞(맨 아래 그림)으로 옮기기", () => {
  it.each([
    { order: "[보조 레인3 text [0,4), 초기 BPM, 초기 박자]", events: [text(0, 4, 3), bpm(0, 1), signature(0, 2)], expected: [1, 2, 0] },
    { order: "[초기 박자, 초기 BPM, 보조 레인3 text [0,4)]", events: [signature(0, 2), bpm(0, 1), text(0, 4, 3)], expected: [1, 0, 2] },
  ])("레인이 이미 고정 자리여도 $order는 [초기 BPM, 초기 박자, text] 순서의 새 배열이 되고 세 이벤트는 같은 객체다", ({ events, expected }) => {
    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events).not.toBe(events);
    expect(placed.events.map(event => event.type)).toEqual(["bpm", "timeSignature", "text"]);
    expected.forEach((sourceIndex, index) => expect(placed.events[index]).toBe(events[sourceIndex]));
  });

  it("4박 BPM 180·4박 박자는 초기 설정이 아니라 [4박 BPM, 보조 레인3 text, 4박 박자, 초기 BPM, 초기 박자]에서 원래 순서대로 초기 BPM·박자 뒤에 남는다", () => {
    const events = [bpm(4, 1, 180), text(8, 12, 3), signature(4, 2), bpm(0, 1), signature(0, 2)];

    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events).toEqual([events[3], events[4], events[0], events[1], events[2]]);
  });

  it("초기 BPM 150·120과 초기 박자 둘이 다른 이벤트 사이에 섞여 있으면 BPM 150·120, 박자 0박·0/4박 순서로 맨 앞에 모으고 각 종류 안의 상대 순서를 지킨다", () => {
    const events = [text(4, 8, 3), signature(0, 1), bpm(0, 3, 150), auto(8, 12, 3), signature({ n: 0, d: 4 }, 2), bpm(0, 1, 120)];

    const placed = placeInitialTimingEvents(events, 3);

    expect(placed.events).toEqual([
      bpm(0, 1, 150), bpm(0, 1, 120), signature(0, 2), signature({ n: 0, d: 4 }, 2), text(4, 8, 3), auto(8, 12, 3),
    ]);
    expect(placed.events[3]).toBe(events[4]);
    expect(placed.events[4]).toBe(events[0]);
    expect(placed.events[5]).toBe(events[3]);
  });

  it("[보조 레인1 text [0,4), 보조 레인1 박자, 보조 레인3 BPM]을 한 번 배치한 결과에 다시 적용하면 같은 events 참조를 돌려준다", () => {
    const first = placeInitialTimingEvents([text(0, 4, 1), signature(0, 1), bpm(0, 3)], 3);

    const second = placeInitialTimingEvents(first.events, first.extraLaneCount);

    expect(second.events).toBe(first.events);
    expect(second.extraLaneCount).toBe(3);
  });

  it("0박 BPM·박자가 없는 [보조 레인1 text [0,4), 4박 BPM]은 순서를 바꾸지 않고 같은 events 참조를 돌려준다", () => {
    const events = [text(0, 4, 1), bpm(4, 1)];

    expect(placeInitialTimingEvents(events, 2).events).toBe(events);
  });
});

describe("placeEditedInitialTiming 편집으로 0박에 온 BPM·박자를 고정 보조 레인에 두거나 거부하기", () => {
  it("0박 BPM이 있는데 편집한 보조 레인3 BPM 180이 0박에 오면 null을 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2), bpm(0, 3, 180)];

    expect(placeEditedInitialTiming(events, [2])).toBeNull();
  });

  it("0박 박자가 없는데 편집한 보조 레인3 박자가 0박에 오면 editorLane만 2로 바꾸고 값·박은 그대로다", () => {
    const events = [bpm(0, 1), signature(0, 3)];

    const placed = placeEditedInitialTiming(events, [1]);

    expect(placed).toEqual([
      { type: "bpm", beat: beat(0), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]);
    expect(placed![0]).toBe(events[0]);
    expect(events[1].editorLane).toBe(3);
  });

  it("0박 BPM이 없는데 편집한 보조 레인2 BPM이 0박에 오면 보조 레인1로 옮긴다", () => {
    const placed = placeEditedInitialTiming([signature(0, 2), bpm(0, 2)], [1]);

    expect(placed?.map(event => event.editorLane)).toEqual([2, 1]);
  });

  it("0박 BPM이 있어도 편집한 보조 레인3 박자는 종류가 달라 0박 박자가 없으면 보조 레인2에 둔다", () => {
    const placed = placeEditedInitialTiming([bpm(0, 1), signature(0, 3)], [1]);

    expect(placed?.[1].editorLane).toBe(2);
  });

  it("편집한 0박 BPM이 editorLane 없이 이미 보조 레인1이면 같은 events 참조를 돌려준다", () => {
    const events = [signature(0, 2), bpm(0)];

    expect(placeEditedInitialTiming(events, [1])).toBe(events);
  });

  it("편집한 4박 BPM·0박 text는 초기 설정이 아니라 0박 BPM이 있어도 같은 events 참조를 돌려준다", () => {
    const events = [bpm(0, 1), signature(0, 2), bpm(4, 3), text(0, 4, 3)];

    expect(placeEditedInitialTiming(events, [2, 3])).toBe(events);
  });

  it("편집하지 않은 0박 BPM 120·150 중복이 있어도 편집한 4박 text는 막지 않는다", () => {
    const events = [bpm(0, 1), bpm(0, 1, 150), signature(0, 2), text(4, 8, 3)];

    expect(placeEditedInitialTiming(events, [3])).toBe(events);
  });

  it("편집한 BPM 두 개가 모두 0박에 오면 서로 중복이라 null을 돌려준다", () => {
    expect(placeEditedInitialTiming([signature(0, 2), bpm(0, 3), bpm(0, 4, 150)], [1, 2])).toBeNull();
  });
});

describe("withInitialTimingLane 0박 BPM·박자만 고정 보조 레인으로 바꾸기", () => {
  it("보조 레인3의 0박 박자는 editorLane만 2로, 보조 레인3의 0박 BPM은 1로 바꾼다", () => {
    expect(withInitialTimingLane(signature(0, 3))).toEqual(signature(0, 2));
    expect(withInitialTimingLane(bpm(0, 3))).toEqual(bpm(0, 1));
  });

  it("보조 레인3의 1박 박자·0박 text와 editorLane 없는 0박 BPM은 같은 객체를 돌려준다", () => {
    for (const event of [signature(1, 3), text(0, 4, 3), bpm(0)]) expect(withInitialTimingLane(event)).toBe(event);
  });
});
