import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- Fossil Core: 태양 디스크 (원 + 8개 삼각형 광선) ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  if (!filled) {
    // 비어있는 상태: 외곽 사각 석재 프레임
    return (
      <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2}
        fill="none" stroke={P.core.offMid} strokeWidth="1.5" />
    );
  }
  const lit = glowing && !dimmed;
  const c = lit
    ? P.core
    : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright, specular: P.core.offBright };

  // 8개 삼각형 광선 (45도 간격), 원에서 밖으로 뻗어나감
  const rays = Array.from({ length: 8 }, (_, i) => {
    const ang = (i * 45 * Math.PI) / 180;
    const angL = ang - 0.22;
    const angR = ang + 0.22;
    const r0 = s * 0.75; // 광선 시작 반지름 (원 가장자리)
    const r1 = s * 1.85; // 광선 끝 반지름
    const x0 = cx + Math.cos(ang) * r0;
    const y0 = cy + Math.sin(ang) * r0;
    const x1 = cx + Math.cos(angL) * r1;
    const y1 = cy + Math.sin(angL) * r1;
    const x2 = cx + Math.cos(angR) * r1;
    const y2 = cy + Math.sin(angR) * r1;
    return `${x0},${y0} ${x1},${y1} ${x2},${y2}`;
  });

  return (
    <g>
      {lit && (
        <circle cx={cx} cy={cy} r={s * 2.2}
          fill={P.core.glow} filter="url(#coreGlow)" opacity="0.7" />
      )}
      {/* 광선 삼각형들 */}
      {rays.map((pts, i) => (
        <polygon key={i} points={pts}
          fill={lit ? (i % 2 === 0 ? c.bright : c.mid) : c.highlight}
          opacity={lit ? 0.85 : 0.5} />
      ))}
      {/* 중앙 원 디스크 */}
      <circle cx={cx} cy={cy} r={s * 0.75}
        fill={lit ? c.highlight : c.mid} />
      {/* 중앙 원 내부 링 */}
      <circle cx={cx} cy={cy} r={s * 0.45}
        fill={lit ? c.specular : c.bright} opacity="0.8" />
      {lit && (
        <circle cx={cx - s * 0.2} cy={cy - s * 0.2} r={s * 0.15}
          fill="white" opacity="0.6" />
      )}
    </g>
  );
}

// --- Fossil Holder: 사각 석재 프레임 (축 정렬, 두꺼운 테두리) ---
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  return (
    <g>
      {/* 외곽 두꺼운 석재 테두리 */}
      <rect x={cx - hs - 2} y={cy - hs - 2} width={(hs + 2) * 2} height={(hs + 2) * 2}
        fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="2" />
      {/* 내부 음각 라인 */}
      <rect x={cx - hs + 1} y={cy - hs + 1} width={(hs - 1) * 2} height={(hs - 1) * 2}
        fill="none" stroke={P.core.offMid} strokeWidth="0.7" opacity="0.5" />
    </g>
  );
}

// --- Fossil Wire: 블록 석재 기둥 (두꺼운 직사각형 + 수평 홈 라인) ---
export function Wire({ cx, y, height, thickness = 6 }) {
  const x = cx - thickness / 2;
  // 수평 홈 라인 간격
  const notchSpacing = 6;
  const notchCount = Math.floor(height / notchSpacing);
  return (
    <g>
      {/* 기둥 본체 */}
      <rect x={x} y={y} width={thickness} height={height}
        fill="#2a1c08" stroke="#1a1000" strokeWidth="0.8" />
      {/* 왼쪽 하이라이트 엣지 */}
      <rect x={x} y={y} width="1.2" height={height} fill="#4a3018" opacity="0.5" />
      {/* 오른쪽 어두운 엣지 */}
      <rect x={x + thickness - 1} y={y} width="1" height={height} fill="#0a0800" opacity="0.6" />
      {/* 수평 퇴적층 홈 라인 */}
      {Array.from({ length: notchCount }, (_, i) => {
        const ly = y + (i + 1) * notchSpacing;
        return <line key={i} x1={x + 1} y1={ly} x2={x + thickness - 1} y2={ly}
          stroke="#1a1000" strokeWidth="0.5" opacity="0.6" />;
      })}
    </g>
  );
}

