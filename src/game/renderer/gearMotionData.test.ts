import { describe, expect, it } from 'vitest';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import dataSource from './gearMotionData.ts?raw';
import {
  GEAR_MOTION_ASSET_DIR,
  GEAR_MOTION_DATA_PATH,
  parseGearMotionData,
} from './gearMotionData';

const json = () => JSON.parse(motionJsonText);
const data = parseGearMotionData(json());
// 공개 폴더의 PNG 목록(내용은 읽지 않는다).
const MOTION_PNGS = import.meta.glob('../../../public/gear/gear-motion/*.png', { query: '?url', import: 'default' });

describe('parseGearMotionData', () => {
  it('생성된 gear-motion.json을 읽으면 1024×1536 기어 그림, 광원 −841→2377·60초, 기포 5개, 유리 윤곽 2개(왼쪽·반전)', () => {
    expect(data.image).toEqual({ width: 1024, height: 1536 });
    expect(data.light).toMatchObject({ periodMs: 60000, fromY: -841, toY: 2377, tiltDeg: -14, outerHeight: 1380, coreHeight: 840 });
    expect(data.gauge.bubbles).toHaveLength(5);
    expect(data.gauge.glass).toHaveLength(2);
    // 반전한 유리 윤곽의 첫 점은 왼쪽 첫 점(136, 196)의 x' = 1023 − 136 = 887.
    expect(data.gauge.glass[0][0]).toEqual([136, 196]);
    expect(data.gauge.glass[1][0]).toEqual([887, 196]);
  });

  it('텍스처 상자가 빠지면 그 키 이름(accentOverlap)을 담은 에러', () => {
    const value = json();
    delete value.textures.accentOverlap;
    expect(() => parseGearMotionData(value)).toThrow('accentOverlap');
  });

  it('장갑 텍스처(armor-lit 512×1680 아틀라스)는 기둥 둘·아래 띠 두 쪽 조각 4개로 원래 상자(992×1456)의 47%(675,328px)만 그린다', () => {
    const { armorLit } = data.textures;
    expect([armorLit.width, armorLit.height]).toEqual([512, 1680]);
    expect(armorLit.pieces.map((piece) => [piece.x, piece.y, piece.width, piece.height])).toEqual([
      [16, 16, 208, 1328], [800, 16, 208, 1328], [32, 1344, 480, 128], [512, 1344, 480, 128],
    ]);
    expect(armorLit.pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0)).toBe(675_328);
  });

  it('조각이 텍스처 밖(armor-lit 첫 조각 atlasX 900, 폭 208 > 992)을 가리키면 그 조각 경로를 담은 에러', () => {
    const value = json();
    value.textures.armorLit.pieces[0].atlasX = 900;
    expect(() => parseGearMotionData(value)).toThrow('textures.armorLit.pieces[0]');
  });

  it('광원 주기가 숫자가 아니면 light.periodMs를 담은 에러, 유리 윤곽 점이 3개 미만이면 gauge.glass 에러', () => {
    const badLight = json();
    badLight.light.periodMs = '60s';
    expect(() => parseGearMotionData(badLight)).toThrow('light.periodMs');
    const badGlass = json();
    badGlass.gauge.glass[0] = [[0, 0], [1, 1]];
    expect(() => parseGearMotionData(badGlass)).toThrow('gauge.glass');
  });
});

describe('gearMotion 에셋 경로', () => {
  it('텍스처 9장과 gear-motion.json은 기어 그림 옆 /gear/gear-motion/ 아래에 있다(Lab 경로가 아님)', () => {
    expect(GEAR_MOTION_ASSET_DIR).toBe('/gear/gear-motion');
    expect(GEAR_MOTION_DATA_PATH).toBe('/gear/gear-motion/gear-motion.json');
  });

  it('JSON의 텍스처 파일 9개가 모두 /gear/gear-motion/ 폴더의 PNG로 있다(armor-shape 없음)', () => {
    const files = Object.values(data.textures).map((box) => box.file).sort();
    expect(files).toHaveLength(9);
    expect(files).not.toContain('armor-shape.png');
    const published = Object.keys(MOTION_PNGS).map((path) => path.split('/').pop()).sort();
    expect(published).toEqual(files);
  });

  it('게임 자료 모듈은 Lab 경로·승인 SVG·비교 보기를 모른다(/lab·svg·viewBox 없음)', () => {
    expect(dataSource).not.toMatch(/['"]\/lab\//);
    expect(dataSource).not.toContain('.svg');
    expect(dataSource).not.toContain('viewBox');
    expect(dataSource).not.toMatch(/from ['"][^'"]*lab/);
  });
});
