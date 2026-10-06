import { describe, expect, it } from 'vitest';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import {
  breatheOpacity,
  bubbleRise,
  cubicBezierProgress,
  cyclePosition,
  EASE_IN_OUT,
  glintState,
  lightBandCenterY,
  liquidFlowOffset,
  type BreatheTiming,
  type GlintTiming,
  type LightTiming,
  type LiquidTiming,
  type RiseTiming,
} from './gearMotionTiming';

// 승인된 SVG(54-ambient-motion-v19.svg)와 같은 값. prepare-frame-motion-v21.mjs가 gear-motion.json에 쓴다.
const motionJson = JSON.parse(motionJsonText);
const light: LightTiming = motionJson.light;
const liquid: LiquidTiming = motionJson.gauge.liquid;
const rise: RiseTiming = motionJson.gauge.rise;
const breathe: BreatheTiming = motionJson.accent;
const glint: GlintTiming = motionJson.bar;

describe('cyclePosition', () => {
  it('주기 4400ms에서 2200ms는 진행 0.5, 4400ms는 다시 0', () => {
    expect(cyclePosition(2200, 4400)).toBe(0.5);
    expect(cyclePosition(4400, 4400)).toBe(0);
  });

  it('지연 −1200ms는 1.2초 먼저 시작한 것과 같아 0ms에 7500ms 주기의 진행 0.16', () => {
    expect(cyclePosition(0, 7500, -1200)).toBeCloseTo(0.16, 10);
  });

  it('음수 시간 −1000ms는 주기 10000ms의 진행 0.9', () => {
    expect(cyclePosition(-1000, 10000)).toBeCloseTo(0.9, 10);
  });
});

describe('cubicBezierProgress', () => {
  it('ease-in-out(0.42, 0, 0.58, 1)은 0→0, 0.5→0.5, 1→1이고 0.3과 0.7이 대칭', () => {
    expect(cubicBezierProgress(EASE_IN_OUT, 0)).toBe(0);
    expect(cubicBezierProgress(EASE_IN_OUT, 0.5)).toBeCloseTo(0.5, 6);
    expect(cubicBezierProgress(EASE_IN_OUT, 1)).toBe(1);
    expect(cubicBezierProgress(EASE_IN_OUT, 0.3) + cubicBezierProgress(EASE_IN_OUT, 0.7)).toBeCloseTo(1, 6);
  });

  it('ease-in-out은 진행 0.25에서 0.1292(천천히 시작)', () => {
    expect(cubicBezierProgress(EASE_IN_OUT, 0.25)).toBeCloseTo(0.1292, 4);
  });

  it('linear(0, 0, 1, 1)은 진행 0.37을 그대로 0.37로 돌려준다', () => {
    expect(cubicBezierProgress([0, 0, 1, 1], 0.37)).toBeCloseTo(0.37, 6);
  });
});

describe('lightBandCenterY', () => {
  it('0초에 광원 띠 중심 y −841, 30초에 768, 60초에 다시 −841', () => {
    expect(lightBandCenterY(0, light)).toBe(-841);
    expect(lightBandCenterY(30_000, light)).toBe(768);
    expect(lightBandCenterY(60_000, light)).toBe(-841);
  });

  it('59.9초에 2370을 넘어 기어 그림 아래로 나가 있고 0~59.9초 동안 한 방향(아래)으로만 움직인다', () => {
    expect(lightBandCenterY(59_900, light)).toBeGreaterThan(2370);
    let previous = -Infinity;
    for (let time = 0; time < 60_000; time += 500) {
      const y = lightBandCenterY(time, light);
      expect(y).toBeGreaterThan(previous);
      previous = y;
    }
  });

  it('15초에 −36.5, 45초에 1572.5(초당 53.6px로 일정)', () => {
    expect(lightBandCenterY(15_000, light)).toBeCloseTo(-36.5, 6);
    expect(lightBandCenterY(45_000, light)).toBeCloseTo(1572.5, 6);
  });
});

describe('liquidFlowOffset', () => {
  it('게이지 액체는 5초에 320px 위로 이동(−320)하고 10초에 0으로 돌아온다', () => {
    expect(liquidFlowOffset(0, liquid)).toBe(0);
    expect(liquidFlowOffset(5_000, liquid)).toBe(-320);
    expect(liquidFlowOffset(10_000, liquid)).toBe(0);
  });

  it('2.5초에 −160, 12.5초에도 같은 −160', () => {
    expect(liquidFlowOffset(2_500, liquid)).toBe(-160);
    expect(liquidFlowOffset(12_500, liquid)).toBe(-160);
  });
});

