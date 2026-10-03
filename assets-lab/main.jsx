import { createRoot } from "react-dom/client";
import ExportPage from "./export.jsx";

// SVG 스킨 PNG 내보내기 화면이다. scripts/build-skins.mjs(pnpm build:skins)가 이 페이지를 열어 캡처한다.
createRoot(document.getElementById("root")).render(<ExportPage />);
