import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type { Chart, NoteEntity } from "../types/chart";
import {
  auxNotes,
  fromAuxIndex,
  isAuxLane,
  isMainLane,
  isValidNoteLane,
  isVisibleLane,
  mainNotes,
  maxAuxLane,
  toAuxIndex,
  toPlayableChart,
} from "./laneAxis";

const notes: NoteEntity[] = [
  { type: "single", lane: 1, beat: beat(0) },
  { type: "long", lane: 4, beat: beat(1), endBeat: beat(2) },
  { type: "trill", lane: 5, beat: beat(3) },
  { type: "double", lane: 7, beat: beat(4) },
];

describe("laneAxis", () => {
  it("lane=4이면 메인 레인이고 lane=5이면 보조 레인", () => {
    expect(isMainLane(4)).toBe(true);
    expect(isMainLane(5)).toBe(false);
    expect(isAuxLane(4)).toBe(false);
    expect(isAuxLane(5)).toBe(true);
  });

  it("lane=0·4.5·NaN이면 유효하지 않고 lane=8이면 유효한 노트 레인", () => {
    expect(isValidNoteLane(0)).toBe(false);
    expect(isValidNoteLane(-1)).toBe(false);
    expect(isValidNoteLane(4.5)).toBe(false);
    expect(isValidNoteLane(Number.NaN)).toBe(false);
    expect(isValidNoteLane(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidNoteLane(8)).toBe(true);
  });

  it("auxIndex=1은 lane=5로 변환되고 lane=7은 auxIndex=3으로 변환", () => {
    expect(fromAuxIndex(1)).toBe(5);
    expect(toAuxIndex(7)).toBe(3);
  });

  it("auxIndex=0·1.5와 메인 lane=4는 보조 레인 좌표로 변환되지 않는다", () => {
    expect(fromAuxIndex(0)).toBeNull();
    expect(fromAuxIndex(1.5)).toBeNull();
    expect(toAuxIndex(4)).toBeNull();
  });

  it("extraLaneCount=2이면 lane=6까지 보이고 lane=7은 숨김", () => {
    expect(isVisibleLane(6, 2)).toBe(true);
    expect(isVisibleLane(7, 2)).toBe(false);
  });

  it("메인과 보조 노트를 나누면 원래 상대 순서를 유지", () => {
    expect(mainNotes(notes).map((note) => note.lane)).toEqual([1, 4]);
    expect(auxNotes(notes).map((note) => note.lane)).toEqual([5, 7]);
    expect(maxAuxLane(notes)).toBe(3);
  });

  it("통합 차트를 플레이 차트로 변환하면 lane=5 이상 노트만 제외", () => {
    const chart: Chart = {
      meta: {
        title: "test",
        artist: "test",
        difficultyLabel: "test",
        difficultyLevel: 1,
        imageFile: "",
        audioFile: "",
        previewAudioFile: "",
        offsetMs: 0,
      },
      notes,
      trillZones: [],
      events: [],
    };

    const playable = toPlayableChart(chart);

    expect(playable.notes.map((note) => note.lane)).toEqual([1, 4]);
    expect(playable.meta).toBe(chart.meta);
  });
});
