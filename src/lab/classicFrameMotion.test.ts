import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import motionJsonText from '../../public/lab/classic-frame-fit/motion/frame-motion.json?raw';
import {
  bandHalfWidth,
  bandProfileAlpha,
  byteAlpha,
  createClassicFrameMotion,
  FRAME_MOTION_LAYER_LABELS,
  FRAME_MOTION_LAYERS,
  FRAME_MOTION_TEXTURE_KEYS,
  parseFrameMotionData,
  type FrameMotionData,
  type FrameMotionTextures,
} from './classicFrameMotion';

const json = () => JSON.parse(motionJsonText);
const data: FrameMotionData = parseFrameMotionData(json());

function fakeTextures(): FrameMotionTextures {
  const entries = FRAME_MOTION_TEXTURE_KEYS.map((key) => {
    const texture = data.textures[key];
    return [key, new Texture({ source: new TextureSource({ width: texture.width, height: texture.height }) })] as const;
  });
  return Object.fromEntries(entries) as FrameMotionTextures;
}

const byLabel = (root: Container, label: string): Container => {
  const found = root.getChildByLabel(label, true);
  if (!found) throw new Error(`no ${label}`);
  return found;
};
const radians = (degrees: number) => (degrees * Math.PI) / 180;

describe('byteAlpha', () => {
  it('Pixi가 8비트로 버리는 불투명도 0.07은 (18 + 0.5)/255로 넘겨 버림 뒤에도 SVG처럼 반올림한 18/255가 된다', () => {
    expect(byteAlpha(0.07)).toBeCloseTo(18.5 / 255, 12);
    expect((byteAlpha(0.07) * 255) | 0).toBe(18);
    expect((byteAlpha(128 / 255) * 255) | 0).toBe(128);
  });

  it('0 이하·숫자 아님은 0, 1 이상은 1로 그대로 둔다', () => {
    expect(byteAlpha(0)).toBe(0);
    expect(byteAlpha(-0.2)).toBe(0);
    expect(byteAlpha(Number.NaN)).toBe(0);
    expect(byteAlpha(1)).toBe(1);
    expect(byteAlpha(1.4)).toBe(1);
  });
});

describe('bandProfileAlpha(부드러운 띠 가장자리용 1px 폭 세로 프로파일)', () => {
  it('바깥 띠 1380은 1382행 중 위아래 끝 1행만 0이고 나머지 255라, 늘려 그리면 가장자리에서 1px 동안 0→1로 바뀐다', () => {
    const outer = bandProfileAlpha(1380, [{ top: -690, height: 1380 }]);
    expect(outer).toHaveLength(1382);
    expect([outer[0], outer[1], outer[690], outer[1380], outer[1381]]).toEqual([0, 255, 255, 255, 0]);
  });

  it('가운데 띠 840은 1382행 중 271~1110행만 255, 절반 띠 두 줄은 1~270행과 1111~1380행만 255', () => {
    const core = bandProfileAlpha(1380, [{ top: -420, height: 840 }]);
    expect([core[270], core[271], core[1110], core[1111]]).toEqual([0, 255, 255, 0]);
    const half = bandProfileAlpha(1380, [{ top: -690, height: 270 }, { top: 420, height: 270 }]);
    expect([half[0], half[1], half[270], half[271], half[1110], half[1111], half[1380], half[1381]]).toEqual([0, 255, 255, 0, 0, 255, 255, 0]);
  });
});

describe('부드러운 띠 가장자리(bandEdges: soft)', () => {
  it('띠 마스크 세 개가 Graphics 대신 1px 프로파일 스프라이트(알파 채널 마스크)로 바뀌고, 띠 밖 어둡게는 뒤집은 마스크다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures(), { bandEdges: 'soft' });
    for (const label of ['frame-motion-band-outer', 'frame-motion-band-half', 'frame-motion-band-core']) {
      expect(byLabel(motion.container, label)).toBeInstanceOf(Sprite);
    }
    const dim = byLabel(motion.container, 'frame-motion-unlit') as unknown as { mask: unknown; _maskOptions: { inverse: boolean; channel: string } };
    expect(dim.mask).toBe(byLabel(motion.container, 'frame-motion-band-outer'));
    expect(dim._maskOptions).toMatchObject({ inverse: true, channel: 'alpha' });
    const outer = byLabel(motion.container, 'frame-motion-band-outer') as Sprite;
    // 1px 폭 프로파일을 띠 방향 반폭 702의 두 배(1404)로 늘리고 1382행 높이 그대로 쓴다.
    expect([outer.texture.width, outer.texture.height, outer.scale.x, outer.scale.y]).toEqual([1, 1382, 1404, 1]);
    motion.update(30_000);
    expect(outer.position).toMatchObject({ x: 512, y: 768 });
    expect(outer.rotation).toBeCloseTo(radians(-14), 10);
    motion.destroy();
    expect(outer.destroyed).toBe(true);
  });
});

