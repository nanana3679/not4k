import { describe, expect, it } from 'vitest';
import {
  depthFadeAlpha, fallenHeightRatio, groupRestPanels, minRestZoneMs, neighborProgress, noteDwellMs, panelCorners, restPanelState,
  restPanelTiming, sharedCameraLane,
} from './restZonePanel';

describe('restZone 판넬 시각', () => {
  const timing = { startMs: 4000, endMs: 12000, animMs: 300 };

  it.each([
    [3699, 0, 'up', '시작 301ms 전이면 progress 0으로 평상'],
    [3700, 0, 'up', '시작 300ms 전이면 progress 0으로 평상'],
    [3850, 0.25, 'falling', '시작 150ms 전이면 progress 0.25로 꺼지는 중'],
    [4000, 1, 'down', '시작 4000ms이면 progress 1로 꺼짐'],
    [11700, 1, 'down', '종료 300ms 전이면 progress 1로 꺼짐'],
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

  it.each([0, -100])('애니메이션 %s ms이면 3999ms에 평상·4000~11999ms에 꺼짐·12000ms에 평상으로 즉시 전환한다', animMs => {
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
    [4000, 0, 'up', '시작 시각이면 꺼지기 시작하는 순간이라 progress 0'],
    [4150, 0.25, 'falling', '시작 150ms 후이면 꺼지는 중'],
    [4300, 1, 'down', '시작 300ms 후이면 다 꺼짐'],
    [10500, 1, 'down', '뒤 노트가 나타나기 300ms 전이면 아직 꺼짐'],
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

  it('빈 레인 창 300ms가 애니메이션 2번(600ms)보다 짧으면 4150ms에 최대 progress 0.25까지만 꺼진다', () => {
    const short = restPanelTiming(4000, 5500, 1200, 300);
    const states = Array.from({ length: 1501 }, (_, i) => restPanelState(4000 + i, short));
    expect(Math.max(...states.map(state => state.progress))).toBeCloseTo(0.25, 12);
    expect(states.every(state => state.phase !== 'down')).toBe(true);
  });

  it('restZone 1000ms가 머무는 시간 1200ms보다 짧으면 빈 레인 창이 없어 판넬이 한 번도 꺼지지 않는다', () => {
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

  it('restZone이 최소 길이 2100ms(추정 녹숫 1500ms + 애니메이션 300ms × 2)면 1ms라도 다 꺼진다', () => {
    const exact = restPanelTiming(4000, 6100, 1500, 300);
    expect(restPanelState(4300, exact)).toEqual({ progress: 1, phase: 'down' });
    expect(restPanelState(4301, exact).phase).toBe('rising');
  });

  it('애니메이션 0ms이면 빈 레인 창 4000~10799ms 동안만 즉시 꺼진다', () => {
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
      { lane: 4, beat: 8, endBeat: 24 }, { lane: 3, beat: 8, endBeat: 24 },
    ], true)).toEqual([{ firstLane: 3, laneCount: 2, beat: 8, endBeat: 24 }]);
  });
  it('레인 3은 8→24박·레인 4는 12→24박처럼 시작 박이 다르면 묶기를 켜도 판넬이 레인마다 따로다', () => {
    expect(groupRestPanels([
      { lane: 3, beat: 8, endBeat: 24 }, { lane: 4, beat: 12, endBeat: 24 },
    ], true)).toEqual([
      { firstLane: 3, laneCount: 1, beat: 8, endBeat: 24 },
      { firstLane: 4, laneCount: 1, beat: 12, endBeat: 24 },
    ]);
  });
  it('레인 3·4가 시작 박은 같고 끝 박만 24·26으로 다르면 따로다', () => {
    expect(groupRestPanels([
      { lane: 3, beat: 8, endBeat: 24 }, { lane: 4, beat: 8, endBeat: 26 },
    ], true)).toHaveLength(2);
  });
  it('레인 1·2·4가 같은 구간이면 붙어 있는 1·2만 묶고 떨어진 4는 따로다', () => {
    expect(groupRestPanels([
      { lane: 1, beat: 8, endBeat: 24 }, { lane: 2, beat: 8, endBeat: 24 }, { lane: 4, beat: 8, endBeat: 24 },
    ], true)).toEqual([
      { firstLane: 1, laneCount: 2, beat: 8, endBeat: 24 },
      { firstLane: 4, laneCount: 1, beat: 8, endBeat: 24 },
    ]);
  });
  it('묶기를 끄면 같은 구간인 레인 3·4도 레인마다 판넬 하나다', () => {
    expect(groupRestPanels([
      { lane: 3, beat: 8, endBeat: 24 }, { lane: 4, beat: 8, endBeat: 24 },
    ], false)).toEqual([
      { firstLane: 3, laneCount: 1, beat: 8, endBeat: 24 },
      { firstLane: 4, laneCount: 1, beat: 8, endBeat: 24 },
    ]);
  });
  it('한 레인에 구간이 8→12박·16→24박 둘이면 묶기를 켜도 시간 순서대로 판넬 두 개다', () => {
    expect(groupRestPanels([
      { lane: 2, beat: 16, endBeat: 24 }, { lane: 2, beat: 8, endBeat: 12 },
    ], true)).toEqual([
      { firstLane: 2, laneCount: 1, beat: 8, endBeat: 12 },
      { firstLane: 2, laneCount: 1, beat: 16, endBeat: 24 },
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
  it('붙어 있어도 이웃 progress가 0이면 자기 가운데에서 본다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 0 }];
    expect(sharedCameraLane(panels, 0)).toBe(2.5);
  });
  it('레인 2(progress 1) 오른쪽에 레인 3이 0.5로 접히면 레인 2의 이웃은 왼쪽 0·오른쪽 0.5다', () => {
    const panels = [{ firstLane: 2, laneCount: 1, progress: 1 }, { firstLane: 3, laneCount: 1, progress: 0.5 }];
    expect(neighborProgress(panels, 0)).toEqual({ left: 0, right: 0.5 });
    expect(neighborProgress(panels, 1)).toEqual({ left: 1, right: 0 });
  });
});
