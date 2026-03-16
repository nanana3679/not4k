import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- 실패 상태 무채색 팔레트 ---
export const FAIL = {
  single: { deep: "#2a2a2a", base: "#3a3a3a", mid: "#555555", bright: "#6a6a6a", highlight: "#888888", specular: "#aaaaaa" },
  double: { deep: "#2a2a2a", base: "#3a3a3a", mid: "#555555", bright: "#6a6a6a", highlight: "#888888", specular: "#aaaaaa" },
  core: { off: "#1a1a1a", offBase: "#222222", offMid: "#2a2a2a", offBright: "#3a3a3a" },
  body: { single: { base: "#2a2a2a", edge: "#1a1a1a" }, double: { base: "#2a2a2a", edge: "#1a1a1a" } },
};

// --- Crystal Core ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  if (!filled) return (
    <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill="none" stroke={P.core.offMid} strokeWidth="1.2" />
  );
  const lit = glowing && !dimmed;
  const c = lit ? P.core : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright };
  return (
    <g>
      <polygon points={`${cx},${cy - s} ${cx - s},${cy} ${cx},${cy}`} fill={c.base} />
      <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy}`} fill={c.mid} />
      <polygon points={`${cx - s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={c.bright} />
      <polygon points={`${cx + s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={c.highlight} />
      <polygon points={`${cx},${cy - s * .5} ${cx - s * .5},${cy} ${cx},${cy}`} fill={c.mid} opacity="0.5" />
      <polygon points={`${cx},${cy - s * .5} ${cx + s * .5},${cy} ${cx},${cy}`} fill={c.bright} opacity="0.4" />
      {lit && <>
        <polygon points={`${cx},${cy - s * .6} ${cx - s * .2},${cy - s * .15} ${cx + s * .15},${cy - s * .35}`} fill="white" opacity="0.55" />
        <circle cx={cx + s * .25} cy={cy - s * .3} r={s * .08} fill="white" opacity="0.7" />
      </>}
    </g>
  );
}

// --- Crystal Holder ---
export function Holder({ cx, cy, size = 7, pad = 0 }) {
  const d = (size + pad) * Math.SQRT2;
  return (
    <g>
      <polygon points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
        fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="0.3" />
      <line x1={cx - d} y1={cy} x2={cx} y2={cy - d} stroke="#333" strokeWidth="0.5" opacity=".5" />
      <line x1={cx} y1={cy - d} x2={cx + d} y2={cy} stroke="#2a2a2a" strokeWidth="0.4" opacity=".35" />
    </g>
  );
}

// --- Crystal Wire ---
export function Wire({ cx, y, height, thickness = 5, held = false }) {
  return (
    <g>
      {held && <rect x={cx - thickness / 2 - 1.5} y={y} width={thickness + 3} height={height} fill="none" stroke="#fff" strokeWidth="1.5" opacity=".6" />}
      <rect x={cx - thickness / 2} y={y} width={thickness} height={height} fill="#0a0a0a" stroke="#080808" strokeWidth=".8" />
      <line x1={cx - thickness / 2 + .8} y1={y + 1} x2={cx - thickness / 2 + .8} y2={y + height - 1} stroke="#1a1a1a" strokeWidth=".5" />
      <line x1={cx + thickness / 2 - .8} y1={y + 1} x2={cx + thickness / 2 - .8} y2={y + height - 1} stroke="#050505" strokeWidth=".5" />
    </g>
  );
}

// --- Crystal NoteContainer ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 18, holderPad = 0, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `nc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, isDouble = type === "double", half = coreGap / 2;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} />
          <stop offset="40%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
      </defs>
      <rect x={x + 2} y={y + 2} width={CW} height={CH} fill="black" opacity=".4" />
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${uid}_g)`} />
      <line x1={x + 2} y1={y + .5} x2={x + CW - 2} y2={y + .5} stroke={pal.specular} strokeWidth=".8" opacity=".3" />
      <line x1={x} y1={y + CH} x2={x + CW} y2={y + CH} stroke="black" strokeWidth="1" opacity=".5" />
      <rect x={x} y={y} width="1" height={CH} fill={pal.highlight} opacity=".1" />
      <rect x={x + CW - 1} y={y} width="1" height={CH} fill="black" opacity=".2" />
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} pad={holderPad} /><Core cx={cx - half} cy={cy} size={coreSize} filled glowing dimmed={dimLeft} />
        <Holder cx={cx + half} cy={cy} size={coreSize} pad={holderPad} /><Core cx={cx + half} cy={cy} size={coreSize} filled glowing dimmed={dimRight} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} pad={holderPad} /><Core cx={cx} cy={cy} size={coreSize} filled glowing />
      </>)}
    </g>
  );
}

// --- Crystal BodySegment (Classic-style background + Crystal wire/lines) ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 18, wireThickness = 5, lineThickness = 3, glowIntensity = 3 }) {
  const baseCol = held ? P[type].bright : P[type].highlight;
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `cbody_${type}_${held ? "h" : "r"}_${x}_${y}`;
  const isDouble = type === "double", cx = x + CW / 2, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx], gw = lineThickness + 4 + glowIntensity;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={height} fill={`url(#${gradId})`} />
      {positions.map((px, pi) => {
        const glowId = `wglow_${type}_${pi}_${x}_${y}`;
        return (
          <g key={pi}>
            {held && <><defs>
              <linearGradient id={glowId} x1="0" y1="0.5" x2="1" y2="0.5">
                <stop offset="0%" stopColor={P.core.bright} stopOpacity="0" />
                <stop offset="35%" stopColor={P.core.bright} stopOpacity=".25" />
                <stop offset="50%" stopColor={P.core.highlight} stopOpacity=".4" />
                <stop offset="65%" stopColor={P.core.bright} stopOpacity=".25" />
                <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={px - 18} y={y} width={36} height={height} fill={`url(#${glowId})`} /></>}
            <Wire cx={px} y={y} height={height} thickness={wireThickness} held={held} />
            {held ? (
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.bright} strokeWidth={lineThickness} opacity=".95" />
            ) : (
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.mid} strokeWidth={lineThickness} opacity=".5" />
            )}
          </g>
        );
      })}
    </g>
  );
}

