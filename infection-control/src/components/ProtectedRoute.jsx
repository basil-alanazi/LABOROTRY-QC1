import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import ForceChangePassword from "../pages/ForceChangePassword.jsx";

export default function ProtectedRoute({
  children,
  adminOnly = false,
  employeeHealthOnly = false,
  hideForRestrictedAccounts = false,
  haiSurveillanceAccess = false,
}) {
  const { session, loading, isAdmin, canViewEmployeeHealth, canViewHaiSurveillance } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.mustChangePassword) return <ForceChangePassword />;
  if (adminOnly && !isAdmin) return <Navigate to="/profile" replace />;
  if (employeeHealthOnly && !canViewEmployeeHealth) return <Navigate to="/profile" replace />;
  if (haiSurveillanceAccess && !canViewHaiSurveillance) return <Navigate to="/profile" replace />;
  if (hideForRestrictedAccounts && !isAdmin) {
    if (session.canViewEmployeeHealth) return <Navigate to="/employee-health" replace />;
  }

  return children;
}
