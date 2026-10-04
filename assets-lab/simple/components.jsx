/**
 * Simple skin — 에디터 NoteRenderer의 기본 노트 외형을 SVG로 재현
 * 각진 단색 포인트, 가로 그라데이션 바디, 반투명 끝 터미널
 */
import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// 롱노트 켜짐(홀드) 효과가 없는 스킨이다(RFD 0028). export.jsx가 켜짐 요소를 그리지 않아 켜짐 PNG를 만들지 않는다.
// src/game/skin/skins.ts의 Simple 테마 heldEffect: false와 맞춰야 한다.
export const HELD_EFFECT = false;

/* ── 노트 헤드 ── */
export function NoteContainer({ x, y, type = "single" }) {
  const col = type === "double" ? P.double.bright : P.single.bright;
  return (
    <rect x={x} y={y} width={CW} height={CH} fill={col} />
  );
}

/* ── 바디 세그먼트 ── */
function GradientBody({ x, y, height, color, id }) {
  const col = color;
  const gradId = `simple_body_${id}_${x}_${y}_${height}`;

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

export function BodySegment({ x, y, height, type = "single" }) {
  return <GradientBody x={x} y={y} height={height} color={type === "double" ? P.double.body : P.single.body} id={type} />;
}

/* ── 터미널 캡 ── */
export function TerminalCap({ x, y, type = "single" }) {
  return <g opacity={0.5}><BodySegment x={x} y={y} height={CH} type={type} /></g>;
}

/* 실패·부분 충족도 같은 단색 면을 사용한다. */
export function FailedNoteContainer({ x, y }) {
  return <rect x={x} y={y} width={CW} height={CH} fill="#555555" />;
}
export function FailedBody({ x, y, height }) {
  return <rect x={x} y={y} width={CW} height={height} fill="#555555" />;
}
export function FailedTerminalCap({ x, y }) {
  return <g opacity={0.5}><FailedBody x={x} y={y} height={CH} /></g>;
}
export function PartialFailedBody({ x, y, height, failedSide }) {
  return <g><BodySegment x={x} y={y} height={height} type="double" />
    <rect x={x + (failedSide === 'right' ? CW / 2 : 0)} y={y} width={CW / 2} height={height} fill="#555555" /></g>;
}
export function PartialFailedTerminalCap({ x, y, failedSide }) {
  return <g opacity={0.5}><PartialFailedBody x={x} y={y} height={CH} failedSide={failedSide} /></g>;
}
export function PartialFailedNoteContainer({ x, y, failedSide }) {
  return <g><NoteContainer x={x} y={y} type="double" />
    <rect x={x + (failedSide === 'right' ? CW / 2 : 0)} y={y} width={CW / 2} height={CH} fill="#555555" /></g>;
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

export function TrillBodySegment({ x, y, height }) {
  return <GradientBody x={x} y={y} height={height} color="#aaaaaa" id="trill" />;
}

/* 트릴 끝 터미널: 에디터와 같은 납작한 회색 마름모. 트릴 롱 끝은 터미널 이미지 전체를 그리므로 마름모 전체가 보인다. */
export function TrillTerminalCap({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="#888888" />
  );
}

export function FailedTrillNoteContainer({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="#555555" />
  );
}

export function FailedTrillBody({ x, y, height }) {
  return <GradientBody x={x} y={y} height={height} color="#555555" id="trill_failed" />;
}

export function FailedTrillTerminalCap({ x, y }) {
  const cx = x + CW / 2, cy = y + CH / 2;
  return (
    <polygon points={`${cx},${y} ${x + CW},${cy} ${cx},${y + CH} ${x},${cy}`} fill="#555555" />
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
