/**
 * 에디터 차트(또는 사례 텍스트) → ms로 정규화한 판정 사례.
 *
 * 노트 ms는 게임과 같은 ChartTiming(createChartTiming)으로, 입력 ms는 튜토리얼 재생기와 같은
 * getTutorialInputTimings로 구한다. 에디터가 저장한 v3 차트 JSON을 그대로 받는다.
 */

import { deserializeChart } from "../../shared/chart";
import { createChartTiming } from "../../shared/timing/chartTiming";
import { beatToMs, extractBpmMarkers } from "../../shared/timing";
import type { Chart, NoteEntity } from "../../shared/types";
import { getTutorialInputTimings } from "../../game/screens/songSelect/tutorialPreviewChart";
import { parseJudgmentCase } from "./parseJudgmentCase";

export interface JudgmentCaseNote {
  /** chart.notes 인덱스 — 판정 이벤트의 noteIndex와 같다 */
  index: number;
  /** 자동 이름: chart.notes 순서(텍스트 문법이면 적은 순서)로 1부터 센 N1, N2, … head와 바디는 따로 센다 */
  id: string;
  /** 텍스트 문법 `[이름]`으로 직접 붙인 이름 */
  name?: string;
  note: NoteEntity;
  startMs: number;
  endMs?: number;
}

export interface JudgmentCaseInput {
  /** chart.events 인덱스 */
  eventIndex: number;
  /** 엔진에 넘기는 물리 키 식별자(tutorialInput.keyCode) */
  key: string;
  /** 이미지에 쓰는 키 이름 */
  label: string;
  lane: number;
  downMs: number;
  /** null = 끝까지 떼지 않음 */
  upMs: number | null;
}

export interface JudgmentCaseAction {
  atMs: number;
  key: string;
  lane: number;
  type: "down" | "up";
  /** inputs 인덱스 */
  inputIndex: number;
}

export interface JudgmentCaseZone {
  lane: number;
  startMs: number;
  endMs: number;
}

export interface JudgmentCase {
  title: string;
  memo: string;
  chart: Chart;
  notes: JudgmentCaseNote[];
  inputs: JudgmentCaseInput[];
  trillZones: JudgmentCaseZone[];
  /** 시각 오름차순, 같은 시각이면 입력을 적은 순서(같은 입력은 down→up) */
  actions: JudgmentCaseAction[];
}

export interface JudgmentCaseChartOptions {
  title?: string;
  memo?: string;
  /** chart.notes와 같은 순서의 직접 붙인 이름 */
  noteNames?: readonly (string | undefined)[];
  unreleasedInputEventIndices?: readonly number[];
}

/** keyLabel이 없으면 keyCode의 Key/Digit 접두사를 떼어 짧게 보여준다(KeyF → F). */
function inputLabel(keyCode: string, keyLabel: string | undefined): string {
  const label = keyLabel?.trim();
  if (label) return label;
  return keyCode.replace(/^(?:Key|Digit)(?=.$)/, "");
}

export function judgmentCaseFromChart(chart: Chart, options: JudgmentCaseChartOptions = {}): JudgmentCase {
  const timing = createChartTiming(chart);
  const notes = chart.notes.map((note, index): JudgmentCaseNote => ({
    index,
    id: `N${index + 1}`,
    ...(options.noteNames?.[index] === undefined ? {} : { name: options.noteNames[index] }),
    note,
    startMs: timing.noteTimesMs.get(index)!,
    ...(timing.noteEndTimesMs.has(index) ? { endMs: timing.noteEndTimesMs.get(index)! } : {}),
  }));

  const unreleased = new Set(options.unreleasedInputEventIndices ?? []);
  const inputTimings = getTutorialInputTimings(chart);
  const inputEventIndices = chart.events.flatMap((event, index) => (event.type === "tutorialInput" ? [index] : []));
  const inputs = inputTimings.map(({ event, startMs, endMs }, order): JudgmentCaseInput => {
    const eventIndex = inputEventIndices[order];
    return {
      eventIndex,
      key: event.keyCode,
      label: inputLabel(event.keyCode, event.keyLabel),
      lane: event.lane,
      downMs: startMs,
      upMs: unreleased.has(eventIndex) ? null : endMs,
    };
  });

  const ordered = inputs.flatMap((input, inputIndex) => [
    { action: { atMs: input.downMs, key: input.key, lane: input.lane, type: "down" as const, inputIndex }, order: inputIndex * 2 },
    ...(input.upMs === null ? [] : [{ action: { atMs: input.upMs, key: input.key, lane: input.lane, type: "up" as const, inputIndex }, order: inputIndex * 2 + 1 }]),
  ]).sort((a, b) => a.action.atMs - b.action.atMs || a.order - b.order);

  const bpmMarkers = extractBpmMarkers(chart.events);
  const trillZones = chart.trillZones.map((zone): JudgmentCaseZone => ({
    lane: zone.lane,
    startMs: beatToMs(zone.beat, bpmMarkers, chart.meta.offsetMs),
    endMs: beatToMs(zone.endBeat, bpmMarkers, chart.meta.offsetMs),
  }));

  return {
    title: options.title ?? chart.meta.title,
    memo: options.memo ?? "",
    chart,
    notes,
    inputs,
    trillZones,
    actions: ordered.map(({ action }) => action),
  };
}

/** 에디터 차트 JSON(`{`로 시작) 또는 사례 텍스트를 판정 사례로 읽는다. */
export function judgmentCaseFromSource(source: string, options: { fallbackTitle?: string } = {}): JudgmentCase {
  if (source.trimStart().startsWith("{")) {
    const chart = deserializeChart(source);
    return judgmentCaseFromChart(chart, { title: chart.meta.title || options.fallbackTitle || "" });
  }
  const parsed = parseJudgmentCase(source);
  return judgmentCaseFromChart(parsed.chart, {
    title: parsed.title || options.fallbackTitle || "",
    memo: parsed.memo,
    noteNames: parsed.noteNames,
    unreleasedInputEventIndices: parsed.unreleasedInputEventIndices,
  });
}
