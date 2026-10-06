import type { Texture } from 'pixi.js';
import { withPublicBase } from '../../shared/publicPath';
import { loadSharedAsset, releaseSharedAsset, retainSharedAsset } from '../skin/sharedAssets';
import { CLASSIC_FRAME_TEXTURE_OPTIONS } from './classicFrameLayout';
import type { FrameMotionTextures } from './classicFrameMotion';
import {
  FRAME_MOTION_ASSET_DIR,
  FRAME_MOTION_DATA_PATH,
  FRAME_MOTION_TEXTURE_KEYS,
  parseFrameMotionData,
  type FrameMotionData,
} from './classicFrameMotionData';

/**
 * 프레임 움직임 자료(frame-motion.json과 텍스처 9장, public/gear/classic-frame-motion/)의 공유 로더.
 *
 * 스킨 매니페스트에 넣지 않고 따로 읽는다. SkinManager.loadSkin은 렌더러를 만들고 곡을 시작하기 전에 기다리는데, 약 2MB의 움직임 텍스처를
 * 거기에 더하면 첫 화면과 곡 시작이 늦어진다. 또 프레임을 그리지 않는 튜토리얼·노트 에셋 재생기도 스킨을 읽고, 설정에서 움직임을 끄면
 * 아예 읽지 않아야 한다. 그래서 프레임을 그리는 렌더러가 움직임을 켤 때만 빌리고, 기다리지 않고 준비되면 얹는다.
 *
 * 읽기와 공유는 스킨 에셋과 같은 장치(sharedAssets: Pixi Assets 전역 캐시 + 경로별 참조 세기)를 쓴다. 텍스처는 프레임(gearFrame)과 같은
 * 밉맵·삼선형 설정으로 경로 별칭을 붙여 읽으므로, 같은 페이지의 게임 렌더러와 Lab 비교 화면이 한 벌을 나눠 쓰고 마지막 임대를 놓을 때
 * JSON과 PNG를 함께 unload한다.
 */

export interface FrameMotionResources {
  data: FrameMotionData;
  textures: FrameMotionTextures;
}

export interface FrameMotionAssetLease {
  /** 자료와 텍스처가 준비되면 이행한다. 읽기에 실패하거나, 준비되기 전에 놓으면 거절한다. */
  readonly ready: Promise<FrameMotionResources>;
  /** 이 임대가 잡은 참조를 놓는다(두 번 불러도 한 번만). 놓은 뒤에는 받은 텍스처를 쓰지 않는다. */
  release(): void;
}

/** 준비되기 전에 놓은 임대의 ready가 거절될 때의 오류. */
export class FrameMotionLeaseReleasedError extends Error {
  constructor() {
    super('Frame motion asset lease was released before the assets were ready.');
    this.name = 'FrameMotionLeaseReleasedError';
  }
}

/** resolveUrl은 공개 경로에 배포 base를 붙인다(기본 withPublicBase). */
export function acquireFrameMotionAssets(resolveUrl: (path: string) => string = withPublicBase): FrameMotionAssetLease {
  const held: string[] = [];
  let released = false;
  const hold = (path: string) => {
    retainSharedAsset(path);
    held.push(path);
  };
  const ensureHeld = () => {
    if (released) throw new FrameMotionLeaseReleasedError();
  };

  const ready = (async (): Promise<FrameMotionResources> => {
    const dataPath = resolveUrl(FRAME_MOTION_DATA_PATH);
    hold(dataPath);
    const data = parseFrameMotionData(await loadSharedAsset<unknown>(dataPath));
    ensureHeld();
    const paths = FRAME_MOTION_TEXTURE_KEYS.map((key) => resolveUrl(`${FRAME_MOTION_ASSET_DIR}/${data.textures[key].file}`));
    for (const path of paths) hold(path);
    const loaded = await Promise.all(paths.map((path) => loadSharedAsset<Texture>(path, CLASSIC_FRAME_TEXTURE_OPTIONS)));
    ensureHeld();
    const textures = Object.fromEntries(FRAME_MOTION_TEXTURE_KEYS.map((key, index) => [key, loaded[index]])) as FrameMotionTextures;
    return { data, textures };
  })();
  // 소비자가 늦게 처리를 붙이거나 놓은 뒤 거절되어도 처리되지 않은 거절로 남지 않게 한다(소비자 처리에는 그대로 전달된다).
  ready.catch(() => undefined);

  return {
    ready,
    release() {
      if (released) return;
      released = true;
      for (const path of held.splice(0)) releaseSharedAsset(path);
    },
  };
}
