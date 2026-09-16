import { getSkinManifest } from '../game/skin/skins';
import type { SkinManifest } from '../game/skin/types';
import { KEYBOMB_VARIANTS, NOTE_ASSET_KIND_LABELS, type KeybombVariant, type NoteAssetKind, type NoteBodyState, type NoteTerminalState } from './noteAssetShowcase';

export interface NoteAssetDesign {
  id: string;
  name: string;
  skinId: string;
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
  const source = (name: string, fallback: string) => options.sourceBase ? `${options.sourceBase}/${name}.svg` : fallback;
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
      return states.map(state => ({kind, state:state.state, label:`${label} · ${state.label}`, src:source(`body-${kind}-${state.state}`,state.src)}));
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
    description:'유광 포인트 · 어두운 금속 바디 · 흰 석영 트릴 · 실버 봄',
    sourceBase:'/lab/note-assets/classic',
    bombs:KEYBOMB_VARIANTS,
  }),
  createNoteAssetDesign(getSkinManifest('simple'), {description:'기존 Classic · 단색 노트와 기본 봄'}),
];

export function getNoteAssetDesign(id: string | null): NoteAssetDesign {
  return NOTE_ASSET_DESIGNS.find(design => design.id === id) ?? NOTE_ASSET_DESIGNS[0];
}
