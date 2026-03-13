/**
 * Classic 스킨 버튼 디자인 샘플 — 기어 프레임 위에서 버튼만 교체
 * assets-lab 전용
 */
import { useState } from "react";

const BTN_CX = [99, 182, 265, 348];
const BTN_Y = 838;
const LANE_LEFT = 50;
const LANE_RIGHT = 397;
const LANE_W = (LANE_RIGHT - LANE_LEFT) / 4;
const JUDGE_Y = 747;

const LANE_COLORS = {
  idle:    ["#662222", "#663333", "#223366", "#222266"],
  pressed: ["#ff4444", "#ff6655", "#5588ff", "#4466ff"],
};

const SAMPLES = [
  { id: "A", name: "Diamond Star (reference)", render: renderDiamondStar },
  { id: "B", name: "Circle Simple", render: renderCircle },
  { id: "C", name: "Neon Ring", render: renderNeonRing },
  { id: "D", name: "Keycap", render: renderKeycap },
  { id: "E", name: "Minimal Bar", render: renderMinimalBar },
  { id: "F", name: "Hexagon", render: renderHexagon },
];

/* ═══════════════ 기어 프레임 (reference.jsx에서 추출) ═══════════════ */
function GearFrame() {
  return (
    <>
      <defs>
        <linearGradient id="gBotBg" x1="223.5" y1="788.5" x2="223.5" y2="1080" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3E2F58" stopOpacity="0"/>
          <stop offset="1" stopColor="#8665BE"/>
        </linearGradient>
        <linearGradient id="gFrameL" x1="8.5" y1="5.7" x2="8.5" y2="873.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9F6F4"/>
          <stop offset="1" stopColor="#C6A1E0"/>
        </linearGradient>
        <linearGradient id="gFrameR" x1="438.5" y1="5.7" x2="438.5" y2="873.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9F6F4"/>
          <stop offset="1" stopColor="#C6A1E0"/>
        </linearGradient>
        <linearGradient id="gCornerL" x1="1.5" y1="1025.4" x2="68.5" y2="1025.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A66BAA"/>
          <stop offset="1" stopColor="#6E77AB"/>
        </linearGradient>
        <linearGradient id="gCornerR" x1="445.5" y1="1025.4" x2="378.5" y2="1025.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A66BAA"/>
          <stop offset="1" stopColor="#6E77AB"/>
        </linearGradient>
        <filter id="judgeShadow" x="-2%" y="-50%" width="104%" height="400%">
          <feDropShadow dx="0" dy="4" stdDeviation="2" floodColor="#ff3e3e" floodOpacity="0.25"/>
        </filter>
        <filter id="btnGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Bottom gradient bg */}
      <rect x="50" y="788.5" width="347" height="291.5" fill="url(#gBotBg)"/>

      {/* LEFT SIDE */}
      <path d="M13.5 873.2L3.5 844.6V34.5L13.5 5.7V873.2Z" fill="url(#gFrameL)" stroke="white" strokeWidth="1"/>
      <path d="M14.5 879.4V0H29.5V900.5L14.5 879.4Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white" strokeWidth="1"/>
      <rect x="33.5" y="0" width="16" height="834.4" fill="#32243E"/>
      <path d="M0.5 935V888.7H7L81.5 999.4V1008H54.5L0.5 935Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M33.5 905.7V838H44L142 981.9L140 996.2H94.5L33.5 905.7Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M13.5 972.7L1.5 985.9V1078.6H45.5L68.5 1045.7L13.5 972.7Z" fill="url(#gCornerL)"/>
      <path d="M85 1022.5H51L68 1045.7L85 1022.5Z" fill="#E051A3"/>
      <path d="M45.5 1078.6L87 1021.1L128.5 1078L45.5 1078.6Z" fill="#4B405B"/>

      {/* RIGHT SIDE */}
      <path d="M433.5 873.2L443.5 844.6V34.5L433.5 5.7V873.2Z" fill="url(#gFrameR)" stroke="white" strokeWidth="1"/>
      <path d="M432.5 879.4V0H417.5V900.5L432.5 879.4Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white" strokeWidth="1"/>
      <rect x="397.5" y="0" width="16" height="834.4" fill="#32243E"/>
      <path d="M446.5 935V888.7H440L365.5 999.4V1008H392.5L446.5 935Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M413.5 905.7V838H403L305 981.9L307 996.2H352.5L413.5 905.7Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M433.5 972.7L445.5 985.9V1078.6H401.5L378.5 1045.7L433.5 972.7Z" fill="url(#gCornerR)"/>
      <path d="M362 1022.5H396L379 1045.7L362 1022.5Z" fill="#E051A3"/>
      <path d="M401.5 1078.6L360 1021.1L318.5 1078L401.5 1078.6Z" fill="#4B405B"/>

      {/* CENTER */}
      <g filter="url(#judgeShadow)">
        <rect x="50" y="747" width="347" height="8" fill="#544169"/>
        <rect x="50.5" y="747.5" width="346" height="7" stroke="#6A3D78" strokeWidth="1"/>
      </g>
      <path d="M93.5 1008L85.5 1021.8L127 1079.2H320L361.5 1021.8L353.5 1008H93.5Z" fill="#E4DCE9"/>
      <path d="M145 966.3C148 958.9 154.5 944.2 156 942.2H291L302 966.3L291 994H288.5L285 1000.1H162L158.5 994H156L145 966.3Z" fill="white"/>
      <path d="M163 996.5L149.5 966.6H297.5L284 996.5H163Z" fill="#5B4C75"/>
      <path d="M157.5 947.9L149.5 966.6H297.5L289.5 947.9H157.5Z" fill="#DED4DD"/>

      {/* Lane field bg */}
      <rect x={LANE_LEFT} y="0" width={LANE_RIGHT - LANE_LEFT} height={JUDGE_Y} fill="#0a0812"/>
      {[1, 2, 3].map(i => (
        <line key={i} x1={LANE_LEFT + i * LANE_W} y1="0"
          x2={LANE_LEFT + i * LANE_W} y2={JUDGE_Y}
          stroke="rgba(100,60,160,0.12)" strokeWidth="1"/>
      ))}

      {/* Lane cover (below judge) */}
      <rect x={LANE_LEFT} y={JUDGE_Y + 4} width={LANE_RIGHT - LANE_LEFT} height={BTN_Y - JUDGE_Y - 50} fill="#000"/>
    </>
  );
}

