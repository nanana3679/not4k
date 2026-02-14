import { createRoot } from "react-dom/client";
import "./global.css";
import { App } from "./App";

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById("root")!).render(<App />);
