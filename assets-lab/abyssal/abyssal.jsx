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
    background: active ? P.accent : "#080c18", color: active ? "#fff" : P.textDim,
    border: `1px solid ${active ? P.accent : P.border}`, padding: "4px 10px",
    fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all .12s",
  });
  const noteProps = { coreSize, coreGap };
  const longProps = { ...noteProps, wireThickness, lineThickness, glowIntensity };

  // 공통 UI prop
  const uiP = { textDim: P.textDim, text: P.text, accent: P.accent, border: P.border, bgCard: P.bgCard };

  return (
    <div style={{
      minHeight: "100vh", background: P.bg, color: P.text,
      fontFamily: "'JetBrains Mono', monospace", padding: "28px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      maxWidth: 600, margin: "0 auto",
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#90b8c8", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ◯ Abyssal Note Assets
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          Deep Ocean Frame · Bioluminescent Key Beam · 16F Bomb · Animated Preview
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
            style={{ ...btn(holdState), background: holdState ? P.core.bright : "#080c18", borderColor: holdState ? P.core.bright : P.border }}>
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

      {/* === GEAR === */}
      <Section title="▸ Gear" {...uiP}>
        {(() => {
          const SVG_W = FIELD_W + GEAR_PAD * 2 + 16;
          const SVG_H = LANE_H + 120;
          const FR = 4;
          const FR_W = SVG_W - FR * 2;
          const FR_H = SVG_H - FR * 2;
          const FLD_X = GEAR_PAD;
          const FLD_R = FLD_X + FIELD_W;

          return (
            <div style={{ background: "#02040a", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  <linearGradient id="keybeam" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#00e8ff" stopOpacity=".22" />
                    <stop offset="25%" stopColor="#00b8d8" stopOpacity=".10" />
                    <stop offset="70%" stopColor="#006080" stopOpacity=".03" />
                    <stop offset="100%" stopColor="#006080" stopOpacity="0" />
                  </linearGradient>
                </defs>

                  {/* === GEAR FRAME — frosted glass bubble === */}
                {/* Outer rounded frame */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} rx={12} ry={12} fill="#0d1a2e" stroke="#1a3a5a" strokeWidth="1.5" />
                {/* Inner frosted bevel */}
                <rect x={FR + 5} y={FR + 5} width={FR_W - 10} height={FR_H - 10} rx={9} ry={9} fill="rgba(10,20,40,0.82)" stroke="rgba(60,140,180,0.12)" strokeWidth="1" />
                {/* Inner glass panel */}
                <rect x={FR + 9} y={FR + 9} width={FR_W - 18} height={FR_H - 18} rx={6} ry={6} fill="#08111e" stroke="rgba(0,200,232,0.07)" strokeWidth=".5" />
                {/* Top highlight — glass sheen */}
                <rect x={FR + 18} y={FR + 6} width={FR_W - 60} height={4} rx={2} ry={2} fill="rgba(100,200,240,0.10)" />

                {/* Coral reef decorations — left edge */}
                {[
                  [FR + 2, 60, 5, 4, "#ff6a5a"],
                  [FR + 1, 80, 3, 3, "#e84a6a"],
                  [FR + 3, 100, 6, 5, "#c03a5a"],
                  [FR + 0, 130, 4, 3, "#ff6a5a"],
                  [FR + 2, 155, 7, 4, "#e84a6a"],
                  [FR + 1, 180, 3, 3, "#c03a5a"],
                  [FR + 3, 210, 5, 4, "#ff6a5a"],
                  [FR + 0, 240, 4, 5, "#e84a6a"],
                  [FR + 2, 270, 6, 3, "#c03a5a"],
                  [FR + 1, 300, 3, 4, "#ff6a5a"],
                  [FR + 3, 330, 5, 3, "#e84a6a"],
                ].map(([ex, ey, erx, ery, ec], i) =>
                  <ellipse key={`coralL${i}`} cx={ex} cy={ey} rx={erx} ry={ery} fill={ec} opacity=".55" />
                )}
                {/* Coral reef decorations — right edge */}
                {[
                  [FR + FR_W - 2, 55, 4, 5, "#e84a6a"],
                  [FR + FR_W - 1, 78, 6, 3, "#ff6a5a"],
                  [FR + FR_W - 3, 105, 3, 4, "#c03a5a"],
                  [FR + FR_W - 0, 128, 5, 3, "#ff6a5a"],
                  [FR + FR_W - 2, 158, 4, 6, "#e84a6a"],
                  [FR + FR_W - 1, 185, 7, 3, "#c03a5a"],
                  [FR + FR_W - 3, 215, 3, 4, "#ff6a5a"],
                  [FR + FR_W - 0, 248, 5, 3, "#e84a6a"],
                  [FR + FR_W - 2, 278, 4, 5, "#c03a5a"],
                  [FR + FR_W - 1, 308, 6, 3, "#ff6a5a"],
                  [FR + FR_W - 3, 338, 3, 4, "#e84a6a"],
                ].map(([ex, ey, erx, ery, ec], i) =>
                  <ellipse key={`coralR${i}`} cx={ex} cy={ey} rx={erx} ry={ery} fill={ec} opacity=".55" />
                )}

                {/* Lane field — dark inset */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#02040a" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#010308" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#010308" strokeWidth="1.5" />

                {/* Lane dividers with bioluminescent dots */}
                {[0, 1, 2, 3, 4].map(i => {
                  const dx = FLD_X + i * LANE_W;
                  const dotPositions = [];
                  for (let dy = LANE_TOP + 15; dy < LANE_BOT - 10; dy += 30) dotPositions.push(dy);
                  return <g key={`div${i}`}>
                    <line x1={dx} y1={LANE_TOP} x2={dx} y2={LANE_BOT} stroke="#0a1220" strokeWidth="1" />
                    {dotPositions.map((dy, j) =>
                      <circle key={j} cx={dx} cy={dy} r={1.2} fill={P.core.bright} opacity=".18" />
                    )}
                  </g>;
                })}

                {/* Key beams — bioluminescent cyan with rising bubbles */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const bcx = lx + LANE_W / 2;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  const bubbles = [
                    [bcx - 18, LANE_BOT - 40, 2.5],
                    [bcx + 10, LANE_BOT - 90, 1.8],
                    [bcx - 5, LANE_BOT - 145, 2.0],
                    [bcx + 20, LANE_BOT - 200, 1.5],
                    [bcx - 22, LANE_BOT - 250, 2.2],
                    [bcx + 5, LANE_BOT - 300, 1.6],
                  ];
                  return <g key={`kb${i}`}>
                    <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam)" />
                    <rect x={bcx - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#keybeam)" opacity=".5" />
                    <ellipse cx={bcx} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill={P.core.bright} opacity=".08" />
                    {bubbles.map(([bx, by, br], j) =>
                      <circle key={j} cx={bx} cy={by} r={br} fill="none" stroke={P.core.bright} strokeWidth=".8" opacity=".22" />
                    )}
                  </g>;
                })}

                {/* Notes */}
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 10} type="single" {...noteProps} />
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 120} type="single" {...noteProps} />
                <LongNote x={noteX(1)} y={JUDGE_Y - 200} bodyH={170} type="single" held={holdState} {...longProps} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 60} type="double" {...noteProps} dimLeft={dimL} dimRight={dimR} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 180} type="double" {...noteProps} />
                <LongNote x={noteX(3)} y={JUDGE_Y - 260} bodyH={230} type="double" held={holdState} {...longProps} dimLeft={dimL} dimRight={dimR} />

                {/* Bomb preview on lane 1 at judgment line */}
                <BombFrame cx={noteX(0) + CW / 2} cy={JUDGE_Y + CH / 2} frame={6} id="gear" />

                {/* JUDGMENT LINE — undulating wave overlay */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="rgba(0,200,232,.12)" strokeWidth="8" />
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke={P.core.mid} strokeWidth="2" opacity=".6" />
                <path
                  d={`M${FLD_X},${JUDGE_Y} Q${FLD_X + 52},${JUDGE_Y - 3} ${FLD_X + 104},${JUDGE_Y} Q${FLD_X + 156},${JUDGE_Y + 3} ${FLD_X + 208},${JUDGE_Y} Q${FLD_X + 260},${JUDGE_Y - 3} ${FLD_X + 312},${JUDGE_Y} Q${FLD_X + 364},${JUDGE_Y + 3} ${FLD_R},${JUDGE_Y}`}
                  fill="none" stroke={P.core.bright} strokeWidth=".8" opacity=".22"
                />
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill="#2a4050" fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* Button dock — frosted glass panel */}
                <rect x={FR + 9} y={LANE_BOT + 4} width={FR_W - 18} height={SVG_H - LANE_BOT - FR - 10} rx={6} ry={6} fill="rgba(14,24,44,0.90)" stroke="rgba(0,200,232,0.08)" strokeWidth="1" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 18} rx={4} ry={4} fill="rgba(10,18,34,0.70)" stroke="rgba(30,60,90,0.4)" strokeWidth=".5" />
                {/* Frosted glass sheen on dock */}
                <rect x={FR + 16} y={LANE_BOT + 6} width={FR_W - 50} height={3} rx={1.5} ry={1.5} fill="rgba(80,180,220,0.08)" />

                {/* Connectors (organic curved funnel) + Jellyfish bell Buttons */}
                {[0, 1, 2, 3].map(i => {
                  const cx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 50;
                  const isPressed = holdState && (i === 1 || i === 3);
                  // Organic curved funnel: quadratic bezier taper
                  const funnelPath = `M${laneL},${dockY} Q${cx - 28},${dockY + 10} ${cx - 22},${dockY + 22} L${cx + 22},${dockY + 22} Q${cx + 28},${dockY + 10} ${laneR},${dockY} Z`;
                  // Tentacle lines hanging below button (3 wavy lines)
                  const tentY0 = btnY + 18;
                  const tentacles = [
                    `M${cx - 10},${tentY0} Q${cx - 12},${tentY0 + 7} ${cx - 10},${tentY0 + 14}`,
                    `M${cx},${tentY0} Q${cx + 3},${tentY0 + 7} ${cx},${tentY0 + 14}`,
                    `M${cx + 10},${tentY0} Q${cx + 12},${tentY0 + 7} ${cx + 10},${tentY0 + 14}`,
                  ];
                  return <g key={`btn${i}`}>
                    {/* Organic funnel connector */}
                    <path d={funnelPath} fill={isPressed ? "rgba(30,60,90,0.7)" : "rgba(18,36,60,0.7)"} stroke="rgba(0,200,232,0.10)" strokeWidth=".8" />
                    {/* Translucent funnel overlay */}
                    <path d={funnelPath} fill="rgba(0,200,232,0.03)" />

                    {/* Jellyfish bell — ellipse wider than tall */}
                    <ellipse cx={cx} cy={btnY} rx={28} ry={19} fill="#08111e" stroke="rgba(30,60,100,0.8)" strokeWidth="1" />
                    <ellipse cx={cx} cy={btnY} rx={26} ry={18}
                      fill={isPressed ? "rgba(0,80,120,0.85)" : "rgba(20,40,80,0.80)"}
                      stroke={isPressed ? "rgba(0,200,232,0.55)" : "rgba(40,100,140,0.5)"}
                      strokeWidth="1.5"
                    />
                    {/* Frosted glass dome highlight */}
                    <ellipse cx={cx - 5} cy={btnY - 7} rx={12} ry={5} fill="rgba(120,220,255,0.07)" />
                    {/* Inner glass ring */}
                    <ellipse cx={cx} cy={btnY} rx={20} ry={13}
                      fill="none"
                      stroke={isPressed ? "rgba(0,200,232,0.22)" : "rgba(40,100,160,0.18)"}
                      strokeWidth="1"
                    />
                    {/* Bioluminescent glow on press */}
                    {isPressed && <>
                      <ellipse cx={cx} cy={btnY} rx={28} ry={19} fill="none" stroke={P.core.glow} strokeWidth="3" opacity=".45" filter="url(#coreGlow)" />
                      <ellipse cx={cx} cy={btnY} rx={22} ry={14} fill={P.core.bright} opacity=".07" />
                    </>}
                    {/* Tentacle lines */}
                    {tentacles.map((d, j) =>
                      <path key={j} d={d} fill="none" stroke={isPressed ? P.core.mid : "rgba(40,80,120,0.5)"} strokeWidth=".9" opacity=".7" />
                    )}
                    <text x={cx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={isPressed ? P.core.bright : "#2a4060"} fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                  </g>;
                })}

                {/* Corner sea anemone clusters */}
                {[
                  [FR + 14, FR + 14],
                  [FR + FR_W - 14, FR + 14],
                  [FR + 14, FR + FR_H - 14],
                  [FR + FR_W - 14, FR + FR_H - 14],
                ].map(([ax, ay], ci) => {
                  const anemoneCircles = [
                    [0, 0, 4, "#ff6a5a"],
                    [-5, -4, 3, "#e84a6a"],
                    [5, -3, 2.5, "#00c8e8"],
                    [-3, 4, 2, "#c03a5a"],
                    [4, 3, 1.8, "#e84a6a"],
                  ];
                  return <g key={`anem${ci}`}>
                    {anemoneCircles.map(([dx, dy, r, c], j) =>
                      <circle key={j} cx={ax + dx} cy={ay + dy} r={r} fill={c} opacity=".5" />
                    )}
                  </g>;
                })}

                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6" fill="#1a3050" fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">ABYSSAL GEAR</text>
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
              <div>F3-5 · Expand — droplets spawn, ring appears</div>
              <div>F6-8 · Peak — max radius, full burst</div>
              <div>F9-11 · Scatter — glow recedes, droplets fly</div>
              <div>F12-15 · Fade — dissolve to ghost</div>
              <div style={{ marginTop: 4 }}>12 tentacle rays · 6 water droplet shards</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#02040a" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const cx = col * 80 + 40, cy = row * 80 + 40;
              return <g key={fi}>
                <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#0a1220" strokeWidth=".5" />
                <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#1a2a3a" fontFamily="'JetBrains Mono', monospace">{fi}</text>
                <BombFrame cx={cx} cy={cy} frame={fi} id={`sheet_${fi}`} />
              </g>;
            })}
          </svg>
          <div style={{ fontSize: 9, color: P.textDim }}>8×2 sprite sheet · 80×80px per frame</div>
        </div>
      </Section>

      {/* Key beam detail */}
      <Section title="▸ Key Beam" {...uiP}>
        <Row>
          <Card label="Off" svgW={50} svgH={120} {...uiP}>
            <rect x={5} y={5} width={40} height={110} fill="#02040a" />
            {[0, 1].map(i => <line key={i} x1={5 + i * 40} y1={5} x2={5 + i * 40} y2={115} stroke="#0a1220" strokeWidth="1" />)}
          </Card>
          <Card label="On" svgW={50} svgH={120} {...uiP}>
            <defs><linearGradient id="kb_d" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#00e8ff" stopOpacity=".22" /><stop offset="25%" stopColor="#00b8d8" stopOpacity=".10" /><stop offset="70%" stopColor="#006080" stopOpacity=".03" /><stop offset="100%" stopColor="#006080" stopOpacity="0" /></linearGradient></defs>
            <rect x={5} y={5} width={40} height={110} fill="#02040a" />
            <rect x={5} y={5} width={40} height={110} fill="url(#kb_d)" />
            <rect x={17} y={30} width={16} height={85} fill="url(#kb_d)" opacity=".5" />
            <ellipse cx={25} cy={112} rx={16} ry={4} fill={P.core.bright} opacity=".10" />
          </Card>
        </Row>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: P.text, fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div><span style={{ color: P.single.bright }}>■</span> Deep Navy Single &nbsp; <span style={{ color: P.double.bright }}>■</span> Abyssal Teal &nbsp; <span style={{ color: P.core.bright }}>◆</span> Bioluminescent Core</div>
        <div>Container: capsule shape · concentric ellipse rings · vertical tentacle lines</div>
        <div>Gear: dark navy frame, lane gap {LANE_GAP}px, judge at LANE_BOT - 2×CH</div>
        <div>Bomb: 16F@60fps (~267ms), 12 tentacle rays, 6 water droplet shards, expanding ring</div>
        <div>Key Beam: bottom-up bioluminescent cyan gradient on pressed lane</div>
      </div>
    </div>
  );
}
