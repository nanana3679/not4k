import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './global.css';

const GameApp = lazy(() => import('./game/App').then(m => ({ default: m.GameApp })));
const EditorApp = lazy(() => import('./editor/App').then(m => ({ default: m.EditorApp })));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',backgroundColor:'#1a1a1a',color:'#888' }}>Loading...</div>}>
        <Routes>
          <Route path="/game/*" element={<GameApp />} />
          <Route path="/editor/*" element={<EditorApp />} />
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// StrictMode disabled: PixiJS WebGL context conflicts with double-mount
createRoot(document.getElementById('root')!).render(<App />);
