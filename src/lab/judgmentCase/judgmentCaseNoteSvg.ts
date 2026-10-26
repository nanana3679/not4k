/** 사례 이미지 두 모드가 공유하는 게임 에셋 렌더링. 판정·차트 모델에는 의존하지 않는다. */
import { COLORS, LANE_WIDTH as GAME_LANE_WIDTH, NOTE_HEIGHT as GAME_NOTE_HEIGHT, noteBoxTopY, playfieldPx } from "../../game/renderer/constants";
import { escapeXml } from "./judgmentCaseLayout";
import type { JudgmentCaseNoteKind, JudgmentCaseSkin, JudgmentCaseSkinSprite } from "./judgmentCaseSkin";

export const CASE_LANE_WIDTH = 80;
const LANE_W = CASE_LANE_WIDTH;
const LANE_SCALE = LANE_W / GAME_LANE_WIDTH;
export const CASE_NOTE_HEIGHT = GAME_NOTE_HEIGHT * LANE_SCALE;
const NOTE_H = CASE_NOTE_HEIGHT;
const designPx = (value: number) => playfieldPx(value) * LANE_SCALE;

/** 그릴 대상의 모양·좌표만 받는다. overlay는 point의 Grace 또는 끝 terminal의 holdOnly를 나타내는 같은 overlay 표시다. */
export interface CaseNoteDrawing {
  index: number;
  kind: JudgmentCaseNoteKind;
  shape: "point" | "body" | "terminal";
  lane: number;
  startMs: number;
  endMs?: number;
  overlay?: boolean;
  /** 호출자가 XML 이스케이프한 추적 속성. 사용자 입력을 그대로 넣지 않는다. */
  attributes: string;
}

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
function px(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 스킨 이미지 정의 — 노트는 <use href="#jc-skin-키">로 참조한다 */
export function skinDefs(skin: JudgmentCaseSkin): string {
  return Object.entries(skin.images)
    .map(([key, image]) => `<image id="jc-skin-${key}" href="${escapeXml(image!.href)}" width="${image!.width}" height="${image!.height}" preserveAspectRatio="none"/>`)
    .join("");
}

interface Box { x: number; y: number; width: number; height: number }

/** 스킨 이미지(또는 그 일부)를 상자에 늘려 그린다. flipY면 상자 안에서 상하반전(게임의 scale.y < 0) */
function skinImage(sprite: JudgmentCaseSkinSprite, box: Box, attrs: string, flipY = false): string {
  const image = `<svg ${attrs} data-skin-asset="${sprite.key}" x="${px(box.x)}" y="${px(box.y)}" width="${px(box.width)}" height="${px(box.height)}" viewBox="${sprite.x} ${sprite.y} ${sprite.width} ${sprite.height}" preserveAspectRatio="none"><use href="#jc-skin-${sprite.key}"/></svg>`;
  return flipY ? `<g transform="matrix(1 0 0 -1 0 ${px(2 * box.y + box.height)})">${image}</g>` : image;
}

/** NineSliceSprite 위아래 테두리(게임 px) — stretch 바디의 위아래 4px는 늘이지 않는다. src/game/renderer/GameNoteRenderer.ts getOrCreateBodySprite의 topHeight·bottomHeight를 따른다 */
const BODY_SLICE_PX = 4;
/** split-cap 짧은 바디에서 두 반쪽 캡 사이에 남기는 설계 px(레인 100 기준). src/game/renderer/GameNoteRenderer.ts의 WIRE_MIN_PX를 따른다 */
const WIRE_MIN_PX = 5;

/**
 * 롱노트 바디. repeat 스킨(Classic)은 게임 TilingSprite처럼 바디 폭에 맞춘 텍스처 비율 그대로 위(끝 쪽)에서부터 반복하고
 * 바디 길이에서 자른다. stretch 스킨은 위아래 4px 테두리를 두고 가운데를 늘인다.
 */
function drawBody(skin: JudgmentCaseSkin, sprite: JudgmentCaseSkinSprite, box: Box, attrs: string, tileId: string): string {
  if (box.height <= 0) return "";
  const open = `<g ${attrs} data-skin-asset="${sprite.key}">`;
  if (skin.bodyMode === "repeat") {
    const period = (sprite.height * box.width) / sprite.width;
    const tile = `<svg width="${px(box.width)}" height="${px(period)}" viewBox="${sprite.x} ${sprite.y} ${sprite.width} ${sprite.height}" preserveAspectRatio="none"><use href="#jc-skin-${sprite.key}"/></svg>`;
    return `${open}<pattern id="${tileId}" patternUnits="userSpaceOnUse" x="${px(box.x)}" y="${px(box.y)}" width="${px(box.width)}" height="${px(period)}">${tile}</pattern>`
      + `<rect x="${px(box.x)}" y="${px(box.y)}" width="${px(box.width)}" height="${px(box.height)}" fill="url(#${tileId})"/></g>`;
  }
  const border = BODY_SLICE_PX * LANE_SCALE;
  if (box.height < border * 2 || sprite.height <= BODY_SLICE_PX * 2) return `${open}${skinImage(sprite, box, "")}</g>`;
  const slice = (y: number, height: number): JudgmentCaseSkinSprite => ({ ...sprite, y: sprite.y + y, height });
  return open + [
    skinImage(slice(0, BODY_SLICE_PX), { ...box, height: border }, ""),
    skinImage(slice(BODY_SLICE_PX, sprite.height - BODY_SLICE_PX * 2), { ...box, y: box.y + border, height: box.height - border * 2 }, ""),
    skinImage(slice(sprite.height - BODY_SLICE_PX, BODY_SLICE_PX), { ...box, y: box.y + box.height - border, height: border }, ""),
  ].join("") + "</g>";
}

/**
 * Grace·holdOnly 표시. overlay 에셋이 있으면 사방 graceOverlayPaddingPx 여백을 두고 그 이미지를,
 * 없으면 게임 GameNoteRenderer의 대체 글로우(흰 둥근 사각형 4겹 + 바깥 2px 흰 윤곽)를 그린다.
 */
function graceOverlay(skin: JudgmentCaseSkin, kind: "point" | "terminal", x: number, y: number, width: number, attrs: string): string {
  const sprite = kind === "point" ? skin.pointGraceOverlay : skin.terminalGraceOverlay;
  if (sprite) {
    const pad = designPx(skin.graceOverlayPaddingPx);
    return skinImage(sprite, { x: x - pad, y: y - pad, width: width + pad * 2, height: NOTE_H + pad * 2 }, attrs);
  }
  const steps = 4;
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    const stepPad = (COLORS.GRACE_GLOW_PAD * (i + 1)) / steps;
    const pad = stepPad * LANE_SCALE;
    out.push(`<rect x="${px(x - pad)}" y="${px(y - pad)}" width="${px(LANE_W + pad * 2)}" height="${px(NOTE_H + pad * 2)}" rx="${px((playfieldPx(4) + stepPad * 0.3) * LANE_SCALE)}" fill="${hexColor(COLORS.GRACE_GLOW)}" fill-opacity="${COLORS.GRACE_GLOW_ALPHA / steps}"/>`);
  }
  const outline = COLORS.GRACE_OUTLINE_WIDTH * LANE_SCALE;
  out.push(`<rect x="${px(x - outline / 2)}" y="${px(y - outline / 2)}" width="${px(LANE_W + outline)}" height="${px(NOTE_H + outline)}" fill="none" stroke="${hexColor(COLORS.GRACE_OUTLINE)}" stroke-width="${px(outline)}"/>`);
  return `<g ${attrs} data-grace-glow="true">${out.join("")}</g>`;
}

