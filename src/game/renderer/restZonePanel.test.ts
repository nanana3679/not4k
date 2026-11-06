import { describe, expect, it, vi } from 'vitest';
import { createChartTiming } from '../../shared/timing/chartTiming';
import { BEAT_ZERO, beat, type Beat } from '../../shared/types/beat';
import type { RestZone } from '../../shared/types/chart';
import {
  ESTIMATED_DWELL_HIGHEST_LEVEL, ESTIMATED_DWELL_LOWEST_LEVEL, REST_PANEL_LOOK, REST_PANEL_OUTLINE_WIDTH, REST_PANEL_RIM_BRIGHTNESS,
  brightenColor, depthFadeAlpha, estimatedDwellMs, fallenHeightRatio, groupRestPanels, mergeTouchingRestZones, minRestZoneMs, mixColor,
  neighborProgress, noteDwellMs, panelCorners, panelEdgeStrip, restPanelState, restPanelTiming, rimColor, separatorTop, sharedCameraLane,
  toLaneRestZones,
} from './restZonePanel';

describe('restZone 판넬 시각', () => {
  const timing = { startMs: 4000, endMs: 12000, animMs: 300 };

  it.each([
    [3699, 0, 'up', '시작 301ms 전이면 progress 0으로 평상'],
    [3700, 0, 'up', '시작 300ms 전이면 progress 0으로 평상'],
    [3850, 0.25, 'falling', '시작 150ms 전이면 progress 0.25로 넘어가는 중'],
    [4000, 1, 'down', '시작 4000ms이면 progress 1로 넘어가 있음'],
    [11700, 1, 'down', '종료 300ms 전이면 progress 1로 넘어가 있음'],
    [11850, 0.25, 'rising', '종료 150ms 전이면 progress 0.25로 올라오는 중'],
    [12000, 0, 'up', '종료 12000ms이면 progress 0으로 평상'],
    [12001, 0, 'up', '종료 1ms 후이면 progress 0으로 평상'],
  ] as const)('애니메이션 300ms에서 %s ms로 이동하면 %s·%s (%s)', (songMs, progress, phase, _label) => {
    expect(restPanelState(songMs, timing)).toEqual({ progress, phase });
  });

  it('길이 200ms·애니메이션 300ms이면 전체 구간의 progress가 1 미만이고 3950ms에서 최대 25/36이다', () => {
    const short = { startMs: 4000, endMs: 4200, animMs: 300 };
    const states = Array.from({ length: 501 }, (_, i) => restPanelState(3700 + i, short));
    expect(Math.max(...states.map(state => state.progress))).toBeCloseTo(25 / 36, 12);
    expect(states.every(state => state.progress < 1 && state.phase !== 'down')).toBe(true);
    expect(restPanelState(3950, short).phase).toBe('falling');
    expect(restPanelState(3951, short).phase).toBe('rising');
  });

  it.each([0, -100])('애니메이션 %s ms이면 3999ms에 평상·4000~11999ms에 넘어가 있음·12000ms에 평상으로 즉시 전환한다', animMs => {
    expect([3999, 4000, 11999, 12000].map(ms => restPanelState(ms, { ...timing, animMs }))).toEqual([
      { progress: 0, phase: 'up' }, { progress: 1, phase: 'down' },
      { progress: 1, phase: 'down' }, { progress: 0, phase: 'up' },
    ]);
  });
});

