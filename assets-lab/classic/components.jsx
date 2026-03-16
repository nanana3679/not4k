/**
 * Classic skin — 원본 Graphics 렌더링을 SVG로 재현
 * 단색 직사각형 노트, 그래디언트 바디, 심플 원형 버튼
 */
import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

/* ── 노트 헤드 ── */
export function NoteContainer({ x, y, type = "single" }) {
  const col = type === "double" ? P.double.bright : P.single.bright;
  return (
    <rect x={x} y={y} width={CW} height={CH} fill={col} rx={2} />
  );
}

/* ── 바디 세그먼트 ── */
export function BodySegment({ x, y, height, type = "single", held = false }) {
  const baseCol = type === "double" ? P.double.body : P.single.body;
  const col = held ? (type === "double" ? P.double.bright : P.single.bright) : baseCol;
  const gradId = `classic_body_${type}_${held ? "h" : "r"}_${x}_${y}`;

  // 원본과 동일한 좌우 밝은 그래디언트
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);

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
    </g>
  );
}

/* ── 터미널 캡 ── */
export function TerminalCap({ x, y, type = "single" }) {
  const col = type === "double" ? P.double.body : P.single.body;
  return (
    <rect x={x} y={y} width={CW} height={CH} fill={col} opacity={0.7} rx={2} />
  );
}

/* ── 롱노트 조립 ── */
export function LongNote({ x, y, bodyH = 80, type = "single", held = false }) {
  return (
    <g>
      <BodySegment x={x} y={y} height={bodyH} type={type} held={held} />
      <TerminalCap x={x} y={y} type={type} />
      <NoteContainer x={x} y={y + bodyH - CH} type={type} />
    </g>
  );
}

/* ── 봄 프레임 ── */
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const col = P.single.bright;

  return (
    <g>
      {/* Core */}
      {f.coreR > 0 && (
        <circle cx={cx} cy={cy} r={f.coreR} fill="#ffffff" opacity={f.coreOp} />
      )}
      {/* Glow */}
      {f.glowR > 0 && (
        <circle cx={cx} cy={cy} r={f.glowR} fill={col} opacity={f.glowOp * 0.3} />
      )}
      {/* Ring */}
      {f.ringR > 0 && (
        <circle cx={cx} cy={cy} r={f.ringR} fill="none" stroke={col} strokeWidth={f.ringW} opacity={f.ringOp} />
      )}
      {/* Burst lines */}
      {f.burstLen > 0 && BURST_ANGS.map((a, i) => {
        const rad = (a * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * f.coreR;
        const y1 = cy + Math.sin(rad) * f.coreR;
        const x2 = cx + Math.cos(rad) * (f.coreR + f.burstLen);
        const y2 = cy + Math.sin(rad) * (f.coreR + f.burstLen);
        return <line key={`b${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="1.5" opacity={f.burstOp} />;
      })}
      {/* Shards */}
      {f.shardSz > 0 && SHARD_DIRS.map((dir, i) => {
        const sx = cx + dir[0] * f.shardDist;
        const sy = cy + dir[1] * f.shardDist;
        const half = f.shardSz / 2;
        return <rect key={`s${i}`} x={sx - half} y={sy - half} width={f.shardSz} height={f.shardSz}
          transform={`rotate(45 ${sx} ${sy})`} fill={col} opacity={f.shardOp} />;
      })}
    </g>
  );
}

/* ── 트릴 노트 (다이아몬드 모양, 흰색) ── */
export function TrillNoteContainer({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="white" />
  );
}

export function TrillBodySegment({ x, y, height, held = false }) {
  const col = held ? "#ffffff" : "#aaaaaa";
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `classic_trill_body_${held ? "h" : "r"}_${x}_${y}`;
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
    </g>
  );
}

export function TrillTerminalCap({ x, y }) {
  return (
    <rect x={x} y={y} width={CW} height={CH} fill="#aaaaaa" opacity={0.7} rx={2} />
  );
}

export function FailedTrillNoteContainer({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="#555555" />
  );
}

export function FailedTrillBody({ x, y, height }) {
  const col = "#555555";
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.7);
  const lg = Math.round(g + (255 - g) * 0.7);
  const lb = Math.round(b + (255 - b) * 0.7);
  const gradId = `classic_trill_fbody_${x}_${y}`;
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
    </g>
  );
}

export function FailedTrillTerminalCap({ x, y }) {
  return (
    <rect x={x} y={y} width={CW} height={CH} fill="#555555" opacity={0.7} rx={2} />
  );
}

/* ── 더미 (다른 스킨과 인터페이스 통일) ── */
export function Core() { return null; }
export function Holder() { return null; }
export function Wire() { return null; }

/* ── 버튼 ── */
export function ButtonExport({ cx, cy, pressed }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={22} fill={pressed ? "#555566" : "#333355"} stroke="#444466" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={16} fill={pressed ? "#6666aa" : "#444477"} stroke={pressed ? "#8888cc" : "#555588"} strokeWidth="1" />
      {pressed && (
        <circle cx={cx} cy={cy} r={18} fill="none" stroke={P.single.bright} strokeWidth="2" opacity=".4" />
      )}
    </g>
  );
}
