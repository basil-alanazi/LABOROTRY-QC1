import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth.jsx";
import { LanguageProvider } from "./lib/i18n.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/layout/Layout.jsx";
import Login from "./pages/Login.jsx";

// Code-split every page behind login: each one downloads only when its
// route is first visited, instead of all 15 pages (plus xlsx/jspdf) loading
// up front on every login.
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Messages = lazy(() => import("./pages/Messages.jsx"));
const IpcCalendar = lazy(() => import("./pages/IpcCalendar.jsx"));
const StockRequests = lazy(() => import("./pages/stock/StockRequests.jsx"));
const EmployeeHealth = lazy(() => import("./pages/health/EmployeeHealth.jsx"));
const EmployeeProfile = lazy(() => import("./pages/health/EmployeeProfile.jsx"));
const CommunicableCases = lazy(() => import("./pages/cases/CommunicableCases.jsx"));
const ICRounds = lazy(() => import("./pages/ic-rounds/ICRounds.jsx"));
const HandHygiene = lazy(() => import("./pages/hand-hygiene/HandHygiene.jsx"));
const NursingRounds = lazy(() => import("./pages/nursing-rounds/NursingRounds.jsx"));
const QualityRounds = lazy(() => import("./pages/quality-rounds/QualityRounds.jsx"));
const Trackers = lazy(() => import("./pages/trackers/Trackers.jsx"));
const HaiSurveillance = lazy(() => import("./pages/hai/HaiSurveillance.jsx"));

function RouteLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
    <AuthProvider>
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute adminOnly>
              <Navigate to="/ic-rounds" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute hideForRestrictedAccounts>
              <Layout>
                <StockRequests />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-health"
          element={
            <ProtectedRoute employeeHealthOnly>
              <Layout>
                <EmployeeHealth />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/employee-profile/:employeeId" element={<EmployeeProfile />} />
        <Route
          path="/cases"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <CommunicableCases />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ic-rounds"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <ICRounds />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/hand-hygiene"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <HandHygiene />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nursing-rounds"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <NursingRounds />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/quality-rounds"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <QualityRounds />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trackers"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <Trackers />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/hai-surveillance"
          element={
            <ProtectedRoute haiSurveillanceAccess>
              <Layout>
                <HaiSurveillance />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Layout>
                <Messages />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ipc-calendar"
          element={
            <ProtectedRoute>
              <Layout>
                <IpcCalendar />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
    </LanguageProvider>
  );
}
