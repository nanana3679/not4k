import { describe, expect, it } from "vitest";
import { serializeChart } from "../../shared/chart";
import type { Chart } from "../../shared/types";
import { beat } from "../../shared/types/beat";
import { judgmentCaseFromChart, judgmentCaseFromSource } from "./chartCase";

/** 에디터에서 저장한 것과 같은 v3 차트: 120 BPM(1박 = 500ms), offset 100ms. */
function editorChart(): Chart {
  return {
    meta: {
      title: "에디터 사례",
      artist: "",
      difficultyLabel: "NORMAL",
      difficultyLevel: 1,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 100,
    },
    notes: [
      { type: "single", lane: 2, beat: beat(1) },
      { type: "long", lane: 2, beat: beat(1), endBeat: beat(5, 2) },
    ],
    trillZones: [],
    restZones: [],
    events: [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "tutorialInput", beat: beat(1), endBeat: beat(5, 2), lane: 2, keyCode: "KeyF", keyLabel: "F", editorLane: 3 },
      { type: "tutorialInput", beat: beat(2), endBeat: beat(9, 4), lane: 2, keyCode: "KeyD", editorLane: 4 },
    ],
  };
}

describe("judgmentCaseFromSource — 에디터 v3 JSON", () => {
  it("120 BPM·offset 100ms 차트의 1박 head는 600ms, 1~5/2박 long은 600~1350ms", () => {
    const loaded = judgmentCaseFromSource(serializeChart(editorChart()));
    expect(loaded.notes.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[600, undefined], [600, 1350]]);
  });

  it("tutorialInput F 1~5/2박은 600ms에 누르고 1350ms에 떼는 레인 2 입력", () => {
    const loaded = judgmentCaseFromSource(serializeChart(editorChart()));
    expect(loaded.inputs[0]).toMatchObject({ key: "KeyF", label: "F", lane: 2, downMs: 600, upMs: 1350 });
  });

  it("keyLabel이 없는 KeyD 입력은 표시 이름을 D로 줄임", () => {
    const loaded = judgmentCaseFromSource(serializeChart(editorChart()));
    expect(loaded.inputs[1]).toMatchObject({ key: "KeyD", label: "D", downMs: 1100, upMs: 1225 });
  });

  it("에디터 JSON 사례의 노트는 chart.notes 순서대로 자동 이름 N1·N2, 직접 붙인 이름은 없음", () => {
    const loaded = judgmentCaseFromSource(serializeChart(editorChart()));
    expect(loaded.notes.map(({ id, name }) => [id, name])).toEqual([["N1", undefined], ["N2", undefined]]);
  });

  it("JSON 사례의 제목은 meta.title, 메모는 빈 문자열", () => {
    const loaded = judgmentCaseFromSource(serializeChart(editorChart()));
    expect(loaded.title).toBe("에디터 사례");
    expect(loaded.memo).toBe("");
  });

  it("meta.title이 비면 fallbackTitle(파일 이름)을 제목으로 씀", () => {
    const chart = editorChart();
    chart.meta.title = "";
    expect(judgmentCaseFromSource(serializeChart(chart), { fallbackTitle: "case.json" }).title).toBe("case.json");
  });

  it("앞 공백이 있는 JSON 문자열도 텍스트 문법이 아닌 차트 JSON으로 읽음", () => {
    expect(judgmentCaseFromSource(`\n  ${serializeChart(editorChart())}`).notes).toHaveLength(2);
  });
});

describe("judgmentCaseFromSource — 텍스트 문법", () => {
  const text = [
    "제목: 결정 ④",
    "노트: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760",
    "입력: A 1000-1430 | D 1490-1760 | B 1700-",
    "메모: 메모 한 줄",
  ].join("\n");

  it("텍스트 사례는 적은 ms 그대로 노트와 입력을 만든다", () => {
    const loaded = judgmentCaseFromSource(text);
    expect(loaded.notes.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[1000, 1500], [1500, 1560], [1560, undefined], [1560, 1760]]);
    expect(loaded.inputs.map(({ label, downMs, upMs }) => [label, downMs, upMs])).toEqual([["A", 1000, 1430], ["D", 1490, 1760], ["B", 1700, null]]);
  });

  it("텍스트 사례의 노트는 적은 순서대로 자동 이름 N1~N4 — head 1560도 바디와 별개 노트로 N3", () => {
    expect(judgmentCaseFromSource(text).notes.map((note) => note.id)).toEqual(["N1", "N2", "N3", "N4"]);
  });

  it("[가운데]를 붙인 둘째 노트는 name 가운데, 자동 이름 id는 그대로 N2", () => {
    const loaded = judgmentCaseFromSource("노트: holdOnly 1000-1500 | long 1500-1560 [가운데]");
    expect(loaded.notes[1]).toMatchObject({ id: "N2", name: "가운데" });
    expect(loaded.notes[0].name).toBeUndefined();
  });

  it("떼지 않은 B 1700- 입력은 down 동작만 만들고 up 동작이 없음", () => {
    const loaded = judgmentCaseFromSource(text);
    expect(loaded.actions.filter((action) => action.key === "B").map((action) => action.type)).toEqual(["down"]);
  });

  it("제목·메모는 텍스트 머리글에서 가져옴", () => {
    const loaded = judgmentCaseFromSource(text);
    expect(loaded.title).toBe("결정 ④");
    expect(loaded.memo).toBe("메모 한 줄");
  });
});

describe("judgmentCaseFromChart — 입력 동작 순서", () => {
  it("같은 1200ms의 A up과 A down은 적은 순서(A 1000-1200 다음 A 1200-1400)대로 up→down", () => {
    const loaded = judgmentCaseFromSource("입력: A 1000-1200 | A 1200-1400");
    expect(loaded.actions.filter((action) => action.atMs === 1200).map((action) => action.type)).toEqual(["up", "down"]);
  });

  it("동작은 시각 오름차순이고 같은 시각이면 적은 순서를 지킴: B 1000-1100 | A 1000-1100", () => {
    const loaded = judgmentCaseFromSource("입력: B 1000-1100 | A 1000-1100");
    expect(loaded.actions.map((action) => `${action.key}${action.type}@${action.atMs}`)).toEqual([
      "Bdown@1000", "Adown@1000", "Bup@1100", "Aup@1100",
    ]);
  });

  it("길이 0 입력 A 1000-1000은 같은 시각에 down 다음 up", () => {
    const loaded = judgmentCaseFromSource("입력: A 1000-1000");
    expect(loaded.actions.map((action) => action.type)).toEqual(["down", "up"]);
  });

  it("trillZone 1000-2000은 ms 범위 [1000,2000]으로 변환", () => {
    expect(judgmentCaseFromSource("노트: zone 1000-2000 | trill 1000").trillZones).toEqual([{ lane: 1, startMs: 1000, endMs: 2000 }]);
  });

  it("unreleasedInputEventIndices 옵션 없이 차트를 넘기면 모든 입력에 뗌 시각이 있음", () => {
    expect(judgmentCaseFromChart(editorChart()).inputs.every((input) => input.upMs !== null)).toBe(true);
  });
});