describe('bandHalfWidth', () => {
  it('폭 1024 프레임·띠 1380·기울기 −14°면 띠 방향 반폭 702(SVG 사각형 2424의 반 1212보다 짧다)', () => {
    expect(bandHalfWidth(data)).toBe(702);
  });

  it('띠 중심 y가 −841~2377 어디에 있든 프레임 네 모서리와 띠 중심 높이의 좌우 끝 중 띠 안(수직 거리 690 이하)에 드는 점은 띠 방향 ±702 안에 있다', () => {
    const half = bandHalfWidth(data);
    const angle = (14 * Math.PI) / 180;
    for (let centreY = -841; centreY <= 2377; centreY += 7) {
      for (const [x, y] of [[0, 0], [1024, 0], [0, 1536], [1024, 1536], [0, centreY], [1024, centreY]]) {
        const dx = x - 512;
        const dy = y - centreY;
        // 띠 좌표: v는 띠에 수직(반높이 690 안이면 띠 안), u는 띠 방향.
        const v = -dx * Math.sin(-angle) + dy * Math.cos(-angle);
        const u = dx * Math.cos(-angle) + dy * Math.sin(-angle);
        if (Math.abs(v) <= 690) expect(Math.abs(u)).toBeLessThanOrEqual(half);
      }
    }
  });
});