// --- Crystal TerminalCap (same gradient as BodySegment + empty core) ---
export function TerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 18, holderPad = 0, held = false }) {
  const baseCol = P[type].highlight;
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `cterm_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, isDouble = type === "double", half = coreGap / 2;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${gradId})`} />
      {(isDouble ? [cx - half, cx + half] : [cx]).map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={cy} height={y + CH - cy} thickness={5} />
          <line x1={px} y1={cy} x2={px} y2={y + CH} stroke={P.core.mid} strokeWidth={3} opacity=".5" />
        </g>
      ))}
    </g>
  );
}

// --- Crystal LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 18, holderPad, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap} holderPad={holderPad} held={held} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize} coreGap={coreGap} holderPad={holderPad} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- Crystal ButtonExport ---
export function ButtonExport({ cx, cy, pressed }) {
  return (
    <g>
      {/* Outer bezel ring */}
      <circle cx={cx} cy={cy} r={24} fill="#707880" stroke="#606870" strokeWidth="1" />
      {/* Button face */}
      <circle cx={cx} cy={cy} r={20} fill={pressed ? "#8890a0" : "#c0c8d4"} stroke={pressed ? "#707880" : "#d8dce4"} strokeWidth="1.5" />
      {/* Highlight arc */}
      {!pressed && <path d={`M${cx - 16},${cy - 7} A20,20 0 0,1 ${cx + 16},${cy - 7}`} fill="none" stroke="#e8ecf4" strokeWidth="1" opacity=".6" />}
      {pressed && <path d={`M${cx - 16},${cy - 7} A20,20 0 0,1 ${cx + 16},${cy - 7}`} fill="none" stroke="#606870" strokeWidth="1" opacity=".5" />}
      {/* Inner diamond */}
      <rect x={cx - 8} y={cy - 8} width={16} height={16} transform={`rotate(45 ${cx} ${cy})`} fill={pressed ? "#707880" : "#a0a8b8"} stroke={pressed ? "#606870" : "#b8c0cc"} strokeWidth="1.5" />
      {/* Pressed glow effects */}
      {pressed && <>
        <circle cx={cx} cy={cy} r={22} fill="none" stroke={P.core.glow} strokeWidth="3" opacity=".3" />
        <rect x={cx - 6} y={cy - 6} width={12} height={12} transform={`rotate(45 ${cx} ${cy})`} fill={P.core.bright} opacity=".2" />
      </>}
    </g>
  );
}

