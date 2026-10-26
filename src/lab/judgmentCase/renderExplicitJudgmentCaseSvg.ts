import { getExplicitSkinAsset } from "../../game/skin/explicitSkin";
import type { ExplicitSkinAssetId } from "../../game/skin/explicitSkin";
import type { ExplicitChartCase, ExplicitCaseNote } from "./explicitChartCase";
import type { ExplicitCaseSkin } from "./explicitCaseSkin";
import type { ExplicitCaseRun } from "./runExplicitJudgmentCase";
import { explicitCaseDisplayLine, explicitCaseLabels } from "./runExplicitJudgmentCase";
import { createAutoCaseTimeAxis, createCaseTimeAxis, escapeXml, formatMs, resolveLabelPositions, wrapText } from "./judgmentCaseLayout";

export interface ExplicitCasePanel {
  readonly judgmentCase: ExplicitChartCase;
  readonly run: ExplicitCaseRun;
  readonly engineLabel: string;
  readonly enginePath?: string;
}

export function explicitCaseWindows(example: ExplicitChartCase, run: ExplicitCaseRun) {
  return example.notes.flatMap(entry => entry.note.type === "point" || entry.note.type === "release"
    ? [{ noteIndex: entry.index, startMs: entry.startMs - run.defaults.windows.GOOD,
      endMs: entry.startMs + run.defaults.windows.GOOD, label: `${entry.id} ${entry.note.type} Good` }] : []);
}

const SCALE = 100 / 212;
const FONT = "'Noto Sans CJK KR','Noto Sans KR',sans-serif";
const text = (x: number, y: number, value: string, fill = "#e6e8f2", size = 13) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}">${escapeXml(value)}</text>`;

function drawNote(entry: ExplicitCaseNote, x: number, y: (at: number) => number, skin: ExplicitCaseSkin, prefix: string): string {
  const note = entry.note;
  const image = (id: ExplicitSkinAssetId) => {
    const asset = getExplicitSkinAsset(skin.view, id);
    const width = asset.logicalSize.width * SCALE;
    const height = asset.logicalSize.height * SCALE;
    return `<use data-explicit-asset="${id}" href="#explicit-${id}" x="${x - width * asset.anchor.x}" y="${y(entry.startMs) - height * asset.anchor.y}" width="${width}" height="${height}"/>`;
  };
  let drawing: string;
  if (note.type === "body") {
    const id = `body.${note.trill ? "trill" : note.holdCount === 2 ? "double" : "single"}.idle` as ExplicitSkinAssetId;
    const asset = getExplicitSkinAsset(skin.view, id);
    const width = asset.logicalSize.width * SCALE;
    const tileHeight = asset.logicalSize.height * SCALE;
    const boundaryTop = y(entry.endMs!);
    const boundaryHeight = y(entry.startMs) - boundaryTop;
    // 게임 ExplicitNotePresenter처럼 길이 0 바디도 사라지지 않게 타일 한 장(노트 한 칸) 높이를 최소로 하고
    // 실제 경계의 가운데에 맞춘다. 타일보다 긴 바디는 실제 경계 그대로 그린다.
    const height = Math.max(tileHeight, boundaryHeight);
    const top = boundaryHeight >= tileHeight ? boundaryTop : boundaryTop + (boundaryHeight - tileHeight) / 2;
    const patternId = `${prefix}-body-${entry.index}`;
    drawing = `<pattern id="${patternId}" patternUnits="userSpaceOnUse" x="${x - width / 2}" y="${top}" width="${width}" height="${tileHeight}"><use href="#explicit-${id}" width="${width}" height="${tileHeight}"/></pattern>`
      + `<rect data-explicit-asset="${id}" data-body-cap="none" x="${x - width / 2}" y="${top}" width="${width}" height="${height}" fill="url(#${patternId})"/>`;
  } else if (note.type === "sustain") {
    drawing = note.count === 2 ? image("sustain.double.pending.left") + image("sustain.double.pending.right") : image("sustain.single.pending");
  } else {
    const variant = note.type === "point" ? note.kind : note.count === 2 ? "double" : "single";
    drawing = image(`${note.type}.${variant}.pending` as ExplicitSkinAssetId);
    if (note.grace) drawing += image(`graceOverlay.${note.type === "release" ? "release" : note.kind === "trill" ? "trill" : "point"}.overlay`);
  }
  return `<g data-note="${entry.id}" data-note-kind="${note.type}">${drawing}</g>`;
}

