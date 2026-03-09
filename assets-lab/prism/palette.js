/** PRISM 스킨 팔레트 — 홀로그램 × Y2K × 오로라 */
const P = {
  single: {
    deep: "#1a0a3a", base: "#3a1a7a", mid: "#6a30c8",
    bright: "#a060f0", highlight: "#c890ff", specular: "#eedcff",
    band: ["#6600cc", "#3333ff", "#0099ff", "#00ccaa", "#00ee44", "#ccee00", "#ff6600"],
  },
  double: {
    deep: "#3a0a20", base: "#7a1a40", mid: "#cc3070",
    bright: "#f060a0", highlight: "#ff90c8", specular: "#ffd8ee",
    band: ["#ff0066", "#ff3300", "#ff9900", "#ffcc00", "#ff66cc", "#cc33ff", "#9900ff"],
  },
  core: {
    deep: "#0a0a0a", base: "#1a1a2a", mid: "#ccccff",
    bright: "#ffffff", highlight: "#f0f0ff", specular: "#ffffff",
    glow: "rgba(180,160,255,0.6)",
    off: "#111118", offBase: "#1c1c28", offMid: "#2a2a3a", offBright: "#3a3a50",
    points: ["#ff3366", "#33ff99", "#3399ff", "#ffcc00"],
  },
  holder: { stroke: "rgba(200,180,255,0.25)", fill: "rgba(140,100,255,0.07)" },
  body: {
    single: { base: "#2a1060", edge: "#180830" },
    double: { base: "#601030", edge: "#380818" },
  },
  bg: "#06040e",
  bgCard: "#0c0818",
  text: "#d0c8e8",
  textDim: "#4a4060",
  border: "#1a1430",
  accent: "#a060f0",
  rainbow: ["#ff0000", "#ff8800", "#ffff00", "#00ff44", "#0088ff", "#8800ff", "#ff00cc"],
};

export default P;
