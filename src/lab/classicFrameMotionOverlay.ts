import { Container } from 'pixi.js';
import { CLASSIC_FRAME_TEXTURE_OPTIONS, type ClassicFrameLayout } from '../game/renderer/classicFrameLayout';
import type { GameRenderer } from '../game/renderer';

/**
 * 움직임 텍스처는 게임 프레임 텍스처와 같은 밉맵·삼선형 설정으로 만들어, 줄여 그려도 바탕 프레임과 같은 선명도로 보이게 한다.
 * 승인 SVG 비교(classicFrameMotionCompare)도 같은 설정을 쓴다.
 */
export const FRAME_MOTION_TEXTURE_OPTIONS = CLASSIC_FRAME_TEXTURE_OPTIONS;

export interface FrameMotionOverlay {
  /** 프레임 그림 좌표 레이어. 움직임 컨테이너를 자식으로 담는다. */
  readonly holder: Container;
  readonly layout: Readonly<ClassicFrameLayout>;
  /** 움직임 켜기·끄기(페이지의 움직임 토글). */
  setEnabled(enabled: boolean): void;
  /** 레이어를 떼어 파괴한다. 움직임 컨테이너와 텍스처는 만든 쪽이 정리한다. */
  destroy(): void;
}

/**
 * Lab 움직임 레이어(classicFrameMotion)를 실제 게임 렌더러의 내장 프레임 위에 얹는다. 게임 렌더러의 공개 접근자
 * `addFrameOverlay`가 프레임과 같은 레이어(판정선 위, 키봄·UI 아래)에 프레임과 같은 변환으로 붙인다.
 * 움직임을 게임으로 옮기는 후속 작업(PR B) 전까지 /lab/classic-frame-fit 미리보기만 쓴다. 프레임이 없으면 null.
 */
export function attachFrameMotion(renderer: Pick<GameRenderer, 'addFrameOverlay'>, motion: Container): FrameMotionOverlay | null {
  const holder = new Container({ label: 'classic-frame-motion-overlay' });
  holder.addChild(motion);
  const layout = renderer.addFrameOverlay(holder);
  if (!layout) {
    holder.removeChildren();
    holder.destroy();
    return null;
  }
  let destroyed = false;
  return {
    holder,
    layout,
    setEnabled(enabled) {
      if (!destroyed) holder.visible = enabled;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (holder.destroyed) return;
      holder.removeChildren();
      holder.removeFromParent();
      holder.destroy();
    },
  };
}
