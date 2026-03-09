import P from "./palette.js";
import { CW, CH } from "../shared/constants.js";
import { BOMB_FRAMES, SHARD_DIRS, BURST_ANGS } from "../shared/bomb.js";

// --- Forge Core (룬 각인 다이아몬드) ---
export function Core({ cx, cy, size = 7, filled = true, glowing = false, dimmed = false }) {
  const s = size;
  if (!filled) return (
    <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill="none" stroke={P.core.offMid} strokeWidth="1.5" />
  );
  const lit = glowing && !dimmed;
  const c = lit ? P.core : { base: P.core.off, mid: P.core.offBase, bright: P.core.offMid, highlight: P.core.offBright };
  return (
    <g>
      {lit && <rect x={cx - s - 3} y={cy - s - 3} width={(s + 3) * 2} height={(s + 3) * 2}
        transform={`rotate(45 ${cx} ${cy})`} fill={P.core.glow} filter="url(#coreGlow)" />}
      {/* 다이아몬드 면 — 4 facets */}
      <polygon points={`${cx},${cy - s} ${cx - s},${cy} ${cx},${cy}`} fill={c.base} />
      <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy}`} fill={c.mid} />
      <polygon points={`${cx - s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={c.bright} />
      <polygon points={`${cx + s},${cy} ${cx},${cy + s} ${cx},${cy}`} fill={c.highlight} />
      {/* 룬 각인 — 내부 앵귤러 마킹 */}
      <line x1={cx} y1={cy - s * .65} x2={cx - s * .3} y2={cy - s * .1} stroke={c.highlight} strokeWidth=".8" opacity=".55" />
      <line x1={cx} y1={cy - s * .65} x2={cx + s * .3} y2={cy - s * .1} stroke={c.highlight} strokeWidth=".8" opacity=".55" />
      <line x1={cx - s * .45} y1={cy + s * .1} x2={cx} y2={cy - s * .15} stroke={c.mid} strokeWidth=".6" opacity=".4" />
      <line x1={cx + s * .45} y1={cy + s * .1} x2={cx} y2={cy - s * .15} stroke={c.mid} strokeWidth=".6" opacity=".4" />
      <line x1={cx - s * .25} y1={cy + s * .45} x2={cx + s * .25} y2={cy + s * .45} stroke={c.bright} strokeWidth=".5" opacity=".35" />
      {lit && <>
        <polygon points={`${cx},${cy - s * .5} ${cx - s * .45},${cy} ${cx},${cy}`} fill={c.mid} opacity="0.4" />
        <polygon points={`${cx},${cy - s * .5} ${cx + s * .45},${cy} ${cx},${cy}`} fill={c.bright} opacity="0.3" />
        <polygon points={`${cx - s * .2},${cy - s * .55} ${cx - s * .05},${cy - s * .35} ${cx + s * .15},${cy - s * .45}`} fill="white" opacity="0.45" />
        <circle cx={cx + s * .22} cy={cy - s * .28} r={s * .07} fill="white" opacity="0.6" />
      </>}
    </g>
  );
}

// --- Forge Holder (두꺼운 철 프레임, 리벳 느낌) ---
export function Holder({ cx, cy, size = 7, pad = 2 }) {
  const hs = size + pad;
  return (
    <g>
      {/* 외부 두꺼운 프레임 */}
      <rect x={cx - hs - 1} y={cy - hs - 1} width={(hs + 1) * 2} height={(hs + 1) * 2}
        transform={`rotate(45 ${cx} ${cy})`} fill={P.holder.fill} stroke="#1e2428" strokeWidth="1" />
      <rect x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
        transform={`rotate(45 ${cx} ${cy})`} fill={P.holder.fill} stroke={P.holder.stroke} strokeWidth="2.5" />
      {/* 모서리 리벳 강조 */}
      <circle cx={cx} cy={cy - hs} r="1.2" fill="#2a3040" opacity=".7" />
      <circle cx={cx} cy={cy + hs} r="1.2" fill="#2a3040" opacity=".7" />
      <circle cx={cx - hs} cy={cy} r="1.2" fill="#2a3040" opacity=".7" />
      <circle cx={cx + hs} cy={cy} r="1.2" fill="#2a3040" opacity=".7" />
    </g>
  );
}

