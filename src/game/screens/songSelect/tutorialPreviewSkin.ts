import { useEffect, useState } from 'react';
import { SKIN_LIST } from '../../skin/skins';
import type { SkinManifest } from '../../skin/types';
import { DEFAULT_SKIN_ID } from '../../stores';

/** 튜토리얼 재생기(`TutorialPreviewPlayer`)의 `skinId`·`skinManifest` prop. manifest를 넘기면 `skinId`는 그 manifest의 `theme.id`다. */
export interface TutorialPreviewSkin {
  skinId: string;
  skinManifest?: SkinManifest;
}

/**
 * 스킨 id나 manifest를 재생기 prop으로 나눈다. manifest는 받은 참조를 그대로 넘긴다.
 * 스킨 id는 숨긴 스킨까지 포함한 등록 목록(`SKIN_LIST`)에 있어야 하며, 없으면(지워진 스킨이 저장된 설정 등) 기본 스킨으로 재생한다.
 */
export function toTutorialPreviewSkin(skin: string | SkinManifest): TutorialPreviewSkin {
  if (typeof skin !== 'string') return { skinId: skin.theme.id, skinManifest: skin };
  return { skinId: SKIN_LIST.some((manifest) => manifest.theme.id === skin) ? skin : DEFAULT_SKIN_ID };
}

/**
 * 플레이 화면(`PlayScreen`)과 같은 규칙으로 튜토리얼 재생기 스킨을 정한다. 일반은 설정 스킨이고, 개발 환경에서는 개발용 스킨 선택이 우선한다.
 * 개발용 선택 코드는 개발 환경에서만 동적으로 불러와 배포 빌드에 넣지 않는다. 불러오지 못하면 팝업이 로딩에 멈추지 않게 설정 스킨으로 재생한다.
 */
export async function resolveTutorialPreviewSkin(settingsSkinId: string): Promise<TutorialPreviewSkin> {
  try {
    const skin = import.meta.env.DEV
      ? (await import('../../../lab/devSkinSelection')).resolveDevSkinSelection(settingsSkinId)
      : settingsSkinId;
    return toTutorialPreviewSkin(skin);
  } catch (error) {
    console.warn('TutorialPreviewSkin: dev skin selection failed to load', error);
    return toTutorialPreviewSkin(settingsSkinId);
  }
}

/**
 * 튜토리얼 팝업의 재생기 스킨. 배포 빌드는 설정 스킨을 바로 돌려준다. 개발 환경은 개발용 스킨 선택을 불러오기 전까지 null이고,
 * 팝업은 null인 동안 재생기를 마운트하지 않는다. 설정 스킨으로 먼저 만든 렌더러를 개발용 스킨으로 다시 만들지 않기 위해서다.
 */
export function useTutorialPreviewSkin(settingsSkinId: string): TutorialPreviewSkin | null {
  const [devSkin, setDevSkin] = useState<TutorialPreviewSkin | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void resolveTutorialPreviewSkin(settingsSkinId).then((skin) => {
      if (!cancelled) setDevSkin(skin);
    });
    return () => {
      cancelled = true;
    };
  }, [settingsSkinId]);

  return import.meta.env.DEV ? devSkin : toTutorialPreviewSkin(settingsSkinId);
}