// --- Crystal BombFrame (diamond core explosion) ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;
  const coreRot = frame * 8; // 코어 회전 애니메이션
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#fff" stopOpacity={Math.min(1, f.glowOp * 1.8)} />
          <stop offset="25%" stopColor={P.core.specular} stopOpacity={Math.min(1, f.glowOp * 1.4)} />
          <stop offset="50%" stopColor={P.core.highlight} stopOpacity={f.glowOp * .7} />
          <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Glow — diamond shaped, 1.4x larger */}
      {f.glowR > 0 && (() => {
        const gr = f.glowR * 1.4;
        return <rect x={cx - gr} y={cy - gr} width={gr * 2} height={gr * 2}
          transform={`rotate(45 ${cx} ${cy})`} fill={`url(#${gid})`} />;
      })()}
      {/* Inner glow — extra bright center */}
      {f.glowR > 0 && <rect x={cx - f.glowR * .4} y={cy - f.glowR * .4} width={f.glowR * .8} height={f.glowR * .8}
        transform={`rotate(45 ${cx} ${cy})`} fill="#fff" opacity={Math.min(.6, f.glowOp * .8)} />}
      {/* Ring — diamond outline, brighter */}
      {f.ringOp > 0 && <rect x={cx - f.ringR} y={cy - f.ringR} width={f.ringR * 2} height={f.ringR * 2}
        transform={`rotate(45 ${cx} ${cy})`} fill="none" stroke={P.core.specular} strokeWidth={f.ringW * 1.5} opacity={Math.min(1, f.ringOp * 1.6)} />}
      {/* Burst rays — thicker, brighter */}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r = ang * Math.PI / 180, inner = f.burstLen * .2;
        return <line key={li} x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner} x2={cx + Math.cos(r) * f.burstLen * 1.2} y2={cy + Math.sin(r) * f.burstLen * 1.2} stroke={P.core.specular} strokeWidth={Math.max(.5, f.burstOp * 3.5)} opacity={Math.min(1, f.burstOp * 1.5)} />;
      })}
      {/* Shards — brighter, slightly larger */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist, sy = cy + sa.dy * f.shardDist, rot = sa.rot + frame * 12;
        const sz = f.shardSz * 1.3;
        return <rect key={si} x={sx - sz / 2} y={sy - sz / 2} width={sz} height={sz} transform={`rotate(${rot} ${sx} ${sy})`} fill={P.core.specular} opacity={Math.min(1, f.shardOp * 1.4)} />;
      })}
      {/* Core — spinning diamond with facets, brighter */}
      {f.coreR > 0 && (() => {
        const s = f.coreR * 1.2;
        return (
          <g transform={`rotate(${coreRot} ${cx} ${cy})`}>
            <polygon points={`${cx},${cy - s} ${cx - s},${cy} ${cx},${cy}`} fill={P.core.highlight} opacity={f.coreOp} />
            <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy}`} fill={P.core.specular} opacity={f.coreOp} />
            <polygon points={`${cx - s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill="#fff" opacity={f.coreOp * .9} />
            <polygon points={`${cx + s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={P.core.specular} opacity={f.coreOp} />
            <polygon points={`${cx},${cy - s * .5} ${cx - s * .3},${cy} ${cx + s * .2},${cy - s * .3}`} fill="white" opacity={f.coreOp * .8} />
          </g>
        );
      })()}
    </g>
  );
}

// --- Crystal GearFrameExport ---
// reference.jsx의 정적 SVG 프레임을 추출. 447×1080 뷰포트.
// 버튼은 별도 ButtonExport가 있으므로 버튼 웰(소켓)까지만 포함.
const LANE_LEFT = 50;
const LANE_RIGHT = 397;
const JUDGE_Y_GF = 747;
const BTN_Y_GF = 838;
const BTN_CX = [99, 182, 265, 348];

export function GearFrameExport() {
  return (
    <g>
      <defs>
        <linearGradient id="gf_gBotBg" x1="223.5" y1="788.5" x2="223.5" y2="1080" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3E2F58" stopOpacity="0"/>
          <stop offset="1" stopColor="#8665BE"/>
        </linearGradient>
        <linearGradient id="gf_gFrameL" x1="8.5" y1="5.7" x2="8.5" y2="873.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9F6F4"/>
          <stop offset="1" stopColor="#C6A1E0"/>
        </linearGradient>
        <linearGradient id="gf_gFrameR" x1="438.5" y1="5.7" x2="438.5" y2="873.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9F6F4"/>
          <stop offset="1" stopColor="#C6A1E0"/>
        </linearGradient>
        <linearGradient id="gf_gCornerL" x1="1.5" y1="1025.4" x2="68.5" y2="1025.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A66BAA"/>
          <stop offset="1" stopColor="#6E77AB"/>
        </linearGradient>
        <linearGradient id="gf_gCornerR" x1="445.5" y1="1025.4" x2="378.5" y2="1025.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A66BAA"/>
          <stop offset="1" stopColor="#6E77AB"/>
        </linearGradient>
        <filter id="gf_judgeShadow" x="-2%" y="-50%" width="104%" height="400%">
          <feDropShadow dx="0" dy="4" stdDeviation="2" floodColor="#ff3e3e" floodOpacity="0.25"/>
        </filter>
      </defs>

      {/* Lane field background */}
      <rect x={LANE_LEFT} y="0" width={LANE_RIGHT - LANE_LEFT} height={JUDGE_Y_GF} fill="#0a0812"/>

      {/* Lane dividers */}
      {[1, 2, 3].map(i => {
        const lw = (LANE_RIGHT - LANE_LEFT) / 4;
        return <line key={i} x1={LANE_LEFT + i * lw} y1="0" x2={LANE_LEFT + i * lw} y2={JUDGE_Y_GF} stroke="rgba(100,60,160,0.12)" strokeWidth="1"/>;
      })}

      {/* Bottom gradient bg */}
      <rect x="50" y="788.5" width="347" height="291.5" fill="url(#gf_gBotBg)"/>

      {/* ════════ LEFT SIDE ════════ */}
      <path d="M13.5 873.2L3.5 844.6V34.5L13.5 5.7V873.2Z" fill="url(#gf_gFrameL)" stroke="white" strokeWidth="1"/>
      <path d="M14.5 879.4V0H29.5V900.5L14.5 879.4Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white" strokeWidth="1"/>
      <rect x="33.5" y="0" width="16" height="834.4" fill="#32243E"/>
      <path d="M0.5 935V888.7H7L81.5 999.4V1008H54.5L0.5 935Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M33.5 905.7V838H44L142 981.9L140 996.2H94.5L33.5 905.7Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M13.5 972.7L1.5 985.9V1078.6H45.5L68.5 1045.7L13.5 972.7Z" fill="url(#gf_gCornerL)"/>
      <path d="M85 1022.5H51L68 1045.7L85 1022.5Z" fill="#E051A3"/>
      <path d="M45.5 1078.6L87 1021.1L128.5 1078L45.5 1078.6Z" fill="#4B405B"/>

      {/* ════════ RIGHT SIDE ════════ */}
      <path d="M433.5 873.2L443.5 844.6V34.5L433.5 5.7V873.2Z" fill="url(#gf_gFrameR)" stroke="white" strokeWidth="1"/>
      <path d="M432.5 879.4V0H417.5V900.5L432.5 879.4Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white" strokeWidth="1"/>
      <rect x="397.5" y="0" width="16" height="834.4" fill="#32243E"/>
      <path d="M446.5 935V888.7H440L365.5 999.4V1008H392.5L446.5 935Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M413.5 905.7V838H403L305 981.9L307 996.2H352.5L413.5 905.7Z" fill="#D9D9D9" fillOpacity="0.5" stroke="white"/>
      <path d="M433.5 972.7L445.5 985.9V1078.6H401.5L378.5 1045.7L433.5 972.7Z" fill="url(#gf_gCornerR)"/>
      <path d="M362 1022.5H396L379 1045.7L362 1022.5Z" fill="#E051A3"/>
      <path d="M401.5 1078.6L360 1021.1L318.5 1078L401.5 1078.6Z" fill="#4B405B"/>

      {/* ════════ CENTER ════════ */}
      {/* Judgment bar */}
      <g filter="url(#gf_judgeShadow)">
        <rect x="50" y="747" width="347" height="8" fill="#544169"/>
        <rect x="50.5" y="747.5" width="346" height="7" stroke="#6A3D78" strokeWidth="1" fill="none"/>
      </g>

      {/* Bottom main panel */}
      <path d="M93.5 1008L85.5 1021.8L127 1079.2H320L361.5 1021.8L353.5 1008H93.5Z" fill="#E4DCE9"/>

      {/* Score panel */}
      <path d="M145 966.3C148 958.9 154.5 944.2 156 942.2H291L302 966.3L291 994H288.5L285 1000.1H162L158.5 994H156L145 966.3Z" fill="white"/>
      <path d="M163 996.5L149.5 966.6H297.5L284 996.5H163Z" fill="#5B4C75"/>
      <path d="M157.5 947.9L149.5 966.6H297.5L289.5 947.9H157.5Z" fill="#DED4DD"/>

      {/* Button wells (소켓) */}
      {BTN_CX.map((cx, i) => (
        <rect key={i} x={cx - 17.5} y={BTN_Y_GF - 17.5} width="35" height="35"
          transform={`rotate(45 ${cx} ${BTN_Y_GF})`}
          fill="#32243E" stroke="#6A3D78" strokeWidth="1" opacity="0.5"/>
      ))}
    </g>
  );
}

// --- Crystal FailedNoteContainer ---
export function FailedNoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 18, dimLeft = false, dimRight = false }) {
  const pal = FAIL[type];
  const uid = `fnc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, isDouble = type === "double", half = coreGap / 2;
  const failCore = { base: FAIL.core.off, mid: FAIL.core.offBase, bright: FAIL.core.offMid, highlight: FAIL.core.offBright };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} />
          <stop offset="40%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
      </defs>
      <rect x={x + 2} y={y + 2} width={CW} height={CH} fill="black" opacity=".4" />
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${uid}_g)`} />
      <line x1={x + 2} y1={y + .5} x2={x + CW - 2} y2={y + .5} stroke={pal.specular} strokeWidth=".8" opacity=".3" />
      <line x1={x} y1={y + CH} x2={x + CW} y2={y + CH} stroke="black" strokeWidth="1" opacity=".5" />
      <rect x={x} y={y} width="1" height={CH} fill={pal.highlight} opacity=".1" />
      <rect x={x + CW - 1} y={y} width="1" height={CH} fill="black" opacity=".2" />
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} />
        <rect x={cx - half - coreSize} y={cy - coreSize} width={coreSize * 2} height={coreSize * 2}
          transform={`rotate(45 ${cx - half} ${cy})`} fill={failCore.base} />
        <Holder cx={cx + half} cy={cy} size={coreSize} />
        <rect x={cx + half - coreSize} y={cy - coreSize} width={coreSize * 2} height={coreSize * 2}
          transform={`rotate(45 ${cx + half} ${cy})`} fill={failCore.base} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} />
        <rect x={cx - coreSize} y={cy - coreSize} width={coreSize * 2} height={coreSize * 2}
          transform={`rotate(45 ${cx} ${cy})`} fill={failCore.base} />
      </>)}
    </g>
  );
}

// --- Crystal FailedBody ---
export function FailedBody({ x, y, height, type = "single", coreGap = 18, wireThickness = 5, lineThickness = 3 }) {
  const col = FAIL[type].bright;
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `fbody_${type}_${x}_${y}`;
  const isDouble = type === "double", cx = x + CW / 2, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={col} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={height} fill={`url(#${gradId})`} />
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + height} stroke="#333333" strokeWidth={lineThickness} opacity=".9" />
        </g>
      ))}
    </g>
  );
}