// --- Forge Wire (체인 링크 느낌 — 교번 노치 있는 굵은 바) ---
export function Wire({ cx, y, height, thickness = 6 }) {
  const hw = thickness / 2;
  // 노치 간격
  const notchSpacing = 8;
  const notchCount = Math.floor(height / notchSpacing);
  return (
    <g>
      {/* 메인 바 */}
      <rect x={cx - hw} y={y} width={thickness} height={height} fill="#141820" stroke="#0a0c10" strokeWidth=".8" />
      {/* 좌측 하이라이트 엣지 */}
      <line x1={cx - hw + 1} y1={y + 1} x2={cx - hw + 1} y2={y + height - 1} stroke="#282e38" strokeWidth=".6" />
      {/* 우측 섀도우 엣지 */}
      <line x1={cx + hw - 1} y1={y + 1} x2={cx + hw - 1} y2={y + height - 1} stroke="#060608" strokeWidth=".6" />
      {/* 체인 노치 — 교번 위치로 링크 느낌 */}
      {Array.from({ length: notchCount }, (_, i) => {
        const ny = y + i * notchSpacing + notchSpacing / 2;
        const side = i % 2 === 0;
        return (
          <rect key={i}
            x={side ? cx - hw : cx + hw - 2}
            y={ny - 1.5}
            width={2} height={3}
            fill="#0a0c10" opacity=".8"
          />
        );
      })}
    </g>
  );
}

// --- Forge NoteContainer (방패형 오각형, 다마스커스 크로스해치, 해머 딤플, 잔열 보더) ---
export function NoteContainer({ x, y, type = "single", coreSize = 7, coreGap = 26, dimLeft = false, dimRight = false }) {
  const pal = P[type];
  const uid = `nc_${type}_${x}_${y}`;
  const cx = x + CW / 2, cy = y + CH / 2, isDouble = type === "double", half = coreGap / 2;

  // 방패형 오각형 포인트 — 위쪽 넓고 아래 뾰족
  // 상단 좌우 모서리, 하단 좌우 중간, 하단 중앙 포인트
  const shieldPoints = [
    `${x},${y}`,                          // 상단 좌
    `${x + CW},${y}`,                     // 상단 우
    `${x + CW},${y + CH * .6}`,           // 하단 우
    `${cx},${y + CH}`,                    // 하단 중앙 포인트
    `${x},${y + CH * .6}`,               // 하단 좌
  ].join(" ");

  // 클리핑 마스크용 같은 포인트
  const clipId = `${uid}_clip`;

  // 다마스커스 크로스해치 간격
  const hatchSpacing = 6;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}_g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.bright} />
          <stop offset="40%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
        <clipPath id={clipId}>
          <polygon points={shieldPoints} />
        </clipPath>
      </defs>

      {/* 드롭 섀도우 */}
      <polygon points={[
        `${x + 2},${y + 2}`,
        `${x + CW + 2},${y + 2}`,
        `${x + CW + 2},${y + CH * .6 + 2}`,
        `${cx + 2},${y + CH + 2}`,
        `${x + 2},${y + CH * .6 + 2}`,
      ].join(" ")} fill="black" opacity=".45" />

      {/* 방패 몸체 */}
      <polygon points={shieldPoints} fill={`url(#${uid}_g)`} />

      {/* 다마스커스 크로스해치 패턴 (클립 안에서) */}
      <g clipPath={`url(#${clipId})`} opacity=".12">
        {Array.from({ length: Math.ceil((CW + CH) / hatchSpacing) }, (_, i) => {
          const offset = i * hatchSpacing - CH;
          return (
            <g key={i}>
              <line x1={x + offset} y1={y} x2={x + offset + CH} y2={y + CH} stroke={pal.specular} strokeWidth=".5" />
              <line x1={x + CW - offset} y1={y} x2={x + CW - offset - CH} y2={y + CH} stroke={pal.specular} strokeWidth=".5" />
            </g>
          );
        })}
      </g>

      {/* 해머 딤플 — 작은 원형 홈 */}
      <g clipPath={`url(#${clipId})`}>
        {[cx - 35, cx - 18, cx + 18, cx + 35].map((dx, di) => (
          <circle key={di} cx={dx} cy={cy - 1} r="2.2"
            fill="none" stroke="#000000" strokeWidth=".8" opacity=".3" />
        ))}
        {[cx - 35, cx - 18, cx + 18, cx + 35].map((dx, di) => (
          <circle key={`h${di}`} cx={dx + .5} cy={cy - .5} r="1.8"
            fill={pal.bright} opacity=".08" />
        ))}
      </g>

      {/* 잔열 보더 — 엠버 엣지 글로우 */}
      <polygon points={shieldPoints} fill="none"
        stroke={P.core.bright} strokeWidth="1.5" opacity=".35" />
      <polygon points={shieldPoints} fill="none"
        stroke={P.core.highlight} strokeWidth=".5" opacity=".2" />

      {/* 상단 스펙큘러 라인 */}
      <line x1={x + 4} y1={y + .6} x2={x + CW - 4} y2={y + .6}
        stroke={pal.specular} strokeWidth=".8" opacity=".25" />

      {/* 코어 */}
      {isDouble ? (<>
        <Holder cx={cx - half} cy={cy} size={coreSize} /><Core cx={cx - half} cy={cy} size={coreSize} filled glowing dimmed={dimLeft} />
        <Holder cx={cx + half} cy={cy} size={coreSize} /><Core cx={cx + half} cy={cy} size={coreSize} filled glowing dimmed={dimRight} />
      </>) : (<>
        <Holder cx={cx} cy={cy} size={coreSize} /><Core cx={cx} cy={cy} size={coreSize} filled glowing />
      </>)}
    </g>
  );
}

