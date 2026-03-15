/**
 * JudgmentUI — 판정 등급 텍스트 / FAST·SLOW / 타이밍 차이 표시를 담당한다.
 *
 * GameRenderer가 소유하고 renderFrame() 내에서 updateFade()를 호출한다.
 */

import { Container, Text, TextStyle } from "pixi.js";
import { JudgmentGrade, JUDGMENT_WINDOWS } from "../../shared";
import { COLORS } from "./constants";
import { formatTimingDiff } from "./formatTimingDiff";

export class JudgmentUI {
  private judgmentText: Text;
  private fastSlowText: Text;
  private timingDiffText: Text;

  private judgmentTimer: number = 0;
  private showFastSlow: boolean = true;
  private showTimingDiff: boolean = false;
  private perfectWindow: number = JUDGMENT_WINDOWS.PERFECT;

  constructor(uiLayer: Container, judgmentLineY: number, width: number) {

    const judgmentStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 36,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.judgmentText = new Text({ text: "", style: judgmentStyle });
    this.judgmentText.anchor.set(0.5, 0.5);
    this.judgmentText.x = width / 2;
    this.judgmentText.y = judgmentLineY - 45;
    this.judgmentText.alpha = 0;

    const fastSlowStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.fastSlowText = new Text({ text: "", style: fastSlowStyle });
    this.fastSlowText.anchor.set(0.5, 0.5);
    this.fastSlowText.x = width / 2;
    this.fastSlowText.y = judgmentLineY - 15;
    this.fastSlowText.alpha = 0;

    const timingDiffStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 22,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.timingDiffText = new Text({ text: "", style: timingDiffStyle });
    this.timingDiffText.anchor.set(0.5, 0.5);
    this.timingDiffText.x = width / 2;
    this.timingDiffText.y = judgmentLineY - 68;
    this.timingDiffText.alpha = 0;

    uiLayer.addChild(this.judgmentText);
    uiLayer.addChild(this.fastSlowText);
    uiLayer.addChild(this.timingDiffText);
  }

  showJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    this.judgmentTimer = 500; // 500ms fade duration

    const gradeText = grade === "goodTrill" ? "GOOD◇" : grade.toUpperCase();
    this.judgmentText.text = gradeText;

    const color = this.getJudgmentColor(grade);
    this.judgmentText.style.fill = color;
    this.judgmentText.alpha = 1;

    // FAST/SLOW 표시 (Perfect 윈도우 내측 절반에서는 숨김)
    const fastSlowThreshold = this.perfectWindow / 2;
    if (
      this.showFastSlow &&
      deltaMs != null &&
      grade !== "miss" &&
      Math.abs(deltaMs) > fastSlowThreshold
    ) {
      if (deltaMs < 0) {
        this.fastSlowText.text = "FAST";
        this.fastSlowText.style.fill = COLORS.FAST_TEXT;
        this.fastSlowText.alpha = 1;
      } else if (deltaMs > 0) {
        this.fastSlowText.text = "SLOW";
        this.fastSlowText.style.fill = COLORS.SLOW_TEXT;
        this.fastSlowText.alpha = 1;
      } else {
        this.fastSlowText.text = "";
        this.fastSlowText.alpha = 0;
      }
    } else {
      this.fastSlowText.text = "";
      this.fastSlowText.alpha = 0;
    }

    // 타이밍 차이 표시
    const timingDiffStr = this.showTimingDiff
      ? formatTimingDiff(deltaMs, grade === "miss")
      : null;
    if (timingDiffStr) {
      this.timingDiffText.text = timingDiffStr;
      this.timingDiffText.alpha = 1;
    } else {
      this.timingDiffText.text = "";
      this.timingDiffText.alpha = 0;
    }
  }

  /** renderFrame()에서 매 프레임 호출 — 판정 텍스트 페이드 처리 */
  updateFade(deltaMs: number): void {
    if (this.judgmentTimer > 0) {
      this.judgmentTimer -= deltaMs;
      const alpha = Math.max(0, this.judgmentTimer / 500);
      this.judgmentText.alpha = alpha;
      this.fastSlowText.alpha = alpha;
      this.timingDiffText.alpha = alpha;
    }
  }

  setShowFastSlow(value: boolean): void {
    this.showFastSlow = value;
  }

  setShowTimingDiff(value: boolean): void {
    this.showTimingDiff = value;
  }

  setPerfectWindow(windowMs: number): void {
    this.perfectWindow = windowMs;
  }

  setPosition(judgmentLineY: number): void {
    this.judgmentText.y = judgmentLineY - 45;
    this.fastSlowText.y = judgmentLineY - 15;
    this.timingDiffText.y = judgmentLineY - 68;
  }

  private getJudgmentColor(grade: JudgmentGrade): number {
    switch (grade) {
      case "perfect":
        return COLORS.JUDGMENT_PERFECT;
      case "great":
        return COLORS.JUDGMENT_GREAT;
      case "good":
      case "goodTrill":
        return COLORS.JUDGMENT_GOOD;
      case "bad":
        return COLORS.JUDGMENT_BAD;
      case "miss":
        return COLORS.JUDGMENT_MISS;
      default:
        return COLORS.COMBO_TEXT;
    }
  }

  dispose(): void {
    this.judgmentText.destroy();
    this.fastSlowText.destroy();
    this.timingDiffText.destroy();
  }
}
