import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

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
      {lit && <rect x={cx - s - 3} y={cy - s - 3} width={(s + 3) * 2} height={(s + 3) * 2}
        transform={`rotate(45 ${cx} ${cy})`} fill={P.core.glow} filter="url(#coreGlow)" />}
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
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  return (
    <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="2" />
  );
}

// --- Crystal Wire ---
export function Wire({ cx, y, height, thickness = 6 }) {
  return (
    <g>
      <rect x={cx - thickness / 2} y={y} width={thickness} height={height} fill="#0a0a0a" stroke="#080808" strokeWidth=".8" />
      <line x1={cx - thickness / 2 + .8} y1={y + 1} x2={cx - thickness / 2 + .8} y2={y + height - 1} stroke="#1a1a1a" strokeWidth=".5" />
      <line x1={cx + thickness / 2 - .8} y1={y + 1} x2={cx + thickness / 2 - .8} y2={y + height - 1} stroke="#050505" strokeWidth=".5" />
    </g>
  );
}

// --- Crystal NoteContainer ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
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
        <Holder cx={cx - half} cy={cy} size={coreSize} /><Core cx={cx - half} cy={cy} size={coreSize} filled glowing dimmed={dimLeft} />
        <Holder cx={cx + half} cy={cy} size={coreSize} /><Core cx={cx + half} cy={cy} size={coreSize} filled glowing dimmed={dimRight} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} /><Core cx={cx} cy={cy} size={coreSize} filled glowing />
      </>)}
    </g>
  );
}

// --- Crystal BodySegment ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type], isDouble = type === "double", cx = x + CW / 2, bx = x + 8, bw = CW - 16, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx], gw = lineThickness + 4 + glowIntensity;
  return (
    <g>
      <defs>
        <linearGradient id={`bbg_${type}_${x}_${y}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} /><stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} /><stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={height} fill={`url(#bbg_${type}_${x}_${y})`} />
      {held && <rect x={bx} y={y} width={bw} height={height} fill={P.core.glow} opacity=".06" />}
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.bright} strokeWidth={lineThickness} opacity=".95" />
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.glow} strokeWidth={gw} opacity=".2" filter="url(#coreGlow)" />
          </>) : (<>
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".9" />
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.offMid} strokeWidth={lineThickness * .5} opacity=".5" />
          </>)}
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + height} stroke={pal.base} strokeWidth="1" opacity=".35" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + height} stroke="black" strokeWidth="1" opacity=".3" />
    </g>
  );
}

// --- Crystal TerminalCap ---
export function TerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 26, wireThickness = 6, lineThickness = 2 }) {
  const pal = P.body[type], isDouble = type === "double", cx = x + CW / 2, cy = y + CH / 2;
  const bx = x + 8, bw = CW - 16, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  return (
    <g>
      <defs>
        <linearGradient id={`tbg_${type}_${x}_${y}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} /><stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} /><stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={CH} fill={`url(#tbg_${type}_${x}_${y})`} />
      <line x1={bx} y1={y} x2={bx + bw} y2={y} stroke={pal.base} strokeWidth="1" opacity=".5" />
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={CH} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + CH} stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".9" />
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + CH} stroke={pal.base} strokeWidth="1" opacity=".35" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + CH} stroke="black" strokeWidth="1" opacity=".3" />
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} /><Core cx={cx - half} cy={cy} size={coreSize} filled={false} />
        <Holder cx={cx + half} cy={cy} size={coreSize} /><Core cx={cx + half} cy={cy} size={coreSize} filled={false} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} /><Core cx={cx} cy={cy} size={coreSize} filled={false} />
      </>)}
    </g>
  );
}

// --- Crystal LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize} coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
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

// --- Crystal BombFrame ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#fff" stopOpacity={f.glowOp} />
          <stop offset="18%" stopColor="#ffc0d4" stopOpacity={f.glowOp * .7} />
          <stop offset="45%" stopColor={P.core.bright} stopOpacity={f.glowOp * .35} />
          <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
        </radialGradient>
      </defs>
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}
      {f.ringOp > 0 && <circle cx={cx} cy={cy} r={f.ringR} fill="none" stroke={P.core.highlight} strokeWidth={f.ringW} opacity={f.ringOp} />}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r = ang * Math.PI / 180, inner = f.burstLen * .3;
        return <line key={li} x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner} x2={cx + Math.cos(r) * f.burstLen} y2={cy + Math.sin(r) * f.burstLen} stroke={P.core.highlight} strokeWidth={Math.max(.3, f.burstOp * 2.5)} opacity={f.burstOp} />;
      })}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist, sy = cy + sa.dy * f.shardDist, rot = sa.rot + frame * 12;
        return <rect key={si} x={sx - f.shardSz / 2} y={sy - f.shardSz / 2} width={f.shardSz} height={f.shardSz} transform={`rotate(${rot} ${sx} ${sy})`} fill={P.core.highlight} opacity={f.shardOp} />;
      })}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}