describe('createClassicFrameMotion', () => {
  it('레이어 4개(A 큰 광원·B 게이지 액체·C 발광선 호흡·D 하단 바 흐름)를 이 순서로 프레임 좌표 컨테이너에 쌓는다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    expect(FRAME_MOTION_LAYERS).toEqual(['armor', 'gauge', 'accent', 'bar']);
    expect(FRAME_MOTION_LAYERS.map((layer) => FRAME_MOTION_LAYER_LABELS[layer])).toEqual(['A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름']);
    expect(motion.container.children.map((child) => child.label)).toEqual([
      'frame-motion-armor', 'frame-motion-gauge', 'frame-motion-accent', 'frame-motion-bar',
    ]);
    // 장갑 텍스처는 왼쪽 기둥(16, 16)·오른쪽 기둥(800, 16)·아래 띠 왼쪽(32, 1344)·오른쪽(512, 1344) 조각으로 프레임 원본 좌표에 놓인다.
    const core = byLabel(motion.container, 'frame-motion-lit-core');
    expect(core.children.map((piece) => [piece.x, piece.y])).toEqual([[16, 16], [800, 16], [32, 1344], [512, 1344]]);
    // 조각 스프라이트는 아틀라스에서 자기 상자만 쓴다(왼쪽 기둥 208×1328은 아틀라스 (16, 16)부터).
    const [left] = core.children as Sprite[];
    expect([left.texture.frame.x, left.texture.frame.y, left.texture.frame.width, left.texture.frame.height]).toEqual([16, 16, 208, 1328]);
    motion.destroy();
  });

  it('update(30000)이면 광원 마스크 세 개(바깥 띠·절반 띠·가운데 띠)의 중심이 (512, 768)에 있고 −14° 기울어 있다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    motion.update(30_000);
    for (const label of ['frame-motion-band-outer', 'frame-motion-band-half', 'frame-motion-band-core']) {
      const band = byLabel(motion.container, label);
      expect(band).toBeInstanceOf(Graphics);
      expect(band.position).toMatchObject({ x: 512, y: 768 });
      expect(band.rotation).toBeCloseTo(radians(-14), 10);
    }
    motion.update(0);
    expect(byLabel(motion.container, 'frame-motion-band-core').y).toBe(-841);
    motion.destroy();
  });

  it('빛 밖 어둡게는 armor-shape 없이 armor-lit 조각을 #04060a로 물들여 같은 알파로 쓴다', () => {
    const textures = fakeTextures();
    const motion = createClassicFrameMotion(data, textures);
    const dim = byLabel(motion.container, 'frame-motion-unlit');
    expect(dim.children).toHaveLength(data.textures.armorLit.pieces.length);
    expect((dim.children as Sprite[]).every((piece) => piece.texture.source === textures.armorLit.source)).toBe(true);
    expect(FRAME_MOTION_TEXTURE_KEYS).not.toContain('armorShape');
    motion.destroy();
  });

  it('빛 밖 어둡게는 바깥 띠를 뒤집은 마스크(inverse)로, 절반·가운데 빛은 각자의 띠 마스크로 자르고 불투명도는 0.07·128/255·1(흰빛은 armor-core에 합성)', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    const dim = byLabel(motion.container, 'frame-motion-unlit');
    const half = byLabel(motion.container, 'frame-motion-lit-half');
    const core = byLabel(motion.container, 'frame-motion-lit-core');
    expect(dim.mask).toBe(byLabel(motion.container, 'frame-motion-band-outer'));
    expect((dim as unknown as { _maskOptions: { inverse: boolean } })._maskOptions.inverse).toBe(true);
    expect(half.mask).toBe(byLabel(motion.container, 'frame-motion-band-half'));
    expect(core.mask).toBe(byLabel(motion.container, 'frame-motion-band-core'));
    expect(dim.alpha).toBe(byteAlpha(0.07));
    expect(dim.tint).toBe(0x04060a);
    expect(half.alpha).toBe(byteAlpha(128 / 255));
    expect(core.alpha).toBe(1);
    expect(core.getChildByLabel('frame-motion-lit-glow', true)).toBeNull();
    motion.destroy();
  });

  it('update(5000)이면 왼쪽·오른쪽 액체 타일 3장이 320px 위(y −320, 320, 960)에 있고, 오른쪽은 x 1023 기준 좌우 반전이다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    motion.update(5_000);
    const left = byLabel(motion.container, 'frame-motion-liquid-left');
    const right = byLabel(motion.container, 'frame-motion-liquid-right');
    expect(left.children.map((tile) => tile.y)).toEqual([-320, 320, 960]);
    expect(right.children.map((tile) => tile.y)).toEqual([-320, 320, 960]);
    expect(left.children.every((tile) => tile.x === 146)).toBe(true);
    expect(right.scale.x).toBe(-1);
    expect(right.x).toBe(1023);
    expect(byLabel(motion.container, 'frame-motion-liquid').alpha).toBe(byteAlpha(0.45));
    expect(byLabel(motion.container, 'frame-motion-gauge').mask).toBe(byLabel(motion.container, 'frame-motion-glass'));
    motion.destroy();
  });

  it('update(0)이면 첫 기포(x 150, 반지름 2.2)가 바닥 y 1004에서 126.4px 올라가 있고 불투명도 0.75, 화면 혼합 screen', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    motion.update(0);
    const [first] = byLabel(motion.container, 'frame-motion-bubbles-left').children as Sprite[];
    // 16px 칸 가운데가 기포 중심이다.
    expect(first.x).toBe(150 - 8);
    expect(first.y).toBeCloseTo(1004 - 8 - 126.4, 6);
    expect(first.alpha).toBe(byteAlpha(0.75));
    expect(first.blendMode).toBe('screen');
    const [mirrored] = byLabel(motion.container, 'frame-motion-bubbles-right').children as Sprite[];
    expect(mirrored.y).toBeCloseTo(first.y, 6);
    motion.destroy();
  });

  it('update(2200)이면 번짐 위 발광선(T1)이 최대 불투명도 0.85, 겹침 보정(T2)이 0.85 × 0.15 = 0.1275이고 0초에는 둘 다 0, 둘 다 screen', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    const glow = byLabel(motion.container, 'frame-motion-accent-glow');
    const overlap = byLabel(motion.container, 'frame-motion-accent-overlap');
    motion.update(2_200);
    expect(glow.alpha).toBe(byteAlpha(0.85));
    expect(overlap.alpha).toBeCloseTo(byteAlpha(0.1275), 10);
    motion.update(0);
    expect(glow.alpha).toBe(0);
    expect(overlap.alpha).toBe(0);
    expect([glow.blendMode, overlap.blendMode]).toEqual(['screen', 'screen']);
    motion.destroy();
  });

  it('update(880)이면 하단 바 빛 두 개가 가운데(464)에서 ±85px, 2000ms(이동 끝 뒤)에는 불투명도 0이라 하단 바 레이어를 그리지 않는다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    const bar = byLabel(motion.container, 'frame-motion-bar');
    const right = byLabel(motion.container, 'frame-motion-glint-right') as Sprite;
    const left = byLabel(motion.container, 'frame-motion-glint-left') as Sprite;
    motion.update(880);
    expect(right.x).toBeCloseTo(464 + 85, 6);
    expect(left.x).toBeCloseTo(464 - 85, 6);
    expect(bar.visible).toBe(true);
    expect(bar.mask).toBe(byLabel(motion.container, 'frame-motion-bar-mask'));
    expect((bar as unknown as { _maskOptions: { channel: string } })._maskOptions.channel).toBe('alpha');
    motion.update(2_000);
    expect(right.alpha).toBe(0);
    expect(bar.visible).toBe(false);
    motion.destroy();
  });

  it('setLayerVisible(armor, false)이면 A 레이어만 숨고 다시 켜면 보이며, 꺼 둔 D는 빛이 보이는 880ms에도 숨어 있다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    motion.setLayerVisible('armor', false);
    expect(byLabel(motion.container, 'frame-motion-armor').visible).toBe(false);
    expect(byLabel(motion.container, 'frame-motion-gauge').visible).toBe(true);
    expect(motion.isLayerVisible('armor')).toBe(false);
    motion.setLayerVisible('armor', true);
    expect(byLabel(motion.container, 'frame-motion-armor').visible).toBe(true);

    motion.setLayerVisible('bar', false);
    motion.update(880);
    expect(byLabel(motion.container, 'frame-motion-bar').visible).toBe(false);
    motion.setLayerVisible('bar', true);
    expect(byLabel(motion.container, 'frame-motion-bar').visible).toBe(true);
    motion.destroy();
  });

  it('setReducedMotion(true)면 움직임 전체가 숨고 update(30000)도 광원을 옮기지 않으며, false로 돌리면 다시 보이고 다음 update를 따른다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    motion.update(0);
    motion.setReducedMotion(true);
    expect(motion.reducedMotion).toBe(true);
    expect(motion.container.visible).toBe(false);
    motion.update(30_000);
    expect(byLabel(motion.container, 'frame-motion-band-core').y).toBe(-841);
    motion.setReducedMotion(false);
    expect(motion.container.visible).toBe(true);
    motion.update(30_000);
    expect(byLabel(motion.container, 'frame-motion-band-core').y).toBe(768);
    motion.destroy();
  });

  it('30초 → 5초 → 30초로 갱신해도(재사용 객체에 값이 남지 않아) 마지막 30초 상태가 처음 30초 상태와 같다', () => {
    const motion = createClassicFrameMotion(data, fakeTextures());
    const snapshot = () => [
      'frame-motion-band-core', 'frame-motion-liquid-left', 'frame-motion-liquid-right', 'frame-motion-bubbles-left', 'frame-motion-bubbles-right',
      'frame-motion-accent-glow', 'frame-motion-accent-overlap', 'frame-motion-glint-right', 'frame-motion-glint-left', 'frame-motion-bar',
    ].map((label) => {
      const node = byLabel(motion.container, label);
      return [label, node.x, node.y, node.alpha, node.visible, node.children.map((child) => [child.x, child.y, child.alpha])];
    });
    motion.update(30_000);
    const first = snapshot();
    motion.update(5_000);
    expect(snapshot()).not.toEqual(first);
    motion.update(30_000);
    expect(snapshot()).toEqual(first);
    motion.destroy();
  });

  it('구성 도중 실패하면(하단 바 빛 조각이 비어 있음) 그때까지 만든 조각 서브 텍스처를 모두 정리해 원본 소스의 resize 구독이 처음(1개)으로 돌아온다', () => {
    const textures = fakeTextures();
    const broken: FrameMotionData = { ...data, textures: { ...data.textures, glint: { ...data.textures.glint, pieces: [] } } };
    expect(() => createClassicFrameMotion(broken, textures)).toThrow();
    for (const key of FRAME_MOTION_TEXTURE_KEYS) expect(textures[key].source.listenerCount('resize')).toBe(1);
  });

  it('destroy하면 컨테이너가 부모에서 빠져 파괴되고 조각 서브 텍스처도 정리하지만, 받은 텍스처는 호출자가 쓰도록 파괴하지 않는다', () => {
    const textures = fakeTextures();
    const motion = createClassicFrameMotion(data, textures);
    const parent = new Container();
    parent.addChild(motion.container);
    const pieceTexture = (byLabel(motion.container, 'frame-motion-lit-half').children[0] as Sprite).texture;
    motion.destroy();
    expect(pieceTexture.destroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(motion.container.destroyed).toBe(true);
    expect(FRAME_MOTION_TEXTURE_KEYS.every((key) => !textures[key].destroyed)).toBe(true);
    // 두 번 불러도 에러가 없다.
    expect(() => motion.destroy()).not.toThrow();
  });
});
