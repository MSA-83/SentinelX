// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/auth/LoginPage";
import { Dashboard } from "@/pages/Dashboard";
import { ThreatIntelPage } from "@/pages/ThreatIntelPage";
import { AssetTrackingPage } from "@/pages/AssetTrackingPage";
import { TimelineReplayPage } from "@/pages/TimelineReplayPage";
import { CaseManagementPage } from "@/pages/CaseManagementPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { ExecutiveSummaryPage } from "@/pages/ExecutiveSummaryPage";
import { WorkspaceManagerPage } from "@/pages/WorkspaceManagerPage";
import { AdminPage } from "@/pages/AdminPage";
import { GeofencePage } from "@/pages/GeofencePage";
import { KnowledgeGraphPage } from "@/pages/KnowledgeGraphPage";
import { SigintPage } from "@/pages/SigintPage";
import { OrbitalGlobePage } from "@/pages/OrbitalGlobePage";
import { NotFound } from "@/pages/NotFound";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-sx-bg">
      <div className="font-mono text-sx-cyan text-sm tracking-[0.3em] animate-pulse">
        AUTHENTICATING...
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/threat" element={<ThreatIntelPage />} />
        <Route path="/assets" element={<AssetTrackingPage />} />
        <Route path="/timeline" element={<TimelineReplayPage />} />
        <Route path="/cases" element={<CaseManagementPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/exec" element={<ExecutiveSummaryPage />} />
        <Route path="/workspaces" element={<WorkspaceManagerPage />} />
        <Route path="/geofences" element={<GeofencePage />} />
        <Route path="/graph" element={<KnowledgeGraphPage />} />
        <Route path="/sigint" element={<SigintPage />} />
        <Route path="/orbital" element={<OrbitalGlobePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0d1424",
              border: "1px solid #1e3a5f",
              color: "#e2e8f0",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "11px",
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
