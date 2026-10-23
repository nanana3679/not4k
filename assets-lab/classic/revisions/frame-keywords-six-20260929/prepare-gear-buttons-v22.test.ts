import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAP_EASING, DEPTH, GLOW_EASING, IDLE_REGIONS, LIGHTS, MIN_SLOT, MIRROR_SUM, PRESSED_KEYS, RELEASE, SINK, SOURCE_TRAVEL,
  STRETCH_BLUR, WHITE_SHARE, baseKey, feather, keyRegion, mirrorRegion, polylineAt, sinkCap, whiteMs,
} from './button-press-shared.mjs';
import { ALIGN, FRAME_GAP, alignedCrop, packColumns } from './gear-buttons-atlas.mjs';
import { decimal } from './frame-motion-shared.mjs';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const demo = read('lab/image-galleries/frame-keywords-six-20260929/press-depth.html').toString();
const geometry = JSON.parse(read('src/game/renderer/gearButtonGeometry.json').toString());

type Region = { x0: number; x1: number; y0: number; y1: number; left: number; right: number; top: number; bottom: number };
type Frame = { x: number; y: number; width: number; height: number; atlasX: number; atlasY: number };
// 시연 페이지가 적은 모양 그대로: { x0: 200, x1: 372, ... }, [[221, 1207], ...], [.25, .78, 1].
const regionText = (region: Region) => `{ x0: ${region.x0}, x1: ${region.x1}, y0: ${region.y0}, y1: ${region.y1}, left: ${region.left}, right: ${region.right}, top: ${region.top}, bottom: ${region.bottom} }`;
const pointsText = (points: number[][]) => `[${points.map(([x, y]) => `[${x}, ${y}]`).join(', ')}]`;
const listText = (values: number[]) => `[${values.map(decimal).join(', ')}]`;
const frames = (): Frame[] => geometry.buttons.flatMap((button: { glow: Record<string, Frame[]>; tint: Record<string, Frame>; cap: Frame }) => [
  ...button.glow.single, ...button.glow.double, button.tint.single, button.tint.double, button.cap,
]);

describe('공유 모듈(button-press-shared.mjs) — 버튼 누름 깊이 비교 시연과 같은 값', () => {
  it('반전 합 1022·누름 깊이 15px·소재가 이미 내려간 깊이(1번 0px·2번 6px)·슬롯 2px·늘린 뒷벽 흐림 2px이 press-depth.html에 그대로 있다', () => {
    expect(demo).toContain(`const MIRROR_SUM = ${MIRROR_SUM};`);
    expect(demo).toContain(`const DEFAULT_DEPTH = "${DEPTH}";`);
    expect(demo).toContain(`const SOURCE_TRAVEL = { 1: ${SOURCE_TRAVEL[1]}, 2: ${SOURCE_TRAVEL[2]} };`);
    expect(demo).toContain(`const MIN_SLOT = ${MIN_SLOT};`);
    expect(demo).toContain(`const STRETCH_BLUR = ${STRETCH_BLUR};`);
    expect(DEPTH).toBe(15);
  });

  it('대기 보정 영역과 1·2번 키의 빛(glow)·키캡 덮개(cap) 영역이 press-depth.html의 줄과 같다', () => {
    expect(demo).toContain(`patch: ${regionText(IDLE_REGIONS.patch)},`);
    expect(demo).toContain(`gap: ${regionText(IDLE_REGIONS.gap)},`);
    for (const key of [1, 2] as const) {
      expect(demo).toContain(`glow: ${regionText(PRESSED_KEYS[key].glow)},`);
      expect(demo).toContain(`cap: ${regionText(PRESSED_KEYS[key].cap)},`);
    }
  });

  it('열마다 잰 키캡 윤곽(SINK의 columns·fixedAbove·capTop·capBottom·lip)이 press-depth.html의 줄과 같다', () => {
    for (const key of [1, 2] as const) {
      const outline = SINK[key];
      expect(demo).toContain(`columns: [${outline.columns[0]}, ${outline.columns[1]}],`);
      for (const name of ['fixedAbove', 'capTop', 'capBottom', 'lip'] as const) expect(demo).toContain(`${name}: ${pointsText(outline[name])},`);
    }
  });

  it('싱글 연파랑 잔광 이득 (0.25, 0.78, 1)·더블 금색 방향 (0.959, 0.643, 0.163)과 잔광 이득 (1, 0.82, 0.44)·흰빛 몫 0.35가 press-depth.html과 같다', () => {
    expect(demo).toContain(`single: { decayTint: ${listText(LIGHTS.single.decayTint)} },`);
    expect(demo).toContain(`double: { hue: ${listText(LIGHTS.double.hue)}, decayTint: ${listText(LIGHTS.double.decayTint)} },`);
    expect(demo).toContain(`const WHITE_SHARE = ${decimal(WHITE_SHARE)};`);
  });

  it('떼는 시간 cap 40ms·잔광 150ms와 CSS 곡선(cap cubic-bezier(.2, .6, .3, 1), 잔광·흰빛 ease-out)이 press-depth.html과 같고 흰빛은 round(150 × 0.35) = 53ms다', () => {
    expect(demo).toContain(`const DEFAULTS = { capMs: ${RELEASE.capMs}, glowMs: ${RELEASE.glowMs} };`);
    expect(demo).toContain(`transition: opacity var(--cap-ms, 40ms) cubic-bezier(${CAP_EASING.map(decimal).join(', ')});`);
    expect(demo).toContain('.tint { opacity: 0; transition: opacity var(--glow-ms, 150ms) ease-out; }');
    expect(demo).toContain('.glow { opacity: 0; transition: opacity var(--white-ms, 53ms) ease-out; }');
    // CSS 'ease-out'은 cubic-bezier(0, 0, .58, 1)이다.
    expect(GLOW_EASING).toEqual([0, 0, 0.58, 1]);
    expect(whiteMs()).toBe(53);
  });
});

