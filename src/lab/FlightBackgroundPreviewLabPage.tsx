import { Link } from "react-router-dom";
import "./FlightBackgroundPreviewLabPage.css";

export const flightBackgroundPreviewFramePath = "/__lab/flight-background-preview/";

export default function FlightBackgroundPreviewLabPage() {
  return (
    <main className="flight-preview-lab" data-lab-page="flight-background-preview">
      <header>
        <Link className="flight-preview-lab-back" to="/lab" aria-label="Preview Archive로 돌아가기">
          <span aria-hidden="true">←</span> LAB
        </Link>
        <span>Flight Background Preview</span>
      </header>
      <iframe src={flightBackgroundPreviewFramePath} title="Flight Background Preview" />
    </main>
  );
}
