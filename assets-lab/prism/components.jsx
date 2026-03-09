import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- PRISM Core: 4각 별 (각 꼭짓점 스펙트럼 색) ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  const inner = s * 0.38;

  if (!filled) {
    // 빈 코어: 얇은 4각 별 윤곽
    const pts = starPoints(cx, cy, s, inner);
    return <polygon points={pts} fill="none" stroke={P.core.offMid} strokeWidth="1" />;
  }

  const lit = glowing && !dimmed;
  const [c0, c1, c2, c3] = lit ? P.core.points : [P.core.offMid, P.core.offMid, P.core.offMid, P.core.offMid];

  // 4각 별: 상(top), 우(right), 하(bottom), 좌(left) 각 사분면
  return (
    <g>
      {lit && (
        <polygon points={starPoints(cx, cy, s + 3, inner + 1)}
          fill={P.core.glow} filter="url(#prismCoreGlow)" opacity="0.5" />
      )}
      {/* top quadrant */}
      <polygon points={`${cx},${cy - s} ${cx - inner},${cy} ${cx},${cy} ${cx + inner},${cy}`}
        fill={c0} opacity={lit ? 0.95 : 0.5} />
      {/* right quadrant */}
      <polygon points={`${cx + s},${cy} ${cx},${cy - inner} ${cx},${cy} ${cx},${cy + inner}`}
        fill={c2} opacity={lit ? 0.95 : 0.5} />
      {/* bottom quadrant */}
      <polygon points={`${cx},${cy + s} ${cx + inner},${cy} ${cx},${cy} ${cx - inner},${cy}`}
        fill={c1} opacity={lit ? 0.9 : 0.45} />
      {/* left quadrant */}
      <polygon points={`${cx - s},${cy} ${cx},${cy + inner} ${cx},${cy} ${cx},${cy - inner}`}
        fill={c3} opacity={lit ? 0.9 : 0.45} />
      {/* center highlight */}
      {lit && (
        <circle cx={cx} cy={cy} r={inner * 0.5} fill="white" opacity="0.7" />
      )}
    </g>
  );
}

/** 4각 별 꼭짓점 문자열 생성 (상 → 우상내 → 우 → 우하내 → 하 → 좌하내 → 좌 → 좌상내) */
function starPoints(cx, cy, outer, inner) {
  return [
    `${cx},${cy - outer}`,
    `${cx + inner},${cy}`,
    `${cx + outer},${cy}`,
    `${cx + inner},${cy}`,
    `${cx},${cy + outer}`,
    `${cx - inner},${cy}`,
    `${cx - outer},${cy}`,
    `${cx - inner},${cy}`,
  ].join(" ");
}

// --- PRISM Holder: 얇은 반투명 아크릴 프레임 ---
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  return (
    <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
      transform={`rotate(45 ${cx} ${cy})`}
      fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="1.2" />
  );
}

// --- PRISM Wire: 홀로그래픽 무지개 그라디언트 ---
export function Wire({ cx, y, height, thickness = 6 }) {
  const uid = `wire_${cx}_${y}`;
  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ff00cc" stopOpacity="0.9" />
          <stop offset="20%"  stopColor="#8800ff" stopOpacity="0.85" />
          <stop offset="40%"  stopColor="#0066ff" stopOpacity="0.85" />
          <stop offset="60%"  stopColor="#00ccaa" stopOpacity="0.85" />
          <stop offset="80%"  stopColor="#aaff00" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff6600" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x={cx - thickness / 2} y={y} width={thickness} height={height}
        fill={`url(#${uid})`} opacity="0.55" />
      <line x1={cx - thickness / 2 + 1} y1={y + 1} x2={cx - thickness / 2 + 1} y2={y + height - 1}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
    </g>
  );
}

