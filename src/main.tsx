import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './global.css';
import { LoadingSpinner } from './shared/components/LoadingSpinner';

const GameApp = lazy(() => import('./game/App'));
const EditorApp = lazy(() => import('./editor/App'));
const TestPage = import.meta.env.DEV
  ? lazy(() => import('./game/screens/test/TestPage'))
  : null;

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/game/*" element={<GameApp />} />
          <Route path="/editor/*" element={<EditorApp />} />
          {TestPage && <Route path="/test" element={<TestPage />} />}
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById('root')!).render(<App />);
