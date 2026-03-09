import { useState } from "react";
import P from "./palette.js";
import { NoteContainer, LongNote, TerminalCap, BombFrame } from "./components.jsx";
import { CW, CH, LANE_GAP, LANE_W, GEAR_PAD, FIELD_W, LANE_H, LANE_TOP, LANE_BOT, JUDGE_Y, noteX } from "../shared/constants.js";
import { BOMB_FRAMES } from "../shared/bomb.js";
import { SharedDefs, Section, Card, Row, Slider, BombPlayer } from "../shared/ui.jsx";

export default function App() {
  const [coreSize, setCoreSize] = useState(7);
  const [coreGap, setCoreGap] = useState(26);
  const [wireThickness, setWireThickness] = useState(6);
  const [lineThickness, setLineThickness] = useState(2);
  const [glowIntensity, setGlowIntensity] = useState(3);
  const [holdState, setHoldState] = useState(false);
  const [dimMode, setDimMode] = useState("none");
  const dimL = dimMode === "left", dimR = dimMode === "right";

  const btn = active => ({
    background: active ? P.accent : "#141008", color: active ? "#fff" : P.textDim,
    border: `1px solid ${active ? P.accent : P.border}`, padding: "4px 10px",
    fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all .12s",
  });
  const noteProps = { coreSize, coreGap };
  const longProps = { ...noteProps, wireThickness, lineThickness, glowIntensity };

  const uiP = { textDim: P.textDim, text: P.text, accent: P.accent, border: P.border, bgCard: P.bgCard };

  return (
    <div style={{
      minHeight: "100vh", background: P.bg, color: P.text,
      fontFamily: "'JetBrains Mono', monospace", padding: "28px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      maxWidth: 600, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e0c89a", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ⬡ Forge Note Assets v1
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          Iron Gear · Ember Wire · 16F Bomb · Animated Preview
        </p>
      </div>

      {/* Controls */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "14px 16px", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 10, color: P.textDim, textTransform: "uppercase", letterSpacing: ".1em" }}>Options</div>
        <Slider label="Core Size" value={coreSize} onChange={setCoreSize} min={5} max={12} suffix="px" {...uiP} />
        <Slider label="Double Gap" value={coreGap} onChange={setCoreGap} min={14} max={40} suffix="px" {...uiP} />
        <Slider label="Glow" value={glowIntensity} onChange={setGlowIntensity} min={0} max={10} step={.5} {...uiP} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><Slider label="Line" value={lineThickness} onChange={setLineThickness} min={1} max={6} suffix="px" {...uiP} /></div>
          <div style={{ flex: 1 }}><Slider label="Wire" value={wireThickness} onChange={setWireThickness} min={4} max={16} suffix="px" {...uiP} /></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: P.textDim, marginBottom: 5 }}>Double Dim</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[["none", "Both Lit"], ["left", "L Dim"], ["right", "R Dim"]].map(([v, l]) =>
              <button key={v} onClick={() => setDimMode(v)} style={btn(dimMode === v)}>{l}</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 10, color: P.textDim }}>Hold</div>
          <button
            onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
            onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}
            style={{ ...btn(holdState), background: holdState ? P.core.bright : "#141008", borderColor: holdState ? P.core.bright : P.border }}>
            {holdState ? "◆ HOLDING" : "◇ PRESS & HOLD"}
          </button>
        </div>
      </div>

      {/* Note assets */}
      <Section title="▸ Notes" {...uiP}>
        <Row>
          <Card label="Single" gi={glowIntensity} {...uiP}><NoteContainer x={15} y={17} type="single" {...noteProps} /></Card>
          <Card label="Double" gi={glowIntensity} {...uiP}><NoteContainer x={15} y={17} type="double" {...noteProps} /></Card>
          <Card label="Term S" svgW={130} svgH={55} {...uiP}><TerminalCap x={15} y={17} type="single" coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} /></Card>
          <Card label="Term D" svgW={130} svgH={55} {...uiP}><TerminalCap x={15} y={17} type="double" coreSize={coreSize} coreGap={coreGap} wireThickness={wireThickness} lineThickness={lineThickness} /></Card>
        </Row>
      </Section>

      <Section title="▸ Long Notes" {...uiP}>
        <Row>
          <Card label="Sgl Off" svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held={false} {...longProps} /></Card>
          <Card label="Sgl Held" svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held {...longProps} /></Card>
          <Card label="Dbl Off" svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="double" held={false} {...longProps} dimLeft={dimL} dimRight={dimR} /></Card>
          <Card label="Dbl Held" svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="double" held {...longProps} dimLeft={dimL} dimRight={dimR} /></Card>
        </Row>
      </Section>

      {/* Gear */}
      <Section title="▸ Gear" {...uiP}>
        {(() => {
          const SVG_W = FIELD_W + GEAR_PAD * 2 + 16;
          const SVG_H = LANE_H + 120;
          const FR = 4;
          const FR_W = SVG_W - FR * 2;
          const FR_H = SVG_H - FR * 2;
          const FLD_X = GEAR_PAD;
          const FLD_R = FLD_X + FIELD_W;

          // Flat-top hexagon: vertices at 30°+k*60°, radius r
          const hexPoints = (cx, cy, r) =>
            Array.from({ length: 6 }, (_, k) => {
              const a = (Math.PI / 180) * (30 + k * 60);
              return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
            }).join(" ");

          // Edge rivet row — N rivets evenly along a horizontal or vertical edge
          const rivetRow = ({ x1, y1, x2, y2, n, r = 2.5 }) =>
            Array.from({ length: n }, (_, i) => {
              const t = n === 1 ? 0.5 : i / (n - 1);
              const rx = x1 + (x2 - x1) * t;
              const ry = y1 + (y2 - y1) * t;
              return <g key={i}>
                <circle cx={rx} cy={ry} r={r} fill="#1e2228" stroke="#101418" strokeWidth="1" />
                <circle cx={rx} cy={ry} r={r * 0.45} fill="#2e3440" />
                <circle cx={rx - r * 0.25} cy={ry - r * 0.25} r={r * 0.18} fill="#404858" opacity=".55" />
              </g>;
            });

          return (
            <div style={{ background: "#060408", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  <linearGradient id="keybeam_forge" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#f06000" stopOpacity=".22" />
                    <stop offset="25%" stopColor="#c04000" stopOpacity=".1" />
                    <stop offset="70%" stopColor="#803000" stopOpacity=".03" />
                    <stop offset="100%" stopColor="#803000" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lavacrack_forge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6000" stopOpacity=".55" />
                    <stop offset="40%" stopColor="#c04000" stopOpacity=".25" />
                    <stop offset="100%" stopColor="#803000" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* ── HEAVY IRON PLATE FRAME ── */}
                {/* Outer iron plate */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="#252a2e" />
                {/* Top-left highlight bevel */}
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke="#3e4650" strokeWidth="2.5" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke="#3e4650" strokeWidth="2.5" />
                {/* Bottom-right shadow bevel */}
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="#0e1014" strokeWidth="2.5" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="#0e1014" strokeWidth="2.5" />
                {/* Inner recessed plate */}
                <rect x={FR + 5} y={FR + 5} width={FR_W - 10} height={FR_H - 10} fill="#1e2228" />
                <rect x={FR + 9} y={FR + 9} width={FR_W - 18} height={FR_H - 18} fill="#1a1e24" stroke="#12161a" strokeWidth=".5" />

                {/* Hammered texture — diagonal crosshatch lines at ~45deg, very low opacity */}
                {[0, 1, 2, 3, 4].map(k => {
                  const step = (FR_W + FR_H) / 5;
                  const ox = FR + 9 + k * step;
                  return <line key={`hx${k}`}
                    x1={ox} y1={FR + 9}
                    x2={ox - FR_H + 18} y2={FR + FR_H - 9}
                    stroke="#c8a060" strokeWidth=".8" opacity=".07"
                    strokeDasharray="none" />;
                })}
                {[0, 1, 2, 3].map(k => {
                  const step = (FR_W + FR_H) / 5;
                  const ox = FR + 9 + (k + 0.5) * step;
                  return <line key={`hx2${k}`}
                    x1={Math.min(ox, FR + FR_W - 9)} y1={ox > FR + FR_W - 9 ? FR + 9 + (ox - (FR + FR_W - 9)) : FR + 9}
                    x2={Math.max(ox - FR_H + 18, FR + 9)} y2={ox - FR_H + 18 < FR + 9 ? FR + FR_H - 9 - ((FR + 9) - (ox - FR_H + 18)) : FR + FR_H - 9}
                    stroke="#c8a060" strokeWidth=".6" opacity=".05" />;
                })}

                {/* Ember inner border glow */}
                <rect x={FR + 9} y={FR + 9} width={FR_W - 18} height={FR_H - 18}
                  fill="none" stroke={P.core.glow} strokeWidth="1.5" opacity=".12" />

                {/* ── RIVET ROWS along each edge ── */}
                {/* Top edge */}
                {rivetRow({ x1: FR + 28, y1: FR + 7, x2: FR + FR_W - 28, y2: FR + 7, n: 6 })}
                {/* Bottom edge */}
                {rivetRow({ x1: FR + 28, y1: FR + FR_H - 7, x2: FR + FR_W - 28, y2: FR + FR_H - 7, n: 6 })}
                {/* Left edge */}
                {rivetRow({ x1: FR + 7, y1: FR + 28, x2: FR + 7, y2: FR + FR_H - 28, n: 5 })}
                {/* Right edge */}
                {rivetRow({ x1: FR + FR_W - 7, y1: FR + 28, x2: FR + FR_W - 7, y2: FR + FR_H - 28, n: 5 })}

                {/* Lane field */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#08090c" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#040408" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#040408" strokeWidth="1.5" />

                {/* ── IRON BAR LANE DIVIDERS ── */}
                {[0, 1, 2, 3, 4].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  return <g key={`ld${i}`}>
                    <line x1={lx} y1={LANE_TOP} x2={lx} y2={LANE_BOT} stroke="#202428" strokeWidth="2" />
                    <circle cx={lx} cy={LANE_TOP + 4} r="2" fill="#2a2e34" stroke="#141820" strokeWidth=".8" />
                    <circle cx={lx} cy={LANE_BOT - 4} r="2" fill="#2a2e34" stroke="#141820" strokeWidth=".8" />
                  </g>;
                })}

                {/* ── KEY BEAM — lava crack effect ── */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const cx = lx + LANE_W / 2;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  // Zigzag center path
                  const zTop = LANE_TOP, zBot = LANE_BOT;
                  const seg = (zBot - zTop) / 8;
                  const zPath = Array.from({ length: 9 }, (_, k) => {
                    const y = zTop + k * seg;
                    const x = cx + (k % 2 === 0 ? -3 : 3);
                    return `${k === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                  }).join(" ");
                  return <g key={`kb${i}`}>
                    <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam_forge)" />
                    <rect x={cx - 18} y={JUDGE_Y - 200} width={36} height={200 + LANE_BOT - JUDGE_Y} fill="url(#lavacrack_forge)" opacity=".4" />
                    {/* Jagged lava center line */}
                    <path d={zPath} fill="none" stroke="#ff6000" strokeWidth="1.5" opacity=".6" />
                    <ellipse cx={cx} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill={P.core.bright} opacity=".1" />
                  </g>;
                })}

                {/* Notes */}
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 10} type="single" {...noteProps} />
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 120} type="single" {...noteProps} />
                <LongNote x={noteX(1)} y={JUDGE_Y - 200} bodyH={170} type="single" held={holdState} {...longProps} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 60} type="double" {...noteProps} dimLeft={dimL} dimRight={dimR} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 180} type="double" {...noteProps} />
                <LongNote x={noteX(3)} y={JUDGE_Y - 260} bodyH={230} type="double" held={holdState} {...longProps} dimLeft={dimL} dimRight={dimR} />

                {/* Bomb preview */}
                <BombFrame cx={noteX(0) + CW / 2} cy={JUDGE_Y + CH / 2} frame={6} id="gear" />

                {/* ── MOLTEN CRACK JUDGMENT LINE ── */}
                {/* Ember glow underlay */}
                <rect x={FLD_X} y={JUDGE_Y - 3} width={FIELD_W} height={8} fill="#f06000" opacity=".06" />
                {/* Main orange line */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="#f06000" strokeWidth="2.5" opacity=".85" />
                {/* Crack branches — short perpendicular lines along judgment line */}
                {[0.12, 0.27, 0.43, 0.58, 0.73, 0.88].map((t, idx) => {
                  const jx = FLD_X + FIELD_W * t;
                  const angle = (idx % 2 === 0 ? 1 : -1) * (70 + (idx * 13) % 30);
                  const rad = (angle * Math.PI) / 180;
                  const len = 5 + (idx % 3) * 2;
                  return <line key={`crack${idx}`}
                    x1={jx} y1={JUDGE_Y}
                    x2={jx + len * Math.cos(rad)} y2={JUDGE_Y + len * Math.sin(rad)}
                    stroke="#ff8030" strokeWidth="1" opacity=".6" />;
                })}
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill="#605040" fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* Button dock — heavy iron plate */}
                <rect x={FR + 9} y={LANE_BOT + 4} width={FR_W - 18} height={SVG_H - LANE_BOT - FR - 13} fill="#222630" />
                <line x1={FR + 9} y1={LANE_BOT + 4} x2={FR + FR_W - 9} y2={LANE_BOT + 4} stroke="#0e1014" strokeWidth="2" />
                <line x1={FR + 9} y1={LANE_BOT + 4} x2={FR + FR_W - 9} y2={LANE_BOT + 4} stroke="#3a4050" strokeWidth=".8" opacity=".5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 19} fill="#1e2430" stroke="#181e26" strokeWidth=".5" />

                {/* ── CONNECTORS + HEXAGONAL BUTTONS ── */}
                {[0, 1, 2, 3].map(i => {
                  const bcx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 48;
                  const isPressed = holdState && (i === 1 || i === 3);
                  const trapR = bcx + 20, trapL = bcx - 20;

                  // Hex points (flat-top, r=22)
                  const HEX_R = 22;
                  const hexPts = hexPoints(bcx, btnY, HEX_R);
                  const hexInnerPts = hexPoints(bcx, btnY, HEX_R - 3);

                  return <g key={`btn${i}`}>
                    {/* Forged iron bridge connector — trapezoid with thick stroke */}
                    <polygon
                      points={`${laneL},${dockY} ${laneR},${dockY} ${trapR},${dockY + 22} ${trapL},${dockY + 22}`}
                      fill={isPressed ? "#30363e" : "#1e2228"}
                      stroke="#0e1014" strokeWidth="2.5" />
                    {/* Top bevel highlight */}
                    <line x1={laneL} y1={dockY} x2={laneR} y2={dockY} stroke="#3a4250" strokeWidth="1" opacity=".6" />
                    {/* Chain link dashed line across middle */}
                    <line
                      x1={laneL + 4} y1={dockY + 11}
                      x2={laneR - 4} y2={dockY + 11}
                      stroke="#303840" strokeWidth="1.5"
                      strokeDasharray="4 3" opacity=".7" />
                    {/* Rivet dots top-left and top-right of connector */}
                    <circle cx={laneL + 5} cy={dockY + 3} r={2.5} fill="#1a1e24" stroke="#0a0e12" strokeWidth="1" />
                    <circle cx={laneL + 5} cy={dockY + 3} r={1} fill="#2e3440" />
                    <circle cx={laneR - 5} cy={dockY + 3} r={2.5} fill="#1a1e24" stroke="#0a0e12" strokeWidth="1" />
                    <circle cx={laneR - 5} cy={dockY + 3} r={1} fill="#2e3440" />

                    {/* Hexagon outer shadow ring */}
                    <polygon points={hexPoints(bcx, btnY, HEX_R + 3)} fill="#0e1014" opacity=".8" />
                    {/* Hexagon main body */}
                    <polygon
                      points={hexPts}
                      fill={isPressed ? "#28303c" : "#242a30"}
                      stroke={isPressed ? "#282030" : "#363e4a"}
                      strokeWidth="2" />
                    {/* Hexagon inner chamfer ring */}
                    <polygon points={hexInnerPts} fill="none" stroke={isPressed ? "#181422" : "#2a3040"} strokeWidth="1" opacity=".7" />
                    {/* Top facet highlight */}
                    {!isPressed && <line
                      x1={bcx - HEX_R * Math.cos(Math.PI / 180 * 30)}
                      y1={btnY - HEX_R * Math.sin(Math.PI / 180 * 30)}
                      x2={bcx + HEX_R * Math.cos(Math.PI / 180 * 30)}
                      y2={btnY - HEX_R * Math.sin(Math.PI / 180 * 30)}
                      stroke="#484e5e" strokeWidth=".8" opacity=".5" />}

                    {/* Inner diamond receptor */}
                    <rect x={bcx - 8} y={btnY - 8} width={16} height={16}
                      transform={`rotate(45 ${bcx} ${btnY})`}
                      fill={isPressed ? "#1e1a28" : "#262c38"}
                      stroke={isPressed ? "#18141e" : "#30384a"} strokeWidth="1.5" />
                    {/* Rune marking lines inside diamond */}
                    <line x1={bcx - 5} y1={btnY - 2} x2={bcx - 2} y2={btnY - 5} stroke="#404858" strokeWidth=".8" opacity=".7" />
                    <line x1={bcx + 2} y1={btnY + 5} x2={bcx + 5} y2={btnY + 2} stroke="#404858" strokeWidth=".8" opacity=".7" />
                    <line x1={bcx - 3} y1={btnY + 1} x2={bcx + 3} y2={btnY - 1} stroke="#505868" strokeWidth=".7" opacity=".5" />

                    {/* Pressed state: molten orange glow + ember particles */}
                    {isPressed && <>
                      <polygon points={hexPts} fill="none" stroke={P.core.glow} strokeWidth="3" opacity=".4" filter="url(#coreGlow)" />
                      <rect x={bcx - 6} y={btnY - 6} width={12} height={12}
                        transform={`rotate(45 ${bcx} ${btnY})`}
                        fill={P.core.bright} opacity=".3" />
                      {/* Ember particles */}
                      <circle cx={bcx - 14} cy={btnY - 18} r={2} fill="#ff6000" opacity=".55" />
                      <circle cx={bcx + 16} cy={btnY - 14} r={1.5} fill="#ff8030" opacity=".45" />
                      <circle cx={bcx + 4} cy={btnY - 22} r={1.2} fill="#ffa040" opacity=".35" />
                    </>}

                    <text x={bcx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle"
                      fontSize="8" fill={isPressed ? P.core.highlight : "#505860"}
                      fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                  </g>;
                })}

                {/* ── CORNER RIVETS with cross-slot + hammer dents ── */}
                {[[FR + 14, FR + 14], [FR + FR_W - 14, FR + 14], [FR + 14, FR + FR_H - 14], [FR + FR_W - 14, FR + FR_H - 14]].map(([bx, by], i) =>
                  <g key={`b${i}`}>
                    {/* Hammer dent marks near corner */}
                    <circle cx={bx + (i % 2 === 0 ? 10 : -10)} cy={by + (i < 2 ? 6 : -6)} r={1.5} fill="#141820" opacity=".8" />
                    <circle cx={bx + (i % 2 === 0 ? 14 : -14)} cy={by + (i < 2 ? 3 : -3)} r={1} fill="#141820" opacity=".6" />
                    <circle cx={bx + (i % 2 === 0 ? 7 : -7)} cy={by + (i < 2 ? 11 : -11)} r={1.2} fill="#141820" opacity=".5" />
                    {/* Outer rivet body */}
                    <circle cx={bx} cy={by} r={7} fill="#181c22" stroke="#0c1014" strokeWidth="1.2" />
                    <circle cx={bx} cy={by} r={5.5} fill="#1e2430" stroke="#101418" strokeWidth=".8" />
                    <circle cx={bx} cy={by} r={3.5} fill="#262e3c" />
                    {/* Prominent cross engraving */}
                    <line x1={bx - 3} y1={by} x2={bx + 3} y2={by} stroke="#0e1216" strokeWidth="1.2" />
                    <line x1={bx} y1={by - 3} x2={bx} y2={by + 3} stroke="#0e1216" strokeWidth="1.2" />
                    {/* Highlight dot */}
                    <circle cx={bx - 1} cy={by - 1} r={1} fill="#404858" opacity=".6" />
                  </g>
                )}

                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6" fill="#504838"
                  fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">FORGE GEAR</text>
              </svg>
            </div>
          );
        })()}
        <div style={{ fontSize: 9, color: P.textDim, textAlign: "center", marginTop: 5 }}>Press & hold — lanes 2 & 4 · Gap {LANE_GAP}px · Judge at 2×CH from bottom</div>
      </Section>

      {/* Bomb animated player */}
      <Section title="▸ Bomb · Animated Preview" {...uiP}>
        <Row>
          <BombPlayer size={140} BombFrameComp={BombFrame} {...uiP} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 200 }}>
            <div style={{ fontSize: 10, color: P.textDim, lineHeight: 1.8 }}>
              <div style={{ color: P.text, fontWeight: 700, marginBottom: 2 }}>16 Frames @ 60fps</div>
              <div>F0-2 · Flash — white core burst</div>
              <div>F3-5 · Expand — shards spawn, ring appears</div>
              <div>F6-8 · Peak — max radius, full burst</div>
              <div>F9-11 · Scatter — glow recedes, shards fly</div>
              <div>F12-15 · Fade — dissolve to ghost</div>
              <div style={{ marginTop: 4 }}>12 burst rays · 6 metal shards · smoke</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#060408" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const fcx = col * 80 + 40, fcy = row * 80 + 40;
              return <g key={fi}>
                <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#181c20" strokeWidth=".5" />
                <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#302820" fontFamily="'JetBrains Mono', monospace">{fi}</text>
                <BombFrame cx={fcx} cy={fcy} frame={fi} id={`sheet_${fi}`} />
              </g>;
            })}
          </svg>
          <div style={{ fontSize: 9, color: P.textDim }}>8x2 sprite sheet · 80x80px per frame</div>
        </div>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: "#e0c89a", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div><span style={{ color: P.single.bright }}>■</span> Dark Steel &nbsp; <span style={{ color: P.double.bright }}>■</span> Bronze/Copper &nbsp; <span style={{ color: P.core.bright }}>◆</span> Molten Core</div>
        <div>Container: shield pentagon · crosshatch pattern · hammer dimples · ember border</div>
        <div>Core: rune-inscribed diamond · angular markings inside facets</div>
        <div>Gear: iron frame, riveted corners, lane gap {LANE_GAP}px, judge at LANE_BOT - 2xCH</div>
        <div>Bomb: 16F@60fps (~267ms), 12 spark rays, 6 metal polygon shards, smoke circles</div>
      </div>
    </div>
  );
}
