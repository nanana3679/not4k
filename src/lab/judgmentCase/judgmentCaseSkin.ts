/**
 * 판정 사례 이미지의 노트 스킨 (순수 함수).
 *
 * 게임 스킨 매니페스트(`src/game/skin/skins.ts`)에서 노트를 판정 전(대기) 모양으로 그리는 데 필요한 에셋만 고른다.
 * 켜짐(Held)·실패(Failed)·부분 상태 에셋은 고르지 않는다. 실패는 판정 라벨로만 보인다.
 * 에셋 선택과 배치 값은 GameNoteRenderer·SkinManager의 대기 상태 규칙을 따른다.
 *
 * 스크립트가 judgmentCaseSkinAssetPaths로 받은 경로의 PNG를 읽어 data URI와 크기를 넘기면
 * createJudgmentCaseSkin이 렌더러가 쓰는 JudgmentCaseSkin을 만든다.
 */

import type { SkinManifest, SkinTheme } from "../../game/skin/types";

export const JUDGMENT_CASE_SKIN_IDS = ["classic", "crystal", "simple"] as const;
export type JudgmentCaseSkinId = (typeof JUDGMENT_CASE_SKIN_IDS)[number];
export const DEFAULT_JUDGMENT_CASE_SKIN: JudgmentCaseSkinId = "classic";

export type JudgmentCaseNoteKind = "single" | "double" | "trill";

/** 매니페스트의 이미지 한 장짜리 에셋 키(봄·버튼 배열 제외) */
export type SkinAssetKey = Exclude<keyof SkinManifest["assets"], "bomb" | "buttonIdle" | "buttonPressed">;

export interface JudgmentCaseSkinImage {
  /** 이미지 주소. 스크립트는 data URI를 넘긴다(Playwright setContent는 상대 경로를 읽지 못한다) */
  href: string;
  /** 원본 픽셀 크기 */
  width: number;
  height: number;
}

