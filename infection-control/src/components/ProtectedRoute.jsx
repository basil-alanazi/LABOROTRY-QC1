import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import ForceChangePassword from "../pages/ForceChangePassword.jsx";

export default function ProtectedRoute({ children, adminOnly = false, fullAdminOnly = false, hideForEmployeeHealthOnly = false }) {
  const { session, loading, isAdmin, isFullAdmin } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.mustChangePassword) return <ForceChangePassword />;
  if (adminOnly && !isAdmin) return <Navigate to="/profile" replace />;
  if (fullAdminOnly && !isFullAdmin) return <Navigate to={isAdmin ? "/employee-health" : "/profile"} replace />;
  if (hideForEmployeeHealthOnly && session.employeeHealthOnly) return <Navigate to="/employee-health" replace />;

  return children;
}