describe('restZone 판넬 전환 시각', () => {
  it.each([
    [420, 350, 1200, '리프트·서든 없이 판정선까지 420px'],
    [210, 350, 600, '리프트나 서든으로 보이는 레인이 210px로 줄면'],
    [420, 700, 600, '스크롤 속도가 700px/초로 빨라지면'],
    [-10, 350, 0, '보이는 거리가 음수면 0px로 보고'],
  ] as const)('%spx·%spx/초이면 노트가 레인에 머무는 시간 %sms (%s)', (travelPx, speed, expected, _label) => {
    expect(noteDwellMs(travelPx, speed)).toBeCloseTo(expected, 9);
  });

  it('스크롤 속도 0px/초이면 노트가 레인에 끝없이 머무르므로 Infinity', () => {
    expect(noteDwellMs(420, 0)).toBe(Infinity);
  });

  // restZone 4000~12000ms, 노트가 머무는 시간 1200ms, 애니메이션 300ms: 빈 레인 창은 4000~10800ms다.
  const timing = restPanelTiming(4000, 12000, 1200, 300);

  it.each([
    [3999, 0, 'up', '시작 1ms 전이면 앞 노트가 레인에 남아 있을 수 있어 평상'],
    [4000, 0, 'up', '시작 시각이면 넘어가기 시작하는 순간이라 progress 0'],
    [4150, 0.25, 'falling', '시작 150ms 후이면 넘어가는 중'],
    [4300, 1, 'down', '시작 300ms 후이면 다 넘어감'],
    [10500, 1, 'down', '뒤 노트가 나타나기 300ms 전이면 아직 넘어가 있음'],
    [10650, 0.25, 'rising', '뒤 노트가 나타나기 150ms 전이면 올라오는 중'],
    [10800, 0, 'up', '뒤 노트가 레인 위끝에 나타나는 10800ms이면 다 올라옴'],
    [11999, 0, 'up', '끝 1ms 전이면 뒤 노트가 레인에 보이므로 평상'],
  ] as const)('restZone 4000~12000ms·머무는 시간 1200ms에서 %s ms이면 progress %s·%s (%s)', (songMs, progress, phase, _label) => {
    const state = restPanelState(songMs, timing);
    expect(state.progress).toBeCloseTo(progress, 12);
    expect(state.phase).toBe(phase);
  });

  it('같은 restZone이라도 머무는 시간이 600ms → 2400ms로 길어지면 올라옴이 11400ms → 9600ms에 끝난다', () => {
    expect(restPanelState(11399, restPanelTiming(4000, 12000, 600, 300)).phase).toBe('rising');
    expect(restPanelState(11400, restPanelTiming(4000, 12000, 600, 300)).phase).toBe('up');
    expect(restPanelState(9599, restPanelTiming(4000, 12000, 2400, 300)).phase).toBe('rising');
    expect(restPanelState(9600, restPanelTiming(4000, 12000, 2400, 300)).phase).toBe('up');
  });

  it('빈 레인 창 300ms가 애니메이션 2번(600ms)보다 짧으면 4150ms에 최대 progress 0.25까지만 넘어간다', () => {
    const short = restPanelTiming(4000, 5500, 1200, 300);
    const states = Array.from({ length: 1501 }, (_, i) => restPanelState(4000 + i, short));
    expect(Math.max(...states.map(state => state.progress))).toBeCloseTo(0.25, 12);
    expect(states.every(state => state.phase !== 'down')).toBe(true);
  });

  it('restZone 1000ms가 머무는 시간 1200ms보다 짧으면 빈 레인 창이 없어 판넬이 한 번도 넘어가지 않는다', () => {
    const none = restPanelTiming(4000, 5000, 1200, 300);
    const states = Array.from({ length: 2001 }, (_, i) => restPanelState(3500 + i, none));
    expect(states.every(state => state.progress === 0 && state.phase === 'up')).toBe(true);
  });

  it.each([
    [1500, 300, 2100, '추정 녹숫 1500ms·애니메이션 300ms'],
    [600, 300, 1200, '추정 녹숫 600ms·애니메이션 300ms'],
    [1500, 0, 1500, '애니메이션 0ms면 추정 녹숫만'],
    [1500, -100, 1500, '애니메이션이 음수면 0ms로 보고 추정 녹숫만'],
  ] as const)('%sms·%sms이면 restZone 최소 길이 %sms (%s)', (estimatedDwellMs, animMs, expected, _label) => {
    expect(minRestZoneMs(estimatedDwellMs, animMs)).toBe(expected);
  });

  it('restZone이 최소 길이 2100ms(추정 녹숫 1500ms + 애니메이션 300ms × 2)와 같으면 4300ms 한 순간 progress 1까지 넘어갔다가 바로 올라온다', () => {
    const exact = restPanelTiming(4000, 6100, 1500, 300);
    expect(restPanelState(4300, exact)).toEqual({ progress: 1, phase: 'down' });
    expect(restPanelState(4301, exact).phase).toBe('rising');
  });

  it('애니메이션 0ms이면 빈 레인 창 4000~10799ms 동안만 즉시 넘어간다', () => {
    const instant = restPanelTiming(4000, 12000, 1200, 0);
    expect([3999, 4000, 10799, 10800].map(ms => restPanelState(ms, instant).phase)).toEqual(['up', 'down', 'down', 'up']);
  });
});

