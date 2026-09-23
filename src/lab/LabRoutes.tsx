import { Routes, Route } from 'react-router-dom';
import { lazy } from 'react';

const GearLightTestPage = lazy(() => import('./GearLightTestPage'));
const GearMeasurePulseTestPage = lazy(() => import('./GearMeasurePulseTestPage'));
const TutorialPatternDiagramTestPage = lazy(() => import('./TutorialPatternDiagramTestPage'));
const JudgmentPlaytestPage = lazy(() => import('./JudgmentPlaytestPage'));
const NoteAssetShowcasePage = lazy(() => import('./NoteAssetShowcasePage'));
const LabIndexPage = lazy(() => import('./LabIndexPage'));
const FlightBackgroundPreviewLabPage = lazy(() => import('./FlightBackgroundPreviewLabPage'));
const FacilityPassagePreviewLabPage = lazy(() => import('./FacilityPassagePreviewLabPage'));

/**
 * 개발 서버와 별도 공개 Lab이 공유하는 시연 라우트.
 * main.tsx에서는 import.meta.env.DEV일 때만 로드하므로
 * 메인 앱 프로덕션 빌드에서는 하위 Lab 페이지까지 번들에서 제외된다.
 */
export default function LabRoutes() {
  return (
    <Routes>
      <Route index element={<LabIndexPage />} />
      <Route path="flight-background-preview" element={<FlightBackgroundPreviewLabPage />} />
      <Route path="facility-passage" element={<FacilityPassagePreviewLabPage />} />
      <Route path="gear-light" element={<GearLightTestPage />} />
      <Route path="gear-measure-pulse" element={<GearMeasurePulseTestPage />} />
      <Route path="tutorial-pattern-diagram" element={<TutorialPatternDiagramTestPage />} />
      <Route path="judgment-playtest" element={<JudgmentPlaytestPage />} />
      <Route path="note-assets" element={<NoteAssetShowcasePage />} />
    </Routes>
  );
}
