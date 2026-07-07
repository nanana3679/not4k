import { Routes, Route } from 'react-router-dom';
import { lazy } from 'react';

const GeometricBackgroundTestPage = lazy(() => import('./GeometricBackgroundTestPage'));
const PerspectiveSurfaceGridTestPage = lazy(() => import('./PerspectiveSurfaceGridTestPage'));
const GearLightTestPage = lazy(() => import('./GearLightTestPage'));
const GearMeasurePulseTestPage = lazy(() => import('./GearMeasurePulseTestPage'));
const TutorialPatternDiagramTestPage = lazy(() => import('./TutorialPatternDiagramTestPage'));
const JudgmentPlaytestPage = lazy(() => import('./JudgmentPlaytestPage'));

/**
 * 개발 전용 Lab 테스트 페이지 라우트.
 * main.tsx에서 import.meta.env.DEV일 때만 lazy 로드되므로,
 * 프로덕션 빌드에서는 이 파일과 하위 lab 페이지가 번들에서 제외된다.
 */
export default function LabRoutes() {
  return (
    <Routes>
      <Route path="geometric-background" element={<GeometricBackgroundTestPage />} />
      <Route path="perspective-surface-grid" element={<PerspectiveSurfaceGridTestPage />} />
      <Route path="gear-light" element={<GearLightTestPage />} />
      <Route path="gear-measure-pulse" element={<GearMeasurePulseTestPage />} />
      <Route path="tutorial-pattern-diagram" element={<TutorialPatternDiagramTestPage />} />
      <Route path="judgment-playtest" element={<JudgmentPlaytestPage />} />
    </Routes>
  );
}