describe('restZone 판넬 투영', () => {
  it('60°·거리 1.5·눈높이 0.5이면 높이는 50%·위 폭은 약 63.4%이고 아래 두 모서리는 고정된다', () => {
    const camera = { cameraDistance: 1.5, eyeHeight: 0.5 };
    const [tl, tr, br, bl] = panelCorners({ x: 10, width: 100, hingeY: 600, height: 600 }, Math.PI / 3, camera);
    expect(fallenHeightRatio(Math.PI / 3, camera)).toBeCloseTo(0.5, 12);
    expect(tl.y).toBeCloseTo(300, 12);
    expect(tr.y).toBeCloseTo(300, 12);
    expect((tr.x - tl.x) / 100).toBeCloseTo(0.6339745962155614, 12);
    expect((tr.x + tl.x) / 2).toBe(60);
    expect([br, bl]).toEqual([{ x: 110, y: 600 }, { x: 10, y: 600 }]);
  });
  it('각도 0°이면 x 10.1·폭 62.5·힌지 422.25·높이 400의 네 모서리가 원래 사각형과 정확히 같다', () => {
    expect(panelCorners(
      { x: 10.1, width: 62.5, hingeY: 422.25, height: 400 },
      0,
      { cameraDistance: 1.5, eyeHeight: 0.5 },
    )).toEqual([
      { x: 10.1, y: 22.25 }, { x: 72.6, y: 22.25 },
      { x: 72.6, y: 422.25 }, { x: 10.1, y: 422.25 },
    ]);
  });
});

describe('restZone 판넬 깊이 어둠', () => {
  it('어둠 시작 40%·윗끝 밝기 0%이면 경첩(0)과 40% 지점은 0, 윗변(1)은 1로 검은 배경과 같아진다', () => {
    expect([0, 0.4, 1].map(t => depthFadeAlpha(t, 0.4, 0))).toEqual([0, 0, 1]);
  });
  it('어둠 시작 40%·윗끝 밝기 0%이면 40%~100%의 한가운데인 70% 지점은 smoothstep 절반인 0.5', () => {
    expect(depthFadeAlpha(0.7, 0.4, 0)).toBeCloseTo(0.5, 12);
  });
  it('윗끝 밝기 30%이면 윗변의 검정 불투명도는 0.7에서 멈춘다', () => {
    expect(depthFadeAlpha(1, 0.4, 0.3)).toBeCloseTo(0.7, 12);
  });
  it('어둠 시작 100%이면 어느 지점도 어두워지지 않는다', () => {
    expect([0, 0.5, 1].map(t => depthFadeAlpha(t, 1, 0))).toEqual([0, 0, 0]);
  });
});

describe('인접 레인 restZone 판넬 묶기', () => {
  it('레인 3·4가 같은 8→24박이면 묶기를 켰을 때 레인 3부터 2칸 폭의 판넬 하나가 된다', () => {
    expect(groupRestPanels([
      { lane: 4, start: 8, end: 24 }, { lane: 3, start: 8, end: 24 },
    ], true)).toEqual([{ firstLane: 3, laneCount: 2, start: 8, end: 24 }]);
  });
  it('레인 3은 8→24박·레인 4는 12→24박처럼 시작 박이 다르면 묶기를 켜도 판넬이 레인마다 따로다', () => {
    expect(groupRestPanels([
      { lane: 3, start: 8, end: 24 }, { lane: 4, start: 12, end: 24 },
    ], true)).toEqual([
      { firstLane: 3, laneCount: 1, start: 8, end: 24 },
      { firstLane: 4, laneCount: 1, start: 12, end: 24 },
    ]);
  });
  it('레인 3·4가 시작 박은 같고 끝 박만 24·26으로 다르면 따로다', () => {
    expect(groupRestPanels([
      { lane: 3, start: 8, end: 24 }, { lane: 4, start: 8, end: 26 },
    ], true)).toHaveLength(2);
  });
  it('레인 1·2·4가 같은 구간이면 붙어 있는 1·2만 묶고 떨어진 4는 따로다', () => {
    expect(groupRestPanels([
      { lane: 1, start: 8, end: 24 }, { lane: 2, start: 8, end: 24 }, { lane: 4, start: 8, end: 24 },
    ], true)).toEqual([
      { firstLane: 1, laneCount: 2, start: 8, end: 24 },
      { firstLane: 4, laneCount: 1, start: 8, end: 24 },
    ]);
  });
  it('묶기를 끄면 같은 구간인 레인 3·4도 레인마다 판넬 하나다', () => {
    expect(groupRestPanels([
      { lane: 3, start: 8, end: 24 }, { lane: 4, start: 8, end: 24 },
    ], false)).toEqual([
      { firstLane: 3, laneCount: 1, start: 8, end: 24 },
      { firstLane: 4, laneCount: 1, start: 8, end: 24 },
    ]);
  });
  it('한 레인에 구간이 8→12박·16→24박 둘이면 묶기를 켜도 시간 순서대로 판넬 두 개다', () => {
    expect(groupRestPanels([
      { lane: 2, start: 16, end: 24 }, { lane: 2, start: 8, end: 12 },
    ], true)).toEqual([
      { firstLane: 2, laneCount: 1, start: 8, end: 12 },
      { firstLane: 2, laneCount: 1, start: 16, end: 24 },
    ]);
  });
});