// --- Fossil NoteContainer: 계단형 테두리 + 동심 직사각형 3겹 + 메안더 삼각형 띠 ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `fnc_${type}_${Math.round(x)}_${Math.round(y)}`;
  const cx = x + CW / 2, cy = y + CH / 2;
  const isDouble = type === "double";
  const half = coreGap / 2;

  // 계단형 (stepped) 외곽 폴리곤: 4모서리에 노치가 있는 계단형 윤곽
  const s = 3; // 계단 크기
  const L = x, R = x + CW, T = y, B = y + CH;
  const steppedPoints = [
    `${L + s},${T}`, `${R - s},${T}`,
    `${R - s},${T + s}`, `${R},${T + s}`,
    `${R},${B - s}`, `${R - s},${B - s}`,
    `${R - s},${B}`, `${L + s},${B}`,
    `${L + s},${B - s}`, `${L},${B - s}`,
    `${L},${T + s}`, `${L + s},${T + s}`,
  ].join(" ");

  // 메안더 삼각형 패턴 (상단, 하단 엣지 따라 반복 삼각형)
  const triSize = 3;
  const triSpacing = 6;
  const triCountTop = Math.floor((CW - 16) / triSpacing);
  const triStartX = x + 8;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={pal.bright} />
          <stop offset="40%"  stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
      </defs>

      {/* 그림자 */}
      <polygon points={[
        `${L + s + 2},${T + 2}`, `${R - s + 2},${T + 2}`,
        `${R - s + 2},${T + s + 2}`, `${R + 2},${T + s + 2}`,
        `${R + 2},${B - s + 2}`, `${R - s + 2},${B - s + 2}`,
        `${R - s + 2},${B + 2}`, `${L + s + 2},${B + 2}`,
        `${L + s + 2},${B - s + 2}`, `${L + 2},${B - s + 2}`,
        `${L + 2},${T + s + 2}`, `${L + s + 2},${T + s + 2}`,
      ].join(" ")} fill="black" opacity="0.4" />

      {/* 계단형 본체 */}
      <polygon points={steppedPoints} fill={`url(#${uid}_g)`} />

      {/* 동심 직사각형 3겹 내부 장식 */}
      <rect x={x + 4} y={y + 3} width={CW - 8} height={CH - 6}
        fill="none" stroke={pal.highlight} strokeWidth="0.6" opacity="0.3" />
      <rect x={x + 7} y={y + 5} width={CW - 14} height={CH - 10}
        fill="none" stroke={pal.mid} strokeWidth="0.5" opacity="0.25" />
      <rect x={x + 10} y={y + 7} width={CW - 20} height={CH - 14}
        fill="none" stroke={pal.base} strokeWidth="0.4" opacity="0.2" />

      {/* 상단 퇴적층 스페큘러 라인 */}
      <line x1={x + s + 2} y1={y + 1} x2={x + CW - s - 2} y2={y + 1}
        stroke={pal.specular} strokeWidth="0.7" opacity="0.3" />

      {/* 메안더 삼각형 띠 — 상단 */}
      {Array.from({ length: triCountTop }, (_, i) => {
        const tx = triStartX + i * triSpacing + triSpacing / 2;
        const ty = y + 2;
        // 위아래 교대 삼각형
        if (i % 2 === 0) {
          return <polygon key={`t${i}`}
            points={`${tx},${ty} ${tx - triSize},${ty + triSize} ${tx + triSize},${ty + triSize}`}
            fill={pal.highlight} opacity="0.25" />;
        } else {
          return <polygon key={`t${i}`}
            points={`${tx},${ty + triSize} ${tx - triSize},${ty} ${tx + triSize},${ty}`}
            fill={pal.mid} opacity="0.2" />;
        }
      })}

      {/* 메안더 삼각형 띠 — 하단 */}
      {Array.from({ length: triCountTop }, (_, i) => {
        const tx = triStartX + i * triSpacing + triSpacing / 2;
        const ty = y + CH - 2;
        if (i % 2 === 0) {
          return <polygon key={`b${i}`}
            points={`${tx},${ty} ${tx - triSize},${ty - triSize} ${tx + triSize},${ty - triSize}`}
            fill={pal.highlight} opacity="0.2" />;
        } else {
          return <polygon key={`b${i}`}
            points={`${tx},${ty - triSize} ${tx - triSize},${ty} ${tx + triSize},${ty}`}
            fill={pal.mid} opacity="0.18" />;
        }
      })}

      {/* 하단 어두운 엣지 */}
      <line x1={x} y1={y + CH} x2={x + CW} y2={y + CH}
        stroke="black" strokeWidth="1" opacity="0.5" />

      {/* Core 및 Holder */}
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

