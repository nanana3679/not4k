import { describe, it, expect, vi } from "vitest";
import { ClipboardManager, type ClipboardCallbacks } from "./ClipboardManager";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { beat, beatToFloat } from "../../shared";
import type { Chart, ChartEvent, Lane, NoteEntity, TrillZone, RestZone } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [],
    ...overrides,
  };
}

function makeCallbacks(): ClipboardCallbacks {
  return {
    space: makeFakeSpace({
      getSnapStep: () => beat(1),
      getMaxBeatFloat: () => 100,
    }),
    onChartUpdate: vi.fn(),
    onWarn: vi.fn(),
  };
}

const bf = (b: { n: number; d: number }) => beatToFloat(b);

// ---------------------------------------------------------------------------
// 이벤트 클립보드 (RFD 0016 §3-4 D1) — copy span 겹침 수집, timesig 제외
// ---------------------------------------------------------------------------

describe("ClipboardManager — 이벤트 클립보드 (RFD 0016 §3-4 D1)", () => {
  it("copy는 선택 beat-span [0,4] 안 이벤트(auto[1,2]·bpm@4)를 담되 timeSignature@2는 제외한다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(4) },
    ];
    const events: ChartEvent[] = [
      { type: "auto", beat: beat(1), endBeat: beat(2) },
      { type: "bpm", beat: beat(4), bpm: 180 }, // span 우측 경계(폐구간) 포함
      { type: "timeSignature", beat: beat(2), beatPerMeasure: beat(4) },
    ];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();

    expect(cm.copy(chart, new Set([0, 1]))).toBe(2);

    // beat 10에 붙여넣기 — anchor=0, offset=10
    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    expect(result).not.toBeNull();
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(2);
    expect(injected.some((e) => e.type === "timeSignature")).toBe(false);
    const auto = injected.find((e) => e.type === "auto")!;
    expect(bf(auto.beat)).toBe(11);
    expect(bf((auto as { endBeat: { n: number; d: number } }).endBeat)).toBe(12);
    const bpm = injected.find((e) => e.type === "bpm")!;
    expect(bf(bpm.beat)).toBe(14);
  });

  it("copy는 span [0,4] 밖 이벤트(bpm@5·auto[6,8])를 안 담는다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(4) },
    ];
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(5), bpm: 150 },
      { type: "auto", beat: beat(6), endBeat: beat(8) },
    ];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0, 1]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    expect(result!.chart.events).toHaveLength(events.length); // 주입 0건
  });

  it("구간 이벤트 stop[3,6]가 span [0,4]와 부분 겹치면 담는다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(4) },
    ];
    const events: ChartEvent[] = [{ type: "stop", beat: beat(3), endBeat: beat(6) }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0, 1]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(1);
    expect(bf(injected[0].beat)).toBe(13);
    expect(bf((injected[0] as { endBeat: { n: number; d: number } }).endBeat)).toBe(16);
  });

  it("롱노트(beat0~endBeat4) 선택 시 span이 endBeat까지 확장돼 bpm@3 이벤트를 담는다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1 as Lane, beat: beat(0), endBeat: beat(4) },
    ];
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(3), bpm: 200 }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(1);
    expect(bf(injected[0].beat)).toBe(13);
  });

  it("trillZone[2,6] 선택 시 span이 zone endBeat까지 확장돼 bpm@5 이벤트를 담는다", () => {
    const trillZones: TrillZone[] = [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }];
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(5), bpm: 90 }];
    const chart = makeChart({ trillZones, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set(), new Set([0]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(1);
    expect(bf(injected[0].beat)).toBe(13); // anchor=2, offset=8, 5+8=13
  });

  it("paste는 이벤트를 beatOffset만큼 평행이동해 chart.events에 주입한다(editorLane=3 유지)", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(0), bpm: 120, editorLane: 3 }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0]));

    const result = cm.paste(chart, beat(7), makeCallbacks(), () => {});
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(1);
    expect(bf(injected[0].beat)).toBe(7);
    expect(injected[0].editorLane).toBe(3);
  });

  it("movePasteByLane은 노트 lane만 바꾸고 주입 이벤트의 editorLane=2·beat는 불변", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 2 as Lane, beat: beat(0) }];
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(0), bpm: 120, editorLane: 2 }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set([0]));

    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    const moved = cm.movePasteByLane(pasted.chart, "left", callbacks)!;
    const injected = moved.events.slice(events.length);
    expect(injected[0].editorLane).toBe(2);
    expect(bf(injected[0].beat)).toBe(5);
    // 노트는 lane 2→1로 이동
    expect(moved.notes[moved.notes.length - 1].lane).toBe(1);
  });

  it("movePasteBySnap(up, snap=1)은 주입 이벤트도 beat 5→6으로 함께 이동한다(endBeat 동반)", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const events: ChartEvent[] = [{ type: "auto", beat: beat(0), endBeat: beat(1) }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set([0]));

    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    const moved = cm.movePasteBySnap(pasted.chart, "up", callbacks)!;
    const injected = moved.events.slice(events.length);
    expect(bf(injected[0].beat)).toBe(6);
    expect(bf((injected[0] as { endBeat: { n: number; d: number } }).endBeat)).toBe(7);
  });

  it("cancelPaste는 주입한 이벤트를 제거하고 원본 events 1건으로 원상복구한다", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const events: ChartEvent[] = [{ type: "auto", beat: beat(0), endBeat: beat(1) }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set([0]));

    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    expect(pasted.chart.events).toHaveLength(2);

    const restored = cm.cancelPaste(pasted.chart, callbacks, () => {});
    expect(restored.events).toHaveLength(1);
    expect(bf(restored.events[0].beat)).toBe(0);
  });

  it("confirmPaste는 주입 이벤트를 확정한다 — 확정 후 cancelPaste로 되돌릴 수 없다", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(0) }];
    const events: ChartEvent[] = [{ type: "auto", beat: beat(0), endBeat: beat(1) }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set([0]));

    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    expect(cm.confirmPaste(pasted.chart, callbacks, () => [])).toBe(true);

    // 확정됐으므로 cancelPaste는 no-op — 주입 이벤트 2건 그대로
    const after = cm.cancelPaste(pasted.chart, callbacks, () => {});
    expect(after.events).toHaveLength(2);
  });

  it("timeSignature@1만 있는 선택 범위 [0,4]는 이벤트 0건 복사", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(4) },
    ];
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(1), beatPerMeasure: beat(4) },
    ];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0, 1]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    expect(result!.chart.events).toHaveLength(events.length); // 주입 0건
  });

  it("restZone [2,6] 복사 시 span과 겹치는 bpm@4 이벤트를 함께 담아 +8박 이동해 붙여넣는다", () => {
    const restZones: RestZone[] = [{ lane: 2 as Lane, beat: beat(2), endBeat: beat(6) }];
    const events: ChartEvent[] = [{ type: "bpm", beat: beat(4), bpm: 90 }];
    const chart = makeChart({ restZones, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    const injected = result!.chart.events.slice(events.length);
    expect(injected).toHaveLength(1);
    expect(bf(injected[0].beat)).toBe(12); // anchor=2, offset=8, 4+8=12
  });

  it("span 시작에 걸친 구간 이벤트(stop[2,6])가 붙여넣기 시 음수 beat로 나가면 붙여넣기를 거부한다", () => {
    // note@4만 선택 → span=[4,4], stop[2,6]은 폐구간 겹침(2<=4 && 6>=4)으로 수집(beat 2 < anchor 4).
    const notes: NoteEntity[] = [{ type: "single", lane: 1 as Lane, beat: beat(4) }];
    const events: ChartEvent[] = [{ type: "stop", beat: beat(2), endBeat: beat(6) }];
    const chart = makeChart({ notes, events });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0]));

    // beat 1에 붙여넣기 → offset=-3: note→1(범위 내)이나 stop→[-1,3]으로 음수 → 전체 거부
    const cb = makeCallbacks();
    const result = cm.paste(chart, beat(1), cb, () => {});
    expect(result).toBeNull();
    expect(cb.onWarn).toHaveBeenCalled();
    expect(chart.events).toHaveLength(1); // 원본 불변(주입 없음)
  });
});

