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
    background: active ? P.accent : "#0e0a1c", color: active ? "#fff" : P.textDim,
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e0d8f8", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ✦ Prism Note Assets
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          Holographic Frame · Aurora Key Beam · 16F Rainbow Bomb · Animated Preview
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
            style={{ ...btn(holdState), background: holdState ? P.core.bright : "#0e0a1c", borderColor: holdState ? P.accent : P.border }}>
            {holdState ? "✦ HOLDING" : "✧ PRESS & HOLD"}
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

          // Rounded hexagon path helper — 6 points with small bevel
          const hexPath = (cx, cy, r) => {
            const pts = Array.from({ length: 6 }, (_, i) => {
              const a = (Math.PI / 180) * (60 * i - 30);
              return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
            });
            // Build path with tiny arc at each corner for rounding
            const bevel = r * 0.18;
            let d = "";
            for (let i = 0; i < 6; i++) {
              const prev = pts[(i + 5) % 6];
              const cur = pts[i];
              const next = pts[(i + 1) % 6];
              const dx1 = cur[0] - prev[0], dy1 = cur[1] - prev[1];
              const len1 = Math.hypot(dx1, dy1);
              const dx2 = next[0] - cur[0], dy2 = next[1] - cur[1];
              const len2 = Math.hypot(dx2, dy2);
              const p1 = [cur[0] - dx1 / len1 * bevel, cur[1] - dy1 / len1 * bevel];
              const p2 = [cur[0] + dx2 / len2 * bevel, cur[1] + dy2 / len2 * bevel];
              d += i === 0 ? `M${p1[0].toFixed(2)},${p1[1].toFixed(2)}` : `L${p1[0].toFixed(2)},${p1[1].toFixed(2)}`;
              d += ` Q${cur[0].toFixed(2)},${cur[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
            }
            return d + "Z";
          };

          // 8-pointed star polygon helper
          const starPath = (cx, cy, rOuter, rInner) => {
            const pts = [];
            for (let i = 0; i < 16; i++) {
              const r = i % 2 === 0 ? rOuter : rInner;
              const a = (Math.PI / 180) * (22.5 * i - 90);
              pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
            }
            return pts.join(" ");
          };

          return (
            <div style={{ background: "#06040e", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  {/* Aurora key beam: green → purple → pink */}
                  <linearGradient id="keybeam" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity=".22" />
                    <stop offset="30%" stopColor="#8844ff" stopOpacity=".12" />
                    <stop offset="65%" stopColor="#ff44cc" stopOpacity=".05" />
                    <stop offset="100%" stopColor="#ff44cc" stopOpacity="0" />
                  </linearGradient>
                  {/* Acrylic frame edge rainbow gradients — outer line */}
                  <linearGradient id="frameEdgeTop" x1="0" y1="0" x2="1" y2="0">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.55" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeTop2" x1="0" y1="0" x2="1" y2="0">
                    {[...P.rainbow].reverse().map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.35" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeLeft" x1="0" y1="0" x2="0" y2="1">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.45" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeLeft2" x1="0" y1="0" x2="0" y2="1">
                    {[...P.rainbow].reverse().map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.25" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeRight" x1="0" y1="0" x2="0" y2="1">
                    {[...P.rainbow].reverse().map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.35" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeRight2" x1="0" y1="0" x2="0" y2="1">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.2" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeBot" x1="1" y1="0" x2="0" y2="0">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.4" />
                    ))}
                  </linearGradient>
                  <linearGradient id="frameEdgeBot2" x1="1" y1="0" x2="0" y2="0">
                    {[...P.rainbow].reverse().map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.22" />
                    ))}
                  </linearGradient>
                  {/* Acrylic panel fill */}
                  <linearGradient id="acrylicFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e8e0f4" stopOpacity="0.13" />
                    <stop offset="50%" stopColor="#d0c8f0" stopOpacity="0.09" />
                    <stop offset="100%" stopColor="#c8c0e8" stopOpacity="0.11" />
                  </linearGradient>
                  {/* Button acrylic fill */}
                  <linearGradient id="btnAcrylic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e0d8f8" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#b8b0e0" stopOpacity="0.10" />
                  </linearGradient>
                  {/* CD interference arc gradient */}
                  <linearGradient id="cdArcGrad" x1="0" y1="0" x2="1" y2="1">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.05" />
                    ))}
                  </linearGradient>
                  {/* Judgment line rainbow horizontal */}
                  <linearGradient id="judgeRainbow" x1="0" y1="0" x2="1" y2="0">
                    {P.rainbow.map((c, i) => (
                      <stop key={i} offset={`${Math.round(i * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.85" />
                    ))}
                  </linearGradient>
                  {/* Lane divider gradients — one per lane divider cycling colors */}
                  {[0, 1, 2, 3, 4].map(i => (
                    <linearGradient key={i} id={`divGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                      {[0, 1, 2, 3].map(j => {
                        const ci = (i + j) % P.rainbow.length;
                        return <stop key={j} offset={`${j * 33}%`} stopColor={P.rainbow[ci]} stopOpacity="0.45" />;
                      })}
                    </linearGradient>
                  ))}
                  {/* Button holographic ring gradient */}
                  {[0, 1, 2, 3].map(i => (
                    <linearGradient key={i} id={`holoRing${i}`} x1="0" y1="0" x2="1" y2="1">
                      {P.rainbow.map((c, j) => (
                        <stop key={j} offset={`${Math.round(j * 100 / (P.rainbow.length - 1))}%`} stopColor={c} stopOpacity="0.5" />
                      ))}
                    </linearGradient>
                  ))}
                </defs>

                {/* Gear frame — holographic translucent acrylic */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="url(#acrylicFill)" />

                {/* Double-line rainbow frame borders — outer line */}
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke="url(#frameEdgeTop)" strokeWidth="2" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke="url(#frameEdgeLeft)" strokeWidth="2" />
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="url(#frameEdgeBot)" strokeWidth="2" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="url(#frameEdgeRight)" strokeWidth="2" />
                {/* Double-line rainbow frame borders — inner line (2px gap) */}
                <line x1={FR + 3} y1={FR + 3} x2={FR + FR_W - 3} y2={FR + 3} stroke="url(#frameEdgeTop2)" strokeWidth="1" />
                <line x1={FR + 3} y1={FR + 3} x2={FR + 3} y2={FR + FR_H - 3} stroke="url(#frameEdgeLeft2)" strokeWidth="1" />
                <line x1={FR + 3} y1={FR + FR_H - 3} x2={FR + FR_W - 3} y2={FR + FR_H - 3} stroke="url(#frameEdgeBot2)" strokeWidth="1" />
                <line x1={FR + FR_W - 3} y1={FR + 3} x2={FR + FR_W - 3} y2={FR + FR_H - 3} stroke="url(#frameEdgeRight2)" strokeWidth="1" />

                {/* Inner acrylic layers */}
                <rect x={FR + 4} y={FR + 4} width={FR_W - 8} height={FR_H - 8} fill="#d4ccee" fillOpacity="0.06" />
                <rect x={FR + 8} y={FR + 8} width={FR_W - 16} height={FR_H - 16} fill="#c8c0e8" fillOpacity="0.05" stroke="rgba(180,160,255,0.12)" strokeWidth=".5" />

                {/* Holographic shimmer bands — thin horizontal rects at different y positions */}
                <rect x={FR} y={FR + FR_H * 0.12} width={FR_W} height={3} fill={P.rainbow[0]} fillOpacity="0.06" />
                <rect x={FR} y={FR + FR_H * 0.31} width={FR_W} height={2} fill={P.rainbow[2]} fillOpacity="0.05" />
                <rect x={FR} y={FR + FR_H * 0.55} width={FR_W} height={3} fill={P.rainbow[4]} fillOpacity="0.07" />
                <rect x={FR} y={FR + FR_H * 0.78} width={FR_W} height={2} fill={P.rainbow[6]} fillOpacity="0.04" />

                {/* CD interference pattern — concentric arcs centered at top-right corner */}
                {[40, 70, 100, 130, 160, 200].map((r, i) => {
                  const arcX = FR + FR_W;
                  const arcY = FR;
                  // Quarter-circle arc sweeping left and down
                  const x1 = arcX - r;
                  const y2 = arcY + r;
                  return (
                    <path key={i}
                      d={`M${x1},${arcY} A${r},${r} 0 0,1 ${arcX},${y2}`}
                      fill="none" stroke="url(#cdArcGrad)" strokeWidth="1.5" opacity={0.05 + i * 0.01}
                    />
                  );
                })}

                {/* Lane field — dark inset */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#04020c" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#080418" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#080418" strokeWidth="1.5" />

                {/* Lane dividers — spectrum gradient */}
                {[0, 1, 2, 3, 4].map(i => (
                  <line key={i} x1={FLD_X + i * LANE_W} y1={LANE_TOP} x2={FLD_X + i * LANE_W} y2={LANE_BOT}
                    stroke={`url(#divGrad${i})`} strokeWidth="0.8" />
                ))}

                {/* Key beams — aurora colors with wave curves */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  const mid = lx + LANE_W / 2;
                  const beamTop = LANE_TOP;
                  const beamBot = LANE_BOT;
                  const beamH = beamBot - beamTop;
                  // Aurora wave curves: sine-like S-curves using cubic bezier
                  return <g key={`kb${i}`}>
                    <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam)" />
                    <rect x={mid - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#keybeam)" opacity=".5" />
                    <ellipse cx={mid} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill="#88ffcc" opacity=".08" />
                    {/* Aurora wave 1 — green */}
                    <path
                      d={`M${mid - 8},${beamBot} C${mid + 10},${beamBot - beamH * 0.25} ${mid - 12},${beamBot - beamH * 0.5} ${mid + 8},${beamTop}`}
                      fill="none" stroke="#00ff88" strokeWidth="1.5" opacity="0.07"
                    />
                    {/* Aurora wave 2 — purple */}
                    <path
                      d={`M${mid + 6},${beamBot} C${mid - 10},${beamBot - beamH * 0.3} ${mid + 14},${beamBot - beamH * 0.6} ${mid - 6},${beamTop}`}
                      fill="none" stroke="#8844ff" strokeWidth="1.5" opacity="0.08"
                    />
                    {/* Aurora wave 3 — pink */}
                    <path
                      d={`M${mid},${beamBot} C${mid + 8},${beamBot - beamH * 0.4} ${mid - 10},${beamBot - beamH * 0.7} ${mid + 4},${beamTop}`}
                      fill="none" stroke="#ff44cc" strokeWidth="1" opacity="0.06"
                    />
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

                {/* JUDGMENT LINE — rainbow spectrum */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="rgba(180,160,255,.12)" strokeWidth="8" />
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="url(#judgeRainbow)" strokeWidth="1.5" opacity=".8" />
                {/* Prismatic split lines above and below */}
                <line x1={FLD_X} y1={JUDGE_Y - 2} x2={FLD_R} y2={JUDGE_Y - 2} stroke="#00ffcc" strokeWidth="0.6" opacity=".2" />
                <line x1={FLD_X} y1={JUDGE_Y + 2} x2={FLD_R} y2={JUDGE_Y + 2} stroke="#ff44cc" strokeWidth="0.6" opacity=".2" />
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill="#504870" fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* Button dock — acrylic panel */}
                <rect x={FR + 8} y={LANE_BOT + 4} width={FR_W - 16} height={SVG_H - LANE_BOT - FR - 8} fill="url(#btnAcrylic)" stroke="rgba(180,160,255,0.15)" strokeWidth=".5" />
                <line x1={FR + 8} y1={LANE_BOT + 4} x2={FR + FR_W - 8} y2={LANE_BOT + 4} stroke="rgba(160,140,240,0.3)" strokeWidth="1.5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 14} fill="rgba(200,180,255,0.05)" stroke="rgba(160,140,220,0.2)" strokeWidth=".5" />

                {/* Connectors + Buttons */}
                {[0, 1, 2, 3].map(i => {
                  const cx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 44;
                  const isPressed = holdState && (i === 1 || i === 3);
                  const rainbowColor = P.rainbow[i * 2 % P.rainbow.length];
                  // Prism facet division points
                  const facetL2 = laneL + (laneR - laneL) * 0.33;
                  const facetR2 = laneL + (laneR - laneL) * 0.67;
                  const botL = cx - 22, botR = cx + 22;
                  const facetColors = [
                    isPressed ? "rgba(180,140,255,0.22)" : "rgba(120,100,200,0.10)",
                    isPressed ? "rgba(140,180,255,0.18)" : "rgba(100,120,200,0.08)",
                    isPressed ? "rgba(180,160,255,0.20)" : "rgba(130,110,210,0.09)",
                  ];
                  return <g key={`btn${i}`}>
                    {/* Prism connector — 3 triangular facets */}
                    <polygon points={`${laneL},${dockY} ${facetL2},${dockY} ${botL},${dockY + 20} ${botL},${dockY + 20}`}
                      fill={facetColors[0]} />
                    <polygon points={`${facetL2},${dockY} ${facetR2},${dockY} ${botR},${dockY + 20} ${botL},${dockY + 20}`}
                      fill={facetColors[1]} />
                    <polygon points={`${facetR2},${dockY} ${laneR},${dockY} ${botR},${dockY + 20}`}
                      fill={facetColors[2]} />
                    {/* Thin white edge lines between facets */}
                    <line x1={facetL2} y1={dockY} x2={botL + (botR - botL) * 0.33} y2={dockY + 20} stroke="rgba(255,255,255,0.12)" strokeWidth=".5" />
                    <line x1={facetR2} y1={dockY} x2={botL + (botR - botL) * 0.67} y2={dockY + 20} stroke="rgba(255,255,255,0.12)" strokeWidth=".5" />
                    {/* Outer connector border */}
                    <polygon points={`${laneL},${dockY} ${laneR},${dockY} ${botR},${dockY + 20} ${botL},${dockY + 20}`}
                      fill="none" stroke="rgba(160,140,220,0.3)" strokeWidth=".5" />
                    <line x1={laneL} y1={dockY} x2={laneR} y2={dockY} stroke={rainbowColor} strokeWidth=".8" opacity=".35" />

                    {/* Button outer dark ring */}
                    <path d={hexPath(cx, btnY, 26)} fill="rgba(30,20,60,0.75)" stroke="rgba(140,120,220,0.25)" strokeWidth="1" />
                    {/* Holographic iridescent ring — dashed rainbow stroke */}
                    <circle cx={cx} cy={btnY} r={24}
                      fill="none"
                      stroke={`url(#holoRing${i})`}
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                      opacity=".6"
                    />
                    {/* Button face — rounded hexagon */}
                    <path d={hexPath(cx, btnY, 21)}
                      fill={isPressed ? "rgba(140,120,240,0.4)" : "rgba(220,210,255,0.12)"}
                      stroke={isPressed ? rainbowColor : "rgba(200,180,255,0.3)"} strokeWidth="1.5" />
                    {/* Specular highlight arc */}
                    {!isPressed && <path d={`M${cx - 14},${btnY - 8} A18,18 0 0,1 ${cx + 14},${btnY - 8}`} fill="none" stroke="rgba(240,230,255,0.45)" strokeWidth="1" />}
                    {isPressed && <path d={`M${cx - 14},${btnY - 8} A18,18 0 0,1 ${cx + 14},${btnY - 8}`} fill="none" stroke="rgba(100,80,180,0.4)" strokeWidth="1" />}

                    {/* 4-star core — each arm tip in a different color */}
                    {/* Top arm — red */}
                    <polygon points={`${cx},${btnY - 8} ${cx + 2.5},${btnY - 1} ${cx - 2.5},${btnY - 1}`}
                      fill={isPressed ? P.core.points[0] : "rgba(255,80,100,0.55)"} />
                    {/* Right arm — green */}
                    <polygon points={`${cx + 8},${btnY} ${cx + 1},${btnY - 2.5} ${cx + 1},${btnY + 2.5}`}
                      fill={isPressed ? P.core.points[1] : "rgba(80,255,160,0.55)"} />
                    {/* Bottom arm — blue */}
                    <polygon points={`${cx},${btnY + 8} ${cx - 2.5},${btnY + 1} ${cx + 2.5},${btnY + 1}`}
                      fill={isPressed ? P.core.points[2] : "rgba(80,160,255,0.55)"} />
                    {/* Left arm — yellow */}
                    <polygon points={`${cx - 8},${btnY} ${cx - 1},${btnY + 2.5} ${cx - 1},${btnY - 2.5}`}
                      fill={isPressed ? P.core.points[3] : "rgba(255,220,80,0.55)"} />
                    {/* Center dot */}
                    <circle cx={cx} cy={btnY} r={2} fill={isPressed ? "white" : "rgba(220,200,255,0.5)"} opacity=".8" />

                    {/* Pressed state — outer glow ring in lane's rainbow color + pulsing star */}
                    {isPressed && <>
                      <circle cx={cx} cy={btnY} r={23} fill="none" stroke={rainbowColor} strokeWidth="3.5" opacity=".45" filter="url(#prismCoreGlow)" />
                      {/* Pulsing star overlay */}
                      <polygon points={`${cx},${btnY - 10} ${cx + 3},${btnY - 1} ${cx + 10},${btnY} ${cx + 3},${btnY + 1} ${cx},${btnY + 10} ${cx - 3},${btnY + 1} ${cx - 10},${btnY} ${cx - 3},${btnY - 1}`}
                        fill="white" opacity=".18" />
                    </>}
                    <text x={cx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8"
                      fill={isPressed ? "rgba(240,230,255,0.9)" : "rgba(140,120,200,0.8)"}
                      fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                  </g>;
                })}

                {/* Corner starburst gems — 8-pointed stars with radiating lines */}
                {[[FR + 12, FR + 12], [FR + FR_W - 12, FR + 12], [FR + 12, FR + FR_H - 12], [FR + FR_W - 12, FR + FR_H - 12]].map(([bx, by], i) => {
                  const c = P.rainbow[i * 2 % P.rainbow.length];
                  const lineLen = 6;
                  return <g key={`b${i}`}>
                    {/* 4 radiating lines at 45deg intervals */}
                    {[0, 45, 90, 135].map(deg => {
                      const rad = deg * Math.PI / 180;
                      const dx = Math.cos(rad), dy = Math.sin(rad);
                      return <g key={deg}>
                        <line x1={bx + dx * 5.5} y1={by + dy * 5.5} x2={bx + dx * (5.5 + lineLen)} y2={by + dy * (5.5 + lineLen)} stroke={c} strokeWidth=".7" opacity=".45" />
                        <line x1={bx - dx * 5.5} y1={by - dy * 5.5} x2={bx - dx * (5.5 + lineLen)} y2={by - dy * (5.5 + lineLen)} stroke={c} strokeWidth=".7" opacity=".45" />
                      </g>;
                    })}
                    {/* 8-pointed star shape */}
                    <polygon points={starPath(bx, by, 5, 2.5)}
                      fill="rgba(30,20,60,0.8)" stroke={c} strokeWidth=".8" opacity=".75" />
                    <polygon points={starPath(bx, by, 3.2, 1.5)} fill={c} opacity=".65" />
                    {/* White center dot */}
                    <circle cx={bx} cy={by} r={1} fill="white" opacity=".7" />
                  </g>;
                })}
                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6" fill="#504870" fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">PRISM GEAR</text>
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
              <div>F3-5 · Expand — star shards spawn, rainbow ring</div>
              <div>F6-8 · Peak — max radius, full rainbow burst</div>
              <div>F9-11 · Scatter — glow recedes, shards fly</div>
              <div>F12-15 · Fade — dissolve to ghost</div>
              <div style={{ marginTop: 4 }}>12 rainbow rays · 6 star shards</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#06040e" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const cx = col * 80 + 40, cy = row * 80 + 40;
              return <g key={fi}>
                <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#100820" strokeWidth=".5" />
                <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#201030" fontFamily="'JetBrains Mono', monospace">{fi}</text>
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
            <rect x={5} y={5} width={40} height={110} fill="#04020c" />
            {[0, 1].map(i => <line key={i} x1={5 + i * 40} y1={5} x2={5 + i * 40} y2={115} stroke="#100820" strokeWidth="1" />)}
          </Card>
          <Card label="On" svgW={50} svgH={120} {...uiP}>
            <defs>
              <linearGradient id="kb_d" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#00ff88" stopOpacity=".22" />
                <stop offset="30%" stopColor="#8844ff" stopOpacity=".12" />
                <stop offset="65%" stopColor="#ff44cc" stopOpacity=".05" />
                <stop offset="100%" stopColor="#ff44cc" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={5} y={5} width={40} height={110} fill="#04020c" />
            <rect x={5} y={5} width={40} height={110} fill="url(#kb_d)" />
            <rect x={17} y={30} width={16} height={85} fill="url(#kb_d)" opacity=".5" />
            <ellipse cx={25} cy={112} rx={16} ry={4} fill="#88ffcc" opacity=".10" />
          </Card>
        </Row>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: "#e0d8f8", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div><span style={{ color: P.single.bright }}>■</span> Violet Spectrum &nbsp; <span style={{ color: P.double.bright }}>■</span> Rose Spectrum &nbsp; <span style={{ color: P.core.bright }}>✦</span> 4-Star Core</div>
        <div>Container: parallelogram (skew 6px) · 7-band spectrum overlay · CD interference shimmer</div>
        <div>Gear: holographic acrylic frame, rainbow edge accents, lane gap {LANE_GAP}px, judge at LANE_BOT - 2×CH</div>
        <div>Bomb: 16F@60fps (~267ms), 12 rainbow burst rays, 6 star shards, expanding rainbow ring</div>
        <div>Key Beam: aurora gradient (green → purple → pink) on pressed lane</div>
      </div>
    </div>
  );
}
