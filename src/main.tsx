/* eslint-disable react-refresh/only-export-components */
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'sonner';
import './global.css';
import { PageLoading } from './shared/components/LoadingSpinner';
import { SONNER_TOASTER_POSITION } from './shared/toast';

const GameApp = lazy(() => import('./game/App'));
const EditorApp = lazy(() => import('./editor/App'));
const GeometricBackgroundTestPage = lazy(() => import('./lab/GeometricBackgroundTestPage'));
const PerspectiveSurfaceGridTestPage = lazy(() => import('./lab/PerspectiveSurfaceGridTestPage'));
const GearLightTestPage = lazy(() => import('./lab/GearLightTestPage'));
function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position={SONNER_TOASTER_POSITION} richColors closeButton />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/game/*" element={<GameApp />} />
          <Route path="/editor/*" element={<EditorApp />} />
          <Route path="/lab/geometric-background" element={<GeometricBackgroundTestPage />} />
          <Route path="/lab/perspective-surface-grid" element={<PerspectiveSurfaceGridTestPage />} />
          <Route path="/lab/gear-light" element={<GearLightTestPage />} />
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById('root')!).render(<App />);
