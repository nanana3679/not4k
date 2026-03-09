import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- 5잎 꽃 path 생성 헬퍼 ---
// 중심 (0,0) 기준, r=외부반경, ir=내부반경, n=잎수
function flowerPath(cx, cy, r, ir, n = 5) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    // 각 꽃잎의 중심 방향 각도 (위쪽에서 시작)
    const petalAng = (i / n) * Math.PI * 2 - Math.PI / 2;
    // 꽃잎 좌우 경계 각도
    const halfSpan = Math.PI / n;
    const leftAng = petalAng - halfSpan;
    const rightAng = petalAng + halfSpan;
    // inner 점 (꽃잎 사이)
    pts.push(`${cx + Math.cos(leftAng) * ir},${cy + Math.sin(leftAng) * ir}`);
    // petal tip (베지에 컨트롤 포인트로 볼록하게)
    const tipX = cx + Math.cos(petalAng) * r;
    const tipY = cy + Math.sin(petalAng) * r;
    const c1X = cx + Math.cos(petalAng - halfSpan * 0.5) * r * 0.9;
    const c1Y = cy + Math.sin(petalAng - halfSpan * 0.5) * r * 0.9;
    const c2X = cx + Math.cos(petalAng + halfSpan * 0.5) * r * 0.9;
    const c2Y = cy + Math.sin(petalAng + halfSpan * 0.5) * r * 0.9;
    pts.push(`C${c1X},${c1Y} ${tipX},${tipY} ${tipX},${tipY}`);
    pts.push(`C${tipX},${tipY} ${c2X},${c2Y} ${cx + Math.cos(rightAng) * ir},${cy + Math.sin(rightAng) * ir}`);
  }
  return `M${pts[0]} ${pts.slice(1).join(" ")} Z`;
}

// 단순화된 5잎 꽃 path (별 형태 기반, 꽃잎이 둥근 오각형)
function petalFlowerPath(cx, cy, r, ir = null) {
  const innerR = ir ?? r * 0.42;
  const n = 5;
  const points = [];
  for (let i = 0; i < n * 2; i++) {
    const ang = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innerR;
    points.push([cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius]);
  }
  // 꽃잎을 둥글게 — 각 outer 점에서 양쪽 inner를 향해 quadratic bezier
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n * 2; i++) {
    const next = points[(i + 1) % (n * 2)];
    if (i % 2 === 0) {
      // outer -> inner: 직선
      d += ` L${next[0]},${next[1]}`;
    } else {
      // inner -> outer: quadratic bezier (꽃잎 볼록)
      const nextNext = points[(i + 2) % (n * 2)];
      const midX = (points[i][0] + nextNext[0]) / 2;
      const midY = (points[i][1] + nextNext[1]) / 2;
      const ang = Math.atan2(midY - cy, midX - cx);
      const ctrlR = r * 1.1;
      d += ` Q${cx + Math.cos(ang) * ctrlR},${cy + Math.sin(ang) * ctrlR} ${nextNext[0]},${nextNext[1]}`;
      i++; // outer 점까지 소비했으므로 skip
    }
  }
  return d + " Z";
}

// --- SAKURA Core — 5잎 꽃 형태 ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  const flowerD = petalFlowerPath(cx, cy, s, s * 0.4);

  if (!filled) return (
    <path d={flowerD} fill="none" stroke={P.core.offMid} strokeWidth="1.2" />
  );

  const lit = glowing && !dimmed;
  const c = lit
    ? P.core
    : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright };

  return (
    <g>
      {lit && (
        <circle cx={cx} cy={cy} r={s + 4}
          fill={P.core.glow} filter="url(#coreGlow)" opacity="0.7" />
      )}
      <path d={flowerD} fill={lit ? P.core.mid : c.mid} />
      {/* 꽃잎 상단부 밝은 그라데이션 효과 */}
      <path d={petalFlowerPath(cx, cy - s * 0.15, s * 0.7, s * 0.28)}
        fill={lit ? P.core.bright : c.bright} opacity="0.6" />
      {lit && <>
        {/* 중앙 하이라이트 */}
        <circle cx={cx} cy={cy} r={s * 0.22} fill={P.core.highlight} opacity="0.8" />
        {/* 상단 광택 */}
        <ellipse cx={cx - s * 0.15} cy={cy - s * 0.3} rx={s * 0.18} ry={s * 0.12}
          fill="white" opacity="0.5" transform={`rotate(-20 ${cx - s * 0.15} ${cy - s * 0.3})`} />
      </>}
      {!lit && (
        <circle cx={cx} cy={cy} r={s * 0.2} fill={c.highlight} opacity="0.4" />
      )}
    </g>
  );
}