// --- Fossil BodySegment: 퇴적층 바디 + 석재 기둥 ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const gw = lineThickness + 4 + glowIntensity;

  // 퇴적층 수평 라인 간격
  const layerSpacing = 8;
  const layerCount = Math.floor(height / layerSpacing);

  return (
    <g>
      <defs>
        <linearGradient id={`fbbg_${type}_${Math.round(x)}_${Math.round(y)}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={pal.edge} />
          <stop offset="25%"  stopColor={pal.base} />
          <stop offset="75%"  stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>

      {/* 바디 배경 */}
      <rect x={bx} y={y} width={bw} height={height}
        fill={`url(#fbbg_${type}_${Math.round(x)}_${Math.round(y)})`} />

      {/* held 오버레이 */}
      {held && <rect x={bx} y={y} width={bw} height={height}
        fill={P.core.glow} opacity="0.07" />}

      {/* 퇴적층 수평 라인 텍스처 */}
      {Array.from({ length: layerCount }, (_, i) => {
        const ly = y + (i + 1) * layerSpacing;
        return <line key={i} x1={bx + 1} y1={ly} x2={bx + bw - 1} y2={ly}
          stroke={pal.edge} strokeWidth="0.5" opacity="0.35" />;
      })}

      {/* 석재 기둥 + 코어 라인 */}
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.bright} strokeWidth={lineThickness} opacity="0.95" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.glow} strokeWidth={gw} opacity="0.2" filter="url(#coreGlow)" />
          </>) : (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.9" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offMid} strokeWidth={lineThickness * 0.5} opacity="0.5" />
          </>)}
        </g>
      ))}

      {/* 좌우 엣지 라인 */}
      <line x1={bx} y1={y} x2={bx} y2={y + height} stroke={pal.base} strokeWidth="1" opacity="0.35" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + height} stroke="black" strokeWidth="1" opacity="0.3" />
    </g>
  );
}

// --- Fossil TerminalCap: 바디 끝단 캡 ---
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
        <linearGradient id={`ftbg_${type}_${Math.round(x)}_${Math.round(y)}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={pal.edge} />
          <stop offset="25%"  stopColor={pal.base} />
          <stop offset="75%"  stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>

      <rect x={bx} y={y} width={bw} height={CH}
        fill={`url(#ftbg_${type}_${Math.round(x)}_${Math.round(y)})`} />

      {/* 상단 엣지 라인 */}
      <line x1={bx} y1={y} x2={bx + bw} y2={y}
        stroke={pal.base} strokeWidth="1" opacity="0.5" />

      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={CH} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + CH}
            stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.9" />
        </g>
      ))}

      <line x1={bx} y1={y} x2={bx} y2={y + CH} stroke={pal.base} strokeWidth="1" opacity="0.35" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + CH} stroke="black" strokeWidth="1" opacity="0.3" />

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