/** 이미지 한 장 또는 그 일부(원본 픽셀 좌표) */
export interface JudgmentCaseSkinSprite {
  key: SkinAssetKey;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JudgmentCaseSkin {
  name: string;
  /** 롱노트 양 끝: 노트 한 칸 높이 터미널(full-height) 또는 바디 안쪽 반쪽 캡(split-cap) */
  terminalMode: NonNullable<SkinTheme["longNoteTerminalMode"]>;
  /** 바디: 텍스처 비율대로 세로 반복(repeat) 또는 늘이기(stretch) */
  bodyMode: "stretch" | "repeat";
  /** full-height 터미널이 바디 좌우로 더 나오는 게임 px */
  terminalFrameOverhangPx: number;
  /** Grace overlay 텍스처의 본체 바깥 투명 여백(게임 px) */
  graceOverlayPaddingPx: number;
  /** 포인트 위아래 접촉 그림자의 퍼짐 높이(게임 px). 없으면 접촉 그림자를 그리지 않는다 */
  pointContactShadow?: { above: number; below: number };
  images: Partial<Record<SkinAssetKey, JudgmentCaseSkinImage>>;
  point: Record<JudgmentCaseNoteKind, JudgmentCaseSkinSprite>;
  /** 대기 바디 */
  body: Record<JudgmentCaseNoteKind, JudgmentCaseSkinSprite>;
  /** 대기 터미널(중앙광 꺼짐). 대기 전용 에셋이 없는 스킨은 일반 terminal */
  terminal: Record<JudgmentCaseNoteKind, JudgmentCaseSkinSprite>;
  /** split-cap 스킨의 싱글·더블 반쪽 캡: 전용 endCap 이미지, 없으면 터미널 윗부분 절반 */
  cap?: Record<"single" | "double", JudgmentCaseSkinSprite>;
  pointGraceOverlay?: JudgmentCaseSkinSprite;
  terminalGraceOverlay?: JudgmentCaseSkinSprite;
  /** 싱글·더블 포인트 위아래 접촉 그림자(윗행이 가장 짙은 세로 그라디언트) */
  contactShadow?: JudgmentCaseSkinSprite;
  /** 트릴 포인트 모양을 따라 번지는 접촉 그림자 */
  contactShadowTrill?: JudgmentCaseSkinSprite;
  /** 포인트 이미지 폭 대비 바디 이미지 폭(최대 1) — SkinManager.getBodyWidthScale과 같다 */
  bodyWidthScale: Record<JudgmentCaseNoteKind, number>;
}

const KINDS: readonly JudgmentCaseNoteKind[] = ["single", "double", "trill"];
const SUFFIX: Record<JudgmentCaseNoteKind, "Single" | "Double" | "Trill"> = { single: "Single", double: "Double", trill: "Trill" };

/** src/game/skin/SkinManager.ts CAP_TEXTURE_KEY의 대기 터미널 몫을 따른다: 대기 터미널 키 → 전용 반쪽 캡 키 */
const DEDICATED_CAP: Partial<Record<SkinAssetKey, SkinAssetKey>> = {
  terminalSingle: "endCapSingle",
  terminalDouble: "endCapDouble",
};

interface SkinPlan {
  point: Record<JudgmentCaseNoteKind, SkinAssetKey>;
  body: Record<JudgmentCaseNoteKind, SkinAssetKey>;
  terminal: Record<JudgmentCaseNoteKind, SkinAssetKey>;
  /** topHalf면 그 터미널 이미지의 윗부분 절반을 캡으로 쓴다 */
  cap?: Record<"single" | "double", { key: SkinAssetKey; topHalf: boolean }>;
  pointGraceOverlay?: SkinAssetKey;
  terminalGraceOverlay?: SkinAssetKey;
  contactShadow?: SkinAssetKey;
  contactShadowTrill?: SkinAssetKey;
}

function terminalMode(theme: SkinTheme): JudgmentCaseSkin["terminalMode"] {
  return theme.longNoteTerminalMode ?? "split-cap";
}

/** 게임이 판정 전(대기) 노트에 쓰는 에셋 키 */
function planSkin(manifest: SkinManifest): SkinPlan {
  const { assets, theme } = manifest;
  const has = (key: SkinAssetKey) => assets[key] !== undefined;
  const byKind = (pick: (kind: JudgmentCaseNoteKind) => SkinAssetKey) =>
    Object.fromEntries(KINDS.map((kind) => [kind, pick(kind)])) as Record<JudgmentCaseNoteKind, SkinAssetKey>;
  const terminal = byKind((kind) => {
    const idle = `terminal${SUFFIX[kind]}Idle` as SkinAssetKey;
    return has(idle) ? idle : (`terminal${SUFFIX[kind]}` as SkinAssetKey);
  });
  const capFor = (kind: "single" | "double") => {
    const dedicated = DEDICATED_CAP[terminal[kind]];
    return dedicated && has(dedicated) ? { key: dedicated, topHalf: false } : { key: terminal[kind], topHalf: true };
  };
  return {
    point: byKind((kind) => `note${SUFFIX[kind]}` as SkinAssetKey),
    body: byKind((kind) => `body${SUFFIX[kind]}` as SkinAssetKey),
    terminal,
    ...(terminalMode(theme) === "split-cap" ? { cap: { single: capFor("single"), double: capFor("double") } } : {}),
    ...(has("pointGraceOverlay") ? { pointGraceOverlay: "pointGraceOverlay" as const } : {}),
    ...(has("terminalGraceOverlay") ? { terminalGraceOverlay: "terminalGraceOverlay" as const } : {}),
    // src/game/renderer/GameNoteRenderer.ts renderPointNote의 그림자 분기를 따른다: 테마 pointContactShadow와 에셋이 함께 있을 때만 접촉 그림자.
    ...(theme.pointContactShadow && has("pointContactShadow") ? { contactShadow: "pointContactShadow" as const } : {}),
    ...(theme.pointContactShadow && has("pointContactShadowTrill") ? { contactShadowTrill: "pointContactShadowTrill" as const } : {}),
  };
}

function planKeys(plan: SkinPlan): SkinAssetKey[] {
  const keys = [
    ...KINDS.map((kind) => plan.point[kind]),
    ...KINDS.map((kind) => plan.body[kind]),
    ...KINDS.map((kind) => plan.terminal[kind]),
    ...(plan.cap ? [plan.cap.single.key, plan.cap.double.key] : []),
    plan.pointGraceOverlay,
    plan.terminalGraceOverlay,
    plan.contactShadow,
    plan.contactShadowTrill,
  ];
  return [...new Set(keys.filter((key): key is SkinAssetKey => key !== undefined))];
}

/** 판정 사례 이미지가 쓰는 대기 상태 에셋의 매니페스트 경로(`/skins/<id>/…png`) */
export function judgmentCaseSkinAssetPaths(manifest: SkinManifest): Partial<Record<SkinAssetKey, string>> {
  return Object.fromEntries(planKeys(planSkin(manifest)).map((key) => [key, manifest.assets[key] as string]));
}

/** 매니페스트와 judgmentCaseSkinAssetPaths 키별 이미지로 렌더러용 스킨을 만든다. 이미지가 빠지면 에러 */
export function createJudgmentCaseSkin(
  manifest: SkinManifest,
  images: Partial<Record<string, JudgmentCaseSkinImage>>,
): JudgmentCaseSkin {
  const plan = planSkin(manifest);
  const missing = planKeys(plan).filter((key) => !images[key]);
  if (missing.length > 0) throw new Error(`스킨 "${manifest.theme.id}" 이미지가 없습니다: ${missing.join(", ")}`);
  const image = (key: SkinAssetKey) => images[key]!;
  const whole = (key: SkinAssetKey): JudgmentCaseSkinSprite => ({ key, x: 0, y: 0, width: image(key).width, height: image(key).height });
  const optional = (key: SkinAssetKey | undefined) => (key === undefined ? undefined : whole(key));
  const byKind = (keys: Record<JudgmentCaseNoteKind, SkinAssetKey>) =>
    Object.fromEntries(KINDS.map((kind) => [kind, whole(keys[kind])])) as Record<JudgmentCaseNoteKind, JudgmentCaseSkinSprite>;
  const cap = (entry: { key: SkinAssetKey; topHalf: boolean }): JudgmentCaseSkinSprite =>
    entry.topHalf ? { ...whole(entry.key), height: image(entry.key).height / 2 } : whole(entry.key);
  const { theme } = manifest;
  const bodyWidthScale = Object.fromEntries(KINDS.map((kind) => {
    const point = image(plan.point[kind]);
    const body = image(plan.body[kind]);
    return [kind, point.width > 0 ? Math.min(1, body.width / point.width) : 1];
  })) as Record<JudgmentCaseNoteKind, number>;

  return {
    name: theme.name,
    terminalMode: terminalMode(theme),
    bodyMode: theme.longNoteBodyMode === "repeat" ? "repeat" : "stretch",
    terminalFrameOverhangPx: Math.max(0, theme.longNoteTerminalFrameOverhangPx ?? 0),
    graceOverlayPaddingPx: theme.graceOverlayPaddingPx ?? 0,
    ...(plan.contactShadow || plan.contactShadowTrill ? { pointContactShadow: theme.pointContactShadow } : {}),
    images: Object.fromEntries(planKeys(plan).map((key) => [key, image(key)])),
    point: byKind(plan.point),
    body: byKind(plan.body),
    terminal: byKind(plan.terminal),
    ...(plan.cap ? { cap: { single: cap(plan.cap.single), double: cap(plan.cap.double) } } : {}),
    pointGraceOverlay: optional(plan.pointGraceOverlay),
    terminalGraceOverlay: optional(plan.terminalGraceOverlay),
    contactShadow: optional(plan.contactShadow),
    contactShadowTrill: optional(plan.contactShadowTrill),
    bodyWidthScale,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG IHDR의 폭·높이 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) throw new Error("PNG 파일이 아닙니다");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
