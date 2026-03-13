import { useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

// ?export 쿼리 파라미터가 있으면 익스포트 모드
if (window.location.search.includes("export")) {
  import("./export.jsx").then(({ default: ExportPage }) => {
    createRoot(document.getElementById("root")).render(<ExportPage />);
  });
} else {
  renderApp();
}

function renderApp() {

const skins = [
  { id: "crystal", name: "Crystal", App: lazy(() => import("./crystal/crystal.jsx")) },
  { id: "abyssal", name: "Abyssal", App: lazy(() => import("./abyssal/abyssal.jsx")) },
  { id: "circuit", name: "Circuit", App: lazy(() => import("./circuit/circuit.jsx")) },
  { id: "sakura", name: "Sakura", App: lazy(() => import("./sakura/sakura.jsx")) },
  { id: "forge", name: "Forge", App: lazy(() => import("./forge/forge.jsx")) },
  { id: "prism", name: "Prism", App: lazy(() => import("./prism/prism.jsx")) },
  { id: "fossil", name: "Fossil", App: lazy(() => import("./fossil/fossil.jsx")) },
];

function Root() {
  const [current, setCurrent] = useState("crystal");
  const skin = skins.find(s => s.id === current);

  return (
    <div>
      {/* Skin tab bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#06070c", borderBottom: "1px solid #181c2a",
        display: "flex", justifyContent: "center", gap: 2,
        padding: "8px 8px 0", flexWrap: "wrap",
      }}>
        {skins.map(s => (
          <button
            key={s.id}
            onClick={() => setCurrent(s.id)}
            style={{
              background: current === s.id ? "#1a1e30" : "transparent",
              color: current === s.id ? "#e2e6f0" : "#4a5068",
              border: "none",
              borderBottom: current === s.id ? "2px solid #ff3060" : "2px solid transparent",
              padding: "6px 14px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              letterSpacing: ".05em",
              transition: "all .15s",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Skin viewer */}
      <Suspense fallback={
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          height: "50vh", color: "#4a5068", fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Loading {skin.name}...
        </div>
      }>
        <skin.App />
      </Suspense>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
}