/* ═══════════════ 버튼 렌더러들 ═══════════════ */

function renderDiamondStar(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  const S = 8, s = 2.2;
  const star = `M${cx},${cy-S} L${cx+s},${cy-s} L${cx+S},${cy} L${cx+s},${cy+s} L${cx},${cy+S} L${cx-s},${cy+s} L${cx-S},${cy} L${cx-s},${cy-s}Z`;
  return (
    <g filter={isP ? "url(#btnGlow)" : undefined}>
      <rect x={cx-17.5} y={cy-17.5} width="35" height="35"
        transform={`rotate(45 ${cx} ${cy})`}
        fill={col} stroke="rgba(255,255,255,0.3)" strokeWidth="1" opacity={isP ? 1 : 0.7} />
      <path d={star} fill={isP ? "#fff" : "rgba(255,255,255,0.6)"} strokeWidth="0.5" />
      {isP && <rect x={cx-22} y={cy-22} width="44" height="44"
        transform={`rotate(45 ${cx} ${cy})`}
        fill="none" stroke={LANE_COLORS.pressed[i]} strokeWidth="2" opacity=".4" />}
    </g>
  );
}

function renderCircle(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  return (
    <g>
      <circle cx={cx} cy={cy} r={22} fill={col} stroke="#444466" strokeWidth="1.5" opacity={isP ? 1 : 0.7} />
      <circle cx={cx} cy={cy} r={16} fill={isP ? LANE_COLORS.pressed[i] : "#222233"}
        stroke={col} strokeWidth="1" opacity={isP ? 0.9 : 0.6} />
      {isP && <circle cx={cx} cy={cy} r={24} fill="none" stroke={LANE_COLORS.pressed[i]} strokeWidth="2" opacity=".35" />}
    </g>
  );
}

function renderNeonRing(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  return (
    <g filter={isP ? "url(#btnGlow)" : undefined}>
      <circle cx={cx} cy={cy} r={20} fill="none" stroke={col}
        strokeWidth={isP ? 3 : 1.5} opacity={isP ? 1 : 0.5} />
      <circle cx={cx} cy={cy} r={6} fill={isP ? LANE_COLORS.pressed[i] : "rgba(255,255,255,0.15)"}
        opacity={isP ? 0.9 : 0.4} />
      {/* 십자 마커 */}
      <line x1={cx} y1={cy-12} x2={cx} y2={cy-8} stroke={col} strokeWidth="1.5" opacity={isP ? 1 : 0.4} />
      <line x1={cx} y1={cy+8} x2={cx} y2={cy+12} stroke={col} strokeWidth="1.5" opacity={isP ? 1 : 0.4} />
      <line x1={cx-12} y1={cy} x2={cx-8} y2={cy} stroke={col} strokeWidth="1.5" opacity={isP ? 1 : 0.4} />
      <line x1={cx+8} y1={cy} x2={cx+12} y2={cy} stroke={col} strokeWidth="1.5" opacity={isP ? 1 : 0.4} />
      {isP && <circle cx={cx} cy={cy} r={23} fill="none" stroke={LANE_COLORS.pressed[i]} strokeWidth="1" opacity=".25" />}
    </g>
  );
}

