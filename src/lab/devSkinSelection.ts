import { create } from 'zustand';
import { getSkinManifest } from '../game/skin/skins';
import type { SkinManifest } from '../game/skin/types';
import { CLASSIC_NOTE_ASSET_VERSIONS } from './noteAssetDesigns';

export const DEV_SKIN_OPTIONS = [
  { id: 'settings', label: '게임 설정 사용' },
  { id: 'classic', label: 'Classic · 현재 적용본' },
  ...CLASSIC_NOTE_ASSET_VERSIONS.map(version => ({
    id: version.id,
    label: `Classic ${version.id} · ${version.label}`,
  })),
];

// dev에서만 동적으로 불러온다. 게임 설정과 분리하고 저장소에 기록하지 않는다.
export const useDevSkinSelection = create<{
  selectedId: string;
  select: (id: string) => void;
}>(set => ({
  selectedId: 'settings',
  select: id => set({ selectedId: DEV_SKIN_OPTIONS.some(option => option.id === id) ? id : 'settings' }),
}));

export function resolveDevSkinSelection(settingsSkinId: string): string | SkinManifest {
  const { selectedId } = useDevSkinSelection.getState();
  if (selectedId === 'classic') return getSkinManifest('classic');
  return CLASSIC_NOTE_ASSET_VERSIONS.find(version => version.id === selectedId)?.design.skinManifest
    ?? settingsSkinId;
}
