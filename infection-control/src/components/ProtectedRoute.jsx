import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import ForceChangePassword from "../pages/ForceChangePassword.jsx";

export default function ProtectedRoute({ children, adminOnly = false, employeeHealthOnly = false, hideForEmployeeHealthOnly = false }) {
  const { session, loading, isAdmin, canViewEmployeeHealth } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.mustChangePassword) return <ForceChangePassword />;
  if (adminOnly && !isAdmin) return <Navigate to="/profile" replace />;
  if (employeeHealthOnly && !canViewEmployeeHealth) return <Navigate to="/profile" replace />;
  if (hideForEmployeeHealthOnly && session.canViewEmployeeHealth && !isAdmin) return <Navigate to="/employee-health" replace />;

  return children;
}