describe('카메라 위치를 옮긴 판넬 투영', () => {
  const camera = { cameraDistance: 1.5, eyeHeight: 0.5 };
  it('카메라 x를 판넬 오른쪽 끝 110에 두면 60°에서도 오른쪽 변이 x 110에 수직으로 선다', () => {
    const [tl, tr, br] = panelCorners({ x: 10, width: 100, hingeY: 600, height: 600 }, Math.PI / 3, camera, 110);
    expect(tr.x).toBeCloseTo(110, 12);
    expect(br.x).toBe(110);
    expect(tl.x).toBeCloseTo(110 - 100 * 0.6339745962155614, 12);
  });
  it('카메라 x를 판넬 가운데 60에 두면 생략했을 때와 같은 네 모서리다', () => {
    const rect = { x: 10, width: 100, hingeY: 600, height: 600 };
    expect(panelCorners(rect, Math.PI / 3, camera, 60)).toEqual(panelCorners(rect, Math.PI / 3, camera));
  });
});

describe('붙어서 접히는 판넬의 공유 카메라', () => {
  it('레인 2 혼자 접히면 카메라는 자기 가운데인 레인 좌표 2.5다', () => {
    expect(sharedCameraLane([{ firstLane: 2, laneCount: 1, progress: 0.4 }], 0)).toBe(2.5);
  });
  it('레인 2·3이 둘 다 progress 1이면 둘 다 경계인 레인 좌표 3에서 본다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 1 }];
    expect([sharedCameraLane(panels, 0), sharedCameraLane(panels, 1)]).toEqual([3, 3]);
  });
  it('레인 2는 progress 1·레인 3은 0.25이면 progress 가중 평균 (2.5×1 + 3.5×0.25)/1.25 = 2.7이다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 0.25 }];
    expect(sharedCameraLane(panels, 0)).toBeCloseTo(2.7, 12);
    expect(sharedCameraLane(panels, 1)).toBeCloseTo(2.7, 12);
  });
  it('레인 2부터 2칸인 묶인 판넬과 레인 4가 둘 다 progress 1이면 세 레인의 가운데인 레인 좌표 3.5다', () => {
    const panels = [{ firstLane: 2, laneCount: 2, progress: 1 }, { firstLane: 4, laneCount: 1, progress: 1 }];
    expect(sharedCameraLane(panels, 1)).toBeCloseTo(3.5, 12);
  });
  it('레인 1과 레인 3처럼 떨어져 있으면 각자 자기 가운데 1.5·3.5에서 본다', () => {
    const panels = [{ firstLane: 1, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 1 }];
    expect([sharedCameraLane(panels, 0), sharedCameraLane(panels, 1)]).toEqual([1.5, 3.5]);
  });
  it('레인 2(progress 1)와 붙은 레인 3이 progress 0이면 레인 2 카메라는 자기 가운데 2.5다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 0 }];
    expect(sharedCameraLane(panels, 0)).toBe(2.5);
  });
  it('레인 1·2·3이 progress 1·0.000001·1이면 레인 1 카메라는 자기 가운데 1.5에서 0.001 안이라 가운데 판넬이 접히기 시작해도 튀지 않는다', () => {
    const panels = [
      { firstLane: 1, laneCount: 1, progress: 1 }, { firstLane: 2, laneCount: 1, progress: 0.000001 }, { firstLane: 3, laneCount: 1, progress: 1 },
    ];
    expect(Math.abs(sharedCameraLane(panels, 0) - 1.5)).toBeLessThan(0.001);
    expect(Math.abs(sharedCameraLane(panels, 2) - 3.5)).toBeLessThan(0.001);
  });
  it('따로 묶인 레인 1·2·3이 모두 progress 0.5로 함께 접히면 셋 다 레인 좌표 2.5에서 보고, 60°·거리 1.5에서 맞닿은 윗모서리가 겹친다', () => {
    const panels = [1, 2, 3].map(firstLane => ({ firstLane, laneCount: 1, progress: 0.5 }));
    const cameras = panels.map((_, index) => sharedCameraLane(panels, index));
    expect(cameras).toEqual([2.5, 2.5, 2.5]);
    const camera = { cameraDistance: 1.5, eyeHeight: 0.5 };
    const corners = panels.map((panel, index) => panelCorners(
      { x: panel.firstLane * 62.5, width: 62.5, hingeY: 426, height: 426 }, Math.PI / 6, camera, cameras[index] * 62.5,
    ));
    for (const [left, right] of [[0, 1], [1, 2]]) {
      expect(corners[left][1].x).toBeCloseTo(corners[right][0].x, 9);
      expect(corners[left][1].y).toBeCloseTo(corners[right][0].y, 9);
    }
  });
  it('따로 묶인 레인 1·2·3이 progress 0.5·0.5·1로 접히면 60°·거리 1.5·레인 폭 62.5에서 앞 두 판넬의 맞닿은 윗모서리가 x로 약 3.9px 벌어진다(RFD 0034에서 받아들인 한계)', () => {
    const panels = [0.5, 0.5, 1].map((progress, index) => ({ firstLane: index + 1, laneCount: 1, progress }));
    const camera = { cameraDistance: 1.5, eyeHeight: 0.5 };
    const corners = panels.map((panel, index) => panelCorners(
      { x: panel.firstLane * 62.5, width: 62.5, hingeY: 426, height: 426 },
      panel.progress * Math.PI / 3, camera, sharedCameraLane(panels, index) * 62.5,
    ));
    expect(corners[1][0].y).toBeCloseTo(corners[0][1].y, 9);
    expect(corners[1][0].x - corners[0][1].x).toBeCloseTo(3.906, 3);
  });
  it('레인 1·2·3이 모두 progress 1이면 셋 다 묶음 가운데인 레인 좌표 2.5에서 본다', () => {
    const panels = [1, 2, 3].map(firstLane => ({ firstLane, laneCount: 1, progress: 1 }));
    expect(panels.map((_, index) => sharedCameraLane(panels, index))).toEqual([2.5, 2.5, 2.5]);
  });
  it('레인 2(progress 1) 오른쪽에 레인 3이 0.5로 접히면 레인 2의 이웃은 왼쪽 0·오른쪽 0.5다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 0.5 }];
    expect(neighborProgress(panels, 0)).toEqual({ left: 0, right: 0.5 });
    expect(neighborProgress(panels, 1)).toEqual({ left: 1, right: 0 });
  });
});

