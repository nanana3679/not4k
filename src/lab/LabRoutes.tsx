import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { lazy } from 'react';

const TutorialPatternDiagramTestPage = lazy(() => import('./TutorialPatternDiagramTestPage'));
const JudgmentPlaytestPage = lazy(() => import('./JudgmentPlaytestPage'));
const NoteAssetShowcasePage = lazy(() => import('./NoteAssetShowcasePage'));
const LabIndexPage = lazy(() => import('./LabIndexPage'));
const FlightBackgroundPreviewLabPage = lazy(() => import('./FlightBackgroundPreviewLabPage'));
const FacilityPassagePreviewLabPage = lazy(() => import('./FacilityPassagePreviewLabPage'));
const GearPage = lazy(() => import('./GearPage'));

/** 옛 Lab 주소를 새 경로로 넘긴다(기록을 바꾸는 이동). 쿼리와 해시는 그대로 둔다. */
export function LegacyLabRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

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
      <Route path="gear" element={<GearPage />} />
      {/* #231 전후의 옛 주소. RFD 0029·지난 PR 본문이 이 주소들을 가리키므로 새 주소로 넘긴다(정적 폴더는 만들지 않는다). */}
      <Route path="classic-frame-fit" element={<LegacyLabRedirect to="/lab/gear" />} />
      <Route path="classic-gear" element={<LegacyLabRedirect to="/lab/gear" />} />
      <Route path="tutorial-pattern-diagram" element={<TutorialPatternDiagramTestPage />} />
      <Route path="judgment-playtest" element={<JudgmentPlaytestPage />} />
      <Route path="note-assets" element={<NoteAssetShowcasePage />} />
    </Routes>
  );
}
