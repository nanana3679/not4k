import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { withLabPublicBase } from "./labPublicPath";
import "./FlightBackgroundPreviewLabPage.css";

export const facilityPassageFramePath = withLabPublicBase(
  "/__lab/flight-background-preview/flight/breakthrough/study.html?study=passage&altitude=0&paused=1&backdrop=architecture",
);

export default function FacilityPassagePreviewLabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [framePath] = useState(() => {
    const [path, defaults] = facilityPassageFramePath.split("?");
    const params = new URLSearchParams(defaults);
    searchParams.forEach((value, key) => params.set(key, value));
    return `${path}?${params}`;
  });
  const detachFrame = useRef<(() => void) | null>(null);
  useEffect(() => () => detachFrame.current?.(), []);

  function bindSettings(event: SyntheticEvent<HTMLIFrameElement>) {
    detachFrame.current?.();
    const frame = event.currentTarget.contentWindow;
    if (!frame) return;
    const sync = () => setSearchParams(new URLSearchParams(frame.location.search), { replace: true });
    frame.addEventListener("flight-settings-change", sync);
    frame.addEventListener("popstate", sync);
    detachFrame.current = () => {
      frame.removeEventListener("flight-settings-change", sync);
      frame.removeEventListener("popstate", sync);
    };
    sync();
  }

  return (
    <main className="flight-preview-lab" data-lab-page="facility-passage">
      <header>
        <Link className="flight-preview-lab-back" to="/lab" aria-label="Preview Archive로 돌아가기">
          <span aria-hidden="true">←</span> LAB
        </Link>
        <span>Facility Passage Preview</span>
      </header>
      <iframe src={framePath} title="Facility Passage Preview" onLoad={bindSettings} />
    </main>
  );
}