// ---------------------------------------------------------------------------
// restZone 클립보드 (RFD 0019 스텝4 슬라이스 F) — trillZone 축 미러.
// restZone은 note/zone과 공존하는 선택 축이라 노트+restZone 혼합 복사·붙여넣기가 되며,
// 내부 노트가 없어 구간 자체만 평행이동한다.
// ---------------------------------------------------------------------------

describe("ClipboardManager — restZone 클립보드 (RFD 0019)", () => {
  // 픽스처: 0=lane2[2,6], 1=lane4[8,10]
  const fixtureRestZones = (): RestZone[] => [
    { lane: 2 as Lane, beat: beat(2), endBeat: beat(6) },
    { lane: 4 as Lane, beat: beat(8), endBeat: beat(10) },
  ];

  it("copy는 restZone 2개 복사 시 2를 반환하고 hasClipboard가 true가 된다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    expect(cm.hasClipboard).toBe(false);
    expect(cm.copy(chart, new Set(), new Set(), new Set([0, 1]))).toBe(2);
    expect(cm.hasClipboard).toBe(true);
  });

  it("restZone lane2[2,6] 복사 → beat 10 붙여넣기로 새 restZone [10,14]가 생성된다(레인 2 유지)", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    expect(result).not.toBeNull();
    const pasted = result!.chart.restZones!;
    expect(pasted).toHaveLength(3);
    expect(pasted[2].lane).toBe(2);
    expect(bf(pasted[2].beat)).toBe(10);
    expect(bf(pasted[2].endBeat)).toBe(14);
    expect([...result!.pastedRestZoneIndices]).toEqual([2]);
    expect([...cm.currentPastedRestZoneIndices]).toEqual([2]);
  });

  it("restZone 2개([2,6]·[8,10]) 복붙은 anchor=2 기준 상대 간격을 유지한다 — beat 10 붙여넣기로 [10,14]·[16,18]", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    expect(cm.copy(chart, new Set(), new Set(), new Set([0, 1]))).toBe(2);

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {})!;
    const pasted = result.chart.restZones!;
    expect(pasted).toHaveLength(4);
    expect(bf(pasted[2].beat)).toBe(10);
    expect(bf(pasted[2].endBeat)).toBe(14);
    expect(bf(pasted[3].beat)).toBe(16);
    expect(bf(pasted[3].endBeat)).toBe(18);
    expect(result.count).toBe(2);
  });

  it("restZones 축이 없는(undefined) 차트에 붙여넣어도 restZones 배열이 생성된다", () => {
    const source = makeChart({ restZones: fixtureRestZones() });
    const target = makeChart(); // restZones 키 없음
    const cm = new ClipboardManager();
    cm.copy(source, new Set(), new Set(), new Set([0]));

    const result = cm.paste(target, beat(0), makeCallbacks(), () => {})!;
    expect(result.chart.restZones).toHaveLength(1);
    expect(bf(result.chart.restZones![0].beat)).toBe(0);
    expect(bf(result.chart.restZones![0].endBeat)).toBe(4);
  });

  it("cancelPaste는 붙여넣은 restZone을 제거하고 원본 2개로 복원한다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const pasted = cm.paste(chart, beat(10), callbacks, () => {})!;
    expect(pasted.chart.restZones).toHaveLength(3);

    const restored = cm.cancelPaste(pasted.chart, callbacks, () => {});
    expect(restored.restZones).toHaveLength(2);
    expect(bf(restored.restZones![0].beat)).toBe(2);
    expect(bf(restored.restZones![1].beat)).toBe(8);
  });

  it("confirmPaste 확정 후 cancelPaste는 no-op — 붙여넣은 restZone 3개가 유지된다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const pasted = cm.paste(chart, beat(10), callbacks, () => {})!;
    expect(cm.confirmPaste(pasted.chart, callbacks, () => [])).toBe(true);

    const after = cm.cancelPaste(pasted.chart, callbacks, () => {});
    expect(after.restZones).toHaveLength(3);
  });

  it("restZone [2,6]을 beat 98에 붙여넣으면 끝(102)이 차트 범위(100)를 벗어나 전체 거부·경고", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const cb = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const result = cm.paste(chart, beat(98), cb, () => {});
    expect(result).toBeNull();
    expect(cb.onWarn).toHaveBeenCalled();
    expect(chart.restZones).toHaveLength(2); // 원본 불변
  });

  it("노트(lane2, beat11)와 겹치는 위치에 restZone [10,14]를 붙여넣어도 낙관 주입된다(의미 위반 허용, RFD 0017)", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 2 as Lane, beat: beat(11) }],
      restZones: fixtureRestZones(),
    });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const result = cm.paste(chart, beat(10), makeCallbacks(), () => {});
    expect(result).not.toBeNull();
    expect(result!.chart.restZones).toHaveLength(3); // 겹침(의미 위반)이어도 주입됨
    expect(bf(result!.chart.restZones![2].beat)).toBe(10);
  });

  it("movePasteBySnap('up', snap=1)은 붙여넣은 restZone [10,14]를 [11,15]로 이동한다(원본 불변)", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const pasted = cm.paste(chart, beat(10), callbacks, () => {})!;
    const moved = cm.movePasteBySnap(pasted.chart, "up", callbacks);
    expect(moved).not.toBeNull();
    expect(bf(moved!.restZones![2].beat)).toBe(11);
    expect(bf(moved!.restZones![2].endBeat)).toBe(15);
    expect(bf(moved!.restZones![0].beat)).toBe(2); // 원본 restZone 불변
  });

  it("movePasteBySnap('down')으로 붙여넣은 restZone 시작이 0 아래(-1)로 나가면 이동을 거부한다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const pasted = cm.paste(chart, beat(0), callbacks, () => {})!; // [0,4]에 붙임
    const moved = cm.movePasteBySnap(pasted.chart, "down", callbacks);
    expect(moved).toBeNull();
  });

  it("movePasteByLane('right')는 붙여넣은 restZone을 lane 2→3으로 이동한다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([0]));

    const pasted = cm.paste(chart, beat(10), callbacks, () => {})!;
    const moved = cm.movePasteByLane(pasted.chart, "right", callbacks);
    expect(moved).not.toBeNull();
    expect(moved!.restZones![2].lane).toBe(3);
    expect(moved!.restZones![0].lane).toBe(2); // 원본 불변
  });

  it("lane4 restZone 붙여넣기 후 movePasteByLane('right')는 레인 밖(5)이라 이동을 거부한다", () => {
    const chart = makeChart({ restZones: fixtureRestZones() });
    const cm = new ClipboardManager();
    const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set([1])); // lane4[8,10]

    const pasted = cm.paste(chart, beat(10), callbacks, () => {})!;
    const moved = cm.movePasteByLane(pasted.chart, "right", callbacks);
    expect(moved).toBeNull();
  });
});
