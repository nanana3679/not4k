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
    background: active ? P.accent : "#050f05",
    color: active ? "#000" : P.textDim,
    border: `1px solid ${active ? P.accent : P.border}`,
    padding: "4px 10px",
    fontSize: 10, cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all .12s",
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: P.accent, letterSpacing: ".15em", margin: 0, textTransform: "uppercase" }}>
          ◈ Circuit Note Assets v1
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          PCB Trace · Neon Chevron · Glitch Bomb · RGB Split
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
            style={{ ...btn(holdState), background: holdState ? P.accent : "#050f05", color: holdState ? "#000" : P.textDim, borderColor: holdState ? P.accent : P.border }}>
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
          <Card label="Sgl Off"  svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held={false} {...longProps} /></Card>
          <Card label="Sgl Held" svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held {...longProps} /></Card>
          <Card label="Dbl Off"  svgW={130} svgH={175} gi={glowIntensity} {...uiP}><LongNote x={15} y={8} bodyH={107} type="double" held={false} {...longProps} dimLeft={dimL} dimRight={dimR} /></Card>
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
            <div style={{ background: "#020902", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  <linearGradient id="keybeam_circuit" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={P.accent} stopOpacity=".22" />
                    <stop offset="30%" stopColor={P.accent} stopOpacity=".08" />
                    <stop offset="70%" stopColor={P.accent} stopOpacity=".02" />
                    <stop offset="100%" stopColor={P.accent} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Gear frame — dark PCB */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="#0a1a0a" />

                {/* Solder mask overlay — subtle green tint */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="rgba(0,80,0,0.03)" />

                {/* PCB trace lines — all 4 edges, alternating colors */}
                {/* Top edge traces */}
                <line x1={FR + 20} y1={FR + 2} x2={FR + 60} y2={FR + 2} stroke={P.single.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR + 70} y1={FR + 2} x2={FR + 110} y2={FR + 2} stroke={P.double.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR_W - 60} y1={FR + 2} x2={FR_W - 20} y2={FR + 2} stroke={P.single.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR_W - 110} y1={FR + 2} x2={FR_W - 70} y2={FR + 2} stroke={P.double.bright} strokeWidth=".6" opacity=".4" />
                {/* Bottom edge traces */}
                <line x1={FR + 20} y1={FR + FR_H - 2} x2={FR + 60} y2={FR + FR_H - 2} stroke={P.double.bright} strokeWidth=".6" opacity=".35" />
                <line x1={FR + 70} y1={FR + FR_H - 2} x2={FR + 110} y2={FR + FR_H - 2} stroke={P.single.bright} strokeWidth=".6" opacity=".35" />
                <line x1={FR_W - 60} y1={FR + FR_H - 2} x2={FR_W - 20} y2={FR + FR_H - 2} stroke={P.double.bright} strokeWidth=".6" opacity=".35" />
                {/* Left edge traces */}
                <line x1={FR + 2} y1={FR + 30} x2={FR + 2} y2={FR + 80} stroke={P.single.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR + 2} y1={FR + 90} x2={FR + 2} y2={FR + 140} stroke={P.double.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR + 2} y1={FR + FR_H - 100} x2={FR + 2} y2={FR + FR_H - 50} stroke={P.single.bright} strokeWidth=".6" opacity=".4" />
                {/* Right edge traces */}
                <line x1={FR + FR_W - 2} y1={FR + 30} x2={FR + FR_W - 2} y2={FR + 80} stroke={P.double.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR + FR_W - 2} y1={FR + 90} x2={FR + FR_W - 2} y2={FR + 140} stroke={P.single.bright} strokeWidth=".6" opacity=".4" />
                <line x1={FR + FR_W - 2} y1={FR + FR_H - 100} x2={FR + FR_W - 2} y2={FR + FR_H - 50} stroke={P.double.bright} strokeWidth=".6" opacity=".4" />

                {/* Frame border rect */}
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke={P.accent} strokeWidth="1.5" opacity=".6" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke={P.accent} strokeWidth="1.5" opacity=".6" />
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="#004400" strokeWidth="1" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="#004400" strokeWidth="1" />
                <rect x={FR + 4} y={FR + 4} width={FR_W - 8} height={FR_H - 8} fill="#060f06" />

                {/* IC chip rectangles on frame border — 3 chips */}
                <rect x={FR + FR_W / 2 - 4} y={FR - 2.5} width={8} height={5} fill={P.single.base} stroke={P.single.bright} strokeWidth=".6" opacity=".7" />
                <rect x={FR + 30} y={FR + FR_H - 2.5} width={8} height={5} fill={P.double.base} stroke={P.double.bright} strokeWidth=".6" opacity=".7" />
                <rect x={FR + FR_W - 38} y={FR + FR_H - 2.5} width={8} height={5} fill={P.single.base} stroke={P.single.bright} strokeWidth=".6" opacity=".7" />

                {/* Via hole grid — bottom frame edge */}
                {Array.from({ length: 12 }, (_, vi) => {
                  const vx = FR + 20 + vi * ((FR_W - 40) / 11);
                  return <circle key={`via_bottom_${vi}`} cx={vx} cy={FR + FR_H - 2} r={1.5} fill="none" stroke={P.via} strokeWidth=".7" opacity=".45" />;
                })}

                {/* CPU/chip modules at corners — 8x8 with pin lines */}
                {[
                  [FR + 10, FR + 10, P.single.bright],
                  [FR + FR_W - 10, FR + 10, P.double.bright],
                  [FR + 10, FR + FR_H - 10, P.double.bright],
                  [FR + FR_W - 10, FR + FR_H - 10, P.single.bright],
                ].map(([cx, cy, col], ci) => (
                  <g key={`cpu${ci}`}>
                    {/* chip body */}
                    <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#060f06" stroke={col} strokeWidth=".8" opacity=".8" />
                    {/* pin lines — top */}
                    {[-2, 0, 2].map((off, pi) => (
                      <line key={`t${pi}`} x1={cx + off} y1={cy - 4} x2={cx + off} y2={cy - 6} stroke={col} strokeWidth=".5" opacity=".6" />
                    ))}
                    {/* pin lines — bottom */}
                    {[-2, 0, 2].map((off, pi) => (
                      <line key={`b${pi}`} x1={cx + off} y1={cy + 4} x2={cx + off} y2={cy + 6} stroke={col} strokeWidth=".5" opacity=".6" />
                    ))}
                    {/* pin lines — left */}
                    {[-2, 0, 2].map((off, pi) => (
                      <line key={`l${pi}`} x1={cx - 4} y1={cy + off} x2={cx - 6} y2={cy + off} stroke={col} strokeWidth=".5" opacity=".6" />
                    ))}
                    {/* pin lines — right */}
                    {[-2, 0, 2].map((off, pi) => (
                      <line key={`r${pi}`} x1={cx + 4} y1={cy + off} x2={cx + 6} y2={cy + off} stroke={col} strokeWidth=".5" opacity=".6" />
                    ))}
                    {/* center dot */}
                    <circle cx={cx} cy={cy} r={1} fill={col} opacity=".5" />
                  </g>
                ))}

                {/* Lane field */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#020902" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#003300" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#003300" strokeWidth="1.5" />

                {/* Lane dividers — dashed PCB trace routing guides */}
                {[0, 1, 2, 3, 4].map(i => (
                  <g key={`div${i}`}>
                    <line x1={FLD_X + i * LANE_W} y1={LANE_TOP} x2={FLD_X + i * LANE_W} y2={LANE_BOT}
                      stroke="#0a1a0a" strokeWidth="1" strokeDasharray="4 3" />
                    {/* Via circle at top and bottom of divider */}
                    <circle cx={FLD_X + i * LANE_W} cy={LANE_TOP} r={1.5} fill="none" stroke={P.via} strokeWidth=".6" opacity=".35" />
                    <circle cx={FLD_X + i * LANE_W} cy={LANE_BOT} r={1.5} fill="none" stroke={P.via} strokeWidth=".6" opacity=".35" />
                  </g>
                ))}

                {/* Key beams (neon green) with data stream effect */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  const dataChars = [
                    { dx: 4,  dy: 40,  ch: "0", op: 0.08 },
                    { dx: 14, dy: 80,  ch: "1", op: 0.06 },
                    { dx: 8,  dy: 130, ch: "0", op: 0.10 },
                    { dx: 18, dy: 170, ch: "1", op: 0.07 },
                    { dx: 6,  dy: 220, ch: "0", op: 0.12 },
                    { dx: 16, dy: 260, ch: "1", op: 0.05 },
                  ];
                  return (
                    <g key={`kb${i}`}>
                      <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam_circuit)" />
                      <rect x={lx + LANE_W / 2 - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#keybeam_circuit)" opacity=".5" />
                      <ellipse cx={lx + LANE_W / 2} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill={P.accent} opacity=".08" />
                      {/* Data stream characters */}
                      {dataChars.map((dc, di) => (
                        <text key={di} x={lx + dc.dx} y={LANE_TOP + dc.dy}
                          fontSize="5" fill={P.accent} opacity={dc.op}
                          fontFamily="'JetBrains Mono', monospace">{dc.ch}</text>
                      ))}
                    </g>
                  );
                })}

                {/* Notes */}
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 10}  type="single" {...noteProps} />
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 120} type="single" {...noteProps} />
                <LongNote x={noteX(1)} y={JUDGE_Y - 200} bodyH={170} type="single" held={holdState} {...longProps} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 60}  type="double" {...noteProps} dimLeft={dimL} dimRight={dimR} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 180} type="double" {...noteProps} />
                <LongNote x={noteX(3)} y={JUDGE_Y - 260} bodyH={230} type="double" held={holdState} {...longProps} dimLeft={dimL} dimRight={dimR} />

                {/* Bomb preview */}
                <BombFrame cx={noteX(0) + CW / 2} cy={JUDGE_Y + CH / 2} frame={6} id="gear" />

                {/* JUDGMENT LINE — neon scan line with CRT artifacts */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke={P.accent} strokeWidth="8" opacity=".12" />
                <line x1={FLD_X} y1={JUDGE_Y - 2} x2={FLD_R} y2={JUDGE_Y - 2} stroke={P.accent} strokeWidth="1" opacity=".15" />
                <line x1={FLD_X} y1={JUDGE_Y + 2} x2={FLD_R} y2={JUDGE_Y + 2} stroke={P.accent} strokeWidth="1" opacity=".15" />
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke={P.accent} strokeWidth="1.5" opacity=".8" />
                <line x1={FLD_X + FIELD_W * .2} y1={JUDGE_Y} x2={FLD_R - FIELD_W * .2} y2={JUDGE_Y} stroke="#fff" strokeWidth="1" opacity=".3" />
                {/* Chevron markers at both ends */}
                <text x={FLD_X - 1} y={JUDGE_Y + 2} fontSize="6" fill={P.accent} opacity=".7" fontFamily="'JetBrains Mono', monospace">{">"}</text>
                <text x={FLD_R - 5} y={JUDGE_Y + 2} fontSize="6" fill={P.accent} opacity=".7" fontFamily="'JetBrains Mono', monospace">{">"}</text>
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill={P.textDim} fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* Button dock — PCB style */}
                <rect x={FR + 8} y={LANE_BOT + 4} width={FR_W - 16} height={SVG_H - LANE_BOT - FR - 8} fill="#060f06" stroke="#004400" strokeWidth=".5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 14} fill="#050d05" stroke="#003300" strokeWidth=".5" />

                {/* Buttons */}
                {[0, 1, 2, 3].map(i => {
                  const bcx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 44;
                  const isPressed = holdState && (i === 1 || i === 3);
                  const btnColor = isPressed ? P.accent : P.single.mid;

                  // Data bus connector — parallel lines from lane width to button width
                  const busLineCount = 4;
                  const srcSpread = (laneR - laneL) / (busLineCount + 1);
                  const dstSpread = 44 / (busLineCount + 1);
                  const busLines = Array.from({ length: busLineCount }, (_, bi) => ({
                    x1: laneL + srcSpread * (bi + 1),
                    x2: bcx - 22 + dstSpread * (bi + 1),
                  }));

                  return (
                    <g key={`btn${i}`}>
                      {/* Data bus connector — parallel ribbon lines */}
                      {busLines.map((bl, bi) => (
                        <g key={`bus${bi}`}>
                          <line x1={bl.x1} y1={dockY} x2={bl.x2} y2={dockY + 20}
                            stroke={bi % 2 === 0 ? P.single.bright : P.double.bright}
                            strokeWidth=".5" opacity=".4" />
                          {/* Terminal dots at endpoints */}
                          <circle cx={bl.x1} cy={dockY} r={1} fill={bi % 2 === 0 ? P.single.bright : P.double.bright} opacity=".5" />
                          <circle cx={bl.x2} cy={dockY + 20} r={1} fill={bi % 2 === 0 ? P.single.bright : P.double.bright} opacity=".5" />
                        </g>
                      ))}
                      <line x1={laneL} y1={dockY} x2={laneR} y2={dockY} stroke={isPressed ? P.single.bright : "#003300"} strokeWidth=".5" />

                      {/* Glitch flicker — offset outline copy when pressed */}
                      {isPressed && (
                        <rect x={bcx - 18 + 1.5} y={btnY - 18 - 1} width={36} height={36}
                          fill="none" stroke="#00ff41" strokeWidth="1" opacity=".35" />
                      )}

                      {/* Square wireframe button */}
                      <rect x={bcx - 18} y={btnY - 18} width={36} height={36}
                        fill={isPressed ? "#001800" : "#020902"} stroke={btnColor} strokeWidth="1.5" />

                      {/* IC pin/leg lines extending from each side */}
                      {/* Top pins */}
                      {[-8, 0, 8].map((off, pi) => (
                        <line key={`tp${pi}`} x1={bcx + off} y1={btnY - 18} x2={bcx + off} y2={btnY - 21}
                          stroke={btnColor} strokeWidth=".8" opacity=".5" />
                      ))}
                      {/* Bottom pins */}
                      {[-8, 0, 8].map((off, pi) => (
                        <line key={`bp${pi}`} x1={bcx + off} y1={btnY + 18} x2={bcx + off} y2={btnY + 21}
                          stroke={btnColor} strokeWidth=".8" opacity=".5" />
                      ))}
                      {/* Left pins */}
                      {[-8, 0, 8].map((off, pi) => (
                        <line key={`lp${pi}`} x1={bcx - 18} y1={btnY + off} x2={bcx - 21} y2={btnY + off}
                          stroke={btnColor} strokeWidth=".8" opacity=".5" />
                      ))}
                      {/* Right pins */}
                      {[-8, 0, 8].map((off, pi) => (
                        <line key={`rp${pi}`} x1={bcx + 18} y1={btnY + off} x2={bcx + 21} y2={btnY + off}
                          stroke={btnColor} strokeWidth=".8" opacity=".5" />
                      ))}

                      {/* Corner brackets */}
                      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],ci) => (
                        <g key={ci}>
                          <line x1={bcx + sx*18} y1={btnY + sy*18} x2={bcx + sx*18 - sx*6} y2={btnY + sy*18} stroke={P.accent} strokeWidth="1.5" opacity={isPressed ? 1 : 0.4} />
                          <line x1={bcx + sx*18} y1={btnY + sy*18} x2={bcx + sx*18} y2={btnY + sy*18 - sy*6} stroke={P.accent} strokeWidth="1.5" opacity={isPressed ? 1 : 0.4} />
                        </g>
                      ))}
                      {/* Inner diamond */}
                      <rect x={bcx - 8} y={btnY - 8} width={16} height={16}
                        transform={`rotate(45 ${bcx} ${btnY})`}
                        fill={isPressed ? P.single.base : "none"} stroke={btnColor} strokeWidth="1" opacity=".8" />
                      {isPressed && (
                        <rect x={bcx - 5} y={btnY - 5} width={10} height={10}
                          transform={`rotate(45 ${bcx} ${btnY})`}
                          fill={P.accent} opacity=".3" filter="url(#coreGlow)" />
                      )}
                      {/* Binary "01" text — low opacity */}
                      <text x={bcx - 8} y={btnY + 16} fontSize="5" fill={btnColor} opacity=".2"
                        fontFamily="'JetBrains Mono', monospace">01</text>
                      {/* Lane number */}
                      <text x={bcx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle"
                        fontSize="9" fill={isPressed ? P.accent : P.textDim}
                        fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                    </g>
                  );
                })}

                {/* Corner via dots — replaced by CPU chip modules above, keep small center dot only */}
                {[[FR + 10, FR + 10], [FR + FR_W - 10, FR + 10], [FR + 10, FR + FR_H - 10], [FR + FR_W - 10, FR + FR_H - 10]].map(([bx, by], i) => (
                  <g key={`v${i}`}>
                    <circle cx={bx} cy={by} r={4} fill="#060f06" stroke={P.via} strokeWidth="1" opacity=".6" />
                    <circle cx={bx} cy={by} r={1.5} fill={P.via} opacity=".5" />
                  </g>
                ))}

                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6"
                  fill={P.textDim} fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">CIRCUIT GEAR</text>
              </svg>
            </div>
          );
        })()}
        <div style={{ fontSize: 9, color: P.textDim, textAlign: "center", marginTop: 5 }}>
          Press & hold — lanes 2 & 4 · Gap {LANE_GAP}px · Judge at 2×CH from bottom
        </div>
      </Section>

      {/* Bomb animated player */}
      <Section title="▸ Bomb · Animated Preview" {...uiP}>
        <Row>
          <BombPlayer size={140} BombFrameComp={BombFrame} {...uiP} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 200 }}>
            <div style={{ fontSize: 10, color: P.textDim, lineHeight: 1.8 }}>
              <div style={{ color: P.text, fontWeight: 700, marginBottom: 2 }}>16 Frames @ 60fps</div>
              <div>F0-2 · Flash — white core burst</div>
              <div>F3-5 · Expand — pixel shards spawn</div>
              <div>F6-8 · Peak — RGB split, ring dashed</div>
              <div>F9-11 · Scatter — glow recedes</div>
              <div>F12-15 · Fade — dissolve to ghost</div>
              <div style={{ marginTop: 4 }}>12 burst rays × 3 RGB layers · 6 pixel shards</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#020902" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const bcx = col * 80 + 40, bcy = row * 80 + 40;
              return (
                <g key={fi}>
                  <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#0a1a0a" strokeWidth=".5" />
                  <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#1a3020" fontFamily="'JetBrains Mono', monospace">{fi}</text>
                  <BombFrame cx={bcx} cy={bcy} frame={fi} id={`sheet_${fi}`} />
                </g>
              );
            })}
          </svg>
          <div style={{ fontSize: 9, color: P.textDim }}>8×2 sprite sheet · 80×80px per frame</div>
        </div>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: P.accent, fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div>
          <span style={{ color: P.single.bright }}>■</span> Neon Green (single) &nbsp;
          <span style={{ color: P.double.bright }}>■</span> Neon Magenta (double) &nbsp;
          <span style={{ color: P.core.bright }}>◆</span> Electric Cyan (core)
        </div>
        <div>Container: hexagonal chevron polygon · PCB trace decorations · via holes</div>
        <div>Core: diamond + binary glitch "01" text ornaments</div>
        <div>Holder: thin wireframe square + L-bracket corners + via center</div>
        <div>Wire: PCB trace channel + periodic via dots</div>
        <div>Gear: dark PCB frame, neon accent judgment line</div>
        <div>Bomb: RGB color separation · pixel shards (no rotation) · dashed ring</div>
        <div>Gear: lane gap {LANE_GAP}px · judge at LANE_BOT - 2×CH</div>
      </div>
    </div>
  );
}
