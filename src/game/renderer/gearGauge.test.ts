import { describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { GEAR_GEOMETRY } from './gearLayout';
import gearGaugeSource from './gearGauge.ts?raw';
import {
  clampGaugeLevel,
  easeGaugeLevel,
  GEAR_GAUGE_EASE_TAU_MS,
  GEAR_GAUGE_EDGE_ROWS,
  GearGauge,
  gaugeCoverAlpha,
  gaugeCoverBottom,
  gaugeEmptyRows,
} from './gearGauge';

const FILL_ROWS = GEAR_GEOMETRY.gauge.fillRows;

describe('clampGaugeLevel — 고도를 게이지 채움 0~1로 자른다', () => {
  it('고도 1.3은 1, −0.2는 0, 0.45는 그대로 0.45', () => {
    expect([clampGaugeLevel(1.3), clampGaugeLevel(-0.2), clampGaugeLevel(0.45)]).toEqual([1, 0, 0.45]);
  });

  it('NaN·무한대 고도는 비행 배경과 같은 규칙으로 0(빈 유리관)으로 본다', () => {
    expect([clampGaugeLevel(Number.NaN), clampGaugeLevel(Number.POSITIVE_INFINITY), clampGaugeLevel(Number.NEGATIVE_INFINITY)]).toEqual([0, 0, 0]);
  });
});

describe('gaugeEmptyRows — 채움에서 위쪽 빈 유리 행 수(정수 행)', () => {
  it('채움 구간은 196~1016행의 821행이다', () => {
    expect(FILL_ROWS).toBe(821);
  });

  it('채움 0이면 821행 전부, 채움 1이면 0행을 비운다', () => {
    expect(gaugeEmptyRows(0, FILL_ROWS)).toBe(821);
    expect(gaugeEmptyRows(1, FILL_ROWS)).toBe(0);
  });

  it('채움 0.3이면 (1 − 0.3) × 821 = 574.7을 반올림해 575행, 채움 0.6이면 328.4를 반올림해 328행을 비운다', () => {
    expect(gaugeEmptyRows(0.3, FILL_ROWS)).toBe(575);
    expect(gaugeEmptyRows(0.6, FILL_ROWS)).toBe(328);
  });

  it('채움 −1·NaN이면 821행, 채움 2면 0행(먼저 0~1로 자른다)', () => {
    expect([gaugeEmptyRows(-1, FILL_ROWS), gaugeEmptyRows(Number.NaN, FILL_ROWS), gaugeEmptyRows(2, FILL_ROWS)]).toEqual([821, 821, 0]);
  });
});

describe('gaugeCoverBottom·gaugeCoverAlpha — 빈 유리 덮개와 아래 8행 부드러운 경계', () => {
  const alphas = (bottom: number, rows: number[]) => rows.map((row) => gaugeCoverAlpha(bottom, row));

  it('부드러운 경계는 8행이다(승인 시연의 8px 그라데이션)', () => {
    expect(GEAR_GAUGE_EDGE_ROWS).toBe(8);
  });

  it('빈 행 0개(채움 1)면 덮개 아래끝이 0이라 어떤 행도 덮지 않는다', () => {
    expect(gaugeCoverBottom(0, FILL_ROWS)).toBe(0);
    expect(alphas(0, [0, 1, 400])).toEqual([0, 0, 0]);
  });

  it('빈 행 821개(채움 0)면 경계를 유리관 밖으로 밀어 아래끝 829, 맨 아래 820행까지 알파 1로 모두 덮는다', () => {
    const bottom = gaugeCoverBottom(821, FILL_ROWS);
    expect(bottom).toBe(829);
    expect(alphas(bottom, [0, 400, 812, 813, 820])).toEqual([1, 1, 1, 1, 1]);
  });

  it('빈 행 575개면 경계 가운데가 575행 위끝에 와서 570행까지 알파 1, 571~578행은 15/16→1/16(574행 9/16·575행 7/16), 579행부터 0', () => {
    const bottom = gaugeCoverBottom(575, FILL_ROWS);
    expect(bottom).toBe(579);
    expect(alphas(bottom, [0, 570])).toEqual([1, 1]);
    expect(alphas(bottom, [571, 572, 573, 574, 575, 576, 577, 578])).toEqual([15, 13, 11, 9, 7, 5, 3, 1].map((n) => n / 16));
    expect(alphas(bottom, [579, 700])).toEqual([0, 0]);
  });

  it('빈 행 3개처럼 경계 8행보다 짧으면 반(1행)만 내려 아래끝 4: 0~3행 알파 7/16·5/16·3/16·1/16로 위끝에서 갑자기 진하게 생기지 않는다', () => {
    const bottom = gaugeCoverBottom(3, FILL_ROWS);
    expect(bottom).toBe(4);
    expect(alphas(bottom, [0, 1, 2, 3, 4])).toEqual([7 / 16, 5 / 16, 3 / 16, 1 / 16, 0]);
  });
});

describe('easeGaugeLevel — 표시 채움이 목표로 다가간다(지수 접근, 승인 시연 300ms ease-out 느낌)', () => {
  it('시간 상수 τ는 75ms다', () => {
    expect(GEAR_GAUGE_EASE_TAU_MS).toBe(75);
  });

  it('1에서 목표 0.5로 25ms씩 세 걸음(75ms = τ) 지나면 남은 거리는 0.5 × e⁻¹ ≈ 0.184', () => {
    let level = 1;
    for (let step = 0; step < 3; step++) level = easeGaugeLevel(level, 0.5, 25);
    expect(level - 0.5).toBeCloseTo(0.5 * Math.exp(-1), 12);
  });

  it('8ms 두 걸음과 16ms 한 걸음은 같은 곳에 이른다(프레임률과 무관)', () => {
    const twoSteps = easeGaugeLevel(easeGaugeLevel(0.9, 0.2, 8), 0.2, 8);
    const oneStep = easeGaugeLevel(0.9, 0.2, 16);
    expect(twoSteps).toBeCloseTo(oneStep, 12);
  });

  it('MISS 낙하(1 → 0.76)는 16ms 프레임으로 300ms 뒤 98% 넘게 내려가고 420ms 안에 목표 0.76에 붙는다', () => {
    let level = 1;
    let elapsed = 0;
    while (elapsed < 300) { level = easeGaugeLevel(level, 0.76, 16); elapsed += 16; }
    expect((1 - level) / 0.24).toBeGreaterThan(0.98);
    while (elapsed < 420) { level = easeGaugeLevel(level, 0.76, 16); elapsed += 16; }
    expect(level).toBe(0.76);
  });

  it('남은 거리가 0.001보다 작아지면 목표로 맞춰 더는 움직이지 않는다', () => {
    expect(easeGaugeLevel(0.5005, 0.5, 1)).toBe(0.5);
  });

  it('간격 0·음수·NaN(곡 시작 전 한 장·일시정지)이면 표시 채움이 그대로다', () => {
    expect([easeGaugeLevel(0.8, 0.2, 0), easeGaugeLevel(0.8, 0.2, -16), easeGaugeLevel(0.8, 0.2, Number.NaN)]).toEqual([0.8, 0.8, 0.8]);
  });

  it('한 프레임 간격 5000ms(숨은 탭 복귀)도 기어 움직임처럼 50ms만큼만 다가간다', () => {
    expect(easeGaugeLevel(1, 0, 5000)).toBeCloseTo(easeGaugeLevel(1, 0, 50), 12);
    expect(easeGaugeLevel(1, 0, Number.POSITIVE_INFINITY)).toBeCloseTo(easeGaugeLevel(1, 0, 50), 12);
  });
});

describe('GearGauge — 두 유리관에 같은 고도를 빈 유리 덮개로 그린다', () => {
  const atlas = () => new Texture({ source: new TextureSource({ width: GEAR_GEOMETRY.gauge.atlasWidth, height: GEAR_GEOMETRY.gauge.atlasHeight }) });
  const create = (reducedMotion = false) => {
    const texture = atlas();
    const gauge = new GearGauge({ texture, geometry: GEAR_GEOMETRY.gauge, reducedMotion });
    return { gauge, texture };
  };
  const tube = (gauge: GearGauge, side: 'left' | 'right') => gauge.container.getChildByLabel(`gear-gauge-${side}`) as Container;
  const body = (gauge: GearGauge, side: 'left' | 'right') => tube(gauge, side).getChildByLabel('gear-gauge-body') as Sprite;
  const edges = (gauge: GearGauge, side: 'left' | 'right') =>
    tube(gauge, side).children.filter((child) => child.label.startsWith('gear-gauge-edge-')) as Sprite[];

  it('왼쪽·오른쪽 유리관 덮개를 기어 그림 좌표 (136, 196)·(815, 196)에 놓고 각각 본체 1개와 경계 8행을 둔다', () => {
    const { gauge } = create();
    expect(gauge.container.label).toBe('gear-gauge');
    expect([tube(gauge, 'left').x, tube(gauge, 'left').y]).toEqual([136, 196]);
    expect([tube(gauge, 'right').x, tube(gauge, 'right').y]).toEqual([815, 196]);
    expect(edges(gauge, 'left')).toHaveLength(8);
    expect(edges(gauge, 'right')).toHaveLength(8);
  });

  it('처음(update 전)과 채움 1(가득)이면 덮개 컨테이너를 숨겨 기어 그림이 그대로 보인다', () => {
    const { gauge } = create();
    expect(gauge.container.visible).toBe(false);
    gauge.update(1, 16);
    expect([gauge.level, gauge.emptyRows, gauge.container.visible]).toEqual([1, 0, false]);
  });

  it('첫 update(0.3, 16)은 이징 없이 0.3으로 맞추고 두 유리관 모두 본체가 아틀라스 상자 위끝부터 571행, 경계 8행이 571~578행을 15/16→1/16로 덮는다', () => {
    const { gauge } = create();
    gauge.update(0.3, 16);
    expect([gauge.level, gauge.target, gauge.emptyRows, gauge.container.visible]).toEqual([0.3, 0.3, 575, true]);
    for (const [side, atlasX] of [['left', 8], ['right', 111]] as const) {
      const main = body(gauge, side);
      expect(main.visible).toBe(true);
      expect([main.x, main.y, main.width, main.height]).toEqual([0, 0, 73, 571]);
      const frame = main.texture.frame;
      expect([frame.x, frame.y, frame.width, frame.height]).toEqual([atlasX, 4, 73, 571]);
      const rows = edges(gauge, side);
      expect(rows.map((row) => row.y)).toEqual([571, 572, 573, 574, 575, 576, 577, 578]);
      expect(rows.map((row) => row.texture.frame.y)).toEqual([575, 576, 577, 578, 579, 580, 581, 582]);
      expect(rows.map((row) => row.texture.frame.height)).toEqual(Array(8).fill(1));
      expect(rows.map((row) => row.alpha)).toEqual([15, 13, 11, 9, 7, 5, 3, 1].map((n) => n / 16));
      expect(rows.every((row) => row.visible)).toBe(true);
    }
  });

  it('채움 0이면 본체 하나가 821행 전부를 알파 1로 덮고 경계 행은 유리관 밖이라 숨긴다', () => {
    const { gauge } = create();
    gauge.update(0, 16);
    expect(gauge.emptyRows).toBe(821);
    expect(body(gauge, 'left').height).toBe(821);
    expect(edges(gauge, 'left').some((row) => row.visible)).toBe(false);
  });

  it('0.3에서 목표 0.8을 걸면 16ms 뒤 표시는 0.3과 0.8 사이로 다가가고 두 유리관이 같은 행을 덮는다', () => {
    const { gauge } = create();
    gauge.update(0.3, 16);
    gauge.update(0.8, 16);
    expect(gauge.target).toBe(0.8);
    expect(gauge.level).toBeGreaterThan(0.3);
    expect(gauge.level).toBeLessThan(0.8);
    expect(body(gauge, 'left').height).toBe(body(gauge, 'right').height);
    expect(gauge.emptyRows).toBe(gaugeEmptyRows(gauge.level, FILL_ROWS));
  });

  it('snapNext 뒤 다음 update는 이징 없이 목표 0.8로 바로 맞춘다(차트 다시 걸기·곡 시작 전 한 장)', () => {
    const { gauge } = create();
    gauge.update(0.3, 16);
    gauge.snapNext();
    gauge.update(0.8, 0);
    expect(gauge.level).toBe(0.8);
  });

  it('움직임 줄이기면 update마다 이징 없이 목표로 바로 맞춘다', () => {
    const { gauge } = create(true);
    gauge.update(0.3, 16);
    gauge.update(0.8, 16);
    expect(gauge.level).toBe(0.8);
  });

  it('표시 행이 그대로면(같은 고도로 다시 update) 덮개 텍스처를 다시 고치지 않는다', () => {
    const { gauge } = create();
    gauge.update(0.3, 16);
    const textures = [body(gauge, 'left'), ...edges(gauge, 'left')].map((sprite) => sprite.texture);
    const spies = textures.map((texture) => vi.spyOn(texture, 'update'));
    gauge.update(0.3, 16);
    gauge.update(0.3, 16);
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it('destroy하면 덮개 컨테이너와 게이지가 만든 텍스처만 파괴하고 받은 아틀라스 텍스처·소스는 남긴다', () => {
    const { gauge, texture } = create();
    const parent = new Container();
    parent.addChild(gauge.container);
    gauge.update(0.5, 16);
    const owned = body(gauge, 'left').texture;
    gauge.destroy();
    expect(gauge.container.destroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(owned.destroyed).toBe(true);
    expect(texture.destroyed).toBe(false);
    expect(texture.source.destroyed).toBe(false);
    gauge.update(0.2, 16);
    gauge.destroy();
  });
});

describe('GearGauge 그리기 방식', () => {
  it('부드러운 경계를 마스크·필터·렌더 텍스처 없이 아틀라스 행 스프라이트의 알파로만 그린다(추가 렌더 패스 없음)', () => {
    for (const forbidden of ['RenderTexture', 'setMask', '.mask', 'filters', 'Graphics']) {
      expect(gearGaugeSource, forbidden).not.toContain(forbidden);
    }
  });
});
