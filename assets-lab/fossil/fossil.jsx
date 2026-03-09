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
    background: active ? P.accent : "#1a1208", color: active ? "#1a1208" : P.textDim,
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#edd9aa", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ☀ Fossil Note Assets
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          Sun Disc Core · Stone Crack Bomb · 16F Bomb · Aztec Meander · Sandstone Gear
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
            style={{ ...btn(holdState), background: holdState ? P.core.bright : "#1a1208", borderColor: holdState ? P.core.bright : P.border, color: holdState ? "#1a1208" : P.textDim }}>
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

          // Meander triangle row helper — alternating up/down triangles along a horizontal band
          const MeanderRow = ({ y, x1, x2, size = 8, opacity = 0.55, color = "#c4986a" }) => {
            const tris = [];
            let x = x1;
            let up = true;
            while (x + size <= x2) {
              const pts = up
                ? `${x},${y + size} ${x + size / 2},${y} ${x + size},${y + size}`
                : `${x},${y} ${x + size / 2},${y + size} ${x + size},${y}`;
              tris.push(<polygon key={x} points={pts} fill={color} opacity={opacity} />);
              x += size;
              up = !up;
            }
            return <g>{tris}</g>;
          };

          // Stepped pyramid connector helper — 3 stacked rects decreasing in width
          const PyramidConnector = ({ cx, topY, botY, topW, isPressed }) => {
            const h = (botY - topY) / 3;
            const fills = isPressed
              ? ["#c8a878", "#b09060", "#987848"]
              : ["#907060", "#806050", "#705040"];
            const widths = [topW, topW * 0.7, topW * 0.45];
            return <g>
              {[0, 1, 2].map(step => {
                const sw = widths[step];
                const sy = topY + step * h;
                return <g key={step}>
                  <rect x={cx - sw / 2} y={sy} width={sw} height={h} fill={fills[step]} stroke="#6a5030" strokeWidth=".5" />
                  <line x1={cx - sw / 2} y1={sy} x2={cx + sw / 2} y2={sy} stroke="#c8b090" strokeWidth=".5" opacity=".5" />
                </g>;
              })}
            </g>;
          };

          // Aztec stone carving corner block
          const AztecCorner = ({ bx, by }) => {
            const blockSize = 18;
            const halfB = blockSize / 2;
            return <g transform={`translate(${bx}, ${by})`}>
              {/* Stone block base */}
              <rect x={-halfB} y={-halfB} width={blockSize} height={blockSize} fill="#8a7050" stroke="#6a5030" strokeWidth="1" />
              {/* Highlight top-left edge */}
              <line x1={-halfB} y1={-halfB} x2={halfB} y2={-halfB} stroke="#c8b090" strokeWidth=".8" opacity=".6" />
              <line x1={-halfB} y1={-halfB} x2={-halfB} y2={halfB} stroke="#c8b090" strokeWidth=".8" opacity=".6" />
              {/* Concentric nested squares — rotated slightly for carving effect */}
              <rect x={-halfB + 3} y={-halfB + 3} width={blockSize - 6} height={blockSize - 6} fill="none" stroke="#c4986a" strokeWidth=".8" transform={`rotate(5 0 0)`} opacity=".7" />
              <rect x={-halfB + 6} y={-halfB + 6} width={blockSize - 12} height={blockSize - 12} fill="none" stroke="#c4986a" strokeWidth=".8" transform={`rotate(10 0 0)`} opacity=".5" />
              <rect x={-halfB + 9} y={-halfB + 9} width={blockSize - 18} height={blockSize - 18} fill="#a08060" stroke="#c4986a" strokeWidth=".5" transform={`rotate(15 0 0)`} opacity=".6" />
            </g>;
          };

          return (
            <div style={{ background: "#120c04", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  {/* Key beam: warm sandy dust tones fading upward */}
                  <linearGradient id="keybeam" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%"   stopColor="#dbb888" stopOpacity=".20" />
                    <stop offset="25%"  stopColor="#c4986a" stopOpacity=".09" />
                    <stop offset="70%"  stopColor="#9a7248" stopOpacity=".02" />
                    <stop offset="100%" stopColor="#9a7248" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* ── STEPPED STONE FRAME (Aztec pyramid profile) ── */}
                {/* Step 1 — outermost layer */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="#c8b090" />
                {/* Step 2 — inset 4px */}
                <rect x={FR + 4} y={FR + 4} width={FR_W - 8} height={FR_H - 8} fill="#b8a080" />
                {/* Step 3 — inset 8px, innermost stone layer */}
                <rect x={FR + 8} y={FR + 8} width={FR_W - 16} height={FR_H - 16} fill="#a09070" />
                {/* Stepped highlight edges — top and left of each step */}
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke="#ddc8a0" strokeWidth="1.5" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke="#ddc8a0" strokeWidth="1.5" />
                <line x1={FR + 4} y1={FR + 4} x2={FR + FR_W - 4} y2={FR + 4} stroke="#d0b888" strokeWidth="1" opacity=".7" />
                <line x1={FR + 4} y1={FR + 4} x2={FR + 4} y2={FR + FR_H - 4} stroke="#d0b888" strokeWidth="1" opacity=".7" />
                <line x1={FR + 8} y1={FR + 8} x2={FR + FR_W - 8} y2={FR + 8} stroke="#c0a878" strokeWidth=".8" opacity=".5" />
                <line x1={FR + 8} y1={FR + 8} x2={FR + 8} y2={FR + FR_H - 8} stroke="#c0a878" strokeWidth=".8" opacity=".5" />
                {/* Shadow edges — bottom and right of each step */}
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="#6a5030" strokeWidth="1.5" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="#6a5030" strokeWidth="1.5" />
                <line x1={FR + 4} y1={FR + FR_H - 4} x2={FR + FR_W - 4} y2={FR + FR_H - 4} stroke="#7a6040" strokeWidth="1" opacity=".7" />
                <line x1={FR + FR_W - 4} y1={FR + 4} x2={FR + FR_W - 4} y2={FR + FR_H - 4} stroke="#7a6040" strokeWidth="1" opacity=".7" />

                {/* Sediment layer texture — geological strata horizontal lines */}
                {[0.15, 0.28, 0.42, 0.61, 0.75, 0.88].map((pct, i) => {
                  const ly = FR + 8 + pct * (FR_H - 16);
                  const shades = ["#c8b090", "#b8a078", "#cbb898", "#a89068", "#bca880", "#d0b888"];
                  return <line key={i} x1={FR + 10} y1={ly} x2={FR + FR_W - 10} y2={ly} stroke={shades[i]} strokeWidth=".8" opacity=".12" />;
                })}

                {/* Meander pattern border — top inner edge */}
                <MeanderRow y={FR + 8} x1={FR + 10} x2={FR + FR_W - 10} size={8} color="#c4986a" opacity={0.5} />
                {/* Meander pattern border — bottom inner edge */}
                <MeanderRow y={FR + FR_H - 16} x1={FR + 10} x2={FR + FR_W - 10} size={8} color="#c4986a" opacity={0.5} />

                {/* ── LANE FIELD — jade/turquoise ── */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#0e2820" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#061410" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#061410" strokeWidth="1.5" />

                {/* Lane dividers — turquoise jade inlay */}
                {[0, 1, 2, 3, 4].map(i => (
                  <line key={i}
                    x1={FLD_X + i * LANE_W} y1={LANE_TOP}
                    x2={FLD_X + i * LANE_W} y2={LANE_BOT}
                    stroke={P.double.deep} strokeWidth="1.5" opacity=".8" />
                ))}

                {/* Key beams — sand column effect with particle bands */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  // particle band y-offsets within the beam (relative to LANE_TOP)
                  const bandOffsets = [0.18, 0.37, 0.58, 0.74];
                  return <g key={`kb${i}`}>
                    <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam)" />
                    <rect x={lx + LANE_W / 2 - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#keybeam)" opacity=".5" />
                    <ellipse cx={lx + LANE_W / 2} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill="#dbb888" opacity=".07" />
                    {/* Sand particle bands — thin horizontal lines simulating falling sand layers */}
                    {bandOffsets.map((off, bi) => (
                      <line key={bi}
                        x1={lx + 2} y1={LANE_TOP + off * LANE_H}
                        x2={lx + LANE_W - 2} y2={LANE_TOP + off * LANE_H}
                        stroke="#dbb888" strokeWidth=".6" opacity=".09" />
                    ))}
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

                {/* ── JUDGMENT LINE — gold band with meander ── */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="rgba(219,184,136,.12)" strokeWidth="10" />
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="#c4986a" strokeWidth="3" opacity=".75" />
                <line x1={FLD_X + FIELD_W * .2} y1={JUDGE_Y} x2={FLD_R - FIELD_W * .2} y2={JUDGE_Y} stroke="#edd9aa" strokeWidth="1.2" opacity=".45" />
                {/* Meander overlay on judgment line */}
                <MeanderRow y={JUDGE_Y - 4} x1={FLD_X + FIELD_W * .15} x2={FLD_R - FIELD_W * .15} size={5} color="#edd9aa" opacity={0.18} />
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill="#7a5a30" fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* ── BUTTON DOCK — sandstone panel ── */}
                <rect x={FR + 8} y={LANE_BOT + 4} width={FR_W - 16} height={SVG_H - LANE_BOT - FR - 8} fill="#b0906a" />
                <line x1={FR + 8} y1={LANE_BOT + 4} x2={FR + FR_W - 8} y2={LANE_BOT + 4} stroke="#6a5030" strokeWidth="1.5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 14} fill="#a08060" stroke="#8a7050" strokeWidth=".5" />

                {/* ── STEPPED PYRAMID CONNECTORS + TRAPEZOIDAL BUTTONS ── */}
                {[0, 1, 2, 3].map(i => {
                  const cx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneW_inner = LANE_W - 8;
                  const dockY = LANE_BOT + 10;
                  const connBot = LANE_BOT + 34;
                  const isPressed = holdState && (i === 1 || i === 3);

                  // Trapezoidal button dimensions
                  const btnCY = LANE_BOT + 70;
                  const btnTopW = 40, btnBotW = 28, btnH = 36;
                  const btnTopY = btnCY - btnH / 2, btnBotY = btnCY + btnH / 2;

                  // Sun disc ray size
                  const rayLen = isPressed ? 10 : 7;
                  const sunR = isPressed ? 7 : 5;
                  const sunFill = isPressed ? P.core.bright : "#9a7248";
                  const sunStroke = isPressed ? P.core.highlight : "#c4986a";

                  return <g key={`btn${i}`}>
                    {/* Stepped pyramid connector */}
                    <PyramidConnector cx={cx} topY={dockY} botY={connBot} topW={laneW_inner} isPressed={isPressed} />

                    {/* Trapezoidal button — stone surround */}
                    <polygon
                      points={`${cx - btnTopW / 2 - 3},${btnTopY - 3} ${cx + btnTopW / 2 + 3},${btnTopY - 3} ${cx + btnBotW / 2 + 3},${btnBotY + 3} ${cx - btnBotW / 2 - 3},${btnBotY + 3}`}
                      fill="#604830" stroke="#4a3618" strokeWidth="1"
                    />
                    {/* Trapezoidal button — face */}
                    <polygon
                      points={`${cx - btnTopW / 2},${btnTopY} ${cx + btnTopW / 2},${btnTopY} ${cx + btnBotW / 2},${btnBotY} ${cx - btnBotW / 2},${btnBotY}`}
                      fill={isPressed ? "#907060" : "#c8a878"}
                      stroke={isPressed ? "#704830" : "#ddb888"}
                      strokeWidth="1.5"
                    />
                    {/* Top bevel highlight */}
                    {!isPressed && <line x1={cx - btnTopW / 2 + 3} y1={btnTopY + 2} x2={cx + btnTopW / 2 - 3} y2={btnTopY + 2} stroke="#edd9aa" strokeWidth=".8" opacity=".5" />}
                    {isPressed && <line x1={cx - btnTopW / 2 + 3} y1={btnTopY + 2} x2={cx + btnTopW / 2 - 3} y2={btnTopY + 2} stroke="#4a3618" strokeWidth=".8" opacity=".4" />}

                    {/* Amber glow when pressed */}
                    {isPressed && (
                      <polygon
                        points={`${cx - btnTopW / 2 - 1},${btnTopY - 1} ${cx + btnTopW / 2 + 1},${btnTopY - 1} ${cx + btnBotW / 2 + 1},${btnBotY + 1} ${cx - btnBotW / 2 - 1},${btnBotY + 1}`}
                        fill="none" stroke={P.core.glow} strokeWidth="3" opacity=".4" filter="url(#coreGlow)"
                      />
                    )}

                    {/* Sun disc receptor — circle with N/S/E/W triangular rays */}
                    <circle cx={cx} cy={btnCY} r={sunR + 2} fill={isPressed ? "#604830" : "#7a5030"} />
                    <circle cx={cx} cy={btnCY} r={sunR} fill={sunFill} stroke={sunStroke} strokeWidth="1" />
                    {/* N ray */}
                    <polygon points={`${cx - 3},${btnCY - sunR - 1} ${cx + 3},${btnCY - sunR - 1} ${cx},${btnCY - sunR - 1 - rayLen}`} fill={sunFill} opacity=".85" />
                    {/* S ray */}
                    <polygon points={`${cx - 3},${btnCY + sunR + 1} ${cx + 3},${btnCY + sunR + 1} ${cx},${btnCY + sunR + 1 + rayLen}`} fill={sunFill} opacity=".85" />
                    {/* E ray */}
                    <polygon points={`${cx + sunR + 1},${btnCY - 3} ${cx + sunR + 1},${btnCY + 3} ${cx + sunR + 1 + rayLen},${btnCY}`} fill={sunFill} opacity=".85" />
                    {/* W ray */}
                    <polygon points={`${cx - sunR - 1},${btnCY - 3} ${cx - sunR - 1},${btnCY + 3} ${cx - sunR - 1 - rayLen},${btnCY}`} fill={sunFill} opacity=".85" />

                    {isPressed && (
                      <circle cx={cx} cy={btnCY} r={sunR + 4} fill="none" stroke={P.core.bright} strokeWidth="1" opacity=".3" filter="url(#coreGlow)" />
                    )}

                    <text x={cx} y={btnBotY + 10} textAnchor="middle" fontSize="7" fill={isPressed ? "#edd9aa" : "#604830"} fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                  </g>;
                })}

                {/* ── AZTEC STONE CARVING CORNERS ── */}
                {[[FR + 13, FR + 13], [FR + FR_W - 13, FR + 13], [FR + 13, FR + FR_H - 13], [FR + FR_W - 13, FR + FR_H - 13]].map(([bx, by], i) =>
                  <AztecCorner key={`c${i}`} bx={bx} by={by} />
                )}

                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6" fill="#7a5a30" fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">FOSSIL GEAR</text>
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
              <div>F0-2 · Flash — golden core burst</div>
              <div>F3-5 · Expand — stone shards spawn, ring appears</div>
              <div>F6-8 · Peak — max radius, crack lines full</div>
              <div>F9-11 · Scatter — dust recedes, shards fly</div>
              <div>F12-15 · Fade — dissolve to ghost</div>
              <div style={{ marginTop: 4 }}>12 crack rays · 6 stone shards · dust cloud</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#120c04" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const cx = col * 80 + 40, cy = row * 80 + 40;
              return <g key={fi}>
                <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#2e2010" strokeWidth=".5" />
                <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#3a2a10" fontFamily="'JetBrains Mono', monospace">{fi}</text>
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
            <rect x={5} y={5} width={40} height={110} fill="#0e2820" />
            {[0, 1].map(i => <line key={i} x1={5 + i * 40} y1={5} x2={5 + i * 40} y2={115} stroke="#143828" strokeWidth="1" />)}
          </Card>
          <Card label="On" svgW={50} svgH={120} {...uiP}>
            <defs>
              <linearGradient id="kb_d" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%"   stopColor="#dbb888" stopOpacity=".20" />
                <stop offset="25%"  stopColor="#c4986a" stopOpacity=".09" />
                <stop offset="70%"  stopColor="#9a7248" stopOpacity=".02" />
                <stop offset="100%" stopColor="#9a7248" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={5} y={5} width={40} height={110} fill="#0e2820" />
            <rect x={5} y={5} width={40} height={110} fill="url(#kb_d)" />
            <rect x={17} y={30} width={16} height={85} fill="url(#kb_d)" opacity=".5" />
            <ellipse cx={25} cy={112} rx={16} ry={4} fill="#dbb888" opacity=".08" />
          </Card>
        </Row>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: "#edd9aa", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div><span style={{ color: P.single.bright }}>■</span> Sandstone Beige &nbsp; <span style={{ color: P.double.bright }}>■</span> Jade Turquoise &nbsp; <span style={{ color: P.core.bright }}>◆</span> Golden Sun Core</div>
        <div>Container: stepped polygon · Aztec meander triangles · 3-layer concentric rect</div>
        <div>Gear: sandstone frame (#c8b090), jade/turquoise lane field, trapezoidal buttons, gap {LANE_GAP}px</div>
        <div>Bomb: 16F@60fps (~267ms), 12 zigzag crack rays, 6 stone shards, dust cloud</div>
        <div>Key Beam: warm sand/dust particle gradient on pressed lane (bottom-up)</div>
      </div>
    </div>
  );
}
