import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/layout/Layout.jsx";
import Login from "./pages/Login.jsx";
import DailyEntry from "./pages/DailyEntry.jsx";
import Records from "./pages/Records.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Profile from "./pages/Profile.jsx";
import Messages from "./pages/Messages.jsx";
import StockRequests from "./pages/stock/StockRequests.jsx";
import EmployeeHealth from "./pages/health/EmployeeHealth.jsx";
import CommunicableCases from "./pages/cases/CommunicableCases.jsx";
import ICRounds from "./pages/ic-rounds/ICRounds.jsx";
import Trackers from "./pages/trackers/Trackers.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <DailyEntry />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/records"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <Records />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <Dashboard />
              </Layout>
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
            <ProtectedRoute hideForEmployeeHealthOnly>
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
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
