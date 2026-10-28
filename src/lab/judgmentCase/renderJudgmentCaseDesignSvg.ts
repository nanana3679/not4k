/** 수동 설계 전용 이미지. 기존 게임 스킨을 쓰며 차트 변환·판정 엔진은 실행하지 않는다. */
import { DESIGN_BANNER, DESIGN_TONE_LABELS, designNoteLabel, type DesignTone, type JudgmentCaseDesign } from "./judgmentCaseDesign";
import { createAutoCaseTimeAxis, createCaseTimeAxis, escapeXml, formatMs, resolveLabelPositions, wrapText } from "./judgmentCaseLayout";
import { CASE_LANE_WIDTH as LANE_W, drawCaseNotes, skinDefs, type CaseNoteDrawing } from "./judgmentCaseNoteSvg";
import type { JudgmentCaseSkin } from "./judgmentCaseSkin";

const BG = "#11121b";
const TEXT = "#e6e8f2";
const MUTED = "#a8adc5";
const TONE: Record<DesignTone, string> = { neutral: "#9cbfff", success: "#72dbb2", failure: "#ff8e9b", proposal: "#c5a1ff" };
const KEY_COLORS = ["#ffad62", "#65d8e5", "#dc9bff", "#ff9ccc"];
const FONT = "'Noto Sans CJK KR','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const LINE = 21;
const LANE_STEP = LANE_W + 22;
const KEY_W = 118;

interface Label { at: number; lines: string[]; color: string; position: number }
function arrange(labels: Omit<Label, "position">[]): Label[] {
  const positions = resolveLabelPositions(labels.map(label => label.at), LINE, labels.map(label => label.lines.length + 0.5));
  return labels.map((label, index) => ({ ...label, position: positions[index] }));
}
function text(x: number, y: number, value: string, color = TEXT, size = 14, attrs = "") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${escapeXml(value)}</text>`;
}
function line(x1: number, y1: number, x2: number, y2: number, color: string, attrs = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
}
function rect(x: number, y: number, width: number, height: number, attrs: string) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}/>`;
}

