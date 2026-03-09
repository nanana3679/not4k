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
    background: active ? P.accent : P.bgCard, color: active ? "#fff" : P.textDim,
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e8d8c0", letterSpacing: ".1em", margin: 0, textTransform: "uppercase" }}>
          ✿ Sakura Note Assets
        </h1>
        <p style={{ fontSize: 10, color: P.textDim, marginTop: 6, letterSpacing: ".06em" }}>
          日本伝統 · 水彩 · 桜 — Washi Paper · Enso Holder · Petal Bomb
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
            style={{ ...btn(holdState), background: holdState ? P.core.bright : P.bgCard, borderColor: holdState ? P.core.bright : P.border }}>
            {holdState ? "✿ HOLDING" : "✿ PRESS & HOLD"}
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

          // 벚꽃 5엽 — 코너 장식용 꽃잎 5개를 원형으로 배치
          const CherryBlossom = ({ cx, cy, r = 7 }) => {
            const petalColors = ["#f0c4d0", "#e8aabe", "#f8d8e8", "#e09aaa", "#fae8ed"];
            return (
              <g>
                {[0, 1, 2, 3, 4].map(k => {
                  const angle = (k * 72) - 90;
                  const rad = (angle * Math.PI) / 180;
                  const px = cx + Math.cos(rad) * r;
                  const py = cy + Math.sin(rad) * r;
                  return (
                    <ellipse key={k}
                      cx={px} cy={py} rx={3.5} ry={2.2}
                      fill={petalColors[k]} opacity=".85"
                      transform={`rotate(${angle + 90} ${px} ${py})`} />
                  );
                })}
                {/* 금박 수술 중앙 */}
                <circle cx={cx} cy={cy} r={2} fill={P.core.bright} opacity=".9" />
                <circle cx={cx} cy={cy} r={1} fill={P.core.specular} opacity=".8" />
              </g>
            );
          };

          return (
            <div style={{ background: "#080604", border: `1px solid ${P.border}`, overflow: "hidden" }}
              onMouseDown={() => setHoldState(true)} onMouseUp={() => setHoldState(false)}
              onMouseLeave={() => setHoldState(false)} onTouchStart={() => setHoldState(true)} onTouchEnd={() => setHoldState(false)}>
              <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", margin: "0 auto" }}>
                <SharedDefs glowIntensity={glowIntensity} />
                <defs>
                  {/* 대나무 프레임 그라데이션 */}
                  <linearGradient id="sk_frame_g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6a7a4a" />
                    <stop offset="50%" stopColor="#8a9a5a" />
                    <stop offset="100%" stopColor="#5a6a3a" />
                  </linearGradient>
                  {/* 와시 수채화 오버레이 — 벚꽃 핑크 */}
                  <radialGradient id="sk_washi_wash" cx="50%" cy="50%" r="70%">
                    <stop offset="0%" stopColor="#f0c4d0" stopOpacity=".06" />
                    <stop offset="60%" stopColor="#e09aaa" stopOpacity=".025" />
                    <stop offset="100%" stopColor="#c0607a" stopOpacity="0" />
                  </radialGradient>
                  {/* 키빔 — 벚꽃 따뜻한 빛 */}
                  <linearGradient id="sk_keybeam" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#f8d8e8" stopOpacity=".2" />
                    <stop offset="30%" stopColor="#e8b840" stopOpacity=".06" />
                    <stop offset="70%" stopColor="#c88a20" stopOpacity=".02" />
                    <stop offset="100%" stopColor="#c88a20" stopOpacity="0" />
                  </linearGradient>
                  {/* 버튼 자갈 — 아이들 상태 */}
                  <radialGradient id="sk_btn_idle" cx="38%" cy="32%" r="62%">
                    <stop offset="0%" stopColor="#9aaa88" />
                    <stop offset="55%" stopColor="#6a7a52" />
                    <stop offset="100%" stopColor="#4a5a34" />
                  </radialGradient>
                  {/* 버튼 자갈 — 눌린 상태 (어두워지고 황금빛) */}
                  <radialGradient id="sk_btn_pressed" cx="50%" cy="55%" r="60%">
                    <stop offset="0%" stopColor="#8a6010" />
                    <stop offset="100%" stopColor="#5a3800" />
                  </radialGradient>
                  {/* 버튼 그림자 */}
                  <radialGradient id="sk_btn_shadow" cx="50%" cy="60%" r="55%">
                    <stop offset="0%" stopColor="#000000" stopOpacity=".35" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </radialGradient>
                  {/* 레인 구분선 — 먹붓 그라데이션 */}
                  <linearGradient id="sk_divider" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#201828" stopOpacity="0" />
                    <stop offset="25%" stopColor="#302038" stopOpacity=".9" />
                    <stop offset="75%" stopColor="#302038" stopOpacity=".9" />
                    <stop offset="100%" stopColor="#201828" stopOpacity="0" />
                  </linearGradient>
                  {/* 판정선 금박 패턴용 */}
                  <linearGradient id="sk_judge_glow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={P.core.bright} stopOpacity="0" />
                    <stop offset="20%" stopColor={P.core.bright} stopOpacity=".9" />
                    <stop offset="80%" stopColor={P.core.bright} stopOpacity=".9" />
                    <stop offset="100%" stopColor={P.core.bright} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* ── 대나무 프레임 ── */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="url(#sk_frame_g)" />

                {/* 와시 종이 수채화 오버레이 */}
                <rect x={FR} y={FR} width={FR_W} height={FR_H} fill="url(#sk_washi_wash)" />

                {/* 대나무 마디 — 수평선 + 양쪽 돌출 bump */}
                {[0.2, 0.45, 0.7].map((t, i) => {
                  const ny = FR + FR_H * t;
                  return (
                    <g key={i}>
                      {/* 마디 수평선 */}
                      <line x1={FR} y1={ny} x2={FR + FR_W} y2={ny}
                        stroke="#3a4a1a" strokeWidth="2.5" opacity=".7" />
                      <line x1={FR} y1={ny} x2={FR + FR_W} y2={ny}
                        stroke="#a0b060" strokeWidth=".6" opacity=".3" />
                      {/* 왼쪽 bump — 대나무 마디 돌출 */}
                      <rect x={FR - 2} y={ny - 3} width={5} height={6}
                        rx={1.5} fill="#7a8a4a" stroke="#3a4a1a" strokeWidth=".5" />
                      {/* 오른쪽 bump */}
                      <rect x={FR + FR_W - 3} y={ny - 3} width={5} height={6}
                        rx={1.5} fill="#7a8a4a" stroke="#3a4a1a" strokeWidth=".5" />
                    </g>
                  );
                })}

                {/* 프레임 테두리 선 */}
                {/* 상단 금박 라인 */}
                <line x1={FR} y1={FR} x2={FR + FR_W} y2={FR} stroke={P.core.bright} strokeWidth="1.5" opacity=".85" />
                <line x1={FR} y1={FR} x2={FR} y2={FR + FR_H} stroke="#a0b070" strokeWidth="1" opacity=".6" />
                <line x1={FR} y1={FR + FR_H} x2={FR + FR_W} y2={FR + FR_H} stroke="#3a4a1a" strokeWidth="1.5" />
                <line x1={FR + FR_W} y1={FR} x2={FR + FR_W} y2={FR + FR_H} stroke="#3a4a1a" strokeWidth="1" opacity=".6" />
                <rect x={FR + 4} y={FR + 4} width={FR_W - 8} height={FR_H - 8} fill="#7a8a5a" opacity=".45" />
                <rect x={FR + 8} y={FR + 8} width={FR_W - 16} height={FR_H - 16} fill="#6a7a4a" stroke="#4a5a2a" strokeWidth=".5" opacity=".65" />

                {/* ── 레인 필드 — 먹 검정 ── */}
                <rect x={FLD_X} y={LANE_TOP} width={FIELD_W} height={LANE_H} fill="#08060a" />

                {/* 레인 구분선 — 먹붓 스타일 (그라데이션으로 붓 시작/끝 표현) */}
                {[0, 1, 2, 3, 4].map(i => (
                  <line key={i}
                    x1={FLD_X + i * LANE_W} y1={LANE_TOP}
                    x2={FLD_X + i * LANE_W} y2={LANE_BOT}
                    stroke="url(#sk_divider)" strokeWidth="1.5" />
                ))}

                {/* ── 키빔 ── */}
                {[0, 1, 2, 3].map(i => {
                  const lx = FLD_X + i * LANE_W;
                  const isActive = holdState && (i === 1 || i === 3);
                  if (!isActive) return null;
                  // 키빔 내 벚꽃잎 파티클
                  const petals = [
                    { ox: 8, oy: 40, rx: 4, ry: 2.2, rot: 20, op: 0.09 },
                    { ox: 18, oy: 110, rx: 3, ry: 1.8, rot: -35, op: 0.07 },
                    { ox: 5, oy: 175, rx: 3.5, ry: 2, rot: 55, op: 0.11 },
                    { ox: 20, oy: 70, rx: 2.5, ry: 1.5, rot: -10, op: 0.06 },
                    { ox: 12, oy: 145, rx: 3, ry: 1.8, rot: 40, op: 0.08 },
                  ];
                  return (
                    <g key={`kb${i}`}>
                      <rect x={lx + 1} y={LANE_TOP} width={LANE_W - 2} height={LANE_H} fill="url(#sk_keybeam)" />
                      <rect x={lx + LANE_W / 2 - 14} y={JUDGE_Y - 200} width={28} height={200 + LANE_BOT - JUDGE_Y} fill="url(#sk_keybeam)" opacity=".5" />
                      <ellipse cx={lx + LANE_W / 2} cy={LANE_BOT - 2} rx={LANE_W / 3} ry={4} fill={P.core.bright} opacity=".08" />
                      {/* 벚꽃잎 파티클 */}
                      {petals.map((p, pi) => (
                        <ellipse key={pi}
                          cx={lx + p.ox} cy={LANE_TOP + p.oy}
                          rx={p.rx} ry={p.ry}
                          fill="#f0c4d0" opacity={p.op}
                          transform={`rotate(${p.rot} ${lx + p.ox} ${LANE_TOP + p.oy})`} />
                      ))}
                    </g>
                  );
                })}

                {/* ── Notes ── */}
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 10} type="single" {...noteProps} />
                <NoteContainer x={noteX(0)} y={JUDGE_Y - 120} type="single" {...noteProps} />
                <LongNote x={noteX(1)} y={JUDGE_Y - 200} bodyH={170} type="single" held={holdState} {...longProps} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 60} type="double" {...noteProps} dimLeft={dimL} dimRight={dimR} />
                <NoteContainer x={noteX(2)} y={JUDGE_Y - 180} type="double" {...noteProps} />
                <LongNote x={noteX(3)} y={JUDGE_Y - 260} bodyH={230} type="double" held={holdState} {...longProps} dimLeft={dimL} dimRight={dimR} />

                {/* ── Bomb preview ── */}
                <BombFrame cx={noteX(0) + CW / 2} cy={JUDGE_Y + CH / 2} frame={6} id="gear" />

                {/* ── 판정선 — 금박 리본 ── */}
                {/* 후광 */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke={P.core.glow} strokeWidth="8" opacity=".22" />
                {/* 금박 선 — 그라데이션으로 양끝 페이드 */}
                <line x1={FLD_X} y1={JUDGE_Y} x2={FLD_R} y2={JUDGE_Y} stroke="url(#sk_judge_glow)" strokeWidth="3" />
                {/* 금박 도트 — 30px 간격 */}
                {Array.from({ length: Math.floor(FIELD_W / 30) }, (_, di) => (
                  <circle key={di}
                    cx={FLD_X + di * 30 + 15} cy={JUDGE_Y}
                    r={1.2} fill={P.core.specular} opacity=".6" />
                ))}
                {/* 상단 얇은 금선 */}
                <line x1={FLD_X + FIELD_W * .15} y1={JUDGE_Y} x2={FLD_R - FIELD_W * .15} y2={JUDGE_Y} stroke={P.core.specular} strokeWidth=".8" opacity=".45" />
                {/* 判定 레이블 — 붓글씨 느낌 */}
                <text x={FLD_R + 4} y={JUDGE_Y + 3} fontSize="6"
                  fill={P.core.mid} fontFamily="serif" fontStyle="italic" fontWeight="700"
                  opacity=".9">判定</text>

                {/* ── 버튼 도크 ── */}
                <rect x={FR + 8} y={LANE_BOT + 4} width={FR_W - 16} height={SVG_H - LANE_BOT - FR - 8} fill="#7a8a5a" opacity=".75" />
                <line x1={FR + 8} y1={LANE_BOT + 4} x2={FR + FR_W - 8} y2={LANE_BOT + 4} stroke="#4a5a2a" strokeWidth="1.5" />
                <rect x={FLD_X} y={LANE_BOT + 10} width={FIELD_W} height={SVG_H - LANE_BOT - FR - 14} fill="#6a7a4a" stroke="#4a5a2a" strokeWidth=".5" opacity=".75" />

                {/* ── 도리이 커넥터 + 자갈 버튼 ── */}
                {[0, 1, 2, 3].map(i => {
                  const bcx = FLD_X + LANE_W / 2 + i * LANE_W;
                  const laneL = FLD_X + i * LANE_W + 4, laneR = FLD_X + (i + 1) * LANE_W - 4;
                  const dockY = LANE_BOT + 10, btnY = LANE_BOT + 44;
                  const isPressed = holdState && (i === 1 || i === 3);
                  const connColor = isPressed ? "#b04010" : "#8b2010";
                  const connStroke = isPressed ? "#d05020" : "#6a1808";
                  // 도리이 칫수: 기둥 두께, 빔 높이
                  const postW = 4, postH = 20, beamH = 4;
                  const beamW = laneR - laneL;
                  return (
                    <g key={`btn${i}`}>
                      {/* 도리이 실루엣 커넥터 — 두 기둥 + 상단 빔 */}
                      {/* 왼쪽 기둥 */}
                      <rect x={laneL} y={dockY} width={postW} height={postH}
                        fill={connColor} stroke={connStroke} strokeWidth=".5" />
                      {/* 오른쪽 기둥 */}
                      <rect x={laneR - postW} y={dockY} width={postW} height={postH}
                        fill={connColor} stroke={connStroke} strokeWidth=".5" />
                      {/* 상단 수평 빔 */}
                      <rect x={laneL} y={dockY} width={beamW} height={beamH}
                        fill={connColor} stroke={connStroke} strokeWidth=".5" />
                      {/* 빔 하이라이트 */}
                      <line x1={laneL} y1={dockY + .8} x2={laneL + beamW} y2={dockY + .8}
                        stroke="#e06030" strokeWidth=".7" opacity=".4" />

                      {/* 자갈 돌 그림자 (뒤에 그려서 입체감) */}
                      <ellipse cx={bcx + 1} cy={btnY + 3} rx={26} ry={13}
                        fill="url(#sk_btn_shadow)" />

                      {/* 자갈 버튼 메인 */}
                      <ellipse cx={bcx} cy={btnY} rx={25} ry={22}
                        fill={isPressed ? "url(#sk_btn_pressed)" : "url(#sk_btn_idle)"}
                        stroke={isPressed ? P.core.mid : "#3a4a22"} strokeWidth="1.5" />

                      {/* 하이라이트 스팟들 (아이들 상태만) */}
                      {!isPressed && (<>
                        <ellipse cx={bcx - 5} cy={btnY - 7} rx={9} ry={5.5}
                          fill="white" opacity=".13"
                          transform={`rotate(-18 ${bcx - 5} ${btnY - 7})`} />
                        <ellipse cx={bcx + 7} cy={btnY - 4} rx={4} ry={2.5}
                          fill="white" opacity=".09"
                          transform={`rotate(10 ${bcx + 7} ${btnY - 4})`} />
                        <ellipse cx={bcx - 8} cy={btnY + 4} rx={3} ry={1.8}
                          fill="white" opacity=".07"
                          transform={`rotate(-5 ${bcx - 8} ${btnY + 4})`} />
                      </>)}

                      {/* 눌린 상태 — 황금 글로우 테두리 */}
                      {isPressed && (
                        <ellipse cx={bcx} cy={btnY} rx={28} ry={25}
                          fill="none" stroke={P.core.glow} strokeWidth="3.5" opacity=".4" filter="url(#coreGlow)" />
                      )}

                      {/* 금박 리셉터 */}
                      {isPressed ? (
                        <circle cx={bcx} cy={btnY} r={8}
                          fill={P.core.bright} opacity=".45" filter="url(#coreGlow)" />
                      ) : (
                        <circle cx={bcx} cy={btnY} r={6}
                          fill="none" stroke={P.core.offMid} strokeWidth="1.5" opacity=".6" />
                      )}

                      <text x={bcx} y={btnY + 1} textAnchor="middle" dominantBaseline="middle"
                        fontSize="8" fill={isPressed ? P.core.bright : "#8a9a6a"}
                        fontFamily="'JetBrains Mono', monospace" fontWeight="700">{i + 1}</text>
                    </g>
                  );
                })}

                {/* ── 코너 장식 — 벚꽃 클러스터 ── */}
                {[[FR + 14, FR + 14], [FR + FR_W - 14, FR + 14], [FR + 14, FR + FR_H - 14], [FR + FR_W - 14, FR + FR_H - 14]].map(([bx, by], i) => (
                  <CherryBlossom key={`blossom${i}`} cx={bx} cy={by} r={7} />
                ))}

                <text x={SVG_W / 2} y={SVG_H - 6} textAnchor="middle" fontSize="6"
                  fill={P.textDim} fontFamily="'JetBrains Mono', monospace" letterSpacing=".15em">SAKURA GEAR</text>
              </svg>
            </div>
          );
        })()}
        <div style={{ fontSize: 9, color: P.textDim, textAlign: "center", marginTop: 5 }}>
          Press & hold — lanes 2 & 4 · Gap {LANE_GAP}px · 金 Judge line
        </div>
      </Section>

      {/* Bomb */}
      <Section title="▸ Bomb · Animated Preview" {...uiP}>
        <Row>
          <BombPlayer size={140} BombFrameComp={BombFrame} {...uiP} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 200 }}>
            <div style={{ fontSize: 10, color: P.textDim, lineHeight: 1.8 }}>
              <div style={{ color: P.text, fontWeight: 700, marginBottom: 2 }}>16 Frames @ 60fps</div>
              <div>F0-2 · Flash — 백색 코어 번짐</div>
              <div>F3-5 · Expand — 꽃잎 파편 생성, 링 등장</div>
              <div>F6-8 · Peak — 최대 반경, 먹물 스플래시</div>
              <div>F9-11 · Scatter — 꽃잎 원거리 비산</div>
              <div>F12-15 · Fade — 벚꽃 흩날리며 소멸</div>
              <div style={{ marginTop: 4 }}>12 curved bursts · 6 petal shards · ink splash</div>
            </div>
          </div>
        </Row>
      </Section>

      {/* Bomb sprite sheet */}
      <Section title="▸ Bomb · Sprite Sheet" {...uiP}>
        <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <svg width={640} height={160} viewBox="0 0 640 160">
            <SharedDefs glowIntensity={glowIntensity} />
            <rect width={640} height={160} fill="#08060a" />
            {BOMB_FRAMES.map((_, fi) => {
              const col = fi % 8, row = Math.floor(fi / 8);
              const fcx = col * 80 + 40, fcy = row * 80 + 40;
              return (
                <g key={fi}>
                  <rect x={col * 80} y={row * 80} width={80} height={80} fill="none" stroke="#201828" strokeWidth=".5" />
                  <text x={col * 80 + 3} y={row * 80 + 9} fontSize="7" fill="#3a2a38" fontFamily="'JetBrains Mono', monospace">{fi}</text>
                  <BombFrame cx={fcx} cy={fcy} frame={fi} id={`sheet_${fi}`} />
                </g>
              );
            })}
          </svg>
          <div style={{ fontSize: 9, color: P.textDim }}>8×2 sprite sheet · 80×80px per frame</div>
        </div>
      </Section>

      {/* Spec */}
      <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, padding: "12px 16px", fontSize: 10, color: P.textDim, width: "100%", lineHeight: 2 }}>
        <div style={{ color: "#e8d8c0", fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Spec</div>
        <div>
          <span style={{ color: P.single.bright }}>■</span> 紺色 Kon-iro (Warm Indigo) &nbsp;
          <span style={{ color: P.double.bright }}>■</span> 桜色 Sakura-iro (Cherry Blossom) &nbsp;
          <span style={{ color: P.core.bright }}>✿</span> 金箔 Kinpaku (Gold)
        </div>
        <div>Container: top-rounded rect · washi fiber texture · gold foil top line · petal watermark</div>
        <div>Core: 5-petal flower shape (quadratic bezier petals)</div>
        <div>Holder: Enso 禅 circle (brushstroke feel, slight gap)</div>
        <div>Wire: organic brush-stroke, slightly wavy path</div>
        <div>Bomb: petal shards (rotated ellipses) · curved burst lines · ink splash circles</div>
        <div>Gear: bamboo frame · cobblestone buttons · gold judgment line (判定)</div>
      </div>
    </div>
  );
}