// --- Crystal PartialFailedNoteContainer ---
export function PartialFailedNoteContainer({ x, y, coreSize = 7, coreGap = 18, failedSide = "left" }) {
  const pal = P.double;
  const uid = `pfnc_${failedSide}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, half = coreGap / 2;
  const failCore = { base: FAIL.core.off, mid: FAIL.core.offBase, bright: FAIL.core.offMid, highlight: FAIL.core.offBright };
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} />
          <stop offset="40%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
      </defs>
      <rect x={x + 2} y={y + 2} width={CW} height={CH} fill="black" opacity=".4" />
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${uid}_g)`} />
      <line x1={x + 2} y1={y + .5} x2={x + CW - 2} y2={y + .5} stroke={pal.specular} strokeWidth=".8" opacity=".3" />
      <line x1={x} y1={y + CH} x2={x + CW} y2={y + CH} stroke="black" strokeWidth="1" opacity=".5" />
      <rect x={x} y={y} width="1" height={CH} fill={pal.highlight} opacity=".1" />
      <rect x={x + CW - 1} y={y} width="1" height={CH} fill="black" opacity=".2" />
      {/* Left core */}
      <Holder cx={cx - half} cy={cy} size={coreSize} />
      {failedSide === "left" ? (
        <rect x={cx - half - coreSize} y={cy - coreSize} width={coreSize * 2} height={coreSize * 2}
          transform={`rotate(45 ${cx - half} ${cy})`} fill={failCore.base} />
      ) : (
        <Core cx={cx - half} cy={cy} size={coreSize} filled glowing />
      )}
      {/* Right core */}
      <Holder cx={cx + half} cy={cy} size={coreSize} />
      {failedSide === "right" ? (
        <rect x={cx + half - coreSize} y={cy - coreSize} width={coreSize * 2} height={coreSize * 2}
          transform={`rotate(45 ${cx + half} ${cy})`} fill={failCore.base} />
      ) : (
        <Core cx={cx + half} cy={cy} size={coreSize} filled glowing />
      )}
    </g>
  );
}

