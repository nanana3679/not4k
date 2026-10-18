import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkinManifest } from '../../skin/skins';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../../../lab/noteAssetDesigns';
import { useDevSkinSelection } from '../../../lab/devSkinSelection';
import { resolveTutorialPreviewSkin, toTutorialPreviewSkin } from './tutorialPreviewSkin';
import tutorialPreviewSkinSource from './tutorialPreviewSkin.ts?raw';

const classicV012 = CLASSIC_NOTE_ASSET_VERSIONS.find(version => version.id === 'v012')?.design.skinManifest;

beforeEach(() => useDevSkinSelection.getState().select('settings'));
afterEach(() => vi.unstubAllEnvs());

describe('튜토리얼 재생기 스킨', () => {
  it('스킨 id crystal은 skinId crystal로 나누고 skinManifest는 넘기지 않는다', () => {
    expect(toTutorialPreviewSkin('crystal')).toEqual({ skinId: 'crystal' });
  });

  it('보관 manifest classic-v012는 skinId classic-v012와 받은 manifest 참조 그대로의 skinManifest로 나눈다', () => {
    const skin = toTutorialPreviewSkin(classicV012!);
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

  it('배포 빌드(import.meta.env.DEV=false)에서는 개발용 스킨이 v012여도 저장된 crystal로 재생한다', async () => {
    useDevSkinSelection.getState().select('v012');
    vi.stubEnv('DEV', false);
    expect(await resolveTutorialPreviewSkin('crystal')).toEqual({ skinId: 'crystal' });
  });

  it('개발용 스킨 선택은 PlayScreen처럼 import.meta.env.DEV 삼항 안에서만 동적으로 불러오고 lab 모듈을 정적으로 import하지 않는다', () => {
    expect(tutorialPreviewSkinSource).toContain("import.meta.env.DEV\n    ? (await import('../../../lab/devSkinSelection')).resolveDevSkinSelection(settingsSkinId)\n    : settingsSkinId");
    expect(tutorialPreviewSkinSource).not.toMatch(/from '\.\.\/\.\.\/\.\.\/lab\//);
  });
});
