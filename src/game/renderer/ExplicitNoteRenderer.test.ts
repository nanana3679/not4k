import { Container, Sprite, Texture, TextureSource, TilingSprite } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { buildExplicitSkinView } from "../skin/explicitSkin";
import type { ExplicitSkinTextures } from "../skin/ExplicitSkinLoader";
import { ExplicitNoteRenderer } from "./ExplicitNoteRenderer";
import { explicitRenderChart, explicitRenderSnapshot } from "./ExplicitRenderFixtures";

const chart = explicitRenderChart();
const layout = { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 20, height: 600 };
const setup = () => {
  const parent = new Container();
  const skin: ExplicitSkinTextures = { view: buildExplicitSkinView("/"), getTexture: () => Texture.WHITE };
  const renderer = new ExplicitNoteRenderer(parent, skin, layout);
  renderer.setChart(chart);
  return { parent, skin, renderer };
};
const children = (renderer: ExplicitNoteRenderer, layer: string) => renderer.root.children.find(child => child.label === `explicit-${layer}`) as Container;

describe("G1 실제 Pixi Sprite·TilingSprite 표시 경로", () => {
  it("첫 표시 후 같은 snapshot을 다시 그리면 Sprite 6개와 TilingSprite 1개를 재사용하고 탭을 가장 위에 놓는다", () => {
    const { renderer } = setup();
    const snapshot = explicitRenderSnapshot(chart);
    renderer.render(snapshot, 1000);
    expect(renderer.root.children.map(layer => layer.label)).toEqual(["explicit-body", "explicit-release", "explicit-tick", "explicit-tap"]);
    const body = children(renderer, "body").children[0];
    expect(body).toBeInstanceOf(TilingSprite);
    const originals = renderer.root.children.flatMap(layer => (layer as Container).children);
    expect(originals).toHaveLength(7);
    renderer.render(snapshot, 1100);
    expect(renderer.root.children.flatMap(layer => (layer as Container).children)).toEqual(originals);
    expect(renderer.spriteCount).toBe(7);
    expect(children(renderer, "tap").children.every(sprite => sprite instanceof Sprite)).toBe(true);
    renderer.dispose();
  });

  it("혼합 release의 본체 alpha 0.7과 Grace alpha 1은 같은 Container의 sibling으로 합성된다", () => {
    const { renderer } = setup();
    renderer.render(explicitRenderSnapshot(chart, { items: { 0: ["success", "miss"] } }));
    const [base, overlay] = children(renderer, "release").children;
    expect(base.alpha).toBe(0.7); expect(overlay.alpha).toBe(1);
    expect(base.parent).toBe(overlay.parent);
    expect(base.x - overlay.x).toBeCloseTo(24 * 62.5 / 212);
    renderer.dispose();
  });

  it("실패 snapshot을 아래로 스크롤하면 Sprite를 모두 파괴해 spriteCount 0이 되고 과거 시각 재조회는 snapshot으로 다시 그린다", () => {
    const { renderer } = setup();
    const snapshot = explicitRenderSnapshot(chart, { body: ["failed", "failed"],
      items: { 0: ["miss", "miss"], 1: ["dependentZero", "dependentZero"], 3: ["miss", "miss"] } });
    renderer.render(snapshot);
    const body = children(renderer, "body").children[0];
    renderer.render(snapshot, 8000);
    expect(renderer.spriteCount).toBe(0); expect(body.destroyed).toBe(true);
    renderer.render(snapshot, 2000);
    expect(renderer.spriteCount).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("resize로 lift·lane 폭·scroll을 바꾸면 같은 Sprite를 새 논리 위치·크기로 갱신한다", () => {
    const { renderer } = setup();
    const snapshot = explicitRenderSnapshot(chart);
    renderer.render(snapshot, 1000);
    const tap = children(renderer, "tap").children[0];
    renderer.resize({ ...layout, judgmentLineY: 300, laneAreaX: 100, laneWidth: 106, noteHeight: 20 });
    renderer.render(snapshot, 1000);
    expect(children(renderer, "tap").children[0]).toBe(tap);
    expect(tap).toMatchObject({ x: 100, y: 290, width: 106, height: 20 });
    renderer.dispose();
  });

  it("setChart와 dispose는 자신이 만든 Sprite·레이어만 정리하고 부모와 공유 texture는 보존한다", () => {
    const { renderer, parent, skin } = setup();
    renderer.render(explicitRenderSnapshot(chart));
    const textureDestroy = vi.spyOn(skin.getTexture("body.double.idle"), "destroy");
    const old = children(renderer, "body").children[0];
    renderer.setChart(chart);
    expect(old.destroyed).toBe(true); expect(renderer.spriteCount).toBe(0);
    renderer.render(explicitRenderSnapshot(chart));
    renderer.dispose(); renderer.dispose();
    expect(parent.children).toHaveLength(0); expect(parent.destroyed).toBe(false);
    expect(textureDestroy).not.toHaveBeenCalled(); textureDestroy.mockRestore();
    expect(() => renderer.render(explicitRenderSnapshot(chart))).toThrow("disposed");
    parent.destroy();
  });

  it("탭 더블 왼쪽 Miss는 tap.double.failed 원본 왼쪽 절반(frame x 0·폭 106)과 pending 원본 오른쪽 절반(x 106)을 합성하고 좌우가 바뀌면 각 원본의 crop을 따로 쓰며 dispose는 crop view만 해제한다", () => {
    const texturesById = new Map<string, Texture>();
    const getTexture = (id: string) => {
      if (!texturesById.has(id)) texturesById.set(id, new Texture({ source: new TextureSource({ width: 212, height: 40 }) }));
      return texturesById.get(id)!;
    };
    const renderer = new ExplicitNoteRenderer(new Container(), { view: buildExplicitSkinView("/"), getTexture }, layout);
    renderer.setChart(chart);
    renderer.render(explicitRenderSnapshot(chart, { items: { 3: ["miss", "pending"] } }), 1000);
    const taps = children(renderer, "tap").children as Sprite[];
    const failedSource = getTexture("tap.double.failed").source;
    const pendingSource = getTexture("tap.double.pending").source;
    expect(taps).toHaveLength(2);
    expect(taps.map(tap => tap.texture.source)).toEqual([failedSource, pendingSource]);
    expect(taps.map(tap => [tap.texture.frame.x, tap.texture.frame.width])).toEqual([[0, 106], [106, 106]]);
    expect(taps.map(tap => tap.alpha)).toEqual([1, 1]);
    expect(taps[0].x + taps[0].width).toBeCloseTo(taps[1].x);
    const crops = taps.map(tap => tap.texture);
    renderer.render(explicitRenderSnapshot(chart, { items: { 3: ["pending", "miss"] } }), 1000);
    expect(taps.map(tap => tap.texture.source)).toEqual([pendingSource, failedSource]);
    expect(taps.map(tap => tap.texture.frame.x)).toEqual([0, 106]);
    crops.push(...taps.map(tap => tap.texture));
    renderer.render(explicitRenderSnapshot(chart, { items: { 3: ["miss", "success"] } }), 1000);
    expect(taps.map(tap => tap.alpha)).toEqual([0.7, 0.7]);
    expect(taps.map(tap => tap.texture)).toEqual(crops.slice(0, 2));
    renderer.dispose();
    expect(crops.every(texture => texture.destroyed)).toBe(true);
    expect([failedSource, pendingSource].every(source => !source.destroyed)).toBe(true);
  });
});