// --- Crystal PartialFailedBody (Classic-style background + wire/lines) ---
export function PartialFailedBody({ x, y, height, coreGap = 18, wireThickness = 5, lineThickness = 3, failedSide = "left" }) {
  const col = P.double.highlight;
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `pfbody_${failedSide}_${x}_${y}`;
  const cx = x + CW / 2, half = coreGap / 2;
  const positions = [cx - half, cx + half];
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={col} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={height} fill={`url(#${gradId})`} />
      {positions.map((px, pi) => {
        const isFailed = (pi === 0 && failedSide === "left") || (pi === 1 && failedSide === "right");
        return (
          <g key={pi}>
            {!isFailed && <><defs>
              <linearGradient id={`pfglow_${failedSide}_${pi}_${x}_${y}`} x1="0" y1="0.5" x2="1" y2="0.5">
                <stop offset="0%" stopColor={P.core.bright} stopOpacity="0" />
                <stop offset="35%" stopColor={P.core.bright} stopOpacity=".25" />
                <stop offset="50%" stopColor={P.core.highlight} stopOpacity=".4" />
                <stop offset="65%" stopColor={P.core.bright} stopOpacity=".25" />
                <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={px - 18} y={y} width={36} height={height} fill={`url(#pfglow_${failedSide}_${pi}_${x}_${y})`} /></>}
            <Wire cx={px} y={y} height={height} thickness={wireThickness} held={!isFailed} />
            {isFailed ? (
              <line x1={px} y1={y} x2={px} y2={y + height}
                stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".9" />
            ) : (<>
              <line x1={px} y1={y} x2={px} y2={y + height}
                stroke={P.core.bright} strokeWidth={lineThickness} opacity=".95" />
            </>)}
          </g>
        );
      })}
    </g>
  );
}

