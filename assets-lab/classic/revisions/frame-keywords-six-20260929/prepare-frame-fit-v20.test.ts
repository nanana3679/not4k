import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAUGE_MIRROR_SUM, GLASS, GLASS_FEATHER, glassInteriorAlpha } from './frame-motion-shared.mjs';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));

// 기어 그림은 생성기가 만든 한 벌만 둔다. 게임 렌더러·/lab/gear·움직임 생성기가 모두 이 두 파일을 읽는다.
describe('기어 생성기 산출물 (RFD 0029)', () => {
  it('생성기는 게임 경로 public/gear/gear.png와 src/game/renderer/gearGeometry.json에만 쓴다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs').toString();
    expect(script).toContain("resolve(workspaceRoot, 'public/gear/gear.png')");
    expect(script).toContain("resolve(workspaceRoot, 'src/game/renderer/gearGeometry.json')");
    expect(script).not.toContain('public/lab/classic-frame-fit');
  });

  it('Lab 복사본(public/lab/classic-frame-fit/frame-cutout.png·frame-fit.json)은 남아 있지 않다', () => {
    expect(existsSync(new URL('public/lab/classic-frame-fit/frame-cutout.png', root))).toBe(false);
    expect(existsSync(new URL('public/lab/classic-frame-fit/frame-fit.json', root))).toBe(false);
  });

  it('#231 이전 이름(public/gear/classic-frame.png·classic-frame-motion/, src/game/renderer/classicFrame.json)은 남아 있지 않다', () => {
    expect(existsSync(new URL('public/gear/classic-frame.png', root))).toBe(false);
    expect(existsSync(new URL('public/gear/classic-frame-motion', root))).toBe(false);
    expect(existsSync(new URL('src/game/renderer/classicFrame.json', root))).toBe(false);
  });

  it('Classic 접두사를 붙였던 이름(public/gear/classic-gear.png·classic-gear-motion/, src/game/renderer/classicGear.json)도 남아 있지 않다', () => {
    expect(existsSync(new URL('public/gear/classic-gear.png', root))).toBe(false);
    expect(existsSync(new URL('public/gear/classic-gear-motion', root))).toBe(false);
    expect(existsSync(new URL('src/game/renderer/classicGear.json', root))).toBe(false);
  });

  it('움직임 생성기도 같은 기어 그림의 알파를 입력으로 읽는다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-motion-v21.mjs').toString();
    expect(script).toContain("const cutoutPath = resolve(workspaceRoot, 'public/gear/gear.png');");
  });

  it('기어 그림은 측정값과 같은 1024×1536 PNG이고 승인된 Lab 컷아웃(PR #218)과 같은 바이트(sha256 194d6955…)다', () => {
    const geometry = JSON.parse(read('src/game/renderer/gearGeometry.json').toString());
    const png = read('public/gear/gear.png');
    expect(geometry.image).toBe('public/gear/gear.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([geometry.width, geometry.height]);
    // 생성기를 다시 돌려 그림이 바뀌면 이 해시와 gearLayout.test.ts의 측정값을 함께 바꾼다.
    expect(createHash('sha256').update(png).digest('hex')).toBe('194d6955319b9aea3fab8e9d2c657c71d02bbb4e6b9574c7d0256ae56b5b1167');
  });
});