function renderKeycap(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  const sz = 30;
  const x = cx - sz / 2;
  const y = cy - sz / 2;
  return (
    <g>
      {!isP && <rect x={x+1} y={y+2} width={sz} height={sz} rx={4} fill="#000" opacity=".4" />}
      <rect x={x} y={isP ? y+1 : y} width={sz} height={sz} rx={4}
        fill={col} opacity={isP ? 1 : 0.6}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {!isP && <rect x={x+3} y={y+2} width={sz-6} height={4} rx={2}
        fill="rgba(255,255,255,0.12)" />}
      <rect x={x+5} y={(isP ? y+1 : y)+5} width={sz-10} height={sz-10} rx={2}
        fill={isP ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.25)"}
        stroke={isP ? "rgba(255,255,255,0.2)" : "none"} />
      {isP && <rect x={x-2} y={y-1} width={sz+4} height={sz+4} rx={6}
        fill="none" stroke={LANE_COLORS.pressed[i]} strokeWidth="1.5" opacity=".3" />}
    </g>
  );
}

function renderMinimalBar(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  const w = 50, h = 10;
  return (
    <g filter={isP ? "url(#btnGlow)" : undefined}>
      <rect x={cx-w/2} y={cy-h/2} width={w} height={h} rx={3}
        fill={col} opacity={isP ? 1 : 0.5} />
      <circle cx={cx-w/2+4} cy={cy} r={2.5} fill={isP ? "#fff" : col} opacity={isP ? 0.8 : 0.3} />
      <circle cx={cx+w/2-4} cy={cy} r={2.5} fill={isP ? "#fff" : col} opacity={isP ? 0.8 : 0.3} />
      {isP && <rect x={cx-w/2-2} y={cy-h/2-4} width={w+4} height={h+8} rx={4}
        fill="none" stroke={LANE_COLORS.pressed[i]} strokeWidth="1" opacity=".3" />}
    </g>
  );
}

function renderHexagon(cx, cy, i, isP) {
  const col = isP ? LANE_COLORS.pressed[i] : LANE_COLORS.idle[i];
  const hex = (r) => {
    const pts = [];
    for (let j = 0; j < 6; j++) {
      const a = (Math.PI / 3) * j - Math.PI / 6;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return pts.join(" ");
  };
  return (
    <g filter={isP ? "url(#btnGlow)" : undefined}>
      <polygon points={hex(20)} fill={col} stroke="rgba(255,255,255,0.2)" strokeWidth="1"
        opacity={isP ? 1 : 0.5} />
      <polygon points={hex(11)} fill={isP ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)"}
        stroke={isP ? "rgba(255,255,255,0.3)" : "none"} strokeWidth="0.8" />
      {isP && <polygon points={hex(24)} fill="none" stroke={LANE_COLORS.pressed[i]}
        strokeWidth="1.5" opacity=".3" />}
    </g>
  );
}

/* ═══════════════ 기어 + 버튼 조합 뷰 ═══════════════ */
function GearWithButtons({ renderBtn }) {
  const [pressed, setPressed] = useState([false, false, false, false]);
  const press = (i, s) => setPressed(p => { const n = [...p]; n[i] = s; return n; });

  return (
    <svg width={447 * 0.45} height={1080 * 0.45} viewBox="0 0 447 1080"
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: "#08060e", borderRadius: 4 }}>
      <GearFrame />

      {/* Key beams */}
      {pressed.map((p, i) => p && (
        <g key={`kb${i}`}>
          <defs>
            <linearGradient id={`kbGrad${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LANE_COLORS.pressed[i]} stopOpacity="0"/>
              <stop offset="100%" stopColor={LANE_COLORS.pressed[i]} stopOpacity="0.15"/>
            </linearGradient>
          </defs>
          <rect x={LANE_LEFT + i * LANE_W} y="0" width={LANE_W} height={JUDGE_Y}
            fill={`url(#kbGrad${i})`} />
        </g>
      ))}

      {/* Buttons */}
      {BTN_CX.map((cx, i) => (
        <g key={i} style={{ cursor: "pointer" }}
          onMouseDown={() => press(i, true)} onMouseUp={() => press(i, false)}
          onMouseLeave={() => press(i, false)}
          onTouchStart={() => press(i, true)} onTouchEnd={() => press(i, false)}>
          {/* Hit area */}
          <rect x={cx - 30} y={BTN_Y - 30} width={60} height={60} fill="transparent" />
          {renderBtn(cx, BTN_Y, i, pressed[i])}
        </g>
      ))}
    </svg>
  );
}

/* ═══════════════ 메인 페이지 ═══════════════ */
export default function ButtonSamples() {
  return (
    <div style={{
      minHeight: "100vh", background: "#08060e",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "24px 12px", gap: 16,
    }}>
      <div style={{
        fontSize: 14, color: "#a0a8c0", fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: ".08em",
      }}>
        Classic Button Design Samples
      </div>
      <div style={{ fontSize: 10, color: "#666", fontFamily: "'JetBrains Mono', monospace" }}>
        click buttons to preview pressed state
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 8 }}>
        {SAMPLES.map(({ id, name, render }) => (
          <div key={id} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              fontSize: 11, color: "#c0c8e0", fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {id}: {name}
            </div>
            <GearWithButtons renderBtn={render} />
          </div>
        ))}
      </div>
    </div>
  );
}
