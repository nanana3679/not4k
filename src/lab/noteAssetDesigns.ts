import { getSkinManifest } from '../game/skin/skins';
import type { SkinManifest } from '../game/skin/types';
import { withLabPublicBase } from './labPublicPath';
import { CLASSIC_SKIN_VERSIONS } from './classicSkinVersions';
import { KEYBOMB_VARIANTS, NOTE_ASSET_KIND_LABELS, type KeybombVariant, type NoteAssetKind, type NoteBodyState, type NoteTerminalState } from './noteAssetShowcase';

export interface NoteAssetDesign {
  id: string;
  name: string;
  skinId: string;
  skinManifest?: SkinManifest;
  versionId?: string;
  description: string;
  points: Record<NoteAssetKind, string>;
  bodies: Array<{kind: NoteAssetKind; state: NoteBodyState; label: string; src: string}>;
  terminals: Array<{kind: NoteAssetKind; state: NoteTerminalState; label: string; src: string}>;
  bombs: KeybombVariant[];
}

/** 새 시안은 스킨 등록 후 이 설정만 추가한다. 차트·플레이어·랙에는 디자인 분기가 없다. */
export function createNoteAssetDesign(skin: SkinManifest, options: {
  description: string;
  sourceBase?: string;
  bombs?: KeybombVariant[];
}): NoteAssetDesign {
  const {assets, theme} = skin;
  const source = (name: string, fallback: string) => options.sourceBase
    ? withLabPublicBase(`${options.sourceBase}/${name}.svg`)
    : fallback;
  const assetKinds = {single:'Single', double:'Double', trill:'Trill'} as const;
  return {
    id: theme.id, name: theme.name, skinId: theme.id, description: options.description,
    points: {single: source('note-single', assets.noteSingle), double: source('note-double', assets.noteDouble), trill: source('note-trill', assets.noteTrill)},
    bodies: (['single','double','trill'] as const).flatMap(kind => {
      const label = NOTE_ASSET_KIND_LABELS[kind];
      const key = assetKinds[kind];
      const states = [
        {state:'idle' as const, label:'대기', src: assets[`body${key}`]},
        {state:'on' as const, label:'켜짐', src: assets[`body${key}Held`]},
        ...(kind === 'double' ? [{state:'partial-off' as const, label:'중앙광', src:assets.bodyDoublePartialHeldLeft}] : []),
        {state:'off' as const, label:'실패', src: assets[`body${key}Failed`]},
      ];
      // 켜짐 효과가 없는 스킨(heldEffect: false)은 켜짐·중앙광 에셋이 없어 랙에서 뺀다.
      return states
        .filter((state): state is typeof state & {src: string} => state.src !== undefined)
        .map(state => ({kind, state:state.state, label:`${label} · ${state.label}`, src:source(`body-${kind}-${state.state}`,state.src)}));
    }),
    terminals: (['single','double','trill'] as const).flatMap(kind => {
      const label = NOTE_ASSET_KIND_LABELS[kind];
      const key = assetKinds[kind];
      const on = assets[`terminal${key}`];
      return [
        {kind, state:'idle' as const, label:`${label} · 대기`, src:source(`terminal-${kind}-idle`,assets[`terminal${key}Idle`] ?? on)},
        {kind, state:'on' as const, label:`${label} · 켜짐`, src:source(`terminal-${kind}`,on)},
        {kind, state:'failed' as const, label:`${label} · 실패`, src:source(`terminal-${kind}-failed`,assets[`terminal${key}Failed`])},
        ...(options.sourceBase && kind !== 'trill' ? [{kind, state:'grace' as const, label:`${label} · Grace`, src:source(`terminal-${kind}-grace`,on)}] : []),
      ];
    }),
    bombs: options.bombs ?? [{id:'skin', title:`${theme.name} 봄`, duration:theme.bombDurationMs ?? assets.bomb.length * 1000 / 60, frames:assets.bomb}],
  };
}

export const NOTE_ASSET_DESIGNS: NoteAssetDesign[] = [
  createNoteAssetDesign(getSkinManifest('classic'), {
    description:'고채도 포인트 · 아주 밝은 바디 · 흰 석영 트릴 · 실버 봄',
    sourceBase:'/lab/note-assets/classic',
    bombs:KEYBOMB_VARIANTS,
  }),
  createNoteAssetDesign(getSkinManifest('simple'), {description:'단색 노트와 기본 봄 · 켜짐 효과 없음'}),
];

/**
 * 보관본의 스킨 공통 기어 에셋 키(#231 전 키 `gearFrame`·지금 키 `gearImage`, RFD 0029 이전의 기둥 게이지).
 * 보관본의 옛 기어·게이지 대신 지금 공통 기어를 쓴다(렌더러 배치가 이 그림의 측정값을 따른다).
 */
const SHARED_GEAR_ASSET_KEYS = new Set(['gearFrame', 'gearImage', 'gearGaugeLeft', 'gearGaugeRight']);

/** 보관한 Classic 버전 하나를 재생용 시안으로 바꾼다. 보관본의 기어 키(옛 `gearFrame`이든 지금 `gearImage`든)는 버리고 지금 공통 기어를 쓴다. */
export function createArchivedClassicDesign(version: (typeof CLASSIC_SKIN_VERSIONS)[number]) {
  const base = `/lab/skin-versions/classic/${version.id}`;
  const assetPath = (path: string) => {
    if (path.startsWith('/skins/classic/')) return withLabPublicBase(`${base}/skin/${path.slice('/skins/classic/'.length)}`);
    throw new Error(`Unknown archived Classic asset: ${path}`);
  };
  const archivedAssets = Object.entries(version.manifest.assets).filter(([key]) => !SHARED_GEAR_ASSET_KEYS.has(key));
  const skin: SkinManifest = {
    theme: { ...version.manifest.theme, id: `classic-${version.id}`, name: `Classic ${version.id}`, available: false },
    assets: {
      ...Object.fromEntries(archivedAssets.map(([key, paths]) =>
        [key, Array.isArray(paths) ? paths.map(assetPath) : assetPath(paths)],
      )),
      gearImage: getSkinManifest('classic').assets.gearImage,
    } as SkinManifest['assets'],
  };
  const design: NoteAssetDesign = {
    ...createNoteAssetDesign(skin, { description: version.label, sourceBase: `${base}/svg` }),
    id: 'classic', name: 'Classic', versionId: version.id, skinManifest: skin,
  };
  return { id: version.id, label: version.label, design };
}

export const CLASSIC_NOTE_ASSET_VERSIONS = CLASSIC_SKIN_VERSIONS.map(createArchivedClassicDesign);

export function getNoteAssetDesign(id: string | null, versionId: string | null = null): NoteAssetDesign {
  const design = NOTE_ASSET_DESIGNS.find(design => design.id === id) ?? NOTE_ASSET_DESIGNS[0];
  if (design.id !== 'classic') return design;
  return CLASSIC_NOTE_ASSET_VERSIONS.find(version => version.id === versionId)?.design ?? design;
}
