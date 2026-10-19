import { useEffect, useState } from 'react';
import { SKIN_LIST } from '../../skin/skins';
import type { SkinManifest } from '../../skin/types';
import { DEFAULT_SKIN_ID } from '../../stores';

/** 튜토리얼 재생기(`TutorialPreviewPlayer`)의 `skinId`·`skinManifest` prop. manifest를 넘기면 `skinId`는 그 manifest의 `theme.id`다. */
export interface TutorialPreviewSkin {
  skinId: string;
  skinManifest?: SkinManifest;
}

// 개발 환경에서는 이 모듈을 불러올 때 개발용 스킨 선택도 미리 불러와, 팝업을 처음 열 때 재생기 마운트가 늦어지지 않게 한다.
// 배포 빌드에서는 null이 되어 import가 빠진다. 실패는 resolveTutorialPreviewSkin이 기다릴 때 처리하므로,
// 그 전에 처리되지 않은 거부로 보고되지 않게 빈 catch를 붙여 둔다.
const devSkinSelectionModule = import.meta.env.DEV ? import('../../../lab/devSkinSelection') : null;
void devSkinSelectionModule?.catch(() => undefined);

/** 개발용 스킨 선택이 돌려주는 manifest 모양(`theme.id` 문자열과 `assets` 객체)인지 본다. */
function isSkinManifest(skin: unknown): skin is SkinManifest {
  if (typeof skin !== 'object' || skin === null) return false;
  const { theme, assets } = skin as Partial<SkinManifest>;
  return typeof theme?.id === 'string' && typeof assets === 'object' && assets !== null;
}

/**
 * 개발용 스킨 선택의 manifest는 받은 참조 그대로, 그 밖의 값은 등록된 스킨 id로 재생기 prop을 만든다.
 * 스킨 id는 숨긴 스킨까지 포함한 등록 목록(`SKIN_LIST`)에 있어야 하며, 없거나 문자열이 아니면(지워진 스킨, 손으로 고친 null 등)
 * 기본 스킨 `DEFAULT_SKIN_ID`로 바꾼다. 저장된 설정은 타입과 달리 아무 값이나 될 수 있어 `unknown`으로 받는다.
 */
export function toTutorialPreviewSkinOrDefault(skin: unknown): TutorialPreviewSkin {
  if (isSkinManifest(skin)) return { skinId: skin.theme.id, skinManifest: skin };
  return { skinId: typeof skin === 'string' && SKIN_LIST.some((manifest) => manifest.theme.id === skin) ? skin : DEFAULT_SKIN_ID };
}

/**
 * 튜토리얼 재생기 스킨을 정한다. 설정 스킨을 쓰고 개발 환경에서는 개발용 스킨 선택이 우선하는 것은 플레이 화면(`PlayScreen`)과 같다.
 * 다만 저장된 스킨 id가 등록되지 않았거나 문자열이 아니면 플레이 화면과 달리 기본 스킨으로 재생한다.
 * 개발용 선택을 불러오지 못해도 팝업이 로딩에 멈추지 않게 설정 스킨으로 재생한다.
 */
export async function resolveTutorialPreviewSkin(settingsSkinId: string): Promise<TutorialPreviewSkin> {
  try {
    const skin = devSkinSelectionModule
      ? (await devSkinSelectionModule).resolveDevSkinSelection(settingsSkinId)
      : settingsSkinId;
    return toTutorialPreviewSkinOrDefault(skin);
  } catch (error) {
    console.warn('TutorialPreviewSkin: dev skin selection failed to load', error);
    return toTutorialPreviewSkinOrDefault(settingsSkinId);
  }
}

/**
 * 튜토리얼 팝업의 재생기 스킨. 배포 빌드는 설정 스킨(쓸 수 없으면 기본 스킨)을 바로 돌려준다. 개발 환경은 개발용 스킨 선택을
 * 기다리는 동안 null이고, 팝업은 null인 동안 재생기를 마운트하지 않는다. 설정 스킨으로 먼저 만든 렌더러를 개발용 스킨으로 다시 만들지 않기 위해서다.
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

  return import.meta.env.DEV ? devSkin : toTutorialPreviewSkinOrDefault(settingsSkinId);
}
