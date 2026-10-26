import type { ExplicitCompiledBody, ExplicitCompiledChart, ExplicitScoreItem } from "../judgment/explicitCompiledChart";
import type { ExplicitBodyUnitSnapshot, ExplicitItemSnapshot, ExplicitJudgmentSnapshot } from "../judgment/ExplicitJudgmentState";
import { getExplicitSkinAsset } from "../skin/explicitSkin";
import type { ExplicitSkinAssetId, ExplicitSkinView } from "../skin/explicitSkin";
import { LANE_WIDTH, NOTE_HEIGHT } from "./constants";

export interface ExplicitRenderLayout {
  readonly judgmentLineY: number;
  /** 기존 게임과 같은 논리 px/초. 배속·visual offset은 호출자가 visualTimeMs에 반영한다. */
  readonly scrollSpeed: number;
  readonly laneAreaX: number;
  readonly height: number;
  readonly laneWidth?: number;
  readonly noteHeight?: number;
}

export interface ExplicitPresentedLayer {
  readonly key: string;
  readonly assetId: ExplicitSkinAssetId;
  readonly ordinal: number | null;
  readonly layer: "body" | "release" | "sustain" | "point";
  readonly overlay: boolean;
  /** 승인된 더블 Point의 전체 pending/failed 도안에서 필요한 절반만 합성한다. */
  readonly crop?: "left" | "right";
  readonly visible: boolean;
  readonly inViewport: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly laneScaleX: number;
  readonly laneScaleY: number;
}

export interface ExplicitPresentedNote {
  readonly sourceNoteIndex: number;
  readonly kind: "body" | ExplicitScoreItem["kind"];
  readonly ordinals: readonly number[];
  readonly bodyAlpha: number;
  readonly overlayAlpha: number;
  readonly layers: readonly ExplicitPresentedLayer[];
}

type SourceGroup = { kind: "body"; body: ExplicitCompiledBody }
  | { kind: ExplicitScoreItem["kind"]; items: readonly ExplicitScoreItem[] };
const side = (ordinal: number) => ordinal === 0 ? "left" : "right";
const isFailedItem = (item: ExplicitItemSnapshot) => item.state === "miss" || item.state === "dependentZero";

/** 컴파일된 배치와 공개 상태만 읽는다. 키·입력 창·연결 hold 추론·효과 이력은 받지 않는다. */
export class ExplicitNotePresenter {
  private readonly groupsByNote = new Map<number, SourceGroup>();

  constructor(readonly chart: ExplicitCompiledChart, readonly skin: ExplicitSkinView) {
    if (chart.format !== "explicit") throw new Error("ExplicitNotePresenter requires an explicit compiled chart");
    for (const body of chart.bodies) this.groupsByNote.set(body.source.noteIndex, { kind: "body", body });
    const itemsByNote = new Map<number, ExplicitScoreItem[]>();
    for (const item of chart.scoreItems) {
      const group = itemsByNote.get(item.source.noteIndex) ?? [];
      group.push(item);
      itemsByNote.set(item.source.noteIndex, group);
    }
    for (const [index, items] of itemsByNote) {
      if (this.groupsByNote.has(index)) throw new Error(`중복된 명시 source: ${index}`);
      items.sort((a, b) => a.ordinal - b.ordinal);
      this.groupsByNote.set(index, { kind: items[0].kind, items });
    }
  }

