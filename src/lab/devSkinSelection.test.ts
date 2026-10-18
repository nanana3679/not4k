import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../game/stores';
import { getSkinManifest } from '../game/skin/skins';
import { CLASSIC_NOTE_ASSET_VERSIONS } from './noteAssetDesigns';
import DevSkinVersionSelect, { type DevSkinSelectRow } from './DevSkinVersionSelect';
import { DEV_SKIN_OPTIONS, resolveDevSkinSelection, useDevSkinSelection } from './devSkinSelection';

beforeEach(() => useDevSkinSelection.getState().select('settings'));

describe('dev Settings의 스킨 버전', () => {
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
    useDevSkinSelection.getState().select('v002');
    useDevSkinSelection.getState().select('v999');
    expect(useDevSkinSelection.getState().selectedId).toBe('settings');
    expect(resolveDevSkinSelection('crystal')).toBe('crystal');
  });

  it('선택기는 게임 설정·현재 Classic·v014·v013·v012·v002·v001의 7개 선택지를 최신 버전부터 제공한다', () => {
    expect(DEV_SKIN_OPTIONS.map(option => option.id)).toEqual(['settings', 'classic', 'v014', 'v013', 'v012', 'v002', 'v001']);
    let row: DevSkinSelectRow | undefined;
    renderToStaticMarkup(createElement(DevSkinVersionSelect, { renderRow: r => { row = r; return null; } }));
    expect(row?.label).toBe('개발용 스킨');
    expect(row?.desc).toBe('기본 스킨보다 우선합니다. 새로고침하면 해제됩니다.');
    expect(row?.value).toBe('settings');
    expect(row?.options.map(option => option.label)).toContain('Classic v002 · 고채도 포인트 · 아주 밝은 바디 · 공용 터미널');
    expect(row?.options.map(option => option.label)).toContain('Classic v012 · 흰빛 포인트 · 트렌치 바디 · 접촉 그림자 · 에디터 회색 마름모 트릴 끝 터미널');
    expect(row?.options.map(option => option.label)).toContain('Classic v013 · 흰빛 포인트 · 트렌치 바디 · 접촉 그림자(트릴 마름모 테두리 포함) · 에디터 회색 마름모 트릴 끝 터미널');
    expect(row?.options.map(option => option.label)).toContain('Classic v014 · 흰빛 포인트 · 트렌치 바디 · 접촉 그림자(트릴 마름모 테두리 포함) · 반투명 사각 기둥 트릴 켜짐 바디 · 에디터 회색 마름모 트릴 끝 터미널');
  });

  it('선택기 행의 onChange에 v002를 넘기면 개발용 선택이 v002로 바뀐다', () => {
    let row: DevSkinSelectRow | undefined;
    renderToStaticMarkup(createElement(DevSkinVersionSelect, { renderRow: r => { row = r; return null; } }));
    row?.onChange('v002');
    expect(useDevSkinSelection.getState().selectedId).toBe('v002');
  });

});