describe('접힌 판넬 둘레의 레인 구분선', () => {
  it('레인 2부터 2칸인 묶인 판넬이 접혀 있고 판정선이 y 246이면 그 안쪽 경계 3의 구분선은 판정선 y 246부터 그려 판정선 아래가 남는다', () => {
    expect(separatorTop(3, [{ firstLane: 2, laneCount: 2 }], true, 246)).toBe(246);
  });
  it('접힌 판넬과 닿지 않는 경계 1의 구분선은 레인 맨 위 y 0부터 그린다', () => {
    expect(separatorTop(1, [{ firstLane: 2, laneCount: 2 }], true, 246)).toBe(0);
  });
  it('레인 2·3이 따로 접혀 있으면 사이 경계 3은 틈 메우기를 켜면 판정선 y 246부터, 끄면 y 0부터 그린다', () => {
    const folding = [{ firstLane: 2, laneCount: 1 }, { firstLane: 3, laneCount: 1 }];
    expect(separatorTop(3, folding, true, 246)).toBe(246);
    expect(separatorTop(3, folding, false, 246)).toBe(0);
  });
});

describe('차트 Lv.별 추정 녹숫', () => {
  it('추정 녹숫 직선의 두 끝점은 Lv.1 3000ms·Lv.15 500ms다', () => {
    expect(ESTIMATED_DWELL_LOWEST_LEVEL).toEqual({ level: 1, ms: 3000 });
    expect(ESTIMATED_DWELL_HIGHEST_LEVEL).toEqual({ level: 15, ms: 500 });
  });
  it.each([
    [1, 3000, 'Lv.1이면 가장 긴 3000ms'],
    [8, 1750, 'Lv.8이면 한가운데 1750ms'],
    [15, 500, 'Lv.15면 가장 짧은 500ms'],
    [4.5, 2375, '소수 Lv.4.5면 3000 − 3.5 × 2500 / 14 = 2375ms로 선형 보간'],
    [20, 500, 'Lv.15보다 높은 Lv.20이면 500ms'],
    [0, 3000, 'Lv.1보다 낮은 Lv.0이면 3000ms'],
    [-3, 3000, '음수 Lv.−3이면 3000ms'],
  ] as const)('Lv.%s → 추정 녹숫 %sms (%s)', (level, expected, _label) => {
    expect(estimatedDwellMs(level)).toBe(expected);
  });
  it('Lv.2이면 1단계만큼 줄어 3000 − 2500 / 14 ≈ 2821.43ms다', () => {
    expect(estimatedDwellMs(2)).toBeCloseTo(3000 - 2500 / 14, 9);
  });
  it('Lv.1부터 Lv.15까지 정수 Lv.가 오를 때마다 추정 녹숫이 2500 / 14 ≈ 178.57ms씩 줄어든다', () => {
    for (let level = 1; level < 15; level++) {
      expect(estimatedDwellMs(level) - estimatedDwellMs(level + 1)).toBeCloseTo(2500 / 14, 9);
    }
  });
  it('Lv.가 NaN이면 Lv.1로 보고 3000ms다', () => {
    expect(estimatedDwellMs(Number.NaN)).toBe(3000);
  });
  it('옛 차트 JSON에 difficultyLevel이 없어 undefined가 들어오면 Lv.1로 보고 3000ms다', () => {
    expect(estimatedDwellMs(undefined as unknown as number)).toBe(3000);
  });
  it.each([
    ['8', '숫자 문자열 "8"'],
    [null, 'null'],
    [{ level: 8 }, '객체'],
  ] as const)('Lv.가 %s처럼 숫자가 아니면(%s) Lv.1로 보고 3000ms다', (level, _label) => {
    expect(estimatedDwellMs(level as unknown as number)).toBe(3000);
  });
  it('Lv.가 Infinity면 Lv.15보다 높으므로 500ms, −Infinity면 Lv.1보다 낮으므로 3000ms다', () => {
    expect(estimatedDwellMs(Number.POSITIVE_INFINITY)).toBe(500);
    expect(estimatedDwellMs(Number.NEGATIVE_INFINITY)).toBe(3000);
  });
});