  present(snapshot: ExplicitJudgmentSnapshot, layout: ExplicitRenderLayout, visualTimeMs = snapshot.atMs): readonly ExplicitPresentedNote[] {
    const bodyById = new Map(snapshot.bodyUnits.map(unit => [unit.id, unit]));
    const itemById = new Map(snapshot.items.map(item => [item.id, item]));
    const laneWidth = layout.laneWidth ?? LANE_WIDTH;
    const noteHeight = layout.noteHeight ?? NOTE_HEIGHT;
    const scaleX = laneWidth / this.skin.body.laneReferenceWidth;
    const scaleY = noteHeight / this.skin.body.tileSize.height;
    const timeY = (at: number) => layout.judgmentLineY - (at - visualTimeMs) * layout.scrollSpeed / 1000;
    const sprite = (index: number, lane: number, at: number, assetId: string, layer: ExplicitPresentedLayer["layer"],
      alpha: number, visible: boolean, ordinal: number | null = null, overlay = false,
      bodyGeometry?: { y: number; height: number }): ExplicitPresentedLayer => {
      const asset = getExplicitSkinAsset(this.skin, assetId);
      const width = asset.logicalSize.width * scaleX;
      const height = bodyGeometry?.height ?? asset.logicalSize.height * scaleY;
      const y = bodyGeometry?.y ?? timeY(at) - height * asset.anchor.y;
      const x = layout.laneAreaX + (lane - 0.5) * laneWidth - width * asset.anchor.x;
      return { key: `${index}:${overlay ? "overlay" : layer}:${ordinal ?? "whole"}`, assetId: asset.id,
        ordinal, layer, overlay, visible, inViewport: y + height >= 0 && y <= layout.height,
        x, y, width, height, alpha, laneScaleX: scaleX, laneScaleY: scaleY };
    };
    const required = <T>(value: T | undefined, id: string): T => {
      if (!value) throw new Error(`공개 snapshot에 명시 상태가 없습니다: ${id}`);
      return value;
    };
    return [...this.groupsByNote].sort(([a], [b]) => a - b).map(([index, group]) => {
      if (group.kind === "body" && "body" in group) {
        const body = group.body;
        const units = [...body.units].sort((a, b) => a.ref.ordinal - b.ref.ordinal).map(unit => {
          const state = required(bodyById.get(unit.id), unit.id);
          if (state.ref.bodyIndex !== index || state.ref.ordinal !== unit.ref.ordinal) throw new Error(`바디 원본 참조 불일치: ${unit.id}`);
          return state;
        });
        const complete = units.filter(unit => unit.state === "complete").length;
        const failed = units.filter(unit => unit.state === "failed");
        const fulfilled = units.filter(unit => unit.state === "active" || unit.state === "complete");
        const variant = body.trill ? "trill" : body.holdCount === 2 ? "double" : "single";
        let state = "idle";
        let suffix = "";
        if (failed.length === units.length) state = "failed";
        else if (failed.length) { state = "partialFailed"; suffix = `.${side(failed[0].ref.ordinal)}`; }
        else if (fulfilled.length === units.length) state = "held";
        else if (variant === "double" && fulfilled.length) {
          state = "partialHeld";
          suffix = `.${side(units.find(unit => unit.state !== "active" && unit.state !== "complete")!.ref.ordinal)}`;
        }
        else if (fulfilled.length) state = "held";
        const alpha = complete > 0 && complete < units.length ? 0.7 : 1;
        const rawBottom = timeY(body.startMs) + noteHeight / 2;
        // 실제 시작해 유지·회복 중인 몫이 하나라도 남으면 판정선에 붙인다. 더블 한 몫이 실패해도 남은 몫을 잡고 있는 동안
        // 바디가 원래 위치로 튀지 않는다(실패한 절반은 부분 실패 도안). 남은 몫이 없을 때만 원래 배치를 끝까지 스크롤한다.
        const pinned = units.some((unit: ExplicitBodyUnitSnapshot) => unit.actualStartMs !== null
          && (unit.state === "active" || unit.state === "recovering"));
        const bottom = pinned ? layout.judgmentLineY + noteHeight / 2 : rawBottom;
        const top = timeY(body.endMs) - noteHeight / 2;
        const geometry = { y: Math.min(top, bottom - noteHeight), height: Math.max(noteHeight, bottom - top) };
        return { sourceNoteIndex: index, kind: "body", ordinals: units.map(unit => unit.ref.ordinal),
          bodyAlpha: alpha, overlayAlpha: 0, layers: [sprite(index, body.lane, body.startMs,
            `body.${variant}.${state}${suffix}`, "body", alpha, complete !== units.length, null, false, geometry)] };
      }
      if (!("items" in group)) throw new Error(`점수 항목이 없습니다: ${index}`);
      const first = group.items[0];
      const items = group.items.map(item => {
        const state = required(itemById.get(item.id), item.id);
        if (state.sourceNoteIndex !== index || state.ordinal !== item.ordinal || state.kind !== item.kind) {
          throw new Error(`점수 원본 참조 불일치: ${item.id}`);
        }
        return state;
      });
      const success = items.filter(item => item.state === "success").length;
      const failed = items.filter(isFailedItem);
      let alpha = success > 0 && success < items.length ? 0.7 : 1;
      const visible = success !== items.length;
      const layers: ExplicitPresentedLayer[] = [];
      let overlayAlpha = 0;
      if (first.kind === "sustain") {
        alpha = 1;
        for (const item of items) layers.push(sprite(index, first.lane, first.timeMs,
          `sustain.${items.length === 2 ? "double" : "single"}.${isFailedItem(item) ? "failed" : "pending"}${items.length === 2 ? `.${side(item.ordinal)}` : ""}`,
          "sustain", 1, item.state !== "success", item.ordinal));
      } else {
        let id: string;
        if (first.kind === "release") {
          const state = failed.length === items.length ? "failed" : failed.length ? `partialFailed.${side(failed[0].ordinal)}` : "pending";
          id = `release.${items.length === 2 ? "double" : "single"}.${state}`;
        } else {
          // 싱글 Miss의 기존 수명은 유지하고 더블은 몫별 실패색과 성공 alpha를 독립 합성한다.
          id = `point.${first.pointKind}.${first.pointKind !== "single" && failed.length === items.length ? "failed" : "pending"}`;
        }
        if (first.kind === "point" && first.pointKind === "double" && failed.length === 1) {
          for (const item of items) {
            const half = side(item.ordinal);
            const full = sprite(index, first.lane, first.timeMs,
              `point.double.${isFailedItem(item) ? "failed" : "pending"}`, "point", alpha, visible, item.ordinal);
            layers.push({ ...full, crop: half, width: full.width / 2, x: full.x + (half === "right" ? full.width / 2 : 0) });
          }
        } else layers.push(sprite(index, first.lane, first.timeMs, id, first.kind, alpha, visible));
        if (first.grace) {
          // Point Grace는 기존처럼 Miss 뒤 외곽을 숨긴다. release Grace는 실패 중에도 흰 외곽을 유지한다.
          const overlayVisible = visible && (first.kind === "release" || failed.length === 0);
          overlayAlpha = overlayVisible ? 1 : 0;
          const variant = first.kind === "release" ? "release" : first.pointKind === "trill" ? "trill" : "point";
          layers.push(sprite(index, first.lane, first.timeMs, `graceOverlay.${variant}.overlay`, first.kind, 1, overlayVisible, null, true));
        }
      }
      return { sourceNoteIndex: index, kind: first.kind, ordinals: items.map(item => item.ordinal),
        bodyAlpha: alpha, overlayAlpha, layers };
    });
  }
}
