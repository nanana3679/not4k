/** SAKURA 스킨 팔레트 — 일본전통 × 수채화 × 벚꽃 */
const P = {
  single: {
    deep: "#1a1f3a",    // 남색 심층 (kon-iro deep)
    base: "#2d3561",    // 남색 (kon-iro)
    mid: "#3d4a7a",     // 중간 남색
    bright: "#5568a8",  // 밝은 남색 (rurikon)
    highlight: "#8090c8", // 하이라이트
    specular: "#c0ccee", // 스페큘러
  },
  double: {
    deep: "#4a1f2e",    // 깊은 벚꽃 (fuji-iro deep)
    base: "#8b3a54",    // 벚꽃 기본 (sakura-iro)
    mid: "#c0607a",     // 벚꽃 중간
    bright: "#e09aaa",  // 밝은 벚꽃
    highlight: "#f0c4d0", // 벚꽃 하이라이트
    specular: "#fae8ed", // 벚꽃 스페큘러
  },
  core: {
    deep: "#5c3800",    // 금박 심층 (kin-iro deep)
    base: "#a06010",    // 금박 기본
    mid: "#c88a20",     // 금박 중간
    bright: "#e8b840",  // 금박 밝음
    highlight: "#f8d870", // 금박 하이라이트
    specular: "#fff0a0", // 금박 스페큘러
    glow: "rgba(232,184,64,0.55)", // 금박 글로우
    off: "#1a130a", offBase: "#2a1e0a", offMid: "#3a2a10", offBright: "#4e3a1a",
  },
  holder: {
    stroke: "#c88a20",  // 금박 엔소 원 (enso circle)
    fill: "rgba(16,12,6,0.7)",
  },
  body: {
    single: { base: "#2d3561", edge: "#1a1f3a" },
    double: { base: "#8b3a54", edge: "#4a1f2e" },
  },
  bg: "#0f0c0a",       // 와시 종이 어두운 배경
  bgCard: "#18140f",
  text: "#d4c8b8",
  textDim: "#5a5040",
  border: "#2a2218",
  accent: "#e8b840",   // 금박 액센트
};

export default P;
