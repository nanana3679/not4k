import type { SkinManifest } from "./types";
import { withPublicBase } from "../../shared/publicPath";

function buildManifest(
  id: string,
  theme: SkinManifest["theme"],
  withCaps = false,
  baseOverride?: string,
  withIdleTerminals = false,
  additionalAssets: Partial<SkinManifest["assets"]> = {},
): SkinManifest {
  const base = withPublicBase(baseOverride ?? `/skins/${id}`);
  const caps = withCaps
    ? {
        endCapSingle: `${base}/end-cap-single.png`,
        endCapDouble: `${base}/end-cap-double.png`,
        endCapSingleFailed: `${base}/end-cap-single-failed.png`,
        endCapDoubleFailed: `${base}/end-cap-double-failed.png`,
      }
    : {};
  const idleTerminals = withIdleTerminals
    ? {
        terminalSingleIdle: `${base}/terminal-single-idle.png`,
        terminalDoubleIdle: `${base}/terminal-double-idle.png`,
        terminalTrillIdle: `${base}/terminal-trill-idle.png`,
      }
    : {};
  return {
    theme,
    assets: {
      ...caps,
      ...idleTerminals,
      noteSingle: `${base}/note-single.png`,
      noteDouble: `${base}/note-double.png`,
      terminalSingle: `${base}/terminal-single.png`,
      terminalDouble: `${base}/terminal-double.png`,
      bodySingle: `${base}/body-single.png`,
      bodyDouble: `${base}/body-double.png`,
      bodySingleHeld: `${base}/body-single-held.png`,
      bodyDoubleHeld: `${base}/body-double-held.png`,
      noteDoubleFailed: `${base}/note-double-failed.png`,
      bodySingleFailed: `${base}/body-single-failed.png`,
      bodyDoubleFailed: `${base}/body-double-failed.png`,
      bodyDoublePartialFailedLeft: `${base}/body-double-partial-failed-left.png`,
      bodyDoublePartialFailedRight: `${base}/body-double-partial-failed-right.png`,
      terminalDoublePartialFailedLeft: `${base}/terminal-double-partial-failed-left.png`,
      terminalDoublePartialFailedRight: `${base}/terminal-double-partial-failed-right.png`,
      noteDoublePartialFailedLeft: `${base}/note-double-partial-failed-left.png`,
      noteDoublePartialFailedRight: `${base}/note-double-partial-failed-right.png`,
      bodyDoublePartialHeldLeft: `${base}/body-double-partial-held-left.png`,
      bodyDoublePartialHeldRight: `${base}/body-double-partial-held-right.png`,
      terminalSingleFailed: `${base}/terminal-single-failed.png`,
      terminalDoubleFailed: `${base}/terminal-double-failed.png`,
      noteTrill: `${base}/note-trill.png`,
      terminalTrill: `${base}/terminal-trill.png`,
      bodyTrill: `${base}/body-trill.png`,
      bodyTrillHeld: `${base}/body-trill-held.png`,
      noteTrillFailed: `${base}/note-trill-failed.png`,
      bodyTrillFailed: `${base}/body-trill-failed.png`,
      terminalTrillFailed: `${base}/terminal-trill-failed.png`,
      bomb: Array.from({ length: 16 }, (_, i) =>
        `${base}/bomb-${String(i).padStart(2, "0")}.png`
      ),
      // 기어 프레임/게이지는 스킨 공통 공유 에셋 (scripts/split-gear-gauge.mjs 산출물)
      gearFrame: withPublicBase("/gear/gear-frame.png"),
      gearGaugeLeft: withPublicBase("/gear/gear-gauge-left.png"),
      gearGaugeRight: withPublicBase("/gear/gear-gauge-right.png"),
      buttonIdle: Array.from({ length: 4 }, (_, i) =>
        `${base}/button-idle-${i + 1}.png`
      ),
      buttonPressed: Array.from({ length: 4 }, (_, i) =>
        `${base}/button-pressed-${i + 1}.png`
      ),
      ...additionalAssets,
    },
  };
}

export const SKIN_LIST: SkinManifest[] = [
  buildManifest("crystal", {
    id: "crystal",
    name: "Crystal",
    available: true,
    accent: 0xff3060,
    beamColor: 0xffffff,
    heldLine: 0xff3060,
    heldGlow: 0xff3060,
    bg: 0x06070c,
    text: 0xc8cdd8,
  }, true),
  buildManifest("prism", {
    id: "prism",
    name: "Prism",
    available: false,
    accent: 0xa060f0,
    beamColor: 0x00ff88,
    heldLine: 0xffffff,
    heldGlow: 0xb4a0ff,
    bg: 0x06040e,
    text: 0xd0c8e8,
  }),
  buildManifest("simple", {
    id: "simple",
    name: "Simple",
    available: false,
    accent: 0x4488ff,
    beamColor: 0xffffff,
    heldLine: 0x4488ff,
    heldGlow: 0x4488ff,
    bg: 0x0a0a14,
    text: 0xe0e0e0,
  }),
  buildManifest("note-asset-lab", {
    id: "note-asset-lab",
    name: "Note Asset Lab",
    available: false,
    accent: 0x83d8ff,
    beamColor: 0xffffff,
    heldLine: 0x8edcff,
    heldGlow: 0x88cbff,
    bg: 0x05080d,
    text: 0xd8e8f4,
    longNoteTerminalMode: "full-height",
    longNoteTerminalFrameOverhangPx: 2,
  }, false, "/lab/note-assets/skin", true),
  buildManifest("classic", {
    id: "classic",
    name: "Classic",
    available: true,
    accent: 0x83d8ff,
    beamColor: 0xffffff,
    heldLine: 0x8edcff,
    heldGlow: 0x88cbff,
    bg: 0x05080d,
    text: 0xd8e8f4,
    longNoteTerminalMode: "full-height",
    longNoteTerminalFrameOverhangPx: 0,
    pointNoteOverhangPx: 3,
    longNoteBodyMode: "repeat",
    graceOverlayPaddingPx: 12,
    pointShadow: { offsetY: 19.6, height: 3.2 },
    bombDurationMs: 280,
  }, false, undefined, true, {
    pointGraceOverlay: withPublicBase("/skins/classic/point-grace-overlay.png"),
    terminalGraceOverlay: withPublicBase("/skins/classic/terminal-grace-overlay.png"),
    pointShadow: withPublicBase("/skins/classic/point-shadow.png"),
  }),
];

/** 에셋이 준비되어 실제 선택 가능한 스킨만 추린 목록 (선택 UI용) */
export const AVAILABLE_SKINS: SkinManifest[] = SKIN_LIST.filter(
  (s) => s.theme.available
);

export function getSkinManifest(skinId: string): SkinManifest {
  const skin = SKIN_LIST.find((s) => s.theme.id === skinId);
  if (!skin) {
    throw new Error(`Unknown skin: ${skinId}`);
  }
  return skin;
}
