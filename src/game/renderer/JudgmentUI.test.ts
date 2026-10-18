import { describe, expect, it, vi } from "vitest";

// supabase mock — shared barrel에서 useAuth 재export 시 supabase client 초기화 방지
vi.mock("../../supabase/client", () => ({
  supabase: {},
}));

// PixiJS mock — JudgmentUI가 쓰는 Container·Text·TextStyle만 모킹
vi.mock("pixi.js", () => {
  class Container {
    children: unknown[] = [];
    addChild(...children: unknown[]) {
      this.children.push(...children);
    }
  }
  class TextStyle {
    fill: unknown;
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options);
    }
  }
  class Text {
    text: string;
    style: TextStyle;
    alpha = 1;
    x = 0;
    y = 0;
    anchor = { set() {} };
    constructor(options: { text: string; style: TextStyle }) {
      this.text = options.text;
      this.style = options.style;
    }
    destroy() {}
  }
  return { Container, Text, TextStyle };
});

import { Container } from "pixi.js";
import { JudgmentUI } from "./JudgmentUI";

interface MockText {
  text: string;
  alpha: number;
}

function createJudgmentUI() {
  const layer = new Container();
  const ui = new JudgmentUI(layer, 280, 400, 360);
  const [judgmentText, fastSlowText, timingDiffText] =
    (layer as unknown as { children: MockText[] }).children;
  return { ui, judgmentText, fastSlowText, timingDiffText };
}

describe("JudgmentUI 재사용 초기화", () => {
  it("PERFECT 판정을 띄운 직후 reset하면 판정 텍스트가 비고 alpha 0이 된다", () => {
    const { ui, judgmentText } = createJudgmentUI();
    ui.showJudgment("perfect", 0);
    expect(judgmentText).toMatchObject({ text: "PERFECT", alpha: 1 });

    ui.reset();

    expect(judgmentText).toMatchObject({ text: "", alpha: 0 });
  });

  it("FAST(-30ms)와 타이밍 차이를 띄운 뒤 reset하면 세 텍스트가 모두 비고 다음 updateFade(16)에도 다시 나타나지 않는다", () => {
    const { ui, judgmentText, fastSlowText, timingDiffText } = createJudgmentUI();
    ui.setShowTimingDiff(true);
    ui.showJudgment("great", -30);
    expect(fastSlowText).toMatchObject({ text: "FAST", alpha: 1 });
    expect(timingDiffText.alpha).toBe(1);

    ui.reset();
    ui.updateFade(16);

    for (const text of [judgmentText, fastSlowText, timingDiffText]) {
      expect(text).toMatchObject({ text: "", alpha: 0 });
    }
  });
});

describe("JudgmentUI 플레이필드 배율 (RFD 0029, ×0.625)", () => {
  function createAt(judgmentLineY: number) {
    const layer = new Container();
    const ui = new JudgmentUI(layer, judgmentLineY, 1067, 600);
    const [judgmentText, fastSlowText, timingDiffText] =
      (layer as unknown as { children: { y: number; style: { fontSize: number } }[] }).children;
    return { ui, judgmentText, fastSlowText, timingDiffText };
  }

  it("판정선 y 416에서 판정 글자 22.5px는 75 위(341), FAST/SLOW 12.5px는 53.125 위, 타이밍 차이 13.75px는 90.625 위에 놓인다", () => {
    const { judgmentText, fastSlowText, timingDiffText } = createAt(416);
    expect([judgmentText.y, fastSlowText.y, timingDiffText.y]).toEqual([341, 362.875, 325.375]);
    expect([judgmentText.style.fontSize, fastSlowText.style.fontSize, timingDiffText.style.fontSize]).toEqual([22.5, 12.5, 13.75]);
  });

  it("리프트로 판정선이 y 392(4%)로 오르면 setPosition이 세 글자를 같은 간격으로 함께 올린다", () => {
    const { ui, judgmentText, fastSlowText, timingDiffText } = createAt(416);
    ui.setPosition(392);
    expect([judgmentText.y, fastSlowText.y, timingDiffText.y]).toEqual([317, 338.875, 301.375]);
  });
});
