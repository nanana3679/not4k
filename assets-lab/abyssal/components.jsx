import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- Abyssal Core (circular with tentacle radiating lines) ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  if (!filled) return (
    <circle cx={cx} cy={cy} r={s} fill="none" stroke={P.core.offMid} strokeWidth="1.2" />
  );
  const lit = glowing && !dimmed;
  const c = lit ? P.core : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright, glow: "transparent" };
  // tentacle line angles
  const tentAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g>
      {lit && <circle cx={cx} cy={cy} r={s + 4} fill={c.glow} filter="url(#coreGlow)" />}
      {/* tentacle radiating lines */}
      {lit && tentAngles.map((ang, i) => {
        const r = ang * Math.PI / 180;
        const inner = s + 1, outer = s + 4 + (i % 2 === 0 ? 3 : 1.5);
        return <line key={i}
          x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner}
          x2={cx + Math.cos(r) * outer} y2={cy + Math.sin(r) * outer}
          stroke={P.core.highlight} strokeWidth="0.7" opacity="0.6"
        />;
      })}
      <defs>
        <radialGradient id={`core_rg_${cx}_${cy}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={c.highlight} />
          <stop offset="50%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.base} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={s} fill={`url(#core_rg_${cx}_${cy})`} />
      {lit && <>
        <circle cx={cx - s * 0.25} cy={cy - s * 0.3} r={s * 0.2} fill="white" opacity="0.45" />
        <circle cx={cx + s * 0.2} cy={cy - s * 0.15} r={s * 0.08} fill="white" opacity="0.6" />
      </>}
    </g>
  );
}

// --- Abyssal Holder (circular frame) ---
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  return (
    <g>
      <circle cx={cx} cy={cy} r={hs + 1.5} fill="none" stroke={P.holder.stroke} strokeWidth="2.5" opacity="0.5" />
      <circle cx={cx} cy={cy} r={hs} fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="1.5" />
    </g>
  );
}

// --- Abyssal Wire (translucent tentacle-like tube) ---
export function Wire({ cx, y, height, thickness = 6 }) {
  const uid = `wire_${cx}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={P.core.deep} stopOpacity="0.9" />
          <stop offset="35%" stopColor={P.core.base} stopOpacity="0.6" />
          <stop offset="65%" stopColor={P.core.base} stopOpacity="0.6" />
          <stop offset="100%" stopColor={P.core.deep} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x={cx - thickness / 2} y={y} width={thickness} height={height}
        fill={`url(#${uid})`} rx={thickness / 3} />
      {/* subtle highlight edge */}
      <line x1={cx - thickness / 2 + 1} y1={y + 2} x2={cx - thickness / 2 + 1} y2={y + height - 2}
        stroke={P.core.mid} strokeWidth="0.6" opacity="0.35" />
    </g>
  );
}

// --- Abyssal NoteContainer (capsule shape + concentric ellipse rings + tentacle lines) ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `nc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2;
  const isDouble = type === "double", half = coreGap / 2;
  const rx = CW / 2, ry = CH / 2;
  // capsule border-radius
  const capsuleRy = ry;
  const capsuleRx = ry; // same as height half → fully rounded ends
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} stopOpacity="0.9" />
          <stop offset="40%" stopColor={pal.mid} stopOpacity="0.85" />
          <stop offset="100%" stopColor={pal.deep} stopOpacity="0.95" />
        </linearGradient>
        <clipPath id={`${uid}_clip`}>
          <rect x={x} y={y} width={CW} height={CH} rx={capsuleRx} ry={capsuleRy} />
        </clipPath>
      </defs>
      {/* drop shadow */}
      <rect x={x + 2} y={y + 2} width={CW} height={CH} rx={capsuleRx} ry={capsuleRy} fill="black" opacity="0.35" />
      {/* main capsule body */}
      <rect x={x} y={y} width={CW} height={CH} rx={capsuleRx} ry={capsuleRy} fill={`url(#${uid}_g)`} />
      {/* concentric ellipse rings — bioluminescent glow */}
      <g clipPath={`url(#${uid}_clip)`}>
        <ellipse cx={cx} cy={cy} rx={rx * 0.85} ry={ry * 0.75} fill="none"
          stroke={pal.specular} strokeWidth="0.6" opacity="0.25" />
        <ellipse cx={cx} cy={cy} rx={rx * 0.62} ry={ry * 0.55} fill="none"
          stroke={pal.specular} strokeWidth="0.5" opacity="0.18" />
        <ellipse cx={cx} cy={cy} rx={rx * 0.38} ry={ry * 0.35} fill="none"
          stroke={P.core.bright} strokeWidth="0.5" opacity="0.2" />
        {/* vertical tentacle lines */}
        {[-30, -15, 0, 15, 30].map((dx, i) => (
          <line key={i}
            x1={cx + dx} y1={y + 2}
            x2={cx + dx} y2={y + CH - 2}
            stroke={P.core.mid} strokeWidth="0.4" opacity="0.15"
          />
        ))}
        {/* radial glow background */}
        <radialGradient id={`${uid}_radial`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={P.core.bright} stopOpacity="0.12" />
          <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
        </radialGradient>
        <rect x={x} y={y} width={CW} height={CH} rx={capsuleRx} ry={capsuleRy}
          fill={`url(#${uid}_radial)`} />
      </g>
      {/* specular top edge */}
      <line x1={x + capsuleRx} y1={y + 0.5} x2={x + CW - capsuleRx} y2={y + 0.5}
        stroke={pal.specular} strokeWidth="0.8" opacity="0.3" />
      {/* core(s) */}
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} />
        <Core cx={cx - half} cy={cy} size={coreSize} filled glowing dimmed={dimLeft} />
        <Holder cx={cx + half} cy={cy} size={coreSize} />
        <Core cx={cx + half} cy={cy} size={coreSize} filled glowing dimmed={dimRight} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} />
        <Core cx={cx} cy={cy} size={coreSize} filled glowing />
      </>)}
    </g>
  );
}

