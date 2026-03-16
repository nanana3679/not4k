import { useState } from "react";
import P from "./palette.js";
import { NoteContainer, LongNote, TerminalCap, BombFrame, GearFrameExport, ButtonExport, FailedNoteContainer, FailedBody, FailedTerminalCap, PartialFailedNoteContainer, PartialFailedBody, PartialFailedTerminalCap } from "./components.jsx";
import { CW, CH, GF_W, GF_H, LANE_GAP, LANE_W, GEAR_PAD, FIELD_W, LANE_H, LANE_TOP, LANE_BOT, JUDGE_Y, noteX } from "../shared/constants.js";
import { BOMB_FRAMES } from "../shared/bomb.js";
import { SharedDefs, Section, Card, Row, BombPlayer } from "../shared/ui.jsx";

export default function App() {
  const [holdState, setHoldState] = useState(false);
  const [dimMode, setDimMode] = useState("none");
  const dimL = dimMode === "left", dimR = dimMode === "right";

  const btn = active => ({
    background: active ? P.accent : "#14182a", color: active ? "#fff" : P.textDim,
    border: `1px solid ${active ? P.accent : P.border}`, padding: "4px 10px",
    fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all .12s",
  });

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
          <Card label="Single" {...uiP}><NoteContainer x={15} y={17} type="single" /></Card>
          <Card label="Double" {...uiP}><NoteContainer x={15} y={17} type="double" /></Card>
          <Card label="Term S" svgW={130} svgH={55} {...uiP}><TerminalCap x={15} y={17} type="single" /></Card>
          <Card label="Term D" svgW={130} svgH={55} {...uiP}><TerminalCap x={15} y={17} type="double" /></Card>
        </Row>
      </Section>

      <Section title="▸ Long Notes" {...uiP}>
        <Row>
          <Card label="Sgl Off" svgW={130} svgH={175} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held={false} /></Card>
          <Card label="Sgl Held" svgW={130} svgH={175} {...uiP}><LongNote x={15} y={8} bodyH={107} type="single" held /></Card>
          <Card label="Dbl Off" svgW={130} svgH={175} {...uiP}><LongNote x={15} y={8} bodyH={107} type="double" held={false} dimLeft={dimL} dimRight={dimR} /></Card>
          <Card label="Dbl Held" svgW={130} svgH={175} {...uiP}><LongNote x={15} y={8} bodyH={107} type="double" held dimLeft={dimL} dimRight={dimR} /></Card>
        </Row>
      </Section>

      {/* === GEAR (GearFrameExport) === */}
      <Section title="▸ Gear Frame" {...uiP}>
        {(() => {
          const SCALE = 0.55;
          const BTN_CX_GF = [99, 182, 265, 348];
          const BTN_Y_GF = 838;
          return (
            <div style={{ background: "#02030a", border: `1px solid ${P.border}`, padding: 8, overflow: "hidden", display: "flex", justifyContent: "center" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={GF_W * SCALE} height={GF_H * SCALE} viewBox={`0 0 ${GF_W} ${GF_H}`} style={{ display: "block" }}>
                <SharedDefs />
                <GearFrameExport />
                {/* Buttons */}
                {BTN_CX_GF.map((cx, i) => {
                  const isPressed = holdState && (i === 1 || i === 3);
                  return <ButtonExport key={i} cx={cx} cy={BTN_Y_GF} pressed={isPressed} />;
                })}
              </svg>
            </div>
          );
        })()}
        <div style={{ fontSize: 9, color: P.textDim, textAlign: "center", marginTop: 5 }}>Press & hold — lanes 2 & 4 · GearFrameExport {GF_W}×{GF_H}</div>
      </Section>

      {/* === FAILED STATE === */}
      <Section title="▸ Failed Notes" {...uiP}>
        <Row>
          <Card label="Failed S" {...uiP}><FailedNoteContainer x={15} y={17} type="single" /></Card>
          <Card label="Failed D" {...uiP}><FailedNoteContainer x={15} y={17} type="double" /></Card>
          <Card label="F.Term S" svgW={130} svgH={55} {...uiP}><FailedTerminalCap x={15} y={17} type="single" /></Card>
          <Card label="F.Term D" svgW={130} svgH={55} {...uiP}><FailedTerminalCap x={15} y={17} type="double" /></Card>
        </Row>
        <Row>
          <Card label="F.Body S" svgW={130} svgH={100} {...uiP}><FailedBody x={15} y={5} height={90} type="single" /></Card>
          <Card label="F.Body D" svgW={130} svgH={100} {...uiP}><FailedBody x={15} y={5} height={90} type="double" /></Card>
        </Row>
        <Row>
          <Card label="Partial L" svgW={130} svgH={100} {...uiP}><PartialFailedBody x={15} y={5} height={90} failedSide="left" /></Card>
          <Card label="Partial R" svgW={130} svgH={100} {...uiP}><PartialFailedBody x={15} y={5} height={90} failedSide="right" /></Card>
          <Card label="PF.Term L" svgW={130} svgH={55} {...uiP}><PartialFailedTerminalCap x={15} y={17} failedSide="left" /></Card>
          <Card label="PF.Term R" svgW={130} svgH={55} {...uiP}><PartialFailedTerminalCap x={15} y={17} failedSide="right" /></Card>
        </Row>
        <Row>
          <Card label="PF.Head L" {...uiP}><PartialFailedNoteContainer x={15} y={17} failedSide="left" /></Card>
          <Card label="PF.Head R" {...uiP}><PartialFailedNoteContainer x={15} y={17} failedSide="right" /></Card>
        </Row>
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
            <SharedDefs />
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

      {/* Core Color Compare */}
      <Section title="▸ Core Color Compare" {...uiP}>
        {(() => {
          const options = [
            { name: "Current (0.19)", bright: "#ff3060", mid: "#cc1040", deep: "#8b0028", highlight: "#ff7098", glow: "rgba(255,48,96,0.55)" },
            { name: "Option A (0.14)", bright: "#e84868", mid: "#cc3850", deep: "#9a2838", highlight: "#f08098", glow: "rgba(232,72,104,0.55)" },
            { name: "Option B (0.11)", bright: "#cc5878", mid: "#a84060", deep: "#7a3048", highlight: "#d88898", glow: "rgba(204,88,120,0.55)" },
          ];
          const noteColors = [
            { name: "Single", color: P.single.bright },
            { name: "Double", color: P.double.bright },
          ];
          const sw = (color, size = 24) => ({ width: size, height: size, background: color, border: "1px solid #333", display: "inline-block" });
          const diamond = (color, size = 20) => ({
            width: size, height: size, background: color, border: "1px solid #333",
            transform: "rotate(45deg)", display: "inline-block",
          });
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Note color reference */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div style={{ fontSize: 10, color: P.textDim, width: 80 }}>Notes</div>
                {noteColors.map(n => (
                  <div key={n.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={sw(n.color)} />
                    <span style={{ fontSize: 10, color: P.text }}>{n.name}</span>
                  </div>
                ))}
              </div>
              {/* Core options */}
              {options.map(opt => (
                <div key={opt.name} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: P.textDim, width: 80, flexShrink: 0 }}>{opt.name}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <div style={sw(opt.deep, 20)} title="deep" />
                    <div style={sw(opt.mid, 20)} title="mid" />
                    <div style={sw(opt.bright)} title="bright" />
                    <div style={sw(opt.highlight, 20)} title="highlight" />
                  </div>
                  <div style={{ marginLeft: 8 }}>
                    <svg width={130} height={54} viewBox="0 0 130 54" style={{ display: "block" }}>
                      <SharedDefs />
                      <defs>
                        <linearGradient id={`cmp_ng_${opt.name}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={P.single.bright} />
                          <stop offset="40%" stopColor={P.single.mid} />
                          <stop offset="100%" stopColor={P.single.deep} />
                        </linearGradient>
                      </defs>
                      {/* Note head with this core */}
                      <rect x={0} y={17} width={CW} height={CH} fill={`url(#cmp_ng_${opt.name})`} />
                      {/* Core diamond */}
                      <rect x={CW/2 - 5} y={27 - 5} width={10} height={10}
                        transform={`rotate(45 ${CW/2} 27)`} fill={opt.bright} />
                      <rect x={CW/2 - 5} y={27 - 5} width={10} height={10}
                        transform={`rotate(45 ${CW/2} 27)`} fill="none" stroke={opt.glow} strokeWidth="2" opacity=".6" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
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
