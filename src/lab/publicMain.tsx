/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { PageLoading } from "../shared/components/LoadingSpinner";
import { SONNER_TOASTER_POSITION } from "../shared/toast";
import LabRoutes from "./LabRoutes";
import "../global.css";

const PublicLabGameApp = lazy(() => import("./PublicLabGameApp"));
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function PublicLabApp() {
  return (
    <BrowserRouter basename={basename}>
      <Toaster theme="dark" position={SONNER_TOASTER_POSITION} richColors closeButton />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/lab/*" element={<LabRoutes />} />
          <Route path="/game/*" element={<PublicLabGameApp />} />
          <Route path="*" element={<Navigate to="/lab" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<PublicLabApp />);
