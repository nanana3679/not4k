import { describe, it, expect, vi } from "vitest";
import { ClipboardManager, type ClipboardCallbacks } from "./ClipboardManager";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { INITIAL_TIMING_EXISTS_COPY } from "../editorCopy";
import { beat, beatToFloat } from "../../shared";
import type { ChartDocument, Lane, RestZone } from "../../shared";

function makeChart(overrides?: Partial<ChartDocument>): ChartDocument {
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
// 이벤트 클립보드 — 명시 선택, RFD 0068
// ---------------------------------------------------------------------------

describe("ClipboardManager — 이벤트 명시 선택", () => {
  it("노트 2개와 auto·BPM만 선택하면 4개를 복사하고 선택하지 않은 박자는 제외한다", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1, beat: beat(0) }, { type: "single", lane: 2, beat: beat(4) }],
      events: [{ type: "auto", beat: beat(1), endBeat: beat(2) },
        { type: "bpm", beat: beat(4), bpm: 180 }, { type: "timeSignature", beat: beat(2), beatPerMeasure: beat(4) }],
    });
    const cm = new ClipboardManager();
    expect(cm.copy(chart, new Set([0, 1]), new Set(), new Set(), new Set([0, 1]))).toBe(4);
    const pasted = cm.paste(chart, beat(10), makeCallbacks(), () => {})!;
    expect(pasted.chart.events.slice(3)).toEqual([
      { type: "auto", beat: beat(11), endBeat: beat(12) }, { type: "bpm", beat: beat(14), bpm: 180 },
    ]);
    expect(pasted.pastedEventIndices).toEqual(new Set([3, 4]));
    expect(pasted.count).toBe(4);
  });

  it("0～4박 노트만 선택하면 같은 범위의 BPM과 겹치는 stop도 자동 복사하지 않는다", () => {
    const chart = makeChart({
      notes: [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(4) }],
      events: [{ type: "bpm", beat: beat(3), bpm: 180 }, { type: "stop", beat: beat(3), endBeat: beat(6) }],
    });
    const cm = new ClipboardManager();
    expect(cm.copy(chart, new Set([0]))).toBe(1);
    expect(cm.paste(chart, beat(10), makeCallbacks(), () => {})!.chart.events).toEqual(chart.events);
  });

  it("2박 박자 변경만 복사해 8박에 붙이면 beatPerMeasure 3과 editorLane 2를 보존한다", () => {
    const chart = makeChart({ events: [{ type: "timeSignature", beat: beat(2), beatPerMeasure: beat(3), editorLane: 2 }] });
    const cm = new ClipboardManager();
    expect(cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]))).toBe(1);
    expect(cm.paste(chart, beat(8), makeCallbacks(), () => {})!.chart.events[1])
      .toEqual({ type: "timeSignature", beat: beat(8), beatPerMeasure: beat(3), editorLane: 2 });
  });

  it("4박 노트와 2～6박 stop을 함께 선택해 1박에 붙이면 stop 1～5박·노트 3박으로 정렬한다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(4) }],
      events: [{ type: "stop", beat: beat(2), endBeat: beat(6) }] });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set([0]), new Set(), new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(1), makeCallbacks(), () => {})!;
    expect(pasted.chart.notes[1].beat).toEqual(beat(3));
    expect(pasted.chart.events[1]).toMatchObject({ beat: beat(1), endBeat: beat(5) });
  });

  it("restZone 2～6박과 BPM 4박을 함께 선택해 10박에 붙이면 BPM도 12박에 복사한다", () => {
    const chart = makeChart({ restZones: [{ lane: 2, beat: beat(2), endBeat: beat(6) }],
      events: [{ type: "bpm", beat: beat(4), bpm: 90 }] });
    const cm = new ClipboardManager();
    expect(cm.copy(chart, new Set(), new Set(), new Set([0]), new Set([0]))).toBe(2);
    expect(cm.paste(chart, beat(10), makeCallbacks(), () => {})!.chart.events[1].beat).toEqual(beat(12));
  });

  it("길이 4박 stop을 99박에 붙여 끝이 최대 100박을 넘으면 전체 붙여넣기를 거부한다", () => {
    const chart = makeChart({ events: [{ type: "stop", beat: beat(2), endBeat: beat(6) }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]));
    expect(cm.paste(chart, beat(99), callbacks, () => {})).toBeNull();
    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
    expect(callbacks.onWarn).toHaveBeenCalled();
  });

  it("BPM 120 이벤트만 7박에 붙이면 editorLane 3을 보존한다", () => {
    const chart = makeChart({ events: [{ type: "bpm", beat: beat(0), bpm: 120, editorLane: 3 }] });
    const cm = new ClipboardManager();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]));
    expect(cm.paste(chart, beat(7), makeCallbacks(), () => {})!.chart.events[1])
      .toEqual({ type: "bpm", beat: beat(7), bpm: 120, editorLane: 3 });
  });

  it("노트 lane 2와 이벤트 editorLane 2를 붙여넣은 뒤 왼쪽 이동하면 둘 다 1이 된다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 2, beat: beat(0) }],
      events: [{ type: "bpm", beat: beat(0), bpm: 120, editorLane: 2 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 3 };
    cm.copy(chart, new Set([0]), new Set(), new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    const moved = cm.movePasteByLane(pasted.chart, "left", callbacks)!;
    expect(moved.notes.at(-1)?.lane).toBe(1);
    expect(moved.events.at(-1)).toMatchObject({ editorLane: 1, beat: beat(5) });
  });

  it("5～6박 auto 이벤트만 붙여넣은 뒤 위로 1스냅 이동하면 6～7박이 된다", () => {
    const chart = makeChart({ events: [{ type: "auto", beat: beat(0), endBeat: beat(1) }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    expect(cm.movePasteBySnap(pasted.chart, "up", callbacks)!.events.at(-1))
      .toMatchObject({ beat: beat(6), endBeat: beat(7) });
  });

  it("이벤트 붙여넣기를 취소하면 주입 이벤트를 제거하고 원본 배열을 복구한다", () => {
    const chart = makeChart({ events: [{ type: "auto", beat: beat(0), endBeat: beat(1) }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    expect(cm.cancelPaste(pasted.chart, callbacks, () => {}).events).toEqual(chart.events);
  });

  it("이벤트 붙여넣기를 확정하면 이후 cancelPaste로 복사한 이벤트를 지우지 않는다", () => {
    const chart = makeChart({ events: [{ type: "auto", beat: beat(0), endBeat: beat(1) }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(5), callbacks, () => {})!;
    expect(cm.confirmPaste(pasted.chart, callbacks, () => [])).toBe(true);
    expect(cm.cancelPaste(pasted.chart, callbacks, () => {}).events).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 0박 초기 설정 — 붙여넣기·대기 중 이동으로 0박에 온 BPM·박자 (RFD 0082)
// ---------------------------------------------------------------------------

describe("ClipboardManager — 0박에 오는 BPM·박자", () => {
  const initialBpm = { type: "bpm", beat: beat(0), bpm: 120, editorLane: 1 } as const;
  const initialSignature = { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 } as const;

  it("0박 BPM이 있을 때 4박 노트와 4박 BPM 180을 복사해 0박에 붙이면 전체를 거부하고 INITIAL_TIMING_EXISTS_COPY 경고를 한 번 띄운다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(4) }],
      events: [initialBpm, initialSignature, { type: "bpm", beat: beat(4), bpm: 180, editorLane: 1 }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks(); const clearSelection = vi.fn();
    cm.copy(chart, new Set([0]), new Set(), new Set(), new Set([2]));

    expect(cm.paste(chart, beat(0), callbacks, clearSelection)).toBeNull();

    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
    expect(cm.isPendingPaste).toBe(false);
    expect(callbacks.onWarn).toHaveBeenCalledTimes(1);
    expect(callbacks.onWarn).toHaveBeenCalledWith(INITIAL_TIMING_EXISTS_COPY);
  });

  it("0박 박자가 없을 때 보조 레인3의 4박 박자 3/4를 복사해 0박에 붙이면 고정 자리인 보조 레인2에 둔다", () => {
    const chart = makeChart({ events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(3), editorLane: 3 }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([1]));

    const pasted = cm.paste(chart, beat(0), callbacks, () => {})!;

    expect(pasted.chart.events[2]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(3), editorLane: 2 });
    expect(callbacks.onWarn).not.toHaveBeenCalled();
  });

  it("0박 BPM이 있을 때 1박에 붙인 BPM 180을 대기 중 아래로 1스냅 옮겨 0박이 되면 이동을 거부하고 경고를 한 번 띄운다", () => {
    const chart = makeChart({ events: [initialBpm, initialSignature, { type: "bpm", beat: beat(4), bpm: 180, editorLane: 3 }] });
    const cm = new ClipboardManager(); const callbacks = makeCallbacks();
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([2]));
    const pasted = cm.paste(chart, beat(1), callbacks, () => {})!;

    expect(cm.movePasteBySnap(pasted.chart, "down", callbacks)).toBeNull();

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onWarn).toHaveBeenCalledTimes(1);
    expect(callbacks.onWarn).toHaveBeenCalledWith(INITIAL_TIMING_EXISTS_COPY);
    expect(cm.isPendingPaste).toBe(true);
  });

  it("0박 박자가 없을 때 1박에 붙인 보조 레인3 박자를 대기 중 아래로 옮기면 0박 보조 레인2가 되고 다시 위로 옮기면 붙인 자리인 1박 보조 레인3으로 돌아온다", () => {
    const chart = makeChart({ events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(4), editorLane: 3 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 4 };
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([1]));
    const pasted = cm.paste(chart, beat(1), callbacks, () => {})!;

    const down = cm.movePasteBySnap(pasted.chart, "down", callbacks)!;
    expect(down.events[2]).toMatchObject({ beat: beat(0), editorLane: 2 });
    const up = cm.movePasteBySnap(down, "up", callbacks);
    expect(up?.events[2]).toMatchObject({ beat: beat(1), editorLane: 3 });
    expect(callbacks.onWarn).not.toHaveBeenCalled();
  });

  it("0박 박자가 없을 때 1박 보조 레인3에 붙인 박자를 아래로 옮겨 0박 보조 레인2가 된 뒤 →로 옮겨도 보조 레인2에 남고 위로 옮기면 1박 보조 레인4가 된다", () => {
    const chart = makeChart({ events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(4), editorLane: 3 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 4 };
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([1]));
    const pasted = cm.paste(chart, beat(1), callbacks, () => {})!;

    const down = cm.movePasteBySnap(pasted.chart, "down", callbacks)!;
    const right = cm.movePasteByLane(down, "right", callbacks)!;
    expect(right.events[2]).toMatchObject({ beat: beat(0), editorLane: 2 });
    const up = cm.movePasteBySnap(right, "up", callbacks);
    expect(up?.events[2]).toMatchObject({ beat: beat(1), editorLane: 4 });
  });

  it("0박 박자가 없을 때 보조 레인3의 4박 박자를 0박에 붙이면 보조 레인2에 두고 위로 옮기면 복사한 레인인 1박 보조 레인3이 된다", () => {
    const chart = makeChart({ events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(4), editorLane: 3 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 4 };
    cm.copy(chart, new Set(), new Set(), new Set(), new Set([1]));
    const pasted = cm.paste(chart, beat(0), callbacks, () => {})!;
    expect(pasted.chart.events[2]).toMatchObject({ beat: beat(0), editorLane: 2 });

    const up = cm.movePasteBySnap(pasted.chart, "up", callbacks);

    expect(up?.events[2]).toMatchObject({ beat: beat(1), editorLane: 3 });
  });

  it("보조 레인 2개·0박 박자 없는 차트에 레인1 노트와 보조 레인2 박자 3/4를 0박에 붙인 뒤 →로 옮기면 노트는 레인2로 가고 박자는 보조 레인2에 남는다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(4) }],
      events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(3), editorLane: 2 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 2 };
    cm.copy(chart, new Set([0]), new Set(), new Set(), new Set([1]));
    const pasted = cm.paste(chart, beat(0), callbacks, () => {})!;
    expect(pasted.chart.events[2]).toMatchObject({ beat: beat(0), editorLane: 2 });

    const moved = cm.movePasteByLane(pasted.chart, "right", callbacks);

    expect(moved?.notes[1]).toEqual({ type: "single", lane: 2, beat: beat(0) });
    expect(moved?.events[2]).toEqual({ type: "timeSignature", beat: beat(0), beatPerMeasure: beat(3), editorLane: 2 });
    expect(callbacks.onWarn).not.toHaveBeenCalled();
  });

  it("보조 레인 2개에서 레인1 노트와 함께 0박 보조 레인2에 붙인 박자를 →로 옮긴 뒤 위로 옮기면 박자가 보이지 않는 보조 레인3이 되므로 이동을 거부한다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(4) }],
      events: [initialBpm, { type: "timeSignature", beat: beat(4), beatPerMeasure: beat(3), editorLane: 2 }] });
    const cm = new ClipboardManager(); const callbacks = { ...makeCallbacks(), getExtraLaneCount: () => 2 };
    cm.copy(chart, new Set([0]), new Set(), new Set(), new Set([1]));
    const pasted = cm.paste(chart, beat(0), callbacks, () => {})!;
    const right = cm.movePasteByLane(pasted.chart, "right", callbacks)!;

    expect(cm.movePasteBySnap(right, "up", callbacks)).toBeNull();

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(2);
    expect(cm.isPendingPaste).toBe(true);
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

describe('보조 trillZone 클립보드', () => {
  it('lane 7 구간만 붙여넣어도 보조 레인 수 1→3으로 늘고 취소하면 1과 원본 구간으로 돌아간다', () => {
    const chart = makeChart({ trillZones: [{ lane: 7, beat: beat(1), endBeat: beat(3) }] });
    const cm = new ClipboardManager();
    let count = 1;
    const cb = { ...makeCallbacks(), getExtraLaneCount: () => count, setExtraLaneCount: (value: number) => { count = value; } };
    cm.copy(chart, new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(8), cb, () => {})!;
    expect(count).toBe(3);
    expect(pasted.chart.trillZones[1]).toEqual({ lane: 7, beat: beat(8), endBeat: beat(10) });
    const restored = cm.cancelPaste(pasted.chart, cb, () => {});
    expect(restored?.trillZones).toEqual(chart.trillZones);
    expect(count).toBe(1);
  });
  it('lane 4 구간을 lane 5로 붙여넣기 이동하고 가시 상한 lane 6을 넘으면 유지한다', () => {
    const chart = makeChart({ trillZones: [{ lane: 4, beat: beat(1), endBeat: beat(3) }] });
    const cm = new ClipboardManager(); const cb = { ...makeCallbacks(), getExtraLaneCount: () => 2 };
    cm.copy(chart, new Set(), new Set([0]));
    const pasted = cm.paste(chart, beat(8), cb, () => {})!;
    const moved = cm.movePasteByLane(pasted.chart, "right", cb)!;
    expect(moved.trillZones[1].lane).toBe(5);
    const edge = cm.movePasteByLane(moved, "right", cb)!;
    expect(edge.trillZones[1].lane).toBe(6);
    expect(cm.movePasteByLane(edge, "right", cb)).toBeNull();
  });
});
