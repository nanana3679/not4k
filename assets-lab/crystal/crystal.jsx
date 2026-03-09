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
    background: active ? P.accent : "#14182a", color: active ? "#fff" : P.textDim,
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e2e6f0", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ◇ Crystal Note Assets v6
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          Chrome Gear · Key Beam · 16F Bomb · Animated Preview
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
            style={{ ...btn(holdState), background: holdState ? P.core.bright : "#14182a", borderColor: holdState ? P.core.bright : P.border }}>
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
            <div style={{ background: "#02030a", border: `1px solid ${P.border}`, padding: 0, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  <linearGradient id="keybeam" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#fff" stopOpacity=".18" />
                    <stop offset="25%" stopColor="#c8d0e0" stopOpacity=".08" />
                    <stop offset="70%" stopColor="#8090b0" stopOpacity=".02" />
                    <stop offset="100%" stopColor="#8090b0" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Gear frame — bright chrome */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="#c8ccd8" />
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke="#e8ecf4" strokeWidth="2" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke="#e8ecf4" strokeWidth="2" />
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="#8890a0" strokeWidth="2" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="#8890a0" strokeWidth="2" />
                <rect x={FR + 4} y={FR + 4} width={FR_W - 8} height={FR_H - 8} fill="#b0b8c8" />
                <rect x={FR + 8} y={FR + 8} width={FR_W - 16} height={FR_H - 16} fill="#a0a8b8" stroke="#8890a0" strokeWidth=".5" />

                {/* Lane field — dark inset */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#04060c" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_R} y2={LANE_TOP} stroke="#020408" strokeWidth="1.5" />
                <line x1={FLD_X} y1={LANE_TOP} x2={FLD_X} y2={LANE_BOT} stroke="#020408" strokeWidth="1.5" />

                {/* Lane dividers */}
                {[0, 1, 2, 3, 4].map(i => <line key={i} x1={FLD_X + i * LANE_W} y1={LANE_TOP} x2={FLD_X + i * LANE_W} y2={LANE_BOT} stroke="#101420" strokeWidth="1" />)}

                {/* Key beams */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  return <g key={`kb${i}`}>
                    <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#keybeam)" />
                    <rect x={lx + LANE_W / 2 - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#keybeam)" opacity=".5" />
                    <ellipse cx={lx + LANE_W / 2} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={5} fill="white" opacity=".06" />
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

                {/* JUDGMENT LINE */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="rgba(255,255,255,.1)" strokeWidth="8" />
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="#e0e4ec" strokeWidth="2" opacity=".7" />
                <line x1={FLD_X + FIELD_W * .2} y1={JUDGE_Y} x2={FLD_R - FIELD_W * .2} y2={JUDGE_Y} stroke="#fff" strokeWidth="1" opacity=".4" />
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6" fill="#606870" fontFamily="'JetBrains Mono', monospace">JUDGE</text>

                {/* Button dock */}
                <rect x={FR + 8} y={LANE_BOT + 4} width={FR_W - 16} height={SVG_H - LANE_BOT - FR - 8} fill="#b8c0d0" />
                <line x1={FR + 8} y1={LANE_BOT + 4} x2={FR + FR_W - 8} y2={LANE_BOT + 4} stroke="#9098a8" strokeWidth="1.5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 14} fill="#a8b0c0" stroke="#9098a8" strokeWidth=".5" />

                {/* Connectors + Buttons */}
                {[0, 1, 2, 3].map(i => {
                  const cx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 44;
                  const isPressed = holdState && (i === 1 || i === 3);
                  return <g key={`btn${i}`}>
                    <polygon points={`${laneL},${dockY} ${laneR},${dockY} ${cx + 22},${dockY + 20} ${cx - 22},${dockY + 20}`} fill={isPressed ? "#c0c8d8" : "#9aa0b0"} stroke="#8890a0" strokeWidth=".5" />
                    <line x1={laneL} y1={dockY} x2={laneR} y2={dockY} stroke="#c8d0d8" strokeWidth=".5" />
                    <circle cx={cx} cy={btnY} r={24} fill="#707880" stroke="#606870" strokeWidth="1" />
                    <circle cx={cx} cy={btnY} r={20} fill={isPressed ? "#8890a0" : "#c0c8d4"} stroke={isPressed ? "#707880" : "#d8dce4"} strokeWidth="1.5" />
                    {!isPressed && <path d={`M${cx - 16},${btnY - 7} A20,20 0 0,1 ${cx + 16},${btnY - 7}`} fill="none" stroke="#e8ecf4" strokeWidth="1" opacity=".6" />}
                    {isPressed && <path d={`M${cx - 16},${btnY - 7} A20,20 0 0,1 ${cx + 16},${btnY - 7}`} fill="none" stroke="#606870" strokeWidth="1" opacity=".5" />}
                    <rect x={cx - 8} y={btnY - 8} width={16} height={16} transform={`rotate(45 ${cx} ${btnY})`} fill={isPressed ? "#707880" : "#a0a8b8"} stroke={isPressed ? "#606870" : "#b8c0cc"} strokeWidth="1.5" />
                    {isPressed && <>
                      <circle cx={cx} cy={btnY} r={22} fill="none" stroke={P.core.glow} strokeWidth="3" opacity=".3" filter="url(#coreGlow)" />
                      <rect x={cx - 6} y={btnY - 6} width={12} height={12} transform={`rotate(45 ${cx} ${btnY})`} fill={P.core.bright} opacity=".2" />
                    </>}
                    <text x={cx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={isPressed ? "#d0d4dc" : "#606870"} fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                  </g>;
                })}

                {/* Corner bolts */}
                {[[FR + 12, FR + 12], [FR + FR_W - 12, FR + 12], [FR + 12, FR + FR_H - 12], [FR + FR_W - 12, FR + FR_H - 12]].map(([bx, by], i) =>
                  <g key={`b${i}`}><circle cx={bx} cy={by} r={4.5} fill="#b8c0cc" stroke="#9098a8" strokeWidth="1" /><circle cx={bx} cy={by} r={2} fill="#d0d8e0" /><circle cx={bx - .8} cy={by - .8} r={.8} fill="#e8ecf4" opacity=".6" /></g>
                )}
                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6" fill="#808890" fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">CRYSTAL GEAR</text>
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
              <div style={{ marginTop: 4 }}>12 burst rays · 6 diamond shards</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#04060c" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const cx = col * 80 + 40, cy = row * 80 + 40;
              return <g key={fi}>
                <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#101420" strokeWidth=".5" />
                <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#2a3040" fontFamily="'JetBrains Mono', monospace">{fi}</text>
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
            <rect x={5} y={5} width={40} height={110} fill="#04060c" />
            {[0, 1].map(i => <line key={i} x1={5 + i * 40} y1={5} x2={5 + i * 40} y2={115} stroke="#101420" strokeWidth="1" />)}
          </Card>
          <Card label="On" svgW={50} svgH={120} {...uiP}>
            <defs><linearGradient id="kb_d" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#fff" stopOpacity=".18" /><stop offset="25%" stopColor="#c8d0e0" stopOpacity=".08" /><stop offset="70%" stopColor="#8090b0" stopOpacity=".02" /><stop offset="100%" stopColor="#8090b0" stopOpacity="0" /></linearGradient></defs>
            <rect x={5} y={5} width={40} height={110} fill="#04060c" />
            <rect x={5} y={5} width={40} height={110} fill="url(#kb_d)" />
            <rect x={17} y={30} width={16} height={85} fill="url(#kb_d)" opacity=".5" />
            <ellipse cx={25} cy={112} rx={16} ry={4} fill="white" opacity=".08" />
          </Card>
        </Row>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: "#e2e6f0", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div><span style={{ color: P.single.bright }}>■</span> Pastel Periwinkle &nbsp; <span style={{ color: P.double.bright }}>■</span> Pastel Butter &nbsp; <span style={{ color: P.core.bright }}>◆</span> Ruby Core</div>
        <div>Container: top→bottom gradient · Terminal: body-style (wire+dimmed line+empty holder)</div>
        <div>Gear: chrome frame, lane gap {LANE_GAP}px, judge at LANE_BOT - 2×CH</div>
        <div>Bomb: 16F@60fps (~267ms), 12 burst rays, 6 diamond shards, expanding ring</div>
        <div>Key Beam: bottom-up light gradient on pressed lane</div>
      </div>
    </div>
  );
}
