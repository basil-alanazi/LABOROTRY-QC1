import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import ForceChangePassword from "../pages/ForceChangePassword.jsx";

export default function ProtectedRoute({
  children,
  adminOnly = false,
  employeeHealthOnly = false,
  nursingRoundsOnly = false,
  qualityRoundsOnly = false,
  hideForRestrictedAccounts = false,
}) {
  const { session, loading, isAdmin, canViewEmployeeHealth, canViewNursingRounds, canViewQualityRounds } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.mustChangePassword) return <ForceChangePassword />;
  if (adminOnly && !isAdmin) return <Navigate to="/profile" replace />;
  if (employeeHealthOnly && !canViewEmployeeHealth) return <Navigate to="/profile" replace />;
  if (nursingRoundsOnly && !canViewNursingRounds) return <Navigate to="/profile" replace />;
  if (qualityRoundsOnly && !canViewQualityRounds) return <Navigate to="/profile" replace />;
  if (hideForRestrictedAccounts && !isAdmin) {
    if (session.canViewEmployeeHealth) return <Navigate to="/employee-health" replace />;
    if (session.canViewNursingRounds) return <Navigate to="/nursing-rounds" replace />;
    if (session.canViewQualityRounds) return <Navigate to="/quality-rounds" replace />;
  }

  return children;
}
