/** Circuit 스킨 팔레트 — 사이버펑크 × PCB × 네온 */
const P = {
  single: {
    deep:      "#001a00",
    base:      "#003a00",
    mid:       "#006600",
    bright:    "#00cc00",
    highlight: "#39ff14",
    specular:  "#aaffaa",
  },
  double: {
    deep:      "#280028",
    base:      "#5a0050",
    mid:       "#aa0090",
    bright:    "#ee00cc",
    highlight: "#ff44ee",
    specular:  "#ffccff",
  },
  core: {
    deep:      "#001818",
    base:      "#003838",
    mid:       "#007070",
    bright:    "#00e5ff",
    highlight: "#80f0ff",
    specular:  "#ccfaff",
    glow:      "rgba(0,229,255,0.55)",
    off:       "#050e0e",
    offBase:   "#0a1a1a",
    offMid:    "#122020",
    offBright: "#1a2e2e",
  },
  holder: { stroke: "#00cc00", fill: "none" },
  holderDouble: { stroke: "#ee00cc", fill: "none" },
  body: {
    single: { base: "#003a00", edge: "#001a00" },
    double: { base: "#5a0050", edge: "#280028" },
  },
  bg:       "#020902",
  bgCard:   "#050f05",
  text:     "#99ffaa",
  textDim:  "#2a5530",
  border:   "#0a2010",
  accent:   "#39ff14",
  via:      "#00ff88",
};

export default P;