function renderPanel(design: JudgmentCaseDesign, skin: JudgmentCaseSkin, panelIndex: number, pxPerMs?: number) {
  const visibleAnnotations = design.annotations.filter(annotation => annotation.label !== undefined);
  const times = [
    ...design.notes.flatMap(note => [note.startMs, note.endMs]),
    ...design.inputs.flatMap(input => input.upMs === null ? [input.downMs] : [input.downMs, input.upMs]),
    ...design.windows.flatMap(window => [window.startMs, window.endMs]),
    ...visibleAnnotations.map(annotation => annotation.atMs),
  ];
  const axis = pxPerMs === undefined ? createAutoCaseTimeAxis(times) : createCaseTimeAxis(times, pxPerMs);
  const offset = axis.offsetOf;
  const lanes = [...new Set([...design.notes.map(note => note.lane), ...design.inputs.map(input => input.lane)])].sort((a, b) => a - b);
  const inputKey = (input: { key: string; lane: number }) => JSON.stringify([input.lane, input.key]);
  const keys = [...new Map(design.inputs.map(input => [inputKey(input), input])).values()];
  const laneX = (lane: number) => 84 + lanes.indexOf(lane) * LANE_STEP;
  const notesX = 84 + lanes.length * LANE_STEP + 12;
  const keysX = notesX + 222;
  const plotRight = keysX + keys.length * KEY_W;
  const labelsX = plotRight + 40;
  const width = Math.max(920, labelsX + 334);
  const headerHeight = 88;

  const noteColor = (count: number) => count === 1 ? "#90b9ff" : "#eac46a";
  const noteLabels = arrange(design.notes.map(note => ({
    at: (offset(note.startMs) + offset(note.endMs)) / 2,
    lines: wrapText(designNoteLabel(note), 208, 14), color: noteColor(note.count),
  })));
  const inputLabels = keys.map((key, keyIndex) => arrange(design.inputs.filter(input => inputKey(input) === inputKey(key)).flatMap(input => [
    { at: offset(input.downMs), lines: wrapText(`${input.key}↓${formatMs(input.downMs)}`, KEY_W - 22, 13), color: KEY_COLORS[keyIndex % KEY_COLORS.length] },
    { at: offset(input.upMs ?? axis.keyTimes[axis.keyTimes.length - 1]),
      lines: wrapText(input.upMs === null ? `${input.key} (계속)` : `${input.key}↑${formatMs(input.upMs)}`, KEY_W - 22, 13), color: KEY_COLORS[keyIndex % KEY_COLORS.length] },
  ])));
  const explanations = arrange([
    ...design.windows.map((window, index) => ({
      at: (offset(window.startMs) + offset(window.endMs)) / 2, color: TONE[window.tone],
      lines: wrapText(`W${index + 1} · ${window.note} ${window.label}\n${formatMs(window.startMs)}～${formatMs(window.endMs)}ms · ${DESIGN_TONE_LABELS[window.tone]}`, 310, 14),
    })),
    ...visibleAnnotations.map(annotation => ({
      at: offset(annotation.atMs), color: TONE[annotation.tone],
      lines: wrapText(`[${DESIGN_TONE_LABELS[annotation.tone]}] ${annotation.note ?? "전체"} @${formatMs(annotation.atMs)}\n${annotation.label}`, 310, 14),
    })),
  ]);
  const allLabels = [...noteLabels, ...inputLabels.flat(), ...explanations];
  const maxOffset = Math.max(axis.height, ...allLabels.map(label => label.position + 18));
  const minOffset = Math.min(0, ...allLabels.map(label => label.position - (label.lines.length - 1) * LINE - 8));
  const y = (offsetPx: number) => headerHeight + 20 + maxOffset - offsetPx;
  const timeY = (ms: number) => y(offset(ms));
  const footerY = y(minOffset) + 36;
  const hasPlaceholder = design.notes.some(note => note.kind === "maintain" || note.kind === "marker" || note.count > 2);
  const footerLines = wrapText([
    "시간 ↑ · 간격은 눈금의 ms로 읽기 · ≈ 긴 구간 압축 · W = 직접 지정한 창",
    ...(hasPlaceholder ? ["임시 표식(전용 에셋 없음): ◇ 유지 노트 · ○ 자유 표식 또는 3개 이상 수량"] : []),
  ].join("\n"), width - 56, 13);
  const height = Math.ceil(footerY + footerLines.length * LINE + 26);
  const parts = [rect(0, 0, width, height, `fill="${BG}"`), `<g font-family="${FONT}">`];
  parts.push(text(24, 28, DESIGN_BANNER, TONE.proposal, 15));
  parts.push(text(24, 53, `패널 ${panelIndex + 1} · 스킨 ${skin.name}`, MUTED, 13));
  parts.push(text(24, headerHeight, "ms ↑", MUTED, 13));
  lanes.forEach(lane => parts.push(text(laneX(lane) + LANE_W / 2, headerHeight, `L${lane}`, MUTED, 13, 'text-anchor="middle"')));
  parts.push(text(notesX, headerHeight, "노트", MUTED, 13), text(labelsX, headerHeight, "창 · 라벨", MUTED, 13));
  keys.forEach((key, index) => parts.push(text(keysX + index * KEY_W, headerHeight,
    `입력 ${index + 1} · L${key.lane}`, KEY_COLORS[index % KEY_COLORS.length], 13)));

  for (const lane of lanes) parts.push(rect(laneX(lane), timeY(axis.keyTimes[axis.keyTimes.length - 1]) - 12, LANE_W, axis.height + 24, 'fill="#1d2131" rx="5"'));
  for (const ms of axis.keyTimes) {
    parts.push(text(70, timeY(ms) + 4, formatMs(ms), MUTED, 12, 'text-anchor="end"'));
    parts.push(line(78, timeY(ms), plotRight, timeY(ms), "#747d9d", 'opacity="0.28" stroke-dasharray="3 6"'));
  }
  for (const gap of axis.compressed) parts.push(text(42, (timeY(gap.startMs) + timeY(gap.endMs)) / 2 + 4, "≈", MUTED, 20));

  // 각 창의 범위를 같은 시간 축에 놓는다. 겹친 창도 번호·경계선·별도 설명으로 구분한다.
  design.windows.forEach((window, index) => {
    const note = design.notes.find(note => note.id === window.note)!;
    const x = laneX(note.lane) - 6;
    const top = timeY(window.endMs);
    const bottom = timeY(window.startMs);
    const color = TONE[window.tone];
    parts.push(`<g data-design-window="${index + 1}" data-start-ms="${window.startMs}" data-end-ms="${window.endMs}">`);
    parts.push(rect(x, top, plotRight - x, Math.max(1, bottom - top), `fill="${color}" fill-opacity="0.08"`));
    parts.push(line(x, top, plotRight, top, color, 'stroke-dasharray="6 4"'), line(x, bottom, plotRight, bottom, color, 'stroke-dasharray="6 4"'));
    parts.push(line(x, top, x, bottom, color), text(plotRight - 4, top - 4, `W${index + 1}`, color, 11, 'text-anchor="end"'), "</g>");
  });

  // 같은 에셋·크기·타일링·레이어 규칙을 엔진 모드와 공유한다. 판정 결과는 그림에 추론해 넣지 않는다.
  const assetNotes = design.notes.flatMap((note, index): CaseNoteDrawing[] => {
    if (note.kind === "maintain" || note.kind === "marker" || note.count > 2) return [];
    return [{ index, kind: note.count === 2 ? "double" : "single", shape: note.kind === "release" ? "terminal" : note.kind,
      lane: note.lane, startMs: note.startMs, endMs: note.endMs,
      attributes: `data-design-note="${escapeXml(note.id)}"` }];
  });
  const noteLayers = drawCaseNotes(assetNotes, skin, panelIndex, laneX, timeY);
  parts.push(noteLayers.below);
  for (const lane of lanes) {
    const boundaries = new Set(design.notes.filter(note => note.lane === lane).flatMap(note => [note.startMs, note.endMs]));
    for (const ms of boundaries) parts.push(line(laneX(lane), timeY(ms), laneX(lane) + LANE_W, timeY(ms), BG, 'stroke-width="2"'));
  }
  parts.push(noteLayers.points);
  for (const note of design.notes.filter(note => note.kind === "maintain" || note.kind === "marker" || note.count > 2)) {
    const cx = laneX(note.lane) + LANE_W / 2;
    const cy = timeY(note.startMs);
    const color = noteColor(note.count);
    parts.push(`<g data-design-note="${escapeXml(note.id)}" data-design-placeholder="true">`);
    if (note.kind === "body") parts.push(rect(cx - 14, timeY(note.endMs), 28, Math.max(2, cy - timeY(note.endMs)), `fill="none" stroke="${color}" stroke-dasharray="4 3"`));
    if (note.kind === "maintain") parts.push(`<path d="M${cx},${cy - 9} l15,9 l-15,9 l-15,-9 Z" fill="${BG}" stroke="${color}" stroke-width="2"/>`);
    else parts.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${BG}" stroke="${color}" stroke-width="2"/>`);
    parts.push("</g>");
  }

  function labels(items: Label[], x: number, anchorX: number, fontSize = 14) {
    for (const item of items) {
      parts.push(line(anchorX, y(item.at), x - 6, y(item.position) - 4, item.color, 'opacity="0.55"'));
      item.lines.forEach((value, index) => parts.push(text(x, y(item.position) + index * LINE, value, item.color, fontSize)));
    }
  }
  labels(noteLabels, notesX, notesX - 14);
  keys.forEach((key, index) => {
    const x = keysX + index * KEY_W;
    const color = KEY_COLORS[index % KEY_COLORS.length];
    for (const input of design.inputs.filter(input => inputKey(input) === inputKey(key))) {
      const bottom = timeY(input.downMs);
      const top = timeY(input.upMs ?? axis.keyTimes[axis.keyTimes.length - 1]);
      parts.push(rect(x, top, 6, Math.max(2, bottom - top), `fill="${color}" fill-opacity="0.65" rx="2"`));
      parts.push(`<circle cx="${x + 3}" cy="${bottom}" r="4" fill="${color}"/>`);
      if (input.upMs === null) parts.push(text(x + 3, top - 7, "↑", color, 18, 'text-anchor="middle"'));
      else parts.push(`<circle cx="${x + 3}" cy="${top}" r="4" fill="${BG}" stroke="${color}"/>`);
    }
    labels(inputLabels[index], x + 15, x + 6, 13);
  });
  labels(explanations, labelsX, plotRight + 8);
  parts.push(line(24, footerY - 20, width - 24, footerY - 20, "#434a64"));
  footerLines.forEach((value, index) => parts.push(text(28, footerY + index * LINE, value, MUTED, 13)));
  parts.push("</g>");
  return { content: parts.join("\n"), width, height };
}

/** 여러 설계는 읽기 쉬운 폭을 유지하도록 세로로 쌓고, 각 패널은 독립 시간 축을 쓴다. */
export function renderJudgmentCaseDesignSvg(designs: readonly JudgmentCaseDesign[], options: { skin: JudgmentCaseSkin; pxPerMs?: number }) {
  if (!designs.length) throw new Error("설계가 하나 이상 필요합니다");
  if (options.pxPerMs !== undefined && (!Number.isFinite(options.pxPerMs) || options.pxPerMs <= 0)) throw new Error("pxPerMs는 0보다 큰 숫자여야 합니다");
  const panels = designs.map((design, index) => renderPanel(design, options.skin, index, options.pxPerMs));
  const width = Math.max(...panels.map(panel => panel.width));
  const height = panels.reduce((sum, panel) => sum + panel.height, 0) + (panels.length - 1) * 24;
  let top = 0;
  const content = panels.map(panel => {
    const group = `<g transform="translate(0 ${top})">${panel.content}</g>`;
    top += panel.height + 24;
    return group;
  }).join("\n");
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" data-judgment-case-sheet="design" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${skinDefs(options.skin)}</defs>${rect(0, 0, width, height, `fill="${BG}"`)}${content}</svg>` };
}