// --- Crystal PartialFailedTerminalCap ---
export function PartialFailedTerminalCap({ x, y, coreSize = 7, coreGap = 18, failedSide = "left" }) {
  const baseCol = P.double.highlight;
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `pfterm_${failedSide}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, half = coreGap / 2;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${gradId})`} />
      {[cx - half, cx + half].map((px, pi) => {
        const isFailed = (pi === 0 && failedSide === "left") || (pi === 1 && failedSide === "right");
        return (
          <g key={pi}>
            <Wire cx={px} y={cy} height={y + CH - cy} thickness={5} />
            <line x1={px} y1={cy} x2={px} y2={y + CH}
              stroke={isFailed ? "#333333" : P.core.mid} strokeWidth={3} opacity=".5" />
          </g>
        );
      })}
    </g>
  );
}

// --- Crystal TrillNoteContainer (다이아몬드 모양, 흰색) ---
export function TrillNoteContainer({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={CW} height={CH} fill="black" opacity=".4" />
      <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="white" />
      <polygon points={`${cx},${y + 1} ${x + CW - 2},${cy} ${cx},${cy}`} fill="white" opacity=".3" />
    </g>
  );
}

// --- Crystal TrillBodySegment ---
export function TrillBodySegment({ x, y, height, held = false }) {
  const baseCol = held ? "#ffffff" : "#aaaaaa";
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `trill_body_${held ? "h" : "r"}_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={height} fill={`url(#${gradId})`} />
      {held && <rect x={x} y={y} width={CW} height={height} fill="white" opacity=".1" />}
    </g>
  );
}

