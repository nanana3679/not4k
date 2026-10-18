import { describe, expect, it } from 'vitest';
import { assertGroupsCoverStage, parseCaptureParams, planReplay } from './capture-plan.mjs';

const FRAME_MS = 1000 / 60;

describe('planReplay', () => {
  const steps = planReplay({ captureMs: 8800, frameMs: FRAME_MS, tailMs: 1000, maxDrawGapMs: 50 });
  const drawn = steps.filter((step) => step.drawDeltaMs !== null);

  it('captureMs 8800에서 마지막 단계는 정확히 8800ms이고 그 단계는 그린다', () => {
    expect(steps.at(-1)).toEqual({ songMs: 8800, drawDeltaMs: expect.any(Number) });
  });

  it('captureMs 8800에서 그린 deltaMs의 합은 8800ms다', () => {
    expect(drawn.reduce((sum, step) => sum + step.drawDeltaMs!, 0)).toBeCloseTo(8800, 6);
  });

  it('captureMs 8800에서 그린 deltaMs는 모두 50ms 이하(부동소수 오차 1e-9 이내)라 50ms로 자르는 시계도 곡 시간과 같이 간다', () => {
    expect(Math.max(...drawn.map((step) => step.drawDeltaMs!))).toBeLessThanOrEqual(50 + 1e-9);
  });

  it('마지막 1초(7800~8800ms)는 60fps 단계마다 그리고, 그 전에는 세 단계에 한 번(약 50ms) 그린다', () => {
    expect(steps.filter((step) => step.songMs >= 7800).every((step) => step.drawDeltaMs !== null)).toBe(true);
    const early = steps.filter((step) => step.songMs > 0 && step.songMs < 7800);
    expect(early.filter((step) => step.drawDeltaMs !== null).length).toBe(Math.floor(early.length / 3));
  });

  it('captureMs 0이면 0ms 한 단계만 그린다', () => {
    expect(planReplay({ captureMs: 0, frameMs: FRAME_MS, tailMs: 1000, maxDrawGapMs: 50 })).toEqual([{ songMs: 0, drawDeltaMs: 0 }]);
  });
});

describe('parseCaptureParams', () => {
  const options = { durationMs: 184000, difficultyLabels: ['LIFTOFF', 'INFILTRATION', 'BREAKTHROUGH'] };

  it('빈 주소는 LIFTOFF·고도 1·8800ms로 읽는다', () => {
    expect(parseCaptureParams('', options)).toEqual({ difficultyLabel: 'LIFTOFF', altitude: 1, captureMs: 8800 });
  });

  it('label=BREAKTHROUGH&altitude=0.5&ms=1200은 그대로 읽는다', () => {
    expect(parseCaptureParams('?label=BREAKTHROUGH&altitude=0.5&ms=1200', options)).toEqual({ difficultyLabel: 'BREAKTHROUGH', altitude: 0.5, captureMs: 1200 });
  });

  it('목록에 없는 label=LIFTOFFX는 Infiltration으로 바꿔 찍지 않고 오류다', () => {
    expect(() => parseCaptureParams('?label=LIFTOFFX', options)).toThrow(/label must be one of/);
  });

  it('비어 있는 altitude=·ms=는 0으로 읽지 않고 오류다', () => {
    expect(() => parseCaptureParams('?altitude=', options)).toThrow(/altitude/);
    expect(() => parseCaptureParams('?ms=', options)).toThrow(/ms/);
  });

  it('altitude 1.5·ms -1·ms Infinity·곡 길이를 넘는 ms 184001은 오류다', () => {
    expect(() => parseCaptureParams('?altitude=1.5', options)).toThrow(/altitude/);
    expect(() => parseCaptureParams('?ms=-1', options)).toThrow(/ms/);
    expect(() => parseCaptureParams('?ms=Infinity', options)).toThrow(/ms/);
    expect(() => parseCaptureParams('?ms=184001', options)).toThrow(/ms/);
  });
});

describe('assertGroupsCoverStage', () => {
  // Minimal stand-ins for Pixi display objects: only parent, children and label matter here.
  const makeStage = (labels: string[]) => {
    const stage = { children: [] as { label: string; parent: unknown }[] };
    for (const label of labels) stage.children.push({ label, parent: stage });
    return stage;
  };
  const byLabel = (stage: ReturnType<typeof makeStage>, label: string) => stage.children.find((child) => child.label === label)!;
  const nobodyStaysOut = () => false;

  it('stage 순서대로 묶음이 모든 자식을 한 번씩 덮으면 통과한다', () => {
    const stage = makeStage(['lanes', 'notes', 'line']);
    const layersByGroup = { lanes: [byLabel(stage, 'lanes')], notes: [byLabel(stage, 'notes')], judgmentLine: [byLabel(stage, 'line')] };
    expect(() => assertGroupsCoverStage({ stage, layersByGroup, mayStayOut: nobodyStaysOut })).not.toThrow();
  });

  it('어느 묶음에도 없는 stage 자식은 허용 목록에 없으면 오류이고, 허용 목록(mask)에 있으면 통과한다', () => {
    const stage = makeStage(['lanes', 'clip']);
    const layersByGroup = { lanes: [byLabel(stage, 'lanes')] };
    expect(() => assertGroupsCoverStage({ stage, layersByGroup, mayStayOut: nobodyStaysOut })).toThrow(/clip is in no capture group/);
    expect(() => assertGroupsCoverStage({ stage, layersByGroup, mayStayOut: (child) => child === byLabel(stage, 'clip') })).not.toThrow();
  });

  it('stage에서 notes가 lanes보다 아래인데 묶음 순서가 lanes→notes이면 오류다', () => {
    const stage = makeStage(['notes', 'lanes']);
    const layersByGroup = { lanes: [byLabel(stage, 'lanes')], notes: [byLabel(stage, 'notes')] };
    expect(() => assertGroupsCoverStage({ stage, layersByGroup, mayStayOut: nobodyStaysOut })).toThrow(/out of stage order/);
  });

  it('한 레이어가 lanes와 notes 두 묶음에 들어 있으면 오류다', () => {
    const stage = makeStage(['shared']);
    const shared = byLabel(stage, 'shared');
    expect(() => assertGroupsCoverStage({ stage, layersByGroup: { lanes: [shared], notes: [shared] }, mayStayOut: nobodyStaysOut })).toThrow(/both lanes and notes/);
  });

  it('묶음의 레이어가 stage 바로 아래가 아니라 다른 컨테이너 안에 있으면 오류다', () => {
    const stage = makeStage(['ui']);
    const nested = { label: 'keyLabels', parent: byLabel(stage, 'ui') };
    expect(() => assertGroupsCoverStage({ stage, layersByGroup: { hud: [byLabel(stage, 'ui'), nested] }, mayStayOut: nobodyStaysOut })).toThrow(/not a direct stage child/);
  });
});
