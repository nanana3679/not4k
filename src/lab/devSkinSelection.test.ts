import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../game/stores';
import { getSkinManifest } from '../game/skin/skins';
import { CLASSIC_NOTE_ASSET_VERSIONS } from './noteAssetDesigns';
import DevSkinVersionSelect from './DevSkinVersionSelect';
import { DEV_SKIN_OPTIONS, resolveDevSkinSelection, useDevSkinSelection } from './devSkinSelection';

beforeEach(() => useDevSkinSelection.getState().select('settings'));

describe('dev 곡 선택의 스킨 버전', () => {
  it('선택 전에는 저장된 crystal을 쓰고 설정이 classic으로 바뀌면 classic을 쓴다', () => {
    expect(resolveDevSkinSelection('crystal')).toBe('crystal');
    expect(resolveDevSkinSelection('classic')).toBe('classic');
  });

  it.each(CLASSIC_NOTE_ASSET_VERSIONS)('$id를 선택하면 Lab과 같은 보관 매니페스트를 쓰고 게임 설정은 유지한다', version => {
    const gameState = useGameStore.getState();
    useDevSkinSelection.getState().select(version.id);
    expect(resolveDevSkinSelection('crystal')).toBe(version.design.skinManifest);
    expect(version.design.skinManifest?.theme.id).toBe(`classic-${version.id}`);
    expect(version.design.skinManifest?.assets.noteSingle).toContain(`/lab/skin-versions/classic/${version.id}/skin/`);
    expect(useGameStore.getState()).toBe(gameState);
  });

  it('현재 Classic을 선택하면 현재 매니페스트를 쓰고 게임 설정 사용으로 복귀하면 crystal을 쓴다', () => {
    useDevSkinSelection.getState().select('classic');
    expect(resolveDevSkinSelection('crystal')).toBe(getSkinManifest('classic'));
    useDevSkinSelection.getState().select('settings');
    expect(resolveDevSkinSelection('crystal')).toBe('crystal');
  });

  it('존재하지 않는 v999를 선택하면 게임 설정 사용으로 복귀한다', () => {
    useDevSkinSelection.getState().select('v004');
    useDevSkinSelection.getState().select('v999');
    expect(useDevSkinSelection.getState().selectedId).toBe('settings');
    expect(resolveDevSkinSelection('crystal')).toBe('crystal');
  });

  it('선택기는 게임 설정·현재 Classic·v001~v004의 6개 선택지를 제공한다', () => {
    expect(DEV_SKIN_OPTIONS.map(option => option.id)).toEqual(['settings', 'classic', 'v004', 'v003', 'v002', 'v001']);
    const html = renderToStaticMarkup(createElement(DevSkinVersionSelect));
    expect(html).toContain('개발용 스킨');
    expect(html).toContain('value="settings" selected=""');
    expect(html).toContain('Classic v004');
    expect(html).toContain('옅은 원본 포인트');
    expect(html).toContain('새로고침하면 게임 설정으로 돌아갑니다');
  });
});