// --- PRISM NoteContainer: 평행사변형 + 7밴드 스펙트럼 + CD 간섭 ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `nc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2;
  const isDouble = type === "double";
  const half = coreGap / 2;

  // 평행사변형: 위쪽 끝점을 skew=6 오른쪽으로 이동
  const skew = 6;
  const poly = `${x + skew},${y} ${x + CW + skew},${y} ${x + CW},${y + CH} ${x},${y + CH}`;

  // 클리핑 패스 (평행사변형 내부로 제한)
  const clipId = `${uid}_clip`;

  // 7밴드 분할 (CH를 7등분)
  const bandH = CH / 7;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <polygon points={poly} />
        </clipPath>
        <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={pal.bright} stopOpacity="0.9" />
          <stop offset="50%"  stopColor={pal.mid}    stopOpacity="0.8" />
          <stop offset="100%" stopColor={pal.deep}   stopOpacity="1" />
        </linearGradient>
        <linearGradient id={`${uid}_cd`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
          <stop offset="30%"  stopColor="rgba(255,200,255,0.12)" />
          <stop offset="50%"  stopColor="rgba(200,255,255,0.18)" />
          <stop offset="70%"  stopColor="rgba(200,200,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* 그림자 */}
      <polygon points={`${x + skew + 2},${y + 2} ${x + CW + skew + 2},${y + 2} ${x + CW + 2},${y + CH + 2} ${x + 2},${y + CH + 2}`}
        fill="black" opacity="0.35" />

      {/* 메인 몸체 */}
      <polygon points={poly} fill={`url(#${uid}_bg)`} />

      {/* 7밴드 스펙트럼 (ROYGBIV, 낮은 불투명도) */}
      <g clipPath={`url(#${clipId})`}>
        {pal.band.map((color, i) => (
          <rect key={i} x={x} y={y + i * bandH} width={CW + skew + 4} height={bandH}
            fill={color} opacity="0.13" />
        ))}
        {/* CD 간섭 오버레이 */}
        <rect x={x} y={y} width={CW + skew} height={CH}
          fill={`url(#${uid}_cd)`} opacity="0.9" />
        {/* 노이즈 텍스처 (미세 선들) */}
        {Array.from({ length: 4 }, (_, i) => (
          <line key={i}
            x1={x} y1={y + 2 + i * 4.5}
            x2={x + CW + skew} y2={y + 2 + i * 4.5}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        ))}
      </g>

      {/* 상단 하이라이트 선 */}
      <line x1={x + skew + 2} y1={y + 0.5} x2={x + CW + skew - 2} y2={y + 0.5}
        stroke={pal.specular} strokeWidth="0.7" opacity="0.35" />

      {/* 코어 */}
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

// --- PRISM BodySegment ---
export function BodySegment({ x, y, height, type = "single", held = false, coreGap = 26, wireThickness = 6, lineThickness = 2, glowIntensity = 3 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const gw = lineThickness + 4 + glowIntensity;
  const uid = `bbg_${type}_${x}_${y}`;

  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={pal.edge} />
          <stop offset="25%"  stopColor={pal.base} />
          <stop offset="75%"  stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={height} fill={`url(#${uid})`} />
      {held && <rect x={bx} y={y} width={bw} height={height} fill={P.core.glow} opacity="0.07" />}

      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke="rgba(180,160,255,0.9)" strokeWidth={lineThickness} />
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.glow} strokeWidth={gw} opacity="0.22" filter="url(#prismCoreGlow)" />
          </>) : (<>
            <line x1={px} y1={y} x2={px} y2={y + height}
              stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.85" />
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

// --- PRISM TerminalCap ---
export function TerminalCap({ x, y, type = "single", coreSize = 7, coreGap = 26, wireThickness = 6, lineThickness = 2 }) {
  const pal = P.body[type];
  const isDouble = type === "double";
  const cx = x + CW / 2, cy = y + CH / 2;
  const bx = x + 8, bw = CW - 16;
  const half = coreGap / 2;
  const positions = isDouble ? [cx - half, cx + half] : [cx];
  const uid = `tbg_${type}_${x}_${y}`;

  return (
    <g>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={pal.edge} />
          <stop offset="25%"  stopColor={pal.base} />
          <stop offset="75%"  stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.edge} />
        </linearGradient>
      </defs>
      <rect x={bx} y={y} width={bw} height={CH} fill={`url(#${uid})`} />
      <line x1={bx} y1={y} x2={bx + bw} y2={y} stroke={pal.base} strokeWidth="1" opacity="0.45" />

      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={CH} thickness={wireThickness} />
          <line x1={px} y1={y} x2={px} y2={y + CH}
            stroke={P.core.offBright} strokeWidth={lineThickness} opacity="0.85" />
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

// --- PRISM LongNote ---
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

// --- PRISM BombFrame: 7색 방사선 + 별 파편 + 무지개 링 ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;
  const RB = P.rainbow;

  return (
    <g>
      <defs>
        {/* 무지개 링용 코니컬 그라디언트 대신 linearGradient 근사 */}
        <linearGradient id={`${gid}_ring`} x1="0" y1="0" x2="1" y2="1">
          {RB.map((c, i) => (
            <stop key={i} offset={`${Math.round(i * 100 / (RB.length - 1))}%`} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={gid}>
          <stop offset="0%"   stopColor="#ffffff" stopOpacity={f.glowOp} />
          <stop offset="15%"  stopColor="#ddaaff" stopOpacity={f.glowOp * 0.75} />
          <stop offset="45%"  stopColor="#8844ff" stopOpacity={f.glowOp * 0.4} />
          <stop offset="100%" stopColor="#4400cc"  stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 방사 글로우 */}
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}

      {/* 무지개 링 (두 개 겹쳐서 입체감) */}
      {f.ringOp > 0 && (<>
        <circle cx={cx} cy={cy} r={f.ringR} fill="none"
          stroke={`url(#${gid}_ring)`} strokeWidth={f.ringW + 1} opacity={f.ringOp * 0.6} />
        <circle cx={cx} cy={cy} r={f.ringR} fill="none"
          stroke="white" strokeWidth={f.ringW * 0.4} opacity={f.ringOp * 0.4} />
      </>)}

      {/* 7색 방사선 (각 선마다 다른 무지개 색) */}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r = ang * Math.PI / 180;
        const inner = f.burstLen * 0.3;
        const color = RB[li % RB.length];
        return (
          <line key={li}
            x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner}
            x2={cx + Math.cos(r) * f.burstLen} y2={cy + Math.sin(r) * f.burstLen}
            stroke={color} strokeWidth={Math.max(0.4, f.burstOp * 2.8)} opacity={f.burstOp} />
        );
      })}

      {/* 별 모양 파편 */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        const sx = cx + sa.dx * f.shardDist;
        const sy = cy + sa.dy * f.shardDist;
        const rot = sa.rot + frame * 15;
        const color = RB[si % RB.length];
        const sz = f.shardSz;
        const pts = starShardPoints(sx, sy, sz, sz * 0.42);
        return (
          <polygon key={si} points={pts}
            transform={`rotate(${rot} ${sx} ${sy})`}
            fill={color} opacity={f.shardOp} />
        );
      })}

      {/* 중심 코어 */}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}

/** 4각 별 파편 꼭짓점 계산 */
function starShardPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const r = (i * 45 - 90) * Math.PI / 180;
    const radius = i % 2 === 0 ? outer : inner;
    pts.push(`${cx + Math.cos(r) * radius},${cy + Math.sin(r) * radius}`);
  }
  return pts.join(" ");
}
