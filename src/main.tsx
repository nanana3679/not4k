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
// Lab 테스트 페이지는 개발 빌드에서만 로드한다.
// 프로덕션에서는 import.meta.env.DEV가 false로 치환되어 삼항이 null이 되고,
// lab import가 dead code로 제거되어 번들·라우트에서 모두 빠진다.
const LabRoutes = import.meta.env.DEV ? lazy(() => import('./lab/LabRoutes')) : null;
function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position={SONNER_TOASTER_POSITION} richColors closeButton />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/game/*" element={<GameApp />} />
          <Route path="/editor/*" element={<EditorApp />} />
          {LabRoutes && <Route path="/lab/*" element={<LabRoutes />} />}
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById('root')!).render(<App />);