describe('bubbleRise', () => {
  const first = motionJson.gauge.bubbles[0];

  it('첫 기포(7.5초 주기, 지연 −1.2초)는 0초에 진행 16%라 126.4px 올라가 있고 불투명도 0.75', () => {
    const state = bubbleRise(0, first, rise);
    expect(state.offsetY).toBeCloseTo(-126.4, 6);
    expect(state.alpha).toBeCloseTo(0.75, 6);
  });

  it('지연 없는 7.5초 기포는 0.3초(진행 4%)에 31.6px 올라가며 불투명도 0.375로 나타나는 중', () => {
    const state = bubbleRise(300, { durationMs: 7500, delayMs: 0 }, rise);
    expect(state.offsetY).toBeCloseTo(-31.6, 6);
    expect(state.alpha).toBeCloseTo(0.375, 6);
  });

  it('지연 없는 7.5초 기포는 진행 8%~88%(0.6초~6.6초)에 불투명도 0.75를 유지하고 7.05초(94%)에 0.375로 사라지는 중', () => {
    const bubble = { durationMs: 7500, delayMs: 0 };
    expect(bubbleRise(600, bubble, rise).alpha).toBeCloseTo(0.75, 6);
    expect(bubbleRise(6600, bubble, rise).alpha).toBeCloseTo(0.75, 6);
    const fading = bubbleRise(7050, bubble, rise);
    expect(fading.alpha).toBeCloseTo(0.375, 6);
    expect(fading.offsetY).toBeCloseTo(-742.6, 6);
  });

  it('주기 끝(7.5초)에서 다시 바닥(오프셋 0)·불투명도 0부터 올라간다', () => {
    const state = bubbleRise(7500, { durationMs: 7500, delayMs: 0 }, rise);
    expect(state.offsetY).toBeCloseTo(0, 10);
    expect(state.alpha).toBe(0);
  });
});

describe('breatheOpacity', () => {
  it('발광선 호흡은 0초에 0, 1.1초에 0.425, 2.2초에 최대 불투명도 0.85, 4.4초에 다시 0', () => {
    expect(breatheOpacity(0, breathe)).toBe(0);
    expect(breatheOpacity(1_100, breathe)).toBeCloseTo(0.425, 6);
    expect(breatheOpacity(2_200, breathe)).toBeCloseTo(0.85, 10);
    expect(breatheOpacity(4_400, breathe)).toBe(0);
  });

  it('밝아질 때와 어두워질 때가 대칭이라 0.55초와 3.85초의 불투명도가 같다(0.85 × 0.1292)', () => {
    expect(breatheOpacity(550, breathe)).toBeCloseTo(0.85 * 0.1292, 4);
    expect(breatheOpacity(3_850, breathe)).toBeCloseTo(breatheOpacity(550, breathe), 6);
  });
});

describe('결과 객체 재사용(매 프레임 할당 없이)', () => {
  it('bubbleRise에 out을 넘기면 그 객체에 써서 돌려주고 값은 새 객체로 받은 것과 같다(0초 첫 기포 −126.4·0.75)', () => {
    const out = { offsetY: 99, alpha: 99 };
    const bubble = motionJson.gauge.bubbles[0];
    const returned = bubbleRise(0, bubble, rise, out);
    expect(returned).toBe(out);
    expect(out).toEqual(bubbleRise(0, bubble, rise));
    expect(out.offsetY).toBeCloseTo(-126.4, 6);
  });

  it('glintState에 out을 넘기면 그 객체에 써서 돌려주고, 0.88초 85px 뒤 2초에 다시 쓰면 170px·0으로 바뀐다', () => {
    const out = { offset: -1, alpha: -1 };
    expect(glintState(880, glint, out)).toBe(out);
    expect(out.offset).toBeCloseTo(85, 6);
    glintState(2_000, glint, out);
    expect(out).toEqual({ offset: 170, alpha: 0 });
  });
});

describe('glintState', () => {
  it('하단 바 빛은 0초에 0px·불투명도 0에서 출발해 0.48초(15%)에 불투명도 1', () => {
    expect(glintState(0, glint)).toEqual({ offset: 0, alpha: 0 });
    expect(glintState(480, glint).alpha).toBeCloseTo(1, 10);
  });

  it('0.88초(27.5%, 이동 구간 0~55%의 절반)에 85px 이동', () => {
    expect(glintState(880, glint).offset).toBeCloseTo(85, 6);
  });

  it('1.76초(55%)에 170px·불투명도 0에 닿고 3.2초 직전까지 170px·0으로 멈춰 있다가 3.2초에 0px로 돌아온다', () => {
    const stop = glintState(1_760, glint);
    expect(stop.offset).toBeCloseTo(170, 6);
    expect(stop.alpha).toBeCloseTo(0, 10);
    expect(glintState(3_000, glint)).toEqual({ offset: 170, alpha: 0 });
    expect(glintState(3_200, glint)).toEqual({ offset: 0, alpha: 0 });
  });

  it('밝아지는 구간(0~15%)은 0.24초(7.5%)에 불투명도 0.5, 사라지는 구간(15~55%)은 1.12초(35%)에 0.5', () => {
    expect(glintState(240, glint).alpha).toBeCloseTo(0.5, 6);
    expect(glintState(1_120, glint).alpha).toBeCloseTo(0.5, 6);
  });
});
