import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkinManifest } from '../../skin/skins';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../../../lab/noteAssetDesigns';
import { useDevSkinSelection } from '../../../lab/devSkinSelection';
import { resolveTutorialPreviewSkin, toTutorialPreviewSkinOrDefault } from './tutorialPreviewSkin';
import tutorialPreviewSkinSource from './tutorialPreviewSkin.ts?raw';

const classicV012 = CLASSIC_NOTE_ASSET_VERSIONS.find(version => version.id === 'v012')?.design.skinManifest;

/** 등록되지 않았거나 문자열이 아닌 저장값. manifest 모양 객체는 theme.id가 기본 스킨과 달라 manifest로 쓰였는지 바로 드러난다. */
const UNREGISTERED_SAVED_SKIN_IDS: Array<[string, unknown]> = [
  ['removed-skin', 'removed-skin'],
  ['null', null],
  ['숫자 42', 42],
  ['manifest 모양 객체', { theme: { id: 'hand-made' }, assets: {} }],
];

/**
 * import.meta.env.DEV를 정한 뒤 tutorialPreviewSkin을 새로 불러온다. 개발용 스킨 선택을 미리 불러올지는 모듈을 불러올 때 정해지므로
 * 배포 빌드 동작과 미리 불러오기는 새 모듈로 확인한다. 새 모듈이 불러오는 개발용 스킨 선택은 이 파일이 import한 것과 별개다.
 */
async function importTutorialPreviewSkinWithDev(dev: boolean) {
  vi.stubEnv('DEV', dev);
  vi.resetModules();
  return import('./tutorialPreviewSkin');
}

beforeEach(() => useDevSkinSelection.getState().select('settings'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('../../../lab/devSkinSelection');
  vi.restoreAllMocks();
});

describe('튜토리얼 재생기 스킨', () => {
  // 위에서 import한 resolveTutorialPreviewSkin은 Vitest 기본값 DEV=true로 불러와 개발용 스킨 선택을 미리 불러온 모듈이다. DEV를 바꾸려면 새로 불러온다.

  it('숨긴 스킨(available: false)이지만 등록된 crystal은 skinId crystal 그대로 쓰고 skinManifest는 넘기지 않는다', () => {
    expect(getSkinManifest('crystal').theme.available).toBe(false);
    expect(toTutorialPreviewSkinOrDefault('crystal')).toEqual({ skinId: 'crystal' });
  });

  it.each(UNREGISTERED_SAVED_SKIN_IDS)('저장된 skinId가 등록되지 않았거나 문자열이 아닌 값(%s)이면 manifest로 보지 않고 기본 스킨 classic으로 바꾼다', (_label, skinId) => {
    expect(toTutorialPreviewSkinOrDefault(skinId)).toEqual({ skinId: 'classic' });
  });

  it('개발 환경에서 개발용 스킨이 게임 설정 사용이면 저장된 crystal로 재생한다', async () => {
    expect(await resolveTutorialPreviewSkin('crystal')).toEqual({ skinId: 'crystal' });
  });

  it('개발 환경에서 개발용 스킨 v012를 고르면 저장된 crystal 대신 플레이 화면과 같은 classic-v012 manifest 참조 그대로 재생한다', async () => {
    useDevSkinSelection.getState().select('v012');
    const skin = await resolveTutorialPreviewSkin('crystal');
    expect(skin.skinId).toBe('classic-v012');
    expect(skin.skinManifest).toBe(classicV012);
  });

  it('개발 환경에서 개발용 스킨 현재 Classic을 고르면 저장된 crystal 대신 classic manifest로 재생한다', async () => {
    useDevSkinSelection.getState().select('classic');
    expect(await resolveTutorialPreviewSkin('crystal')).toEqual({ skinId: 'classic', skinManifest: getSkinManifest('classic') });
  });

  it.each(UNREGISTERED_SAVED_SKIN_IDS)('개발 환경에서 개발용 스킨이 게임 설정 사용이고 저장된 skinId가 등록되지 않았거나 문자열이 아닌 값(%s)이면 manifest로 보지 않고 classic으로 재생한다', async (_label, skinId) => {
    expect(await resolveTutorialPreviewSkin(skinId as string)).toEqual({ skinId: 'classic' });
  });

  it('배포 빌드(import.meta.env.DEV=false)에서는 개발용 스킨 선택 모듈을 불러오지 않아 v012를 돌려주는 선택이 있어도 저장된 crystal로 재생한다', async () => {
    const loaded = vi.fn();
    vi.doMock('../../../lab/devSkinSelection', () => {
      loaded();
      return { resolveDevSkinSelection: () => classicV012 };
    });
    const { resolveTutorialPreviewSkin: resolveInProduction } = await importTutorialPreviewSkinWithDev(false);
    expect(await resolveInProduction('crystal')).toEqual({ skinId: 'crystal' });
    await vi.dynamicImportSettled();
    expect(loaded).not.toHaveBeenCalled();
  });

  it.each(UNREGISTERED_SAVED_SKIN_IDS)('배포 빌드(import.meta.env.DEV=false)에서 저장된 skinId가 등록되지 않았거나 문자열이 아닌 값(%s)이면 manifest로 보지 않고 classic으로 재생한다', async (_label, skinId) => {
    const { resolveTutorialPreviewSkin: resolveInProduction } = await importTutorialPreviewSkinWithDev(false);
    expect(await resolveInProduction(skinId as string)).toEqual({ skinId: 'classic' });
  });

  it('개발 환경에서는 tutorialPreviewSkin 모듈을 불러올 때 스킨을 정하기 전에 개발용 스킨 선택 모듈을 미리 불러온다', async () => {
    const loaded = vi.fn();
    vi.doMock('../../../lab/devSkinSelection', () => {
      loaded();
      return { resolveDevSkinSelection: (skinId: string) => skinId };
    });
    await importTutorialPreviewSkinWithDev(true);
    await vi.dynamicImportSettled();
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it.each(UNREGISTERED_SAVED_SKIN_IDS)('개발 환경에서 개발용 스킨 선택을 미리 불러오다 실패하면 처리되지 않은 거부 없이 저장된 skinId(%s)를 경고 1번 뒤 classic으로 재생한다', async (_label, skinId) => {
    vi.doMock('../../../lab/devSkinSelection', () => {
      throw new Error('dev skin selection import failed');
    });
    const { resolveTutorialPreviewSkin: resolveAfterFailedLoad } = await importTutorialPreviewSkinWithDev(true);
    // 미리 불러오기가 실패로 끝날 때까지 기다린다. 이 거부를 처리하지 않으면 Vitest가 처리되지 않은 거부로 실행을 실패시킨다.
    await vi.dynamicImportSettled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await resolveAfterFailedLoad(skinId as string)).toEqual({ skinId: 'classic' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('개발용 스킨 선택은 모듈을 불러올 때 import.meta.env.DEV 삼항 안에서만 동적으로 불러오고 lab 모듈을 정적으로 import하지 않는다', () => {
    expect(tutorialPreviewSkinSource).toMatch(
      /const devSkinSelectionImport = import\.meta\.env\.DEV\s*\?\s*import\('\.\.\/\.\.\/\.\.\/lab\/devSkinSelection'\)\s*:\s*null/,
    );
    expect(tutorialPreviewSkinSource).not.toMatch(/from '\.\.\/\.\.\/\.\.\/lab\//);
  });
});
