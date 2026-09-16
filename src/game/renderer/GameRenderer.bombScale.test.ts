import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedSprite, Container, Texture } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import type { SkinManager } from '../skin';

afterEach(() => vi.restoreAllMocks());

function createRenderer(bombScale?: number) {
  const getBombTextures = vi.fn(() => [Texture.WHITE, Texture.WHITE]);
  const skinManager = {
    getBombTextures,
    getTheme: () => ({ bombDurationMs: 280 }),
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 400, height: 600, skinManager, bombScale,
  });
  const scene = renderer as unknown as {
    effectLayer: Container;
    noteRenderer: { getLaneX(lane: number): number };
  };
  scene.noteRenderer = { getLaneX: lane => (lane - 1) * 100 };
  // 실제 Pixi 크기·위치·완료 처리를 사용하고 브라우저 ticker만 생략한다.
  const play = vi.spyOn(AnimatedSprite.prototype, 'play').mockImplementation(() => {});
  return { renderer, effectLayer: scene.effectLayer, getBombTextures, play };
}

describe('GameRenderer 키봄 크기', () => {
  it.each([
    { scale: undefined, size: 120, label: '미지정(기본 1배)' },
    { scale: 0.5, size: 60, label: '0.5배' },
    { scale: 1.7, size: 204, label: '1.7배' },
    { scale: 3, size: 360, label: '3배' },
    { scale: 4, size: 360, label: '범위 밖 4배(최대 3배)' },
    { scale: NaN, size: 120, label: '유효하지 않은 값(기본 1배)' },
  ])('$label에서 키봄을 표시하면 가로·세로 $size px이고 중심과 280ms 재생 시간을 유지한다', ({ scale, size }) => {
    const { renderer, effectLayer, play } = createRenderer(scale);
    renderer.showBombEffect(2);

    expect(effectLayer.children).toHaveLength(1);
    const bomb = effectLayer.children[0] as AnimatedSprite;
    expect(bomb.width).toBeCloseTo(size);
    expect(bomb.height).toBeCloseTo(size);
    expect([bomb.x, bomb.y]).toEqual([150, 440]);
    expect([bomb.anchor.x, bomb.anchor.y]).toEqual([0.5, 0.5]);
    expect(bomb.animationSpeed).toBeCloseTo(2 * 1000 / (60 * 280));
    expect(bomb.loop).toBe(false);
    expect(play).toHaveBeenCalledOnce();

    bomb.onComplete!();
    expect(bomb.destroyed).toBe(true);
    expect(effectLayer.children).toHaveLength(0);
    effectLayer.destroy();
  });

  it.each([0, -1])('%s배에서 판정 효과를 요청하면 보이지 않는 키봄 애니메이션도 만들지 않는다', scale => {
    const { renderer, effectLayer, getBombTextures, play } = createRenderer(scale);
    renderer.showBombEffect(1);
    expect(effectLayer.children).toHaveLength(0);
    expect(getBombTextures).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    effectLayer.destroy();
  });
});