// --- SAKURA Holder — 엔소(禅) 원 ---
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const r = size + pad;
  // 약간 불완전한 원: stroke-dasharray로 붓터치 느낌 연출
  // 원 둘레 ≈ 2πr
  const circ = Math.PI * 2 * r;
  // 대부분 그리고 살짝 끊어짐 (95% 그림)
  const dash = circ * 0.93;
  const gap = circ * 0.07;
  // 회전으로 끊김 위치를 오른쪽 상단으로
  return (
    <circle
      cx={cx} cy={cy} r={r}
      fill={P.holder.fill}
      stroke={P.holder.stroke}
      strokeWidth="2.2"
      strokeDasharray={`${dash} ${gap}`}
      strokeDashoffset={circ * 0.08}
      strokeLinecap="round"
      transform={`rotate(-110 ${cx} ${cy})`}
    />
  );
}

// --- SAKURA Wire — 유기적 붓터치 느낌 ---
export function Wire({ cx, y, height, thickness = 6 }) {
  // 약간 구불구불한 와이어: path로 미세한 S자 곡선
  const x0 = cx - thickness / 2;
  const x1 = cx + thickness / 2;
  const mid = y + height / 2;
  const wave = thickness * 0.25; // 미세한 웨이브 폭

  return (
    <g>
      {/* 와이어 본체 — 약간 어두운 남색 */}
      <rect x={x0} y={y} width={thickness} height={height}
        fill="#0e0c0a" stroke="#0a0808" strokeWidth=".8" />
      {/* 왼쪽 하이라이트 선 — 미세 웨이브 */}
      <path
        d={`M${x0 + 1},${y + 1} Q${x0 + 1 + wave},${mid} ${x0 + 1},${y + height - 1}`}
        fill="none" stroke="#2a2018" strokeWidth=".6" />
      {/* 오른쪽 그림자 선 */}
      <path
        d={`M${x1 - 1},${y + 1} Q${x1 - 1 - wave},${mid} ${x1 - 1},${y + height - 1}`}
        fill="none" stroke="#080604" strokeWidth=".6" />
    </g>
  );
}

// --- SAKURA NoteContainer ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `nc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2;
  const isDouble = type === "double", half = coreGap / 2;

  // 상단만 라운드된 사각형 path (rx=4)
  const rx = 4;
  const rectPath = [
    `M${x + rx},${y}`,
    `H${x + CW - rx}`,
    `Q${x + CW},${y} ${x + CW},${y + rx}`,
    `V${y + CH}`,
    `H${x}`,
    `V${y + rx}`,
    `Q${x},${y} ${x + rx},${y}`,
    "Z",
  ].join(" ");

  // 꽃잎 워터마크 — 중앙에 희미한 꽃 형태
  const wmD = petalFlowerPath(cx, cy, CH * 0.7, CH * 0.28);

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} />
          <stop offset="40%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
        <clipPath id={`${uid}_clip`}>
          <path d={rectPath} />
        </clipPath>
      </defs>

      {/* 그림자 */}
      <path d={[
        `M${x + rx + 2},${y + 2}`,
        `H${x + CW - rx + 2}`,
        `Q${x + CW + 2},${y + 2} ${x + CW + 2},${y + rx + 2}`,
        `V${y + CH + 2}`,
        `H${x + 2}`,
        `V${y + rx + 2}`,
        `Q${x + 2},${y + 2} ${x + rx + 2},${y + 2}`,
        "Z",
      ].join(" ")} fill="black" opacity=".4" />

      {/* 본체 */}
      <path d={rectPath} fill={`url(#${uid}_g)`} />

      {/* 와시 종이 섬유 텍스처 — 수평 미세 선들 */}
      <g clipPath={`url(#${uid}_clip)`}>
        {[2, 5, 8, 11, 14, 17].map((fy) => (
          <line key={fy}
            x1={x + 3} y1={y + fy} x2={x + CW - 3} y2={y + fy}
            stroke="white" strokeWidth=".4" opacity=".04" />
        ))}
        {/* 꽃잎 워터마크 */}
        <path d={wmD} fill="white" opacity=".035" />
      </g>

      {/* 금박 상단선 */}
      <line x1={x + rx} y1={y + 0.7} x2={x + CW - rx} y2={y + 0.7}
        stroke={P.core.bright} strokeWidth="1.2" opacity=".7" />
      {/* 가는 금박 하이라이트 */}
      <line x1={x + rx} y1={y + 2} x2={x + CW - rx} y2={y + 2}
        stroke={P.core.specular} strokeWidth=".5" opacity=".3" />

      {/* 하단 그림자선 */}
      <line x1={x} y1={y + CH} x2={x + CW} y2={y + CH}
        stroke="black" strokeWidth="1" opacity=".5" />

      {/* 좌우 엣지 */}
      <rect x={x} y={y} width="1" height={CH} fill={pal.highlight} opacity=".08" clipPath={`url(#${uid}_clip)`} />
      <rect x={x + CW - 1} y={y} width="1" height={CH} fill="black" opacity=".2" clipPath={`url(#${uid}_clip)`} />

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

