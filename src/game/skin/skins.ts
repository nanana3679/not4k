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
  buildManifest("abyssal", {
    id: "abyssal",
    name: "Abyssal",
    accent: 0x00c8e8,
    beamColor: 0x00e8ff,
    heldLine: 0x00c8e8,
    heldGlow: 0x00c8e8,
    bg: 0x04060f,
    text: 0x90b8c8,
  }),
  buildManifest("circuit", {
    id: "circuit",
    name: "Circuit",
    accent: 0x39ff14,
    beamColor: 0x39ff14,
    heldLine: 0x00e5ff,
    heldGlow: 0x00e5ff,
    bg: 0x020902,
    text: 0x99ffaa,
  }),
  buildManifest("sakura", {
    id: "sakura",
    name: "Sakura",
    accent: 0xe8b840,
    beamColor: 0xf8d8e8,
    heldLine: 0xe8b840,
    heldGlow: 0xe8b840,
    bg: 0x0f0c0a,
    text: 0xd4c8b8,
  }),
  buildManifest("forge", {
    id: "forge",
    name: "Forge",
    accent: 0xf06000,
    beamColor: 0xf06000,
    heldLine: 0xf06000,
    heldGlow: 0xf06000,
    bg: 0x080a0c,
    text: 0xc0c8d0,
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
  buildManifest("fossil", {
    id: "fossil",
    name: "Fossil",
    accent: 0xf0c800,
    beamColor: 0xdbb888,
    heldLine: 0xf0c800,
    heldGlow: 0xf0c800,
    bg: 0x1a1208,
    text: 0xd8c8a0,
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
