import type { SkinManifest } from "./types";

function buildManifest(id: string, theme: SkinManifest["theme"]): SkinManifest {
  const base = `/skins/${id}`;
  return {
    theme,
    assets: {
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
      terminalSingleFailed: `${base}/terminal-single-failed.png`,
      terminalDoubleFailed: `${base}/terminal-double-failed.png`,
      bomb: Array.from({ length: 16 }, (_, i) =>
        `${base}/bomb-${String(i).padStart(2, "0")}.png`
      ),
      gearFrame: `${base}/gear-frame.png`,
      buttonIdle: Array.from({ length: 4 }, (_, i) =>
        `${base}/button-idle-${i + 1}.png`
      ),
      buttonPressed: Array.from({ length: 4 }, (_, i) =>
        `${base}/button-pressed-${i + 1}.png`
      ),
    },
  };
}

export const SKIN_LIST: SkinManifest[] = [
  buildManifest("crystal", {
    id: "crystal",
    name: "Crystal",
    accent: 0xff3060,
    beamColor: 0xffffff,
    heldLine: 0xff3060,
    heldGlow: 0xff3060,
    bg: 0x06070c,
    text: 0xc8cdd8,
  }),
  buildManifest("prism", {
    id: "prism",
    name: "Prism",
    accent: 0xa060f0,
    beamColor: 0x00ff88,
    heldLine: 0xffffff,
    heldGlow: 0xb4a0ff,
    bg: 0x06040e,
    text: 0xd0c8e8,
  }),
  buildManifest("classic", {
    id: "classic",
    name: "Classic",
    accent: 0x4488ff,
    beamColor: 0xffffff,
    heldLine: 0x4488ff,
    heldGlow: 0x4488ff,
    bg: 0x0a0a14,
    text: 0xe0e0e0,
  }),
];

export function getSkinManifest(skinId: string): SkinManifest {
  const skin = SKIN_LIST.find((s) => s.theme.id === skinId);
  if (!skin) {
    throw new Error(`Unknown skin: ${skinId}`);
  }
  return skin;
}