// --- SAKURA BodySegment ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const gw = lineThickness + 4 + glowIntensity;

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
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.bright} strokeWidth={lineThickness} opacity=".9" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.glow} strokeWidth={gw} opacity=".18" filter="url(#coreGlow)" />
          </>) : (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".85" />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offMid} strokeWidth={lineThickness * 0.5} opacity=".45" />
          </>)}
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + height} stroke={pal.base} strokeWidth="1" opacity=".3" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + height} stroke="black" strokeWidth="1" opacity=".25" />
    </g>
  );
}

// --- SAKURA TerminalCap ---
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
      <line x1={bx} y1={y} x2={bx + bw} y2={y} stroke={pal.base} strokeWidth="1" opacity=".45" />
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={CH} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + CH}
            stroke={P.core.offBright} strokeWidth={lineThickness} opacity=".85" />
        </g>
      ))}
      <line x1={bx} y1={y} x2={bx} y2={y + CH} stroke={pal.base} strokeWidth="1" opacity=".3" />
      <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + CH} stroke="black" strokeWidth="1" opacity=".25" />
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

// --- SAKURA LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held}
        coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap}
        wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize}
        coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- SAKURA BombFrame — 꽃잎 펼침 + 먹물 스플래시 ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;

  // 꽃잎 모양 파편: 타원을 회전시켜 꽃잎 효과
  // SHARD_DIRS의 6방향에 대해 각각 회전된 타원 (꽃잎)
  const PETAL_ROTS = [15, -20, 45, -35, 90, 120]; // 각 파편의 타원 회전각

  // 먹물 스플래시 원 — 작은 원들이 버스트처럼 퍼짐
  const INK_ANGS = [0, 60, 120, 180, 240, 300]; // 6방향 먹물

  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#fff" stopOpacity={f.glowOp} />
          <stop offset="20%" stopColor="#f8d8e8" stopOpacity={f.glowOp * 0.75} />
          <stop offset="50%" stopColor={P.core.bright} stopOpacity={f.glowOp * 0.4} />
          <stop offset="100%" stopColor={P.core.mid} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 중심 글로우 */}
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}

      {/* 링 — 벚꽃 핑크 링 */}
      {f.ringOp > 0 && (
        <circle cx={cx} cy={cy} r={f.ringR} fill="none"
          stroke={P.double.bright} strokeWidth={f.ringW} opacity={f.ringOp} />
      )}

      {/* 버스트 라인 — 느린 곡선 궤적 (curved burst) */}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r0 = ang * Math.PI / 180;
        const inner = f.burstLen * 0.3;
        // 약간 구부러진 선: 중간점을 옆으로 살짝 offset
        const perpAng = r0 + Math.PI / 2;
        const midDist = (inner + f.burstLen) / 2;
        const curvature = f.burstLen * 0.12;
        const mx = cx + Math.cos(r0) * midDist + Math.cos(perpAng) * curvature * (li % 2 === 0 ? 1 : -1);
        const my = cy + Math.sin(r0) * midDist + Math.sin(perpAng) * curvature * (li % 2 === 0 ? 1 : -1);
        return (
          <path key={li}
            d={`M${cx + Math.cos(r0) * inner},${cy + Math.sin(r0) * inner} Q${mx},${my} ${cx + Math.cos(r0) * f.burstLen},${cy + Math.sin(r0) * f.burstLen}`}
            fill="none"
            stroke={P.core.highlight}
            strokeWidth={Math.max(0.3, f.burstOp * 2)}
            opacity={f.burstOp}
            strokeLinecap="round"
          />
        );
      })}

      {/* 꽃잎 파편 — 타원 (rotated ellipses) */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist;
        const sy = cy + sa.dy * f.shardDist;
        const baseRot = PETAL_ROTS[si] + frame * 10;
        // 꽃잎: 길쭉한 타원 (rx > ry)
        const petalRx = f.shardSz * 1.4;
        const petalRy = f.shardSz * 0.55;
        // 꽃잎 색: 단노트는 벚꽃 핑크, 더블은 금박
        const petalColor = si % 2 === 0 ? P.double.bright : P.core.bright;
        return (
          <ellipse key={si}
            cx={sx} cy={sy}
            rx={petalRx} ry={petalRy}
            transform={`rotate(${baseRot} ${sx} ${sy})`}
            fill={petalColor}
            opacity={f.shardOp}
          />
        );
      })}

      {/* 먹물 스플래시 — 작은 불규칙 원들 */}
      {f.shardSz > 0 && INK_ANGS.map((ang, ii) => {
        const r0 = ang * Math.PI / 180;
        // 먹물 원은 파편보다 조금 더 멀리
        const inkDist = f.shardDist * 0.65;
        const ix = cx + Math.cos(r0) * inkDist;
        const iy = cy + Math.sin(r0) * inkDist;
        const inkR = f.shardSz * 0.35;
        return (
          <circle key={ii}
            cx={ix} cy={iy} r={inkR}
            fill={P.single.bright}
            opacity={f.shardOp * 0.6}
          />
        );
      })}

      {/* 중심 코어 */}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}
