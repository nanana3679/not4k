import { useState, useEffect, useRef } from "react";

/**
 * 공통 SVG 필터 (코어 글로우)
 */
export function SharedDefs({ glowIntensity = 3 }) {
  return (
    <defs>
      <filter id="coreGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur in="SourceGraphic" stdDeviation={glowIntensity} />
      </filter>
    </defs>
  );
}

/**
 * 뷰어 레이아웃 컴포넌트
 */
export function Section({ title, children, textDim, border }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{
        fontSize: 11, color: textDim, textTransform: "uppercase",
        letterSpacing: ".12em", borderBottom: `1px solid ${border}`,
        paddingBottom: 4, marginBottom: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}>{title}</div>
      {children}
    </div>
  );
}

export function Card({ label, children, svgW = 130, svgH = 55, gi = 3, textDim, border, bgCard }) {
  return (
    <div style={{
      background: bgCard, border: `1px solid ${border}`,
      padding: "10px 12px 8px", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, minWidth: 80,
    }}>
      <div style={{
        fontSize: 9, color: textDim, textTransform: "uppercase",
        letterSpacing: ".1em", fontFamily: "'JetBrains Mono', monospace",
        textAlign: "center",
      }}>{label}</div>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <SharedDefs glowIntensity={gi} />
        {children}
      </svg>
    </div>
  );
}

export function Row({ children }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>{children}</div>;
}

export function Slider({ label, value, onChange, min, max, step = 1, suffix = "", textDim, text, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: textDim, marginBottom: 3 }}>
        {label}: <span style={{ color: text }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: accent }} />
    </div>
  );
}

/**
 * 봄 애니메이션 플레이어 (스킨 무관한 재생 로직)
 * @param {Function} BombFrameComp - 스킨별 BombFrame 컴포넌트
 */
export function BombPlayer({ size = 120, BombFrameComp, textDim, accent, border }) {
  const [frame, setFrame] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const FPS = 60, TOTAL = 16, FRAME_MS = 1000 / FPS;

  useEffect(() => {
    if (!playing) return;
    startRef.current = performance.now();
    const tick = (now) => {
      const elapsed = now - startRef.current;
      const f = Math.floor(elapsed / FRAME_MS);
      if (f >= TOTAL) { setPlaying(false); setFrame(-1); return; }
      setFrame(f);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const half = size / 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ background: "#04060c", border: `1px solid ${border}` }}>
        <SharedDefs glowIntensity={3} />
        {frame >= 0 && <BombFrameComp cx={half} cy={half} frame={frame} id="player" />}
        {frame < 0 && (
          <text x={half} y={half} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill={textDim} fontFamily="'JetBrains Mono', monospace">
            click to play
          </text>
        )}
      </svg>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => { setFrame(0); setPlaying(true); }}
          style={{
            background: accent, color: "#fff", border: "none",
            padding: "5px 14px", fontSize: 10, cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
          {playing ? `F${frame}` : "▶ PLAY"}
        </button>
        <span style={{ fontSize: 9, color: textDim }}>16F · 60fps · ~267ms</span>
      </div>
    </div>
  );
}
