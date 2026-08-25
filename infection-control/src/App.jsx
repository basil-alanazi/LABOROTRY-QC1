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
import StockRequests from "./pages/stock/StockRequests.jsx";
import EmployeeHealth from "./pages/health/EmployeeHealth.jsx";
import CommunicableCases from "./pages/cases/CommunicableCases.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute fullAdminOnly>
              <Layout>
                <DailyEntry />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/records"
          element={
            <ProtectedRoute fullAdminOnly>
              <Layout>
                <Records />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute fullAdminOnly>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute fullAdminOnly>
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
            <ProtectedRoute adminOnly>
              <Layout>
                <EmployeeHealth />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cases"
          element={
            <ProtectedRoute fullAdminOnly>
              <Layout>
                <CommunicableCases />
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