interface NoteLayers { bodies: string[]; ends: string[]; heads: string[]; points: string[] }

/**
 * 노트 그림. 게임 GameNoteRenderer가 판정 전(대기) 노트를 그리는 에셋·배치를 따르고 판정 결과는 반영하지 않는다
 * (실패는 판정 라벨로만 보인다). 레이어는 게임과 같이 바디 < 끝 터미널 < 시작 터미널 < 포인트 순이고,
 * points(포인트 레이어)는 노트 경계선 위에 그리도록 따로 돌려준다.
 *
 * 게임과 같이 포인트·터미널 박스 가운데를 시각 선에 맞춘다(노트 가운데 기준, #224 — `noteBoxTopY`). 그래서 축 눈금이 노트 가운데를 지난다.
 * 정지 그림이므로 시작·끝 터미널을 모두 그린다(길이 0 롱노트는 full-height 스킨에서 시작 터미널 하나).
 */
export function drawCaseNotes(entries: readonly CaseNoteDrawing[], skin: JudgmentCaseSkin, panelIndex: number, laneX: (lane: number) => number, yOf: (t: number) => number): { below: string; points: string } {
  const layers: NoteLayers = { bodies: [], ends: [], heads: [], points: [] };
  const h = NOTE_H;
  const fullHeight = skin.terminalMode === "full-height";

  for (const entry of entries) {
    const { kind } = entry;
    const lx = laneX(entry.lane);
    const bodyWidth = LANE_W * skin.bodyWidthScale[kind];
    const bodyX = lx + (LANE_W - bodyWidth) / 2;
    const part = (name: string) => `${entry.attributes} data-note-part="${name}"`;

    if (entry.shape === "point") {
      const top = noteBoxTopY(yOf(entry.startMs), h);
      if (entry.overlay === true) layers.points.push(graceOverlay(skin, "point", lx, top, LANE_W, part("overlay")));
      // src/game/renderer/GameNoteRenderer.ts renderPointNote의 그림자 분기를 따른다: 싱글·더블은 pointContactShadow, trill은 pointContactShadowTrill(예전 pointShadow는 고르지 않음).
      const reach = skin.pointContactShadow;
      if (kind !== "trill" && reach && skin.contactShadow) {
        // 텍스처 윗행이 가장 짙다. 위 그림자는 뒤집어 짙은 행이 포인트 윗변에 닿게 한다.
        layers.points.push(
          skinImage(skin.contactShadow, { x: bodyX, y: top - designPx(reach.above), width: bodyWidth, height: designPx(reach.above) }, part("shadow"), true),
          skinImage(skin.contactShadow, { x: bodyX, y: top + h, width: bodyWidth, height: designPx(reach.below) }, part("shadow")),
        );
      } else if (kind === "trill" && reach && skin.contactShadowTrill) {
        layers.points.push(skinImage(skin.contactShadowTrill, { x: lx, y: top - designPx(reach.above), width: LANE_W, height: designPx(reach.above) + NOTE_H + designPx(reach.below) }, part("shadow")));
      }
      layers.points.push(skinImage(skin.point[kind], { x: lx, y: top, width: LANE_W, height: h }, part("point")));
      continue;
    }

    const startY = yOf(entry.startMs);
    const endY = yOf(entry.endMs ?? entry.startMs);
    const terminalOverlay = entry.overlay === true;
    const overhang = fullHeight ? (designPx(skin.terminalFrameOverhangPx) * bodyWidth) / LANE_W : 0;
    const terminalX = bodyX - overhang;
    const terminalWidth = bodyWidth + overhang * 2;
    const tileId = `jc-tile-${panelIndex}-${entry.index}`;

    if (entry.shape === "terminal") {
      const top = noteBoxTopY(startY, h);
      if (terminalOverlay) layers.points.push(graceOverlay(skin, "terminal", terminalX, top, terminalWidth, part("overlay")));
      layers.points.push(skinImage(skin.terminal[kind], { x: terminalX, y: top, width: terminalWidth, height: h }, part("terminal")));
      continue;
    }

    if (kind === "trill") {
      // 바디는 두 마름모 가운데(시작·끝 시각) 사이. 시작 마름모는 같은 시각의 trill 포인트가 그린다.
      layers.bodies.push(drawBody(skin, skin.body.trill, { x: bodyX, y: endY, width: bodyWidth, height: startY - endY }, part("body"), tileId));
      const terminal = fullHeight
        ? { x: terminalX, y: noteBoxTopY(endY, h), width: terminalWidth, height: h }
        : { x: lx, y: noteBoxTopY(endY, h), width: LANE_W, height: h };
      if (terminalOverlay) layers.ends.push(graceOverlay(skin, "terminal", terminalX, noteBoxTopY(endY, h), terminalWidth, part("overlay")));
      layers.ends.push(skinImage(skin.terminal.trill, terminal, part("end")));
      continue;
    }

    // long·doubleLong: 바디는 끝 터미널 윗변부터 시작 터미널 아랫변까지 채운다(터미널 아래까지 채워 접합부가 비지 않음).
    const top = noteBoxTopY(endY, h);
    const bottom = noteBoxTopY(startY, h) + h;
    layers.bodies.push(drawBody(skin, skin.body[kind], { x: bodyX, y: top, width: bodyWidth, height: bottom - top }, part("body"), tileId));
    const zeroLength = entry.endMs === entry.startMs;
    const capKind = kind === "double" ? "double" : "single";
    if (fullHeight) {
      if (!zeroLength) {
        if (terminalOverlay) layers.ends.push(graceOverlay(skin, "terminal", terminalX, top, terminalWidth, part("overlay")));
        layers.ends.push(skinImage(skin.terminal[kind], { x: terminalX, y: top, width: terminalWidth, height: h }, part("end")));
      } else if (terminalOverlay) {
        layers.heads.push(graceOverlay(skin, "terminal", terminalX, noteBoxTopY(startY, h), terminalWidth, part("overlay")));
      }
      layers.heads.push(skinImage(skin.terminal[kind], { x: terminalX, y: noteBoxTopY(startY, h), width: terminalWidth, height: h }, part("start"), true));
      continue;
    }
    // split-cap: 바디 안쪽 위·아래 끝에 반쪽 캡(최대 노트 높이의 절반, 짧은 바디는 가운데 WIRE_MIN_PX를 남긴다).
    const cap = skin.cap?.[capKind] ?? skin.terminal[kind];
    const capHeight = Math.max(0, Math.min(h / 2, (bottom - top - designPx(WIRE_MIN_PX)) / 2));
    if (terminalOverlay) layers.ends.push(graceOverlay(skin, "terminal", terminalX, top, terminalWidth, part("overlay")));
    layers.ends.push(skinImage(cap, { x: terminalX, y: top, width: terminalWidth, height: capHeight }, part("end")));
    layers.heads.push(skinImage(cap, { x: terminalX, y: bottom - capHeight, width: terminalWidth, height: capHeight }, part("start"), true));
  }
  return { below: [...layers.bodies, ...layers.ends, ...layers.heads].join(""), points: layers.points.join("") };
}
