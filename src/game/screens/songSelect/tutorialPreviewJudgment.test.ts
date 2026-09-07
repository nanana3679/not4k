import { describe, expect, it, vi } from 'vitest';
import { JudgmentGrade } from '../../../shared';
import type { JudgmentResult } from '../../judgment/JudgmentEngine';
import { TUTORIAL_PREVIEWS, getTutorialInputTimings } from './tutorialPreviewChart';
import { createTutorialPreviewJudgmentController } from './tutorialPreviewJudgment';

describe('tutorialPreviewJudgment', () => {
  it('트릴 튜토리얼은 기존 JudgmentEngine으로 [a a a a] 같은키 구간을 GOOD◇로 판정', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'trill-note');
    if (!preview) {
      throw new Error('trill-note 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs);

    expect(judgments.map((result) => result.grade)).toEqual([
      JudgmentGrade.PERFECT,
      JudgmentGrade.PERFECT,
      JudgmentGrade.PERFECT,
      JudgmentGrade.PERFECT,
      JudgmentGrade.PERFECT,
      JudgmentGrade.GOOD_TRILL,
      JudgmentGrade.GOOD_TRILL,
      JudgmentGrade.GOOD_TRILL,
    ]);
  });

  it('휴지 구간 튜토리얼은 1·4레인 트릴을 Q/W·8/9로 교대해 8개 노트 모두 Perfect로 판정', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'rest-zone');
    if (!preview) {
      throw new Error('rest-zone 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs);

    // 트릴 노트 8개(왼손 4 + 오른손 4), 키를 매번 교대하므로 GOOD◇ 강등 없이 전부 Perfect
    expect(judgments).toHaveLength(8);
    expect(judgments.every((result) => result.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it('이어진 트릴 롱노트 튜토리얼은 갈아타기·겹쳐 누르기 두 방식 모두 전부 Perfect로 판정', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-trill-long');
    if (!preview) {
      throw new Error('connected-trill-long 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs);

    // 헤드 2 + 연결 + 종결 × 2체인 = 최소 8판정, 전부 Perfect (Miss·GOOD◇ 없음)
    expect(judgments.length).toBeGreaterThanOrEqual(8);
    expect(judgments.every((result) => result.grade === JudgmentGrade.PERFECT)).toBe(true);
  });

  it('릴리즈탭 튜토리얼은 기존 JudgmentEngine으로 롱노트 종결과 끝점 싱글을 모두 판정', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'release-tap');
    if (!preview) {
      throw new Error('release-tap 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs);

    expect(judgments.map((result) => `${result.noteIndex}:${result.grade}`)).toEqual([
      `0:${JudgmentGrade.PERFECT}`,
      `2:${JudgmentGrade.PERFECT}`,
      `1:${JudgmentGrade.PERFECT}`,
    ]);
  });

  it('롱노트 튜토리얼은 루프 끝에서 시간이 되감겨도 끝점 release 판정을 버리지 않는다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'long-note');
    if (!preview) {
      throw new Error('long-note 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs - 1);
    expect(judgments.map((result) => `${result.noteIndex}:${result.grade}`)).toEqual([
      `0:${JudgmentGrade.PERFECT}`,
      `1:${JudgmentGrade.PERFECT}`,
      `2:${JudgmentGrade.PERFECT}`,
      `2:${JudgmentGrade.PERFECT}`,
      `3:${JudgmentGrade.PERFECT}`,
      `3:${JudgmentGrade.PERFECT}`,
      `4:${JudgmentGrade.PERFECT}`,
    ]);

    controller.advanceTo(0);

    expect(judgments.map((result) => `${result.noteIndex}:${result.grade}`)).toEqual([
      `0:${JudgmentGrade.PERFECT}`,
      `1:${JudgmentGrade.PERFECT}`,
      `2:${JudgmentGrade.PERFECT}`,
      `2:${JudgmentGrade.PERFECT}`,
      `3:${JudgmentGrade.PERFECT}`,
      `3:${JudgmentGrade.PERFECT}`,
      `4:${JudgmentGrade.PERFECT}`,
      `5:${JudgmentGrade.PERFECT}`,
    ]);
  });

  it('루프 시간이 되감기면 JudgmentEngine을 새로 만들어 다음 반복도 같은 판정을 다시 낸다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'trill-note');
    if (!preview) {
      throw new Error('trill-note 프리뷰가 없음');
    }
    const judgments: JudgmentResult[] = [];
    const controller = createTutorialPreviewJudgmentController(
      preview.chart,
      getTutorialInputTimings(preview.chart),
      {
        onJudgment: (result) => judgments.push(result),
        onComboUpdate: vi.fn(),
      },
    );

    controller.advanceTo(preview.loopMs - 1);
    controller.advanceTo(0);
    controller.advanceTo(preview.loopMs - 1);

    expect(judgments.filter((result) => result.grade === JudgmentGrade.GOOD_TRILL)).toHaveLength(6);
  });
});
