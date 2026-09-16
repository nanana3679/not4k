export type NoteAssetKind = "single" | "double" | "trill";
export const NOTE_ASSET_KIND_LABELS: Record<NoteAssetKind, string> = { single: "싱글", double: "더블", trill: "트릴" };
export type NoteBodyState = "idle" | "on" | "partial-off" | "off";
export type NoteTerminalState = "idle" | "on" | "failed" | "grace";
export type KeybombVariantId = "silver" | "diagonal" | "armor" | "shockwave" | "segmented" | "compact" | "skin";

export interface KeybombVariant {
  id: KeybombVariantId;
  title: string;
  duration: number;
  /** 등록 스킨의 프레임 봄. 없으면 기존 CSS 효과를 쓴다. */
  frames?: string[];
}

export const NOTE_ASSET_BASE = "/lab/note-assets";

export const KEYBOMB_VARIANTS: KeybombVariant[] = [
  { id: "silver", title: "실버 링", duration: 280 },
  { id: "diagonal", title: "대각 섬광", duration: 240 },
  { id: "armor", title: "장갑 파편", duration: 300 },
  { id: "shockwave", title: "백색 충격파", duration: 280 },
  { id: "segmented", title: "분할 링", duration: 300 },
  { id: "compact", title: "응축 섬광", duration: 200 },
];

export const BODY_ASSETS: Array<{ kind: NoteAssetKind; state: NoteBodyState; label: string; src: string }> = [
  { kind: "single", state: "idle", label: "싱글 · 대기", src: `${NOTE_ASSET_BASE}/body-single-idle.svg` },
  { kind: "single", state: "on", label: "싱글 · 켜짐", src: `${NOTE_ASSET_BASE}/body-single-on.svg` },
  { kind: "single", state: "off", label: "싱글 · 꺼짐", src: `${NOTE_ASSET_BASE}/body-single-off.svg` },
  { kind: "double", state: "idle", label: "더블 · 대기", src: `${NOTE_ASSET_BASE}/body-double-idle.svg` },
  { kind: "double", state: "on", label: "더블 · 켜짐", src: `${NOTE_ASSET_BASE}/body-double-on.svg` },
  {
    kind: "double",
    state: "partial-off",
    label: "더블 · 중앙광",
    src: `${NOTE_ASSET_BASE}/body-double-partial-off.svg`,
  },
  { kind: "double", state: "off", label: "더블 · 꺼짐", src: `${NOTE_ASSET_BASE}/body-double-off.svg` },
];

export const TERMINAL_ASSETS: Array<{
  kind: NoteAssetKind;
  state: NoteTerminalState;
  label: string;
  src: string;
}> = (["single", "double"] as const).flatMap((kind) => ([
  {
    kind,
    state: "idle" as const,
    label: `${kind === "single" ? "싱글" : "더블"} · 대기`,
    src: `${NOTE_ASSET_BASE}/terminal-${kind}-idle.svg`,
  },
  {
    kind,
    state: "on" as const,
    label: `${kind === "single" ? "싱글" : "더블"} · 켜짐`,
    src: `${NOTE_ASSET_BASE}/terminal-${kind}.svg`,
  },
  {
    kind,
    state: "failed" as const,
    label: `${kind === "single" ? "싱글" : "더블"} · 실패`,
    src: `${NOTE_ASSET_BASE}/terminal-${kind}-failed.svg`,
  },
  {
    kind,
    state: "grace" as const,
    label: `${kind === "single" ? "싱글" : "더블"} · Grace`,
    src: `${NOTE_ASSET_BASE}/terminal-${kind}-grace.svg`,
  },
]));

export function getPointNoteAsset(kind: NoteAssetKind): string {
  return `${NOTE_ASSET_BASE}/note-${kind}.png`;
}