// --- Crystal TrillTerminalCap ---
export function TrillTerminalCap({ x, y }) {
  const baseCol = "#aaaaaa";
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `trill_term_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${gradId})`} />
    </g>
  );
}

// --- Crystal FailedTrillNoteContainer ---
export function FailedTrillNoteContainer({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={CW} height={CH} fill="black" opacity=".4" />
      <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="#555555" />
    </g>
  );
}

// --- Crystal FailedTrillBody ---
export function FailedTrillBody({ x, y, height }) {
  const baseCol = "#555555";
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `trill_fbody_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={height} fill={`url(#${gradId})`} />
    </g>
  );
}

// --- Crystal FailedTrillTerminalCap ---
export function FailedTrillTerminalCap({ x, y }) {
  const baseCol = "#555555";
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `trill_fterm_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${gradId})`} />
    </g>
  );
}

// --- Crystal FailedTerminalCap ---
export function FailedTerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 18 }) {
  const baseCol = FAIL[type].bright;
  const r = parseInt(baseCol.slice(1, 3), 16);
  const g = parseInt(baseCol.slice(3, 5), 16);
  const b = parseInt(baseCol.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `fterm_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, isDouble = type === "double", half = coreGap / 2;
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor={`rgb(${lr},${lg},${lb})`} />
          <stop offset="50%" stopColor={baseCol} />
          <stop offset="100%" stopColor={`rgb(${lr},${lg},${lb})`} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={CW} height={CH} fill={`url(#${gradId})`} />
      {(isDouble ? [cx - half, cx + half] : [cx]).map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={cy} height={y + CH - cy} thickness={5} />
          <line x1={px} y1={cy} x2={px} y2={y + CH} stroke="#333333" strokeWidth={3} opacity=".5" />
        </g>
      ))}
    </g>
  );
}