// 고도 게이지의 빈 유리(PR #235). 생성기가 승인 시연(press-animation.html)과 같은 유리 안쪽 윤곽으로 v18 빈 유리를 잘라 아틀라스로 쓴다.
describe('빈 유리관 아틀라스 (고도 게이지)', () => {
  const geometry = () => JSON.parse(read('src/game/renderer/gearGeometry.json').toString());

  it('생성기는 v18 빈 유리 생성 이미지를 읽어 게임 경로 public/gear/gear-gauge-empty.png에 쓴다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-frame-fit-v20.mjs').toString();
    expect(script).toContain("resolve(revisionDir, 'gauge-empty-insert-v18.png')");
    expect(script).toContain("resolve(workspaceRoot, 'public/gear/gear-gauge-empty.png')");
  });

  it('공유 유리 윤곽은 승인 시연의 GLASS(x 136~208, 위 196→203, 아래 1010→1016, 흐림 2px)·반전 합 1023과 같다', () => {
    const demo = read('lab/image-galleries/frame-keywords-six-20260929/press-animation.html').toString();
    expect(demo).toContain('const GLASS = { x0: 136, x1: 208, centerX: 172, top: [196, 203], bottom: [1010, 1016], feather: 2 };');
    expect(demo).toContain('const GAUGE_MIRROR_SUM = 1023;');
    expect(GLASS).toEqual({ x0: 136, x1: 208, top: [196, 203], bottom: [1010, 1016] });
    expect([GLASS_FEATHER, GAUGE_MIRROR_SUM]).toEqual([2, 1023]);
  });

  it('유리 알파는 옆벽 x 136에서 1/3, 137에서 2/3, 138부터 1이고 가운데(172)의 위끝 203행·아래끝 1016행에서 1/3, 바깥(135·1017행)은 0이다', () => {
    expect(glassInteriorAlpha(136, 600)).toBeCloseTo(1 / 3, 12);
    expect(glassInteriorAlpha(137, 600)).toBeCloseTo(2 / 3, 12);
    expect(glassInteriorAlpha(138, 600)).toBe(1);
    expect(glassInteriorAlpha(172, 203)).toBeCloseTo(1 / 3, 12);
    expect(glassInteriorAlpha(172, 1016)).toBeCloseTo(1 / 3, 12);
    expect([glassInteriorAlpha(135, 600), glassInteriorAlpha(172, 1017), glassInteriorAlpha(172, 201)]).toEqual([0, 0, 0]);
  });

  it('gearGeometry.json의 gauge는 채움 구간 196~1016행(821행)과 두 유리관 상자(왼쪽 x 136·오른쪽 815, 폭 73)를 192×832 아틀라스의 16px 정렬 자리(8,4)·(111,4)에 적는다', () => {
    const { gauge } = geometry();
    expect(gauge).toEqual({
      image: 'public/gear/gear-gauge-empty.png',
      source: 'assets-lab/classic/revisions/frame-keywords-six-20260929/gauge-empty-insert-v18.png',
      width: 192,
      height: 832,
      glass: { x0: 136, x1: 208, top: [196, 203], bottom: [1010, 1016], feather: 2, mirrorSum: 1023 },
      fillTop: 196,
      fillRows: 821,
      tubes: [
        { x: 136, y: 196, width: 73, height: 821, atlasX: 8, atlasY: 4 },
        { x: 815, y: 196, width: 73, height: 821, atlasX: 111, atlasY: 4 },
      ],
    });
  });

  it('gearGeometry.json의 유리 상자는 움직임 자료 gear-motion.json의 유리 다각형(왼쪽·반전) 범위와 같다(윤곽의 원본은 하나)', () => {
    const { gauge } = geometry();
    const motion = JSON.parse(read('public/gear/gear-motion/gear-motion.json').toString());
    expect(motion.gauge.mirrorSum).toBe(gauge.glass.mirrorSum);
    gauge.tubes.forEach((tube: { x: number; y: number; width: number; height: number }, index: number) => {
      const polygon: [number, number][] = motion.gauge.glass[index];
      const xs = polygon.map(([x]) => x);
      const ys = polygon.map(([, y]) => y);
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([tube.x, tube.x + tube.width - 1]);
      expect([Math.min(...ys), Math.max(...ys)]).toEqual([tube.y, tube.y + tube.height - 1]);
    });
  });

  it('빈 유리관 아틀라스는 gauge가 적은 192×832 RGBA PNG(색 형식 6)이고 sha256 고정값과 같다', () => {
    const { gauge } = geometry();
    const png = read('public/gear/gear-gauge-empty.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([gauge.width, gauge.height]);
    expect(png[25]).toBe(6);
    // 생성기를 다시 돌려 그림이 바뀌면 이 해시를 함께 바꾼다.
    expect(createHash('sha256').update(png).digest('hex')).toBe('2f1b6d46607b53040b26fecb29300b4e81b4aec84ce0668ec347aa0fe0a0649d');
  });
});
