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
