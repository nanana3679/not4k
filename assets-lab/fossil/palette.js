/** Fossil 스킨 팔레트 — 사암 × 아즈텍 × 미니멀 */
const P = {
  single: {
    deep:     "#6b4a28", // 짙은 사암 갈색
    base:     "#9a7248", // 사암 중간
    mid:      "#c4986a", // 따뜻한 베이지/탄
    bright:   "#dbb888", // 밝은 모래색
    highlight:"#edd9aa", // 하이라이트 크림
    specular: "#f5eccc", // 스페큘러 화이트
  },
  double: {
    deep:     "#1e5248", // 짙은 옥 녹색
    base:     "#2e7a68", // 청록 중간
    mid:      "#3da88a", // 옥/터콰이즈
    bright:   "#5ecaaa", // 밝은 터콰이즈
    highlight:"#8addc8", // 하이라이트 민트
    specular: "#c0f0e4", // 스페큘러 밝은 민트
  },
  core: {
    deep:     "#7a4a00", // 짙은 황금 갈색
    base:     "#b87800", // 황금 앰버 기본
    mid:      "#d4a000", // 황금 중간
    bright:   "#f0c800", // 밝은 황금
    highlight:"#f8dc60", // 하이라이트 선 노랑
    specular: "#fdf0a0", // 스페큘러 크림 노랑
    glow:     "rgba(240,200,0,0.55)",
    off:      "#201800", offBase: "#302400", offMid: "#403200", offBright: "#584400",
  },
  holder: { stroke: "#3a2a10", fill: "#221808" },
  body: {
    single: { base: "#7a5a30", edge: "#4a3618" },
    double: { base: "#246050", edge: "#143830" },
  },
  bg:      "#1a1208",
  bgCard:  "#251a0a",
  text:    "#d8c8a0",
  textDim: "#6a5030",
  border:  "#2e2010",
  accent:  "#f0c800",
};

export default P;