describe('같은 레인에서 맞닿은 restZone 잇기', () => {
  const zone = (lane: RestZone['lane'], start: [number, number?], end: [number, number?]): RestZone => ({
    lane, beat: beat(...start), endBeat: beat(...end),
  });

  it('레인 2의 8→12박과 12→20박이 맞닿으면 8→20박 하나로 잇는다', () => {
    expect(mergeTouchingRestZones([zone(2, [8], [12]), zone(2, [12], [20])])).toEqual([zone(2, [8], [20])]);
  });
  it('레인 2의 0→4박·4→6박·6→10박처럼 3개가 이어 맞닿으면 0→10박 하나로 잇는다', () => {
    expect(mergeTouchingRestZones([zone(2, [0], [4]), zone(2, [4], [6]), zone(2, [6], [10])])).toEqual([zone(2, [0], [10])]);
  });
  it('끝 박 7/2와 다음 시작 박 14/4처럼 분수 표기가 달라도 같은 박이면 1/2→6박 하나로 잇는다', () => {
    expect(mergeTouchingRestZones([
      { lane: 3, beat: beat(1, 2), endBeat: { n: 7, d: 2 } },
      { lane: 3, beat: { n: 14, d: 4 }, endBeat: beat(6) },
    ])).toEqual([zone(3, [1, 2], [6])]);
  });
  it('레인 2의 8→12박과 레인 3의 12→20박처럼 레인이 다르면 맞닿아도 잇지 않는다', () => {
    expect(mergeTouchingRestZones([zone(2, [8], [12]), zone(3, [12], [20])])).toEqual([zone(2, [8], [12]), zone(3, [12], [20])]);
  });
  it('레인 2의 8→12박과 12+1/48박→20박 사이에 1/48박 틈이 있으면 잇지 않는다', () => {
    expect(mergeTouchingRestZones([zone(2, [8], [12]), zone(2, [577, 48], [20])])).toEqual([
      zone(2, [8], [12]), zone(2, [577, 48], [20]),
    ]);
  });
  it('레인 2의 2→6박과 4→8박처럼 겹치면(검증 위반 restZoneOverlap) 합쳐 2→8박 하나로 본다', () => {
    expect(mergeTouchingRestZones([zone(2, [2], [6]), zone(2, [4], [8])])).toEqual([zone(2, [2], [8])]);
  });
  it('레인 2의 0→8박 안에 2→4박이 들어 있으면 바깥 0→8박 하나로 본다', () => {
    expect(mergeTouchingRestZones([zone(2, [0], [8]), zone(2, [2], [4])])).toEqual([zone(2, [0], [8])]);
  });
  it('레인 2의 0→4박이 두 번 들어 있으면 0→4박 하나로 본다', () => {
    expect(mergeTouchingRestZones([zone(2, [0], [4]), zone(2, [0], [4])])).toEqual([zone(2, [0], [4])]);
  });
  it('순서가 뒤섞인 입력이면 레인 순서, 같은 레인 안에서는 시작 박 순서로 돌려준다', () => {
    expect(mergeTouchingRestZones([
      zone(4, [0], [2]), zone(2, [12], [20]), zone(1, [16], [24]), zone(2, [8], [12]), zone(1, [0], [4]),
    ])).toEqual([zone(1, [0], [4]), zone(1, [16], [24]), zone(2, [8], [20]), zone(4, [0], [2])]);
  });
  it('레인 2에 3/2→2박이 4/3→3/2박보다 먼저 들어와도 시작 박을 분수 크기로 정렬해 4/3→2박 하나로 잇는다', () => {
    expect(mergeTouchingRestZones([zone(2, [3, 2], [2]), zone(2, [4, 3], [3, 2])])).toEqual([zone(2, [4, 3], [2])]);
  });
  it('입력 배열과 그 안의 restZone 객체를 바꾸지 않는다', () => {
    const input = [zone(2, [12], [20]), zone(2, [8], [12])];
    const snapshot = structuredClone(input);
    const result = mergeTouchingRestZones(input);
    expect(input).toEqual(snapshot);
    expect(result).toEqual([zone(2, [8], [20])]);
    expect(result[0]).not.toBe(input[0]);
    expect(result[0]).not.toBe(input[1]);
  });
  it('restZone이 없으면 빈 배열이다', () => {
    expect(mergeTouchingRestZones([])).toEqual([]);
  });
});