/** 실제 세션만 받는다. 제목·설명 본문은 stdout에 두고 PNG에는 구조·입력·사실 라벨을 그린다. */
export function renderExplicitJudgmentCaseSvg(panels: readonly ExplicitCasePanel[], options: { skin: ExplicitCaseSkin; pxPerMs?: number }) {
  if (panels.length === 0) throw new Error("explicit 패널이 없습니다");
  const { skin } = options;
  const layouts = panels.map((panel, panelIndex) => {
    const example = panel.judgmentCase;
    const labels = explicitCaseLabels(example, panel.run);
    const windows = explicitCaseWindows(example, panel.run);
    const times = [...example.notes.flatMap(note => [note.startMs, ...(note.endMs === undefined ? [] : [note.endMs])]),
      ...example.actions.map(action => action.atMs), ...labels.map(label => label.atMs),
      ...windows.flatMap(window => [window.startMs, window.endMs]), ...example.trillZones.flatMap(zone => [zone.startMs, zone.endMs])];
    const axis = options.pxPerMs === undefined ? createAutoCaseTimeAxis(times) : createCaseTimeAxis(times, options.pxPerMs);
    const lanes = [...new Set(example.notes.map(note => note.note.lane).concat(example.inputs.map(input => input.lane)))].sort((a, b) => a - b);
    if (lanes.length === 0) lanes.push(1);
    const keys = [...new Set(example.inputs.map(input => `${input.lane}:${input.key}`))];
    const laneX = (lane: number) => 120 + lanes.indexOf(lane) * 110;
    const noteX = 180 + lanes.length * 110;
    const keyX = noteX + 230;
    const factX = keyX + Math.max(1, keys.length) * 62 + 30;
    const width = Math.max(1000, factX + 420);
    const pad = Math.max(60, labels.length * 10, example.notes.length * 10);
    const plotTop = 64 + pad;
    const plotBottom = plotTop + axis.height;
    const y = (at: number) => plotBottom - axis.offsetOf(at);
    const chunks = [text(24, 28, `explicit · ${panel.run.result ? "실제 엔진 실행" : "실행 거부(세션 미생성)"} · classic-explicit`, "#93d9df", 16),
      text(24, 50, `패널 ${panelIndex + 1} · 엔진 기본 Good ±${panel.run.defaults.windows.GOOD}ms · 프레임 ${panel.run.frameMs}ms`),
      text(noteX, 78, "노트 이름 / 종류 / 실제 경계"), text(keyX, 78, "물리 입력"), text(factX, 78, "실제 확정 사실")];
    for (const lane of lanes) {
      chunks.push(`<rect x="${laneX(lane) - 53}" y="${plotTop - 25}" width="106" height="${axis.height + 50}" fill="#191c2c"/>`, text(laneX(lane) - 10, 102, `L${lane}`));
    }
    for (const at of axis.keyTimes) chunks.push(`<line x1="70" x2="${factX - 15}" y1="${y(at)}" y2="${y(at)}" stroke="#404355" stroke-dasharray="2 6"/>`, text(14, y(at) + 4, formatMs(at), "#acb3c7", 11));
    for (const gap of axis.compressed) chunks.push(text(65, (y(gap.startMs) + y(gap.endMs)) / 2, "≈", "#acb3c7", 18));
    for (const zone of example.trillZones) chunks.push(`<rect x="${laneX(zone.lane) - 52}" y="${y(zone.endMs)}" width="104" height="${y(zone.startMs) - y(zone.endMs)}" fill="#c5c3e5" opacity="0.12"/>`);
    for (const window of windows) {
      const entry = example.notes.find(note => note.index === window.noteIndex)!;
      chunks.push(`<rect data-window="${window.label}" x="${laneX(entry.note.lane) - 55}" y="${y(window.endMs)}" width="110" height="${y(window.startMs) - y(window.endMs)}" fill="#70c4e7" fill-opacity="0.08" stroke="#70c4e7" stroke-opacity="0.4" stroke-dasharray="3 4"/>`);
    }
    for (const entry of [...example.notes].sort((a, b) => Number(b.note.type === "body") - Number(a.note.type === "body"))) chunks.push(drawNote(entry, laneX(entry.note.lane), y, skin, `p${panelIndex}`));
    const notePositions = resolveLabelPositions(example.notes.map(note => y(note.startMs)), 21);
    example.notes.forEach((entry, index) => {
      const count = entry.note.type === "body" ? entry.note.holdCount : entry.note.type === "point" ? (entry.note.kind === "double" ? 2 : 1) : entry.note.count;
      chunks.push(`<path d="M${laneX(entry.note.lane) + 50} ${y(entry.startMs)} L${noteX - 8} ${notePositions[index]}" stroke="#888fa8" fill="none"/>`,
        text(noteX, notePositions[index] + 4, `${entry.id} ${entry.note.type} ×${count} ${formatMs(entry.startMs)}${entry.endMs === undefined ? "" : `～${formatMs(entry.endMs)}`}`));
    });
    keys.forEach((key, index) => {
      const x = keyX + index * 62;
      const input = example.inputs.find(input => `${input.lane}:${input.key}` === key)!;
      chunks.push(text(x - 5, 104, `L${input.lane}:${input.label}`, "#ffa966"));
      for (const segment of example.inputs.filter(input => `${input.lane}:${input.key}` === key)) {
        const top = segment.upMs === null ? plotTop : y(segment.upMs);
        chunks.push(`<rect x="${x}" y="${top}" width="10" height="${Math.max(1, y(segment.downMs) - top)}" fill="#ffa966" opacity="0.75"/>`,
          text(x + 13, y(segment.downMs) + 4, `↓${formatMs(segment.downMs)}`, "#ffc195", 10));
        if (segment.upMs !== null) chunks.push(text(x + 13, y(segment.upMs) - 4, `↑${formatMs(segment.upMs)}`, "#ffc195", 10));
      }
    });
    const positions = resolveLabelPositions(labels.map(label => y(label.atMs)), 21);
    labels.forEach((label, index) => chunks.push(`<path d="M${factX - 16} ${y(label.atMs)} L${factX - 5} ${positions[index]}" stroke="#70758b" fill="none"/>`, text(factX, positions[index] + 4, label.text, label.failure ? "#ff8888" : "#a9edcc")));
    const score = panel.run.result?.score;
    const foot = [
      score ? `점수 ${score.earnedScore}/${score.finalDenominatorWeight} · 점수 항목 ${panel.run.compiled!.totalJudgments} · 바디 가중치 0 · 현재 콤보 ${panel.run.result!.combo}` : "점수·분모·콤보 계산 불가(세션 미생성)",
      `${!panel.run.finalized ? "판정 불가(finalize 전)" : score?.isFullCombo ? "Full Combo" : "Full Combo 아님"} · 미정산 ${panel.run.result?.snapshot.items.filter(item => item.settlementFactId === null).length ?? "계산 불가"} · 종속 0점 ${panel.run.result?.snapshot.items.filter(item => item.state === "dependentZero").length ?? "계산 불가"}`,
      "노트는 대기 도안 · body cap/자동 끝점 없음 · sustain 독립 창 없음 · 점선 띠: 엔진 기본 Good 창",
      ...panel.run.displays.map(display => explicitCaseDisplayLine(example, display)),
      ...panel.run.validationErrors.map(issue => `검증 오류 ${issue.rule}: ${issue.message}`),
      ...(panel.run.error ? [`엔진 예외: ${panel.run.error.message}`] : []), panel.engineLabel, panel.enginePath ?? "",
    ].flatMap(line => wrapText(line, width - 48, 12));
    const footerTop = plotBottom + pad + 26;
    foot.forEach((line, index) => chunks.push(text(24, footerTop + index * 19, line, "#b9bed0", 12)));
    return { width, height: Math.ceil(footerTop + foot.length * 19 + 24), chunks };
  });
  const width = Math.ceil(Math.max(...layouts.map(layout => layout.width)));
  const height = Math.ceil(layouts.reduce((sum, layout) => sum + layout.height, 0));
  const defs = Object.keys(skin.images).map(id => {
    const asset = getExplicitSkinAsset(skin.view, id);
    return `<symbol id="explicit-${id}" viewBox="0 0 ${asset.pixelSize.width} ${asset.pixelSize.height}"><image width="${asset.pixelSize.width}" height="${asset.pixelSize.height}" href="${escapeXml(skin.images[asset.id]!.href)}"/></symbol>`;
  }).join("");
  let offset = 0;
  const body = layouts.map(layout => { const group = `<g transform="translate(0 ${offset})">${layout.chunks.join("")}</g>`; offset += layout.height; return group; }).join("");
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" data-judgment-case-sheet="explicit" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><defs>${defs}</defs><rect width="100%" height="100%" fill="#11121b"/>${body}</svg>` };
}
