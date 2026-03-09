import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- Circuit Core ---
// 다이아몬드 shape + 바이너리 글리치 "01" 장식
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  if (!filled) return (
    <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill="none" stroke={P.core.offMid} strokeWidth="1" strokeDasharray="2 2" />
  );
  const lit = glowing && !dimmed;
  const c = lit
    ? P.core
    : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright };
  return (
    <g>
      {lit && (
        <rect x={cx - s - 4} y={cy - s - 4} width={(s + 4) * 2} height={(s + 4) * 2}
          transform={`rotate(45 ${cx} ${cy})`} fill={P.core.glow} filter="url(#coreGlow)" />
      )}
      {/* 다이아몬드 4분면 */}
      <polygon points={`${cx},${cy - s} ${cx - s},${cy} ${cx},${cy}`} fill={lit ? P.core.base : c.base} />
      <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy}`} fill={lit ? P.core.mid : c.mid} />
      <polygon points={`${cx - s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={lit ? P.core.bright : c.bright} />
      <polygon points={`${cx + s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={lit ? P.core.highlight : c.highlight} />
      {/* 내부 하이라이트 패싯 */}
      <polygon points={`${cx},${cy - s * .5} ${cx - s * .5},${cy} ${cx},${cy}`} fill={lit ? P.core.mid : c.mid} opacity="0.5" />
      <polygon points={`${cx},${cy - s * .5} ${cx + s * .5},${cy} ${cx},${cy}`} fill={lit ? P.core.bright : c.bright} opacity="0.4" />
      {/* 글리치 바이너리 텍스트 장식 */}
      {lit && (
        <>
          <text x={cx - s - 6} y={cy - 2} fontSize="3" fill={P.core.bright} opacity="0.7" fontFamily="monospace">1</text>
          <text x={cx + s + 2} y={cy + 3} fontSize="3" fill={P.core.bright} opacity="0.6" fontFamily="monospace">0</text>
          <text x={cx - 2} y={cy - s - 2} fontSize="3" fill={P.core.highlight} opacity="0.55" fontFamily="monospace">1</text>
          <text x={cx} y={cy + s + 5} fontSize="3" fill={P.core.highlight} opacity="0.5" fontFamily="monospace">0</text>
        </>
      )}
      {/* 코어 스펙큘러 하이라이트 */}
      {lit && (
        <polygon points={`${cx},${cy - s * .65} ${cx - s * .2},${cy - s * .2} ${cx + s * .15},${cy - s * .4}`} fill="white" opacity="0.4" />
      )}
    </g>
  );
}

// --- Circuit Holder ---
// PCB 비아 스타일: 얇은 사각 와이어프레임, stroke만, 코너 L-브래킷
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  const stroke = P.holder.stroke;
  // 코너 L-브래킷 크기
  const bl = Math.max(2, hs * 0.4);
  return (
    <g>
      {/* 외곽 사각 와이어프레임 */}
      <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
        fill="none" stroke={stroke} strokeWidth="1" opacity="0.5" />
      {/* 코너 L-브래킷 (4개 코너) */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => {
        const ox = cx + sx * hs, oy = cy + sy * hs;
        return (
          <g key={i}>
            <line x1={ox} y1={oy} x2={ox - sx * bl} y2={oy} stroke={stroke} strokeWidth="1.5" />
            <line x1={ox} y1={oy} x2={ox} y2={oy - sy * bl} stroke={stroke} strokeWidth="1.5" />
          </g>
        );
      })}
      {/* 비아 홀 중앙 점 */}
      <circle cx={cx} cy={cy} r={1.2} fill="none" stroke={stroke} strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

// --- Circuit Wire ---
// PCB 트레이스: 선명한 사각 채널, 비아 도트 포함
export function Wire({ cx, y, height, thickness = 6 }) {
  const hw = thickness / 2;
  // 비아 도트를 일정 간격으로 배치
  const viaSpacing = 16;
  const viaCount = Math.max(0, Math.floor(height / viaSpacing) - 1);
  const vias = Array.from({ length: viaCount }, (_, i) => y + viaSpacing * (i + 1));
  return (
    <g>
      {/* 트레이스 본체 */}
      <rect x={cx - hw} y={y} width={thickness} height={height} fill="#010801" stroke="#003300" strokeWidth=".6" />
      {/* 내부 하이라이트 선 */}
      <line x1={cx - hw + 1} y1={y + 1} x2={cx - hw + 1} y2={y + height - 1} stroke="#003a00" strokeWidth=".4" />
      <line x1={cx + hw - 1} y1={y + 1} x2={cx + hw - 1} y2={y + height - 1} stroke="#000d00" strokeWidth=".4" />
      {/* 비아 도트 */}
      {vias.map((vy, i) => (
        <circle key={i} cx={cx} cy={vy} r={1} fill="none" stroke={P.via} strokeWidth=".6" opacity=".4" />
      ))}
    </g>
  );
}

// --- Circuit NoteContainer ---
// 헥사고널/셰브론 shape (polygon), PCB 트레이스 라인, 비아 dots
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const isDouble = type === "double";
  const cx = x + CW / 2, cy = y + CH / 2;
  const half = coreGap / 2;
  const uid = `nc_${type}_${x}_${y}`;

  // 셰브론 육각형: 양끝 꺾인 모양
  const chev = CH / 2; // 셰브론 깊이
  const pts = [
    `${x + chev},${y}`,           // 좌상 (안쪽)
    `${x + CW - chev},${y}`,      // 우상 (안쪽)
    `${x + CW},${cy}`,            // 오른쪽 꼭짓점
    `${x + CW - chev},${y + CH}`, // 우하 (안쪽)
    `${x + chev},${y + CH}`,      // 좌하 (안쪽)
    `${x},${cy}`,                  // 왼쪽 꼭짓점
  ].join(" ");

  // PCB 솔더마스크 배경 그라디언트
  const holderStroke = isDouble ? P.holderDouble.stroke : P.holder.stroke;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.mid} />
          <stop offset="40%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
        <clipPath id={`${uid}_clip`}>
          <polygon points={pts} />
        </clipPath>
      </defs>

      {/* 그림자 */}
      <polygon points={pts} fill="black" opacity=".4" transform="translate(2,2)" />
      {/* 메인 헥사곤 body */}
      <polygon points={pts} fill={`url(#${uid}_g)`} />

      {/* 솔더마스크 오버레이 (녹색 틴트) */}
      <polygon points={pts} fill={pal.deep} opacity=".18" />

      {/* 상단 스펙큘러 하이라이트 */}
      <line x1={x + chev + 2} y1={y + 1} x2={x + CW - chev - 2} y2={y + 1}
        stroke={pal.specular} strokeWidth=".8" opacity=".3" />

      {/* PCB 트레이스: 가로 중앙선 */}
      <line x1={x + chev} y1={cy} x2={x + CW - chev} y2={cy}
        stroke={pal.bright} strokeWidth=".5" opacity=".25" clipPath={`url(#${uid}_clip)`} />

      {/* 비아 도트 (좌우 쪽) */}
      <circle cx={x + chev + 4} cy={cy} r={1.5} fill="none" stroke={P.via} strokeWidth=".7" opacity=".5" />
      <circle cx={x + CW - chev - 4} cy={cy} r={1.5} fill="none" stroke={P.via} strokeWidth=".7" opacity=".5" />

      {/* 외곽선 */}
      <polygon points={pts} fill="none" stroke={pal.bright} strokeWidth=".8" opacity=".6" />

      {/* Holder + Core */}
      {isDouble ? (
        <>
          <Holder cx={cx - half} cy={cy} size={coreSize} />
          <Core cx={cx - half} cy={cy} size={coreSize} filled glowing dimmed={dimLeft} />
          <Holder cx={cx + half} cy={cy} size={coreSize} />
          <Core cx={cx + half} cy={cy} size={coreSize} filled glowing dimmed={dimRight} />
        </>
      ) : (
        <>
          <Holder cx={cx} cy={cy} size={coreSize} />
          <Core cx={cx} cy={cy} size={coreSize} filled glowing />
        </>
      )}
    </g>
  );
}

// --- Circuit BodySegment ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const gw = lineThickness + 4 + glowIntensity;
  const lineColor = type === "double" ? P.double.bright : P.single.bright;
  const glowColor = type === "double" ? P.double.highlight : P.single.highlight;

  return (
    <g>
      <defs>
        <linearGradient id={`bbg_${type}_${x}_${y}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} />
          <stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={height} fill={`url(#bbg_${type}_${x}_${y})`} />
      {held && <rect x={bx} y={y} width={bw} height={height} fill={P.core.glow} opacity=".05" />}

      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (
            <>
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={lineColor} strokeWidth={lineThickness} opacity=".95" />
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={glowColor} strokeWidth={gw} opacity=".18" filter="url(#coreGlow)" />
            </>
          ) : (
            <>
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".9" />
              <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.offMid} strokeWidth={lineThickness * .5} opacity=".5" />
            </>
          )}
        </g>
      ))}

      {/* 좌우 엣지 라인 */}
      <line x1={bx} y1={y} x2={bx} y2={y + height} stroke={pal.base} strokeWidth="1" opacity=".35" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + height} stroke="black" strokeWidth="1" opacity=".3" />
    </g>
  );
}

