import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkinManifest } from '../../skin/skins';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../../../lab/noteAssetDesigns';
import { useDevSkinSelection } from '../../../lab/devSkinSelection';
import { resolveTutorialPreviewSkin, toTutorialPreviewSkinOrDefault } from './tutorialPreviewSkin';
import tutorialPreviewSkinSource from './tutorialPreviewSkin.ts?raw';

const classicV012 = CLASSIC_NOTE_ASSET_VERSIONS.find(version => version.id === 'v012')?.design.skinManifest;

/**
 * import.meta.env.DEV를 정한 뒤 tutorialPreviewSkin을 새로 불러온다. 개발용 스킨 선택을 미리 불러올지는 모듈을 불러올 때 정해지므로
 * 배포 빌드 동작과 미리 불러오기는 새 모듈로 확인한다. 새 모듈이 불러오는 개발용 스킨 선택은 이 파일이 import한 것과 별개다.
 */
async function importTutorialPreviewSkinWith(dev: boolean) {
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
  it('숨긴 스킨(available: false)이지만 등록된 crystal은 skinId crystal 그대로 나누고 skinManifest는 넘기지 않는다', () => {
    expect(getSkinManifest('crystal').theme.available).toBe(false);
    expect(toTutorialPreviewSkinOrDefault('crystal')).toEqual({ skinId: 'crystal' });
  });

  it('등록되지 않은 스킨 id removed-skin은 기본 스킨 classic으로 바꾸고 skinManifest는 넘기지 않는다', () => {
    expect(toTutorialPreviewSkinOrDefault('removed-skin')).toEqual({ skinId: 'classic' });
  });

  it.each([
    ['null', null],
    ['숫자 42', 42],
    ['theme이 null인 객체', { theme: null }],
  ])('저장된 skinId가 문자열이 아닌 %s이면 manifest로 보지 않고 기본 스킨 classic으로 바꾼다', (_label, skinId) => {
    expect(toTutorialPreviewSkinOrDefault(skinId)).toEqual({ skinId: 'classic' });
  });

  it('보관 manifest classic-v012는 skinId classic-v012와 받은 manifest 참조 그대로의 skinManifest로 나눈다', () => {
    const skin = toTutorialPreviewSkinOrDefault(classicV012);
    expect(skin.skinId).toBe('classic-v012');
    expect(skin.skinManifest).toBe(classicV012);
  });

  it('개발 환경에서 개발용 스킨이 게임 설정 사용이면 저장된 crystal로 재생한다', async () => {
    vi.stubEnv('DEV', true);
    expect(await resolveTutorialPreviewSkin('crystal')).toEqual({ skinId: 'crystal' });
  });

  it('개발 환경에서 개발용 스킨 v012를 고르면 저장된 crystal 대신 플레이 화면과 같은 classic-v012 manifest로 재생한다', async () => {
    vi.stubEnv('DEV', true);
    useDevSkinSelection.getState().select('v012');
    const skin = await resolveTutorialPreviewSkin('crystal');
    expect(skin.skinId).toBe('classic-v012');
    expect(skin.skinManifest).toBe(classicV012);
  });

  it('개발 환경에서 개발용 스킨 현재 Classic을 고르면 저장된 crystal 대신 classic manifest로 재생한다', async () => {
    vi.stubEnv('DEV', true);
    useDevSkinSelection.getState().select('classic');
    expect(await resolveTutorialPreviewSkin('crystal')).toEqual({ skinId: 'classic', skinManifest: getSkinManifest('classic') });
  });

  it.each(['removed-skin', null, 42])('개발 환경에서 개발용 스킨이 게임 설정 사용이고 저장된 skinId가 쓸 수 없는 %s이면 classic으로 재생한다', async (skinId) => {
    vi.stubEnv('DEV', true);
    expect(await resolveTutorialPreviewSkin(skinId as string)).toEqual({ skinId: 'classic' });
  });

  it('배포 빌드(import.meta.env.DEV=false)에서는 개발용 스킨 선택 모듈을 불러오지 않아 v012를 돌려주는 선택이 있어도 저장된 crystal로 재생한다', async () => {
    const loaded = vi.fn();
    vi.doMock('../../../lab/devSkinSelection', () => {
      loaded();
      return { resolveDevSkinSelection: () => classicV012 };
    });
    const { resolveTutorialPreviewSkin: resolveInProduction } = await importTutorialPreviewSkinWith(false);
    expect(await resolveInProduction('crystal')).toEqual({ skinId: 'crystal' });
    await vi.dynamicImportSettled();
    expect(loaded).not.toHaveBeenCalled();
  });

  it.each(['removed-skin', null, 42])('배포 빌드(import.meta.env.DEV=false)에서 저장된 skinId가 쓸 수 없는 %s이면 classic으로 재생한다', async (skinId) => {
    const { resolveTutorialPreviewSkin: resolveInProduction } = await importTutorialPreviewSkinWith(false);
    expect(await resolveInProduction(skinId as string)).toEqual({ skinId: 'classic' });
  });

  it('개발 환경에서는 tutorialPreviewSkin 모듈을 불러올 때 스킨을 정하기 전에 개발용 스킨 선택 모듈을 미리 불러온다', async () => {
    const loaded = vi.fn();
    vi.doMock('../../../lab/devSkinSelection', () => {
      loaded();
      return { resolveDevSkinSelection: (skinId: string) => skinId };
    });
    await importTutorialPreviewSkinWith(true);
    await vi.dynamicImportSettled();
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it.each(['removed-skin', null])('개발 환경에서 개발용 스킨 선택을 미리 불러오다 실패하면 처리되지 않은 거부 없이 저장된 skinId %s를 경고 1번 뒤 classic으로 재생한다', async (skinId) => {
    vi.doMock('../../../lab/devSkinSelection', () => {
      throw new Error('dev skin selection import failed');
    });
    const { resolveTutorialPreviewSkin: resolveAfterFailedLoad } = await importTutorialPreviewSkinWith(true);
    // 미리 불러오기가 실패로 끝날 때까지 기다린다. 이 거부를 처리하지 않으면 Vitest가 처리되지 않은 거부로 실행을 실패시킨다.
    await vi.dynamicImportSettled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await resolveAfterFailedLoad(skinId as string)).toEqual({ skinId: 'classic' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('개발용 스킨 선택은 모듈을 불러올 때 import.meta.env.DEV 삼항 안에서만 동적으로 불러오고 lab 모듈을 정적으로 import하지 않는다', () => {
    expect(tutorialPreviewSkinSource).toMatch(
      /const devSkinSelectionModule = import\.meta\.env\.DEV\s*\?\s*import\('\.\.\/\.\.\/\.\.\/lab\/devSkinSelection'\)\s*:\s*null/,
    );
    expect(tutorialPreviewSkinSource).not.toMatch(/from '\.\.\/\.\.\/\.\.\/lab\//);
  });
});
