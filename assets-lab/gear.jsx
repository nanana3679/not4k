import { SharedDefs } from "./shared/ui.jsx";
import { GF_W, GF_H } from "./shared/constants.js";

import { GearFrameExport as CrystalGear } from "./crystal/components.jsx";
import { GearFrameExport as PrismGear } from "./prism/components.jsx";
import { GearFrameExport as ClassicGear } from "./classic/components.jsx";

const gears = [
  { id: "crystal", name: "Crystal", Component: CrystalGear },
  { id: "prism", name: "Prism", Component: PrismGear },
  { id: "classic", name: "Classic", Component: ClassicGear },
];

const SCALE = 0.5;

export default function GearPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#08060e",
      padding: "20px 10px",
    }}>
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: 16, alignItems: "flex-start",
      }}>
        {gears.map(({ id, name, Component }) => (
          <div key={id} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 11, color: "#a0a8c0", marginBottom: 6,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: ".08em",
            }}>
              {name}
            </div>
            <div style={{
              width: GF_W * SCALE, height: GF_H * SCALE,
              overflow: "hidden",
            }}>
              <svg
                width={GF_W * SCALE} height={GF_H * SCALE}
                viewBox={`0 0 ${GF_W} ${GF_H}`}
                xmlns="http://www.w3.org/2000/svg"
              >
                <SharedDefs glowIntensity={3} />
                <Component />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
