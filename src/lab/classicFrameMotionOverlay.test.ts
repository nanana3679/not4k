import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { CLASSIC_FRAME_TEXTURE_OPTIONS, type ClassicFrameLayout } from '../game/renderer/classicFrameLayout';
import { attachFrameMotion, FRAME_MOTION_TEXTURE_OPTIONS } from './classicFrameMotionOverlay';

const layout = { x: 300, y: -63.9, scale: 250 / 552 } as ClassicFrameLayout;

/** GameRenderer.addFrameOverlay처럼 프레임 레이어에 붙이고 프레임 변환을 건다. */
function fakeRenderer(withFrame = true) {
  const frameLayer = new Container();
  return {
    frameLayer,
    addFrameOverlay: vi.fn((overlay: Container) => {
      if (!withFrame) return null;
      overlay.position.set(layout.x, layout.y);
      overlay.scale.set(layout.scale);
      frameLayer.addChild(overlay);
      return layout;
    }),
  };
}

describe('attachFrameMotion — 게임 렌더러 프레임 위에 Lab 움직임 레이어 얹기', () => {
  it('움직임 컨테이너를 담은 레이어를 프레임 레이어에 프레임과 같은 위치·배율로 붙인다', () => {
    const renderer = fakeRenderer();
    const motion = new Container();
    const overlay = attachFrameMotion(renderer, motion)!;
    expect(renderer.addFrameOverlay).toHaveBeenCalledOnce();
    expect(motion.parent).toBe(overlay.holder);
    expect(overlay.holder.parent).toBe(renderer.frameLayer);
    expect([overlay.holder.x, overlay.holder.y, overlay.holder.scale.x]).toEqual([300, -63.9, 250 / 552]);
    expect(overlay.layout).toBe(layout);
  });

  it('프레임이 없는 렌더러면 붙이지 않고 null을 돌려주며 움직임 컨테이너는 그대로 둔다', () => {
    const motion = new Container();
    expect(attachFrameMotion(fakeRenderer(false), motion)).toBeNull();
    expect(motion.parent).toBeNull();
    expect(motion.destroyed).toBe(false);
  });

  it('setEnabled(false)는 레이어를 숨기고 true면 다시 보인다', () => {
    const overlay = attachFrameMotion(fakeRenderer(), new Container())!;
    overlay.setEnabled(false);
    expect(overlay.holder.visible).toBe(false);
    overlay.setEnabled(true);
    expect(overlay.holder.visible).toBe(true);
  });

  it('destroy는 레이어를 떼어 파괴하지만 움직임 컨테이너는 만든 쪽이 정리하도록 남기고, 두 번 불러도 안전하다', () => {
    const renderer = fakeRenderer();
    const motion = new Container();
    const overlay = attachFrameMotion(renderer, motion)!;
    overlay.destroy();
    overlay.destroy();
    expect(overlay.holder.destroyed).toBe(true);
    expect(renderer.frameLayer.children).toHaveLength(0);
    expect(motion.destroyed).toBe(false);
    expect(motion.parent).toBeNull();
  });

  it('움직임 텍스처는 게임 프레임 텍스처와 같은 밉맵·삼선형 설정으로 만든다', () => {
    expect(FRAME_MOTION_TEXTURE_OPTIONS).toBe(CLASSIC_FRAME_TEXTURE_OPTIONS);
  });
});