describe('공유 모듈 — 영역과 키캡 이동 계산', () => {
  it('feather: 열 200~372에 왼쪽 경계 12px이면 199열 0, 200열 1/13, 211열 12/13, 212열부터 1이다', () => {
    expect(feather(199, 200, 372, 12, 10)).toBe(0);
    expect(feather(200, 200, 372, 12, 10)).toBeCloseTo(1 / 13, 12);
    expect(feather(211, 200, 372, 12, 10)).toBeCloseTo(12 / 13, 12);
    expect(feather(212, 200, 372, 12, 10)).toBe(1);
    expect(feather(372, 200, 372, 12, 10)).toBeCloseTo(1 / 11, 12);
  });

  it('mirrorRegion: 1번 빛 영역(x 200~372, 왼쪽 12·오른쪽 10)을 반전하면 4번 영역 x 650~822, 왼쪽 10·오른쪽 12다', () => {
    expect(mirrorRegion(PRESSED_KEYS[1].glow)).toMatchObject({ x0: 650, x1: 822, left: 10, right: 12, y0: 1092, y1: 1355 });
    expect(keyRegion(4, 'glow')).toEqual(mirrorRegion(PRESSED_KEYS[1].glow));
    expect(keyRegion(2, 'cap')).toBe(PRESSED_KEYS[2].cap);
  });

  it('baseKey: 1·4번 키는 1번 눌림 소재, 2·3번 키는 2번 눌림 소재(v16)에서 온다', () => {
    expect([1, 2, 3, 4].map(baseKey)).toEqual([1, 2, 2, 1]);
  });

  it('polylineAt: 꺾은선 [[221, 1250], [222, 1243], [224, 1236]]의 223열은 1239.5를 반올림한 1240, 220열은 첫 값 1250, 230열은 끝 값 1236이다', () => {
    const points = [[221, 1250], [222, 1243], [224, 1236]];
    expect([polylineAt(points, 223), polylineAt(points, 220), polylineAt(points, 230)]).toEqual([1240, 1250, 1236]);
  });

  it('sinkCap: 5×16 합성 그림의 가운데 열에서 키캡(5~9행)을 3행 내리면 8~11행이 키캡, 2~7행은 뒷벽(2~4행)을 늘린 20·25·30·35·40·40, lip 위 2행 슬롯(12·13행)은 그대로다', () => {
    const width = 5;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const rows = [0, 10, 20, 30, 40, 200, 200, 200, 200, 200, 0, 0, 0, 0, 100, 100];
    rows.forEach((value, y) => { for (let x = 0; x < width; x++) pixels.fill(value, (y * width + x) * 4, (y * width + x) * 4 + 3); });
    const outline = { columns: [2, 2], fixedAbove: [[2, 2]], capTop: [[2, 5]], capBottom: [[2, 9]], lip: [[2, 14]] };
    const sunk = sinkCap(pixels, outline, 3, width, height);
    const column = Array.from({ length: height }, (_, y) => sunk[(y * width + 2) * 4]);
    expect(column).toEqual([0, 10, 20, 25, 30, 35, 40, 40, 200, 200, 200, 200, 0, 0, 100, 100]);
    // 윤곽 밖 열은 그대로다.
    expect(Array.from({ length: height }, (_, y) => sunk[(y * width + 1) * 4])).toEqual(rows);
  });

  it('sinkCap: 더 내릴 깊이가 0 이하면(소재가 이미 그 깊이) 원본 배열을 그대로 돌려준다', () => {
    const pixels = new Uint8ClampedArray(16);
    expect(sinkCap(pixels, SINK[1], 0)).toBe(pixels);
    expect(sinkCap(pixels, SINK[1], -3)).toBe(pixels);
  });
});