describe('판넬 테두리 색 계산', () => {
  it('0x26263f를 2.6배 밝히면 채널마다 반올림해 0x6363a4다', () => {
    expect(brightenColor(0x26263f, 2.6)).toBe(0x6363a4);
  });
  it('0x808080을 2.6배 밝히면 채널마다 255에서 멈춰 0xffffff다', () => {
    expect(brightenColor(0x808080, 2.6)).toBe(0xffffff);
  });
  it('0x000000에서 0xffffff로 0.5만큼 섞으면 127.5를 반올림해 0x808080이다', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('0xff3344에서 0x333355로 0만큼 섞으면 0xff3344, 1만큼 섞으면 0x333355 그대로다', () => {
    expect(mixColor(0xff3344, 0x333355, 0)).toBe(0xff3344);
    expect(mixColor(0xff3344, 0x333355, 1)).toBe(0x333355);
  });
  it('밝은 레인색 둘레는 레인색을 2.6배 밝힌 색이라 짝수 레인 0x26263f → 0x6363a4, 홀수 레인 0x202038 → 0x535392다', () => {
    expect(REST_PANEL_RIM_BRIGHTNESS).toBe(2.6);
    expect(rimColor(0x26263f)).toBe(0x6363a4);
    expect(rimColor(0x202038)).toBe(0x535392);
  });
});

describe('판넬 좌우 변 띠', () => {
  const base = { separatorColor: 0x333355, outlineWidth: 2, separatorWidth: 3 };

  it('변 띠 테두리 폭 상수 REST_PANEL_OUTLINE_WIDTH는 2다', () => {
    expect(REST_PANEL_OUTLINE_WIDTH).toBe(2);
  });
  it('테두리가 있고 옆에 맞닿은 판넬이 없으면(seam 0) 진행도 0.5에서 폭 2·테두리 색 그대로·불투명도 0.5다', () => {
    expect(panelEdgeStrip({ ...base, progress: 0.5, seam: 0, outlineColor: 0x6363a4 })).toEqual({
      visible: true, width: 2, tint: 0x6363a4, alpha: 0.5,
    });
  });
  it('테두리가 있고 옆 판넬이 다 넘어가 있으면(seam 1) 폭이 구분선 절반 1.5·색이 구분선 0x333355·불투명도는 자기 진행도 0.8이다', () => {
    expect(panelEdgeStrip({ ...base, progress: 0.8, seam: 1, outlineColor: 0x6363a4 })).toEqual({
      visible: true, width: 1.5, tint: 0x333355, alpha: 0.8,
    });
  });
  it('테두리가 있고 옆 판넬이 반쯤 넘어가 있으면(seam 0.5) 폭 2와 1.5의 중간 1.75·색은 테두리와 구분선을 반씩 섞는다', () => {
    expect(panelEdgeStrip({ ...base, progress: 1, seam: 0.5, outlineColor: 0x6363a4 })).toEqual({
      visible: true, width: 1.75, tint: 0x4b4b7d, alpha: 1,
    });
  });
  it('테두리가 있고 옆 판넬이 0.25만큼 넘어가 있으면 폭 2 + (1.5 − 2) × 0.25 = 1.875·색은 테두리 0x6363a4 쪽 75% 섞음 0x575790이다', () => {
    expect(panelEdgeStrip({ ...base, progress: 1, seam: 0.25, outlineColor: 0x6363a4 })).toEqual({
      visible: true, width: 1.875, tint: 0x575790, alpha: 1,
    });
  });
  it('테두리가 없고(outlineColor null) 옆 판넬도 없으면 띠를 그리지 않고 불투명도 0이다', () => {
    const strip = panelEdgeStrip({ ...base, progress: 1, seam: 0, outlineColor: null });
    expect(strip.visible).toBe(false);
    expect(strip.alpha).toBe(0);
  });
  it('테두리가 없고 옆 판넬이 0.25만큼 넘어가 있으면 구분선 폭 절반 1.5·구분선 색으로 그리고 불투명도는 진행도 0.8 × 0.25 = 0.2다', () => {
    const strip = panelEdgeStrip({ ...base, progress: 0.8, seam: 0.25, outlineColor: null });
    expect(strip).toEqual({ visible: true, width: 1.5, tint: 0x333355, alpha: expect.closeTo(0.2, 12) });
  });
});

describe('게임 판넬 시각 값', () => {
  it('RFD 0034 결정 4대로 밝은 레인색 둘레·60°·원근 1.5·눈높이 0.5·300ms·빗금 밝기 1·간격 8·어둠 시작 0.4·윗변 밝기 0·묶기 켬·틈 메우기 켬이다', () => {
    expect(REST_PANEL_LOOK).toEqual({
      edge: 'rim', maxAngleDeg: 60, cameraDistance: 1.5, eyeHeight: 0.5, animMs: 300,
      hatchBrightness: 1, stripeWidth: 8, fadeStart: 0.4, topBrightness: 0, mergeAdjacent: true, fillGaps: true,
    });
  });
  it('게임 값으로 60° 넘어간 판넬의 화면 높이는 원래 높이의 50%다', () => {
    expect(fallenHeightRatio(REST_PANEL_LOOK.maxAngleDeg * Math.PI / 180, REST_PANEL_LOOK)).toBeCloseTo(0.5, 12);
  });
});

describe('차트 restZone을 판넬 입력으로 바꾸기', () => {
  const zone = (lane: RestZone['lane'], start: [number, number?], end: [number, number?]): RestZone => ({
    lane, beat: beat(...start), endBeat: beat(...end),
  });
  // 120 BPM(1박 500ms)에 차트 오프셋 1000ms.
  const timing = { beatToMs: (target: Beat) => 1000 + (target.n / target.d) * 500 };

  it('차트 레인 2의 8→12박과 12→16박이 맞닿으면 120 BPM·오프셋 1000ms에서 판넬 레인 1의 5000→9000ms 하나가 된다', () => {
    expect(toLaneRestZones([zone(2, [8], [12]), zone(2, [12], [16])], timing)).toEqual([{ lane: 1, start: 5000, end: 9000 }]);
  });
  it('차트 레인 1～4는 판넬 레인 0～3이 되고 결과는 레인 순서다', () => {
    expect(toLaneRestZones([zone(4, [0], [2]), zone(1, [0], [2]), zone(3, [0], [2]), zone(2, [0], [2])], timing).map(lane => lane.lane))
      .toEqual([0, 1, 2, 3]);
  });
  it('차트 레인 1의 0→4박·4→8박과 레인 2의 0→8박은 먼저 이어져 묶기(groupRestPanels 켬) 뒤 판넬 레인 0부터 2칸 판넬 하나 1000→5000ms가 된다', () => {
    const lanes = toLaneRestZones([zone(1, [0], [4]), zone(1, [4], [8]), zone(2, [0], [8])], timing);
    expect(groupRestPanels(lanes, true)).toEqual([{ firstLane: 0, laneCount: 2, start: 1000, end: 5000 }]);
  });
  it('차트 레인 4의 1/2→7/4박처럼 정수가 아닌 박이면 판넬 레인 3의 1250→1875ms다', () => {
    expect(toLaneRestZones([zone(4, [1, 2], [7, 4])], timing)).toEqual([{ lane: 3, start: 1250, end: 1875 }]);
  });
  it('beatToMs는 이은 뒤의 시작·끝 박으로만 불려 맞닿은 2개 구간이면 2번 불린다', () => {
    const beatToMs = vi.fn(timing.beatToMs);
    toLaneRestZones([zone(2, [8], [12]), zone(2, [12], [16])], { beatToMs });
    expect(beatToMs.mock.calls).toEqual([[beat(8)], [beat(16)]]);
  });
  it('실제 ChartTiming(120 BPM·offsetMs 100)을 넘기면 차트 레인 3의 2→6박이 판넬 레인 2의 1100→3100ms다', () => {
    const chartTiming = createChartTiming({
      notes: [], trillZones: [], events: [{ type: 'bpm', beat: BEAT_ZERO, bpm: 120 }], meta: { offsetMs: 100 },
    });
    expect(toLaneRestZones([zone(3, [2], [6])], chartTiming)).toEqual([{ lane: 2, start: 1100, end: 3100 }]);
  });
  it('입력 배열과 그 안의 restZone 객체를 바꾸지 않는다', () => {
    const input = [zone(2, [12], [16]), zone(2, [8], [12])];
    const snapshot = structuredClone(input);
    toLaneRestZones(input, timing);
    expect(input).toEqual(snapshot);
  });
  it('restZone이 없으면 빈 배열이다', () => {
    expect(toLaneRestZones([], timing)).toEqual([]);
  });
});
