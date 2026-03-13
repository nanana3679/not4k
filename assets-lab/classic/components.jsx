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

/* ── 더미 (다른 스킨과 인터페이스 통일) ── */
export function Core() { return null; }
export function Holder() { return null; }
export function Wire() { return null; }

/* ── 버튼 (다이아몬드 스타, 레인별 색상) ── */
const BTN_COLORS = {
  idle:    { 1: "#662222", 2: "#663333", 3: "#223366", 4: "#222266" },
  pressed: { 1: "#ff4444", 2: "#ff6655", 3: "#5588ff", 4: "#4466ff" },
};

export function ButtonExport({ cx, cy, pressed, lane = 1 }) {
  const col = pressed ? (BTN_COLORS.pressed[lane] || "#ccccdd") : (BTN_COLORS.idle[lane] || "#888899");
  const S = 9.3, s = 2.6;
  const star = `M${cx},${cy-S} L${cx+s},${cy-s} L${cx+S},${cy} L${cx+s},${cy+s} L${cx},${cy+S} L${cx-s},${cy+s} L${cx-S},${cy} L${cx-s},${cy-s}Z`;
  return (
    <g>
      {/* 외곽 다이아몬드 (대각선 ~57px, 70px 캔버스 내) */}
      <rect x={cx-20} y={cy-20} width="40" height="40"
        transform={`rotate(45 ${cx} ${cy})`}
        fill={col} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      {/* 중앙 별 */}
      <path d={star} fill={pressed ? "#ffffff" : "rgba(255,255,255,0.6)"} strokeWidth="0.5" />
      {/* pressed 글로우 (대각선 ~65px, 70px 캔버스 내) */}
      {pressed && (
        <rect x={cx-23} y={cy-23} width="46" height="46"
          transform={`rotate(45 ${cx} ${cy})`}
          fill="none" stroke={col} strokeWidth="2" opacity=".5" />
      )}
    </g>
  );
}
