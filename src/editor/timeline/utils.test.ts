import { describe, it, expect } from "vitest";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { destroyChildren } from "./utils";

/** 사각형 하나를 채운 Graphics를 n개 만들어 container에 추가한다 (타임라인 레인 배경·구간 밴드와 같은 형태). */
function addFilledGraphics(container: Container, n: number): Graphics[] {
  return Array.from({ length: n }, () => {
    const g = new Graphics();
    g.rect(0, 0, 10, 10);
    g.fill(0xffffff);
    container.addChild(g);
    return g;
  });
}

describe("destroyChildren", () => {
  it("Graphics 자식 4개인 Container에 destroyChildren을 호출하면 4개 모두 destroyed=true가 되고 자식 수는 0", () => {
    const layer = new Container();
    const children = addFilledGraphics(layer, 4);

    destroyChildren(layer);

    expect(children.map((c) => c.destroyed)).toEqual([true, true, true, true]);
    expect(layer.children.length).toBe(0);
  });

  it("Graphics 자식 4개에 destroyChildren을 호출하면 각자 소유한 GraphicsContext 4개도 모두 destroyed=true", () => {
    const layer = new Container();
    const contexts = addFilledGraphics(layer, 4).map((g) => g.context);

    destroyChildren(layer);

    expect(contexts.map((ctx) => ctx.destroyed)).toEqual([true, true, true, true]);
  });

  it("Text 자식 3개가 TextStyle 하나를 공유할 때 destroyChildren을 호출하면 Text 3개는 destroyed=true이고 TextStyle의 fill 0x999999는 유지", () => {
    // 마디 번호 라벨(measureLabels)처럼 렌더러가 소유한 TextStyle을 여러 Text가 공유한다.
    const style = new TextStyle({ fontSize: 11, fill: 0x999999, fontFamily: "monospace" });
    const layer = new Container();
    const labels = ["1", "2", "3"].map((text) => layer.addChild(new Text({ text, style })));

    destroyChildren(layer);

    expect(labels.map((t) => t.destroyed)).toEqual([true, true, true]);
    expect(style.fill).toBe(0x999999);
  });

  it("자식 0개인 Container에 destroyChildren을 호출해도 예외 없이 자식 수 0 유지", () => {
    const layer = new Container();

    expect(() => destroyChildren(layer)).not.toThrow();
    expect(layer.children.length).toBe(0);
  });
});