// --- Abyssal BodySegment ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type], isDouble = type === "double";
  const cx = x + CW / 2, bx = x + 8, bw = CW - 16, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const gw = lineThickness + 4 + glowIntensity;
  const uid = `bbg_${type}_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} />
          <stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={height} fill={`url(#${uid})`} opacity="0.85" />
      {held && <rect x={bx} y={y} width={bw} height={height} fill={P.core.glow} opacity="0.08" />}
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.bright} strokeWidth={lineThickness} opacity="0.95" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.glow} strokeWidth={gw} opacity="0.22" filter="url(#coreGlow)" />
          </>) : (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.9" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offMid} strokeWidth={lineThickness * 0.5} opacity="0.5" />
          </>)}
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + height} stroke={pal.base} strokeWidth="1" opacity="0.3" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + height} stroke="black" strokeWidth="1" opacity="0.25" />
    </g>
  );
}

// --- Abyssal TerminalCap ---
export function TerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 26, wireThickness = 6, lineThickness = 2 }) {
  const pal = P.body[type], isDouble = type === "double";
  const cx = x + CW / 2, cy = y + CH / 2;
  const bx = x + 8, bw = CW - 16, half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const uid = `tbg_${type}_${x}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} />
          <stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={CH} fill={`url(#${uid})`} opacity="0.85" />
      <line x1={bx} y1={y} x2={bx + bw} y2={y} stroke={pal.base} strokeWidth="1" opacity="0.5" />
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={CH} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + CH}
            stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.9" />
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + CH} stroke={pal.base} strokeWidth="1" opacity="0.3" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + CH} stroke="black" strokeWidth="1" opacity="0.25" />
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} />
        <Core cx={cx - half} cy={cy} size={coreSize} filled={false} />
        <Holder cx={cx + half} cy={cy} size={coreSize} />
        <Core cx={cx + half} cy={cy} size={coreSize} filled={false} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} />
        <Core cx={cx} cy={cy} size={coreSize} filled={false} />
      </>)}
    </g>
  );
}

// --- Abyssal LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held}
        coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize}
        coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize}
        coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- Abyssal BombFrame (water droplet shards + tentacle burst + slow underwater feel) ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity={f.glowOp} />
          <stop offset="20%" stopColor={P.core.highlight} stopOpacity={f.glowOp * 0.75} />
          <stop offset="50%" stopColor={P.core.bright} stopOpacity={f.glowOp * 0.4} />
          <stop offset="100%" stopColor={P.core.base} stopOpacity="0" />
        </radialGradient>
      </defs>
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}
      {/* ring */}
      {f.ringOp > 0 && <circle cx={cx} cy={cy} r={f.ringR} fill="none"
        stroke={P.core.highlight} strokeWidth={f.ringW} opacity={f.ringOp} />}
      {/* tentacle burst lines */}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r = ang * Math.PI / 180, inner = f.burstLen * 0.3;
        // slight wave offset for underwater organic feel
        const wobble = Math.sin(li * 1.3 + frame * 0.4) * 2;
        const mx = cx + Math.cos(r) * (inner + f.burstLen * 0.5) + wobble;
        const my = cy + Math.sin(r) * (inner + f.burstLen * 0.5) + wobble;
        return <path key={li}
          d={`M${cx + Math.cos(r) * inner},${cy + Math.sin(r) * inner} Q${mx},${my} ${cx + Math.cos(r) * f.burstLen},${cy + Math.sin(r) * f.burstLen}`}
          fill="none"
          stroke={P.core.highlight}
          strokeWidth={Math.max(0.3, f.burstOp * 2)}
          opacity={f.burstOp}
        />;
      })}
      {/* water droplet shards (circles instead of rotating rectangles) */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist;
        const sy = cy + sa.dy * f.shardDist;
        // ellipse to mimic droplet shape (taller than wide)
        const rx = f.shardSz * 0.45;
        const ry = f.shardSz * 0.7;
        // rotate to face away from center
        const dropAng = Math.atan2(sa.dy, sa.dx) * 180 / Math.PI + 90;
        return <ellipse key={si}
          cx={sx} cy={sy}
          rx={rx} ry={ry}
          transform={`rotate(${dropAng} ${sx} ${sy})`}
          fill={P.core.bright}
          opacity={f.shardOp}
        />;
      })}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}