describe('아틀라스 배치(gear-buttons-atlas.mjs)', () => {
  it('alignedCrop: 픽셀 범위 x 362~519·y 1127~1351이면 16px 정렬해 x 352·y 1120·폭 176·높이 240이다', () => {
    expect(alignedCrop({ x0: 362, y0: 1127, x1: 519, y1: 1351 })).toEqual({ x: 352, y: 1120, width: 176, height: 240 });
  });

  it('packColumns: [[192×272, 192×272], [176×240]]이면 둘레·사이 16px 간격으로 첫 열 (16, 16)·(16, 304), 둘째 열 (224, 16), 아틀라스 416×592다', () => {
    const packed = packColumns([
      [{ width: 192, height: 272 }, { width: 192, height: 272 }],
      [{ width: 176, height: 240 }],
    ]);
    expect(packed).toEqual({ width: 416, height: 592, places: [[{ atlasX: 16, atlasY: 16 }, { atlasX: 16, atlasY: 304 }], [{ atlasX: 224, atlasY: 16 }]] });
    expect([ALIGN, FRAME_GAP]).toEqual([16, 16]);
  });
});

describe('생성기 산출물 — public/gear/gear-buttons.png와 gearButtonGeometry.json', () => {
  it('생성기는 v16·1번 키 눌림·대기 소재와 게임 기어 그림을 읽어 게임 경로 public/gear/gear-buttons.png와 src/game/renderer/gearButtonGeometry.json에만 쓴다', () => {
    const script = read('assets-lab/classic/revisions/frame-keywords-six-20260929/prepare-gear-buttons-v22.mjs').toString();
    expect(script).toContain("resolve(workspaceRoot, 'public/gear/gear-buttons.png')");
    expect(script).toContain("resolve(workspaceRoot, 'src/game/renderer/gearButtonGeometry.json')");
    expect(geometry.sources).toEqual({
      v16: 'lab/image-galleries/frame-keywords-six-20260929/53-white-core-frame-v16.svg',
      key1: 'assets-lab/classic/revisions/frame-keywords-six-20260929/key1-press-insert-v17.png',
      idle: 'assets-lab/classic/revisions/frame-keywords-six-20260929/press-idle-deck-v17-input.png',
      gear: 'public/gear/gear.png',
    });
  });

  it('JSON의 깊이 15·20·25·30과 전환 60·40ms·떼는 시간(cap 40ms·흰빛 53ms·남는 빛 150ms)·곡선·빛 색은 공유 모듈 값과 같다', () => {
    expect(geometry.depths).toEqual([DEPTH, 20, 25, 30]);
    expect(geometry.pressMotion).toEqual({ downMs: 60, upMs: 40, easing: CAP_EASING });
    expect(geometry.release).toEqual({ capMs: 40, glowMs: 150, whiteMs: 53, capEasing: CAP_EASING, glowEasing: GLOW_EASING });
    expect(geometry.lights).toEqual(LIGHTS);
  });

  it('아틀라스는 JSON이 적은 816×3072 RGBA PNG(색 형식 6)이고 sha256 고정값과 같다', () => {
    const png = read('public/gear/gear-buttons.png');
    expect(geometry.image).toBe('public/gear/gear-buttons.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([geometry.width, geometry.height]);
    expect([geometry.width, geometry.height]).toEqual([816, 3072]);
    expect(png[25]).toBe(6);
    // 생성기를 다시 돌려 그림이 바뀌면 이 해시를 함께 바꾼다.
    expect(createHash('sha256').update(png).digest('hex')).toBe('55535bddaa631e80a8844b79f624f2a5abfc22346c8935de5efc46421543ab35');
  });

  it('44개 frame(버튼 4개 × glow 4깊이·2색, tint 2색, cap)은 아틀라스 안에서 서로 16px 이상 떨어져 겹치지 않는다', () => {
    const boxes = frames();
    expect(boxes).toHaveLength(44);
    for (const [index, a] of boxes.entries()) {
      expect(a.atlasX + a.width + FRAME_GAP).toBeLessThanOrEqual(geometry.width);
      expect(a.atlasY + a.height + FRAME_GAP).toBeLessThanOrEqual(geometry.height);
      for (const b of boxes.slice(index + 1)) {
        const apartX = a.atlasX + a.width + FRAME_GAP <= b.atlasX || b.atlasX + b.width + FRAME_GAP <= a.atlasX;
        const apartY = a.atlasY + a.height + FRAME_GAP <= b.atlasY || b.atlasY + b.height + FRAME_GAP <= a.atlasY;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it('각 버튼 atlas frame의 기어 그림 좌표 범위는 그 키의 시연 영역(glow·cap, 3·4번은 x → 1022 − x 반전)을 16px 정렬한 범위 안에 있다', () => {
    geometry.buttons.forEach((button: { lane: number; glow: Record<string, Frame[]>; tint: Record<string, Frame>; cap: Frame }, index: number) => {
      const key = index + 1;
      expect(button.lane).toBe(key);
      const within = (frame: Frame, region: Region) => {
        const box = alignedCrop(region);
        expect(frame.x).toBeGreaterThanOrEqual(box.x);
        expect(frame.y).toBeGreaterThanOrEqual(box.y);
        expect(frame.x + frame.width).toBeLessThanOrEqual(box.x + box.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(box.y + box.height);
      };
      for (const frame of [...button.glow.single, ...button.glow.double, button.tint.single, button.tint.double]) within(frame, keyRegion(key, 'glow'));
      within(button.cap, keyRegion(key, 'cap'));
    });
  });
});
