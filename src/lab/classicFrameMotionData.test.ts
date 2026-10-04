import { describe, expect, it } from 'vitest';
import motionJsonText from '../../public/lab/classic-frame-fit/motion/frame-motion.json?raw';
import {
  formatViewBox,
  FRAME_MOTION_ASSET_DIR,
  FRAME_MOTION_DATA_PATH,
  FRAME_MOTION_SVG_PATH,
  FRAME_MOTION_VIEWS,
  parseFrameMotionData,
  readSvgBaseHref,
  viewBoxTransform,
} from './classicFrameMotionData';

const json = () => JSON.parse(motionJsonText);
const data = parseFrameMotionData(json());
// 공개 폴더의 PNG 목록(내용은 읽지 않는다).
const MOTION_PNGS = import.meta.glob('../../public/lab/classic-frame-fit/motion/*.png', { query: '?url', import: 'default' });

describe('parseFrameMotionData', () => {
  it('생성된 frame-motion.json을 읽으면 1024×1536 프레임, 광원 −841→2377·60초, 기포 5개, 유리 윤곽 2개(왼쪽·반전)', () => {
    expect(data.frame).toEqual({ width: 1024, height: 1536 });
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
    expect(() => parseFrameMotionData(value)).toThrow('accentOverlap');
  });

  it('장갑 텍스처(armor-lit 992×1520)는 왼쪽 기둥·오른쪽 기둥·아래 띠 조각 3개로 원래 상자(992×1456)의 47%(675,328px)만 그린다', () => {
    const { armorLit } = data.textures;
    expect([armorLit.width, armorLit.height]).toEqual([992, 1520]);
    expect(armorLit.pieces.map((piece) => [piece.x, piece.y, piece.width, piece.height])).toEqual([
      [16, 16, 208, 1328], [800, 16, 208, 1328], [32, 1344, 960, 128],
    ]);
    expect(armorLit.pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0)).toBe(675_328);
  });

  it('조각이 텍스처 밖(armor-lit 첫 조각 atlasX 900, 폭 208 > 992)을 가리키면 그 조각 경로를 담은 에러', () => {
    const value = json();
    value.textures.armorLit.pieces[0].atlasX = 900;
    expect(() => parseFrameMotionData(value)).toThrow('textures.armorLit.pieces[0]');
  });

  it('광원 주기가 숫자가 아니면 light.periodMs를 담은 에러, 유리 윤곽 점이 3개 미만이면 gauge.glass 에러', () => {
    const badLight = json();
    badLight.light.periodMs = '60s';
    expect(() => parseFrameMotionData(badLight)).toThrow('light.periodMs');
    const badGlass = json();
    badGlass.gauge.glass[0] = [[0, 0], [1, 1]];
    expect(() => parseFrameMotionData(badGlass)).toThrow('gauge.glass');
  });
});

describe('움직임 자료 경로', () => {
  it('텍스처·JSON은 /lab/classic-frame-fit/motion/ 아래, 비교 기준 SVG는 이미지 갤러리의 54-ambient-motion-v19.svg', () => {
    expect(FRAME_MOTION_ASSET_DIR).toBe('/lab/classic-frame-fit/motion');
    expect(FRAME_MOTION_DATA_PATH).toBe('/lab/classic-frame-fit/motion/frame-motion.json');
    expect(FRAME_MOTION_SVG_PATH).toBe('/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg');
  });

  it('JSON의 텍스처 파일 10개가 모두 motion 폴더의 PNG로 있다', () => {
    const files = Object.values(data.textures).map((box) => box.file).sort();
    expect(files).toHaveLength(10);
    const published = Object.keys(MOTION_PNGS).map((path) => path.split('/').pop()).sort();
    expect(published).toEqual(files);
  });
});

describe('비교 보기(viewBox)', () => {
  it('보기 세 개는 승인 SVG 시연과 같은 viewBox: 전체 0 0 1024 1536, 왼쪽 장갑 0 420 320 480, 하단 300 1240 424 212', () => {
    expect(Object.values(FRAME_MOTION_VIEWS).map((view) => [view.label, formatViewBox(view.viewBox)])).toEqual([
      ['전체', '0 0 1024 1536'],
      ['왼쪽 장갑', '0 420 320 480'],
      ['하단', '300 1240 424 212'],
    ]);
  });

  it('왼쪽 장갑(0 420 320 480)을 640×960 화면에 맞추면 배율 2, 위로 840 올린다', () => {
    expect(viewBoxTransform(FRAME_MOTION_VIEWS.left.viewBox, 640, 960)).toEqual({ scale: 2, x: 0, y: -840 });
  });

  it('하단(300 1240 424 212)을 비율이 다른 424×424 화면에 맞추면 배율 1로 가로를 채우고 세로 가운데(위 106)에 둔다', () => {
    expect(viewBoxTransform(FRAME_MOTION_VIEWS.bottom.viewBox, 424, 424)).toEqual({ scale: 1, x: -300, y: -1240 + 106 });
  });
});

describe('readSvgBaseHref', () => {
  it('SVG의 #fm-base href(data URL)를 꺼내고, 없으면 #fm-base를 찾지 못했다는 에러', () => {
    const withBase = { querySelector: (selector: string) => (selector === '#fm-base' ? { getAttribute: () => 'data:image/png;base64,AAAA' } : null) };
    expect(readSvgBaseHref(withBase as unknown as ParentNode)).toBe('data:image/png;base64,AAAA');
    expect(() => readSvgBaseHref({ querySelector: () => null } as unknown as ParentNode)).toThrow('#fm-base');
  });
});
