import { describe, it, expect, vi } from "vitest";
import { ClipboardManager, type ClipboardCallbacks } from "./ClipboardManager";
import { beat, beatToFloat } from "../../shared";
import type { Chart, ChartEvent, Lane, NoteEntity, TrillZone } from "../../shared";

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
    getSnapStep: () => beat(1),
    getMaxBeatFloat: () => 100,
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
});