// --- Fossil LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize} coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- Fossil BombFrame: 돌 균열 + 석재 파편 + 먼지 구름 ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `fbomb_${id}_${frame}`;

  // 균열 선: 지그재그 패턴 (burstLen 기반), 12방향
  const crackSegs = BURST_ANGS.map((ang, li) => {
    if (f.burstLen <= 0) return null;
    const r = (ang * Math.PI) / 180;
    const inner = f.burstLen * 0.25;
    const mid = f.burstLen * 0.6;
    const outer = f.burstLen;
    // 지그재그: inner → mid(약간 편향) → outer
    const jitterAng = r + (li % 2 === 0 ? 0.15 : -0.15);
    const mx = cx + Math.cos(jitterAng) * mid;
    const my = cy + Math.sin(jitterAng) * mid;
    const x1 = cx + Math.cos(r) * inner;
    const y1 = cy + Math.sin(r) * inner;
    const x2 = cx + Math.cos(r) * outer;
    const y2 = cy + Math.sin(r) * outer;
    return (
      <polyline key={li}
        points={`${x1},${y1} ${mx},${my} ${x2},${y2}`}
        fill="none"
        stroke={P.core.bright}
        strokeWidth={Math.max(0.3, f.burstOp * 2)}
        opacity={f.burstOp}
        strokeLinecap="square" />
    );
  });

  // 석재 파편: 불규칙 다각형 (SHARD_DIRS 6방향)
  const stoneShards = SHARD_DIRS.map((sa, si) => {
    if (f.shardSz <= 0) return null;
    const sx = cx + sa.dx * f.shardDist;
    const sy = cy + sa.dy * f.shardDist;
    const sz = f.shardSz;
    const rot = sa.rot + frame * 8;
    // 불규칙 6각형 폴리곤 (돌 파편 모양)
    const angles = [0, 52, 105, 162, 220, 280];
    const radii  = [sz, sz * 0.7, sz * 1.1, sz * 0.6, sz * 0.9, sz * 0.75];
    const pts = angles.map((a, i) => {
      const ar = ((a + rot) * Math.PI) / 180;
      return `${sx + Math.cos(ar) * radii[i]},${sy + Math.sin(ar) * radii[i]}`;
    }).join(" ");
    return (
      <polygon key={si} points={pts}
        fill={P.core.mid} stroke={P.core.deep}
        strokeWidth="0.5" opacity={f.shardOp} />
    );
  });

  // 먼지 구름: 작은 원들이 여러 방향으로 퍼져 나감
  const dustCount = 14;
  const dustCircles = Array.from({ length: dustCount }, (_, di) => {
    if (f.glowR <= 0) return null;
    const dang = (di * (360 / dustCount) * Math.PI) / 180;
    const drad = f.glowR * (0.5 + (di % 3) * 0.2);
    const dx = cx + Math.cos(dang) * drad;
    const dy = cy + Math.sin(dang) * drad;
    const dr = Math.max(0.5, f.shardSz * 0.4 * (1 - di / dustCount * 0.5));
    const dop = f.glowOp * (0.3 + (dustCount - di) / dustCount * 0.4);
    return (
      <circle key={di} cx={dx} cy={dy} r={dr}
        fill="#c4986a" opacity={Math.min(1, dop)} />
    );
  });

  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%"   stopColor="#fff"       stopOpacity={f.glowOp} />
          <stop offset="18%"  stopColor={P.core.specular} stopOpacity={f.glowOp * 0.7} />
          <stop offset="45%"  stopColor={P.core.bright}   stopOpacity={f.glowOp * 0.35} />
          <stop offset="100%" stopColor={P.core.mid}      stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 먼지 구름 (배경 레이어) */}
      {dustCircles}

      {/* 방사형 글로우 */}
      {f.glowR > 0 && (
        <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />
      )}

      {/* 링 */}
      {f.ringOp > 0 && (
        <circle cx={cx} cy={cy} r={f.ringR}
          fill="none" stroke={P.core.highlight}
          strokeWidth={f.ringW} opacity={f.ringOp} />
      )}

      {/* 균열 지그재그 선 */}
      {crackSegs}

      {/* 석재 파편 */}
      {stoneShards}

      {/* 중앙 코어 */}
      {f.coreR > 0 && (
        <circle cx={cx} cy={cy} r={f.coreR}
          fill={P.core.specular} opacity={f.coreOp} />
      )}
    </g>
  );
}
