import { createRoot } from "react-dom/client";
import { App } from "./App";

// Global CSS reset
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; overflow: hidden; }
`;
document.head.appendChild(style);

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById("root")!).render(<App />);