// --- Forge BodySegment ---
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
      {held && <rect x={bx} y={y} width={bw} height={height} fill={P.core.glow} opacity=".07" />}
      {positions.map((px, pi) => (
        <g key={pi}>
          <Wire cx={px} y={y} height={height} thickness={wireThickness} />
          {held ? (<>
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.bright} strokeWidth={lineThickness} opacity=".95" />
            <line x1={px} y1={y} x2={px} y2={y + height} stroke={P.core.glow} strokeWidth={gw} opacity=".22" filter="url(#coreGlow)" />
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

// --- Forge TerminalCap ---
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

// --- Forge LongNote ---
export function LongNote({ x, y, bodyH = 80, type = "single", held = false, coreSize, coreGap = 26, dimLeft = false, dimRight = false, wireThickness, lineThickness, glowIntensity }) {
  return (
    <g>
      <BodySegment x={x} y={y + CH} height={bodyH} type={type} held={held} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} glowIntensity={glowIntensity} />
      <TerminalCap x={x} y={y} type={type} coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} />
      <NoteContainer x={x} y={y + CH + bodyH} type={type} coreSize={coreSize} coreGap={coreGap} dimLeft={dimLeft} dimRight={dimRight} />
    </g>
  );
}

// --- Forge BombFrame (불꽃 포물선, 금속 파편, 연기) ---
export function BombFrame({ cx, cy, frame, id }) {
  const f = BOMB_FRAMES[frame] || BOMB_FRAMES[0];
  const gid = `bomb_${id}_${frame}`;

  // 금속 파편 — 불규칙 폴리곤 형태 (각 방향마다 고유 모양)
  const shardPolygons = [
    // dx, dy를 기반으로 비대칭 폴리곤
    (sx, sy, sz, rot) => `${sx},${sy - sz} ${sx + sz * .4},${sy - sz * .3} ${sx + sz * .7},${sy + sz * .5} ${sx - sz * .3},${sy + sz * .6} ${sx - sz * .6},${sy - sz * .1}`,
    (sx, sy, sz, rot) => `${sx - sz * .5},${sy - sz} ${sx + sz * .6},${sy - sz * .4} ${sx + sz * .4},${sy + sz * .5} ${sx - sz * .7},${sy + sz * .2}`,
    (sx, sy, sz, rot) => `${sx},${sy - sz * .8} ${sx + sz * .8},${sy} ${sx + sz * .3},${sy + sz * .7} ${sx - sz * .6},${sy + sz * .4} ${sx - sz * .5},${sy - sz * .3}`,
    (sx, sy, sz, rot) => `${sx - sz * .3},${sy - sz * .6} ${sx + sz * .7},${sy - sz * .2} ${sx + sz * .5},${sy + sz * .8} ${sx - sz * .6},${sy + sz * .3}`,
    (sx, sy, sz, rot) => `${sx},${sy - sz} ${sx + sz * .5},${sy - sz * .2} ${sx + sz * .2},${sy + sz * .6} ${sx - sz * .4},${sy + sz * .5} ${sx - sz * .3},${sy - sz * .4}`,
    (sx, sy, sz, rot) => `${sx - sz * .6},${sy - sz * .3} ${sx + sz * .4},${sy - sz * .8} ${sx + sz * .7},${sy + sz * .2} ${sx},${sy + sz * .7} ${sx - sz * .8},${sy + sz * .1}`,
  ];

  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor="#fff" stopOpacity={f.glowOp} />
          <stop offset="15%" stopColor="#ffb030" stopOpacity={f.glowOp * .75} />
          <stop offset="40%" stopColor={P.core.bright} stopOpacity={f.glowOp * .4} />
          <stop offset="100%" stopColor={P.core.base} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 연기 — 바깥쪽으로 퍼지는 회색 원 */}
      {f.shardDist > 8 && SHARD_DIRS.slice(0, 4).map((sa, si) => {
        const smx = cx + sa.dx * f.shardDist * .7, smy = cy + sa.dy * f.shardDist * .7;
        const smR = f.shardSz * 2.5;
        return (
          <circle key={`sm${si}`} cx={smx} cy={smy} r={smR}
            fill="#888" opacity={f.shardOp * .25} />
        );
      })}

      {/* 글로우 */}
      {f.glowR > 0 && <circle cx={cx} cy={cy} r={f.glowR} fill={`url(#${gid})`} />}

      {/* 링 */}
      {f.ringOp > 0 && <circle cx={cx} cy={cy} r={f.ringR} fill="none"
        stroke={P.core.highlight} strokeWidth={f.ringW} opacity={f.ringOp} />}

      {/* 버스트 라인 — 짧고 굵은 불꽃 스파크 */}
      {f.burstLen > 0 && BURST_ANGS.map((ang, li) => {
        const r = ang * Math.PI / 180, inner = f.burstLen * .35;
        const strokeW = Math.max(.5, f.burstOp * 3);
        return (
          <line key={li}
            x1={cx + Math.cos(r) * inner} y1={cy + Math.sin(r) * inner}
            x2={cx + Math.cos(r) * f.burstLen} y2={cy + Math.sin(r) * f.burstLen}
            stroke={li % 3 === 0 ? P.core.specular : P.core.highlight}
            strokeWidth={strokeW} opacity={f.burstOp}
            strokeLinecap="round"
          />
        );
      })}

      {/* 금속 파편 — 포물선 궤적 (중력 효과: dy에 추가 오프셋) */}
      {f.shardSz > 0 && SHARD_DIRS.map((sa, si) => {
        // 포물선: x는 선형, y는 아래로 가중
        const gravity = f.shardDist * .15;
        const sx = cx + sa.dx * f.shardDist;
        const sy = cy + sa.dy * f.shardDist + gravity;
        const sz = f.shardSz;
        const rot = sa.rot + frame * 15;
        const polyFn = shardPolygons[si % shardPolygons.length];
        return (
          <polygon key={si}
            points={polyFn(sx, sy, sz, rot)}
            transform={`rotate(${rot} ${sx} ${sy})`}
            fill={si % 2 === 0 ? P.core.highlight : P.single.bright}
            opacity={f.shardOp}
          />
        );
      })}

      {/* 코어 */}
      {f.coreR > 0 && <circle cx={cx} cy={cy} r={f.coreR} fill="white" opacity={f.coreOp} />}
    </g>
  );
}