// --- Circuit TerminalCap ---
export function TerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 26, wireThickness = 6, lineThickness = 2 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2, cy = y + CH / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];

  return (
    <g>
      <defs>
        <linearGradient id={`tbg_${type}_${x}_${y}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={pal.edge} />
          <stop offset="25%" stopColor={pal.base} />
          <stop offset="75%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
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

      {isDouble ? (
        <>
          <Holder cx={cx - half} cy={cy} size={coreSize} />
          <Core cx={cx - half} cy={cy} size={coreSize} filled={false} />
          <Holder cx={cx + half} cy={cy} size={coreSize} />
          <Core cx={cx + half} cy={cy} size={coreSize} filled={false} />
        </>
      ) : (
        <>
          <Holder cx={cx} cy={cy} size={coreSize} />
          <Core cx={cx} cy={cy} size={coreSize} filled={false} />
        </>
      )}
    </g>
  );
}

// --- Circuit LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize} coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- Circuit ButtonExport ---
export function ButtonExport({ cx, cy, pressed }) {
  const btnColor = pressed ? P.accent : P.single.mid;
  return (
    <g>
      {/* Glitch flicker -- offset outline copy when pressed */}
      {pressed && (
        <rect x={cx - 18 + 1.5} y={cy - 18 - 1} width={36} height={36}
          fill="none" stroke="#00ff41" strokeWidth="1" opacity=".35" />
      )}
      {/* Square wireframe button */}
      <rect x={cx - 18} y={cy - 18} width={36} height={36}
        fill={pressed ? "#001800" : "#020902"} stroke={btnColor} strokeWidth="1.5" />
      {/* IC pin/leg lines -- top */}
      {[-8, 0, 8].map((off, pi) => (
        <line key={`tp${pi}`} x1={cx + off} y1={cy - 18} x2={cx + off} y2={cy - 21}
          stroke={btnColor} strokeWidth=".8" opacity=".5" />
      ))}
      {/* Bottom pins */}
      {[-8, 0, 8].map((off, pi) => (
        <line key={`bp${pi}`} x1={cx + off} y1={cy + 18} x2={cx + off} y2={cy + 21}
          stroke={btnColor} strokeWidth=".8" opacity=".5" />
      ))}
      {/* Left pins */}
      {[-8, 0, 8].map((off, pi) => (
        <line key={`lp${pi}`} x1={cx - 18} y1={cy + off} x2={cx - 21} y2={cy + off}
          stroke={btnColor} strokeWidth=".8" opacity=".5" />
      ))}
      {/* Right pins */}
      {[-8, 0, 8].map((off, pi) => (
        <line key={`rp${pi}`} x1={cx + 18} y1={cy + off} x2={cx + 21} y2={cy + off}
          stroke={btnColor} strokeWidth=".8" opacity=".5" />
      ))}
      {/* Corner brackets */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],ci) => (
        <g key={ci}>
          <line x1={cx + sx*18} y1={cy + sy*18} x2={cx + sx*18 - sx*6} y2={cy + sy*18} stroke={P.accent} strokeWidth="1.5" opacity={pressed ? 1 : 0.4} />
          <line x1={cx + sx*18} y1={cy + sy*18} x2={cx + sx*18} y2={cy + sy*18 - sy*6} stroke={P.accent} strokeWidth="1.5" opacity={pressed ? 1 : 0.4} />
        </g>
      ))}
      {/* Inner diamond */}
      <rect x={cx - 8} y={cy - 8} width={16} height={16}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={pressed ? P.single.base : "none"} stroke={btnColor} strokeWidth="1" opacity=".8" />
      {pressed && (
        <rect x={cx - 5} y={cy - 5} width={10} height={10}
          transform={`rotate(45 ${cx} ${cy})`}
          fill={P.accent} opacity=".3" />
      )}
      {/* Binary "01" text */}
      <text x={cx - 8} y={cy + 16} fontSize="5" fill={btnColor} opacity=".2"
        fontFamily="'JetBrains Mono', monospace">01</text>
    </g>
  );
}

// --- Circuit BombFrame ---
// 글리치 폭발: RGB 색분리(오프셋 3벌), 픽셀 파편(회전 없는 사각형)
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;

  // RGB 색분리 오프셋
  const rgbOffsets = [
    { dx: -2, dy: -1, color: "#ff0033", opacity: 0.6 },
    { dx:  2, dy:  1, color: "#00ff88", opacity: 0.6 },
    { dx:  0, dy: -2, color: "#00e5ff", opacity: 0.5 },
  ];

  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#fff" stopOpacity={f.glowOp} />
          <stop offset="15%" stopColor="#00ffcc" stopOpacity={f.glowOp * .75} />
          <stop offset="40%" stopColor={P.core.bright} stopOpacity={f.glowOp * .4} />
          <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* RGB 색분리: 버스트 라인을 3색으로 오프셋 렌더 */}
      {f.burstLen > 0 && rgbOffsets.map((rgb, ri) => (
        <g key={ri} transform={`translate(${rgb.dx}, ${rgb.dy})`} opacity={rgb.opacity * f.burstOp}>
          {BURST_ANGS.map((ang, li) => {
            const r = ang * Math.PI / 180;
            const inner = f.burstLen * .3;
            return (
              <line key={li}
                x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner}
                x2={cx + Math.cos(r) * f.burstLen} y2={cy + Math.sin(r) * f.burstLen}
                stroke={rgb.color} strokeWidth={Math.max(.3, f.burstOp * 2)} />
            );
          })}
        </g>
      ))}

      {/* 메인 글로우 */}
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}

      {/* 링 (글리치 스타일: 대시) */}
      {f.ringOp > 0 && (
        <circle cx={cx} cy={cy} r={f.ringR} fill="none"
          stroke={P.core.bright} strokeWidth={f.ringW}
          strokeDasharray="3 2" opacity={f.ringOp} />
      )}

      {/* 픽셀 파편: 회전 없는 사각형 + RGB 색분리 */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist;
        const sy = cy + sa.dy * f.shardDist;
        const shardColor = [P.single.highlight, P.double.highlight, P.core.bright, P.single.bright, P.double.bright, P.core.highlight][si % 6];
        return (
          <g key={si}>
            {/* RGB 오프셋 픽셀 파편 */}
            <rect x={sx - f.shardSz / 2 - 1.5} y={sy - f.shardSz / 2 - 1}
              width={f.shardSz} height={f.shardSz}
              fill="#ff0033" opacity={f.shardOp * .5} />
            <rect x={sx - f.shardSz / 2 + 1.5} y={sy - f.shardSz / 2 + 1}
              width={f.shardSz} height={f.shardSz}
              fill="#00e5ff" opacity={f.shardOp * .5} />
            {/* 메인 픽셀 파편 (회전 없음) */}
            <rect x={sx - f.shardSz / 2} y={sy - f.shardSz / 2}
              width={f.shardSz} height={f.shardSz}
              fill={shardColor} opacity={f.shardOp} />
          </g>
        );
      })}

      {/* 코어 */}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}
