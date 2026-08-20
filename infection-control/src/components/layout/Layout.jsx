import { NavLink, useNavigate } from "react-router-dom";
import { ClipboardList, LayoutDashboard, ListChecks, Settings as SettingsIcon, LogOut, ShieldPlus } from "lucide-react";
import { useAuth } from "../../lib/auth.jsx";
import { supabase } from "../../lib/supabaseClient";

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-700"
  }`;

export default function Layout({ children }) {
  const { session, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-teal-700">
            <ShieldPlus className="h-6 w-6" />
            <span className="text-lg font-bold">Infection Control</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{session?.displayName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-3">
          <NavLink to="/" end className={linkClass}>
            <ClipboardList className="h-4 w-4" />
            Daily Ward Round
          </NavLink>
          <NavLink to="/records" className={linkClass}>
            <ListChecks className="h-4 w-4" />
            Records
          </NavLink>
          {isAdmin && (
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/settings" className={linkClass}>
              <SettingsIcon className="h-4 w-4" />
              Settings
            </NavLink>
          )}
        </nav>
      </header>
      {supabase.isMock && (
        <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          Preview mode — sample data, not connected to a real database. Nothing is saved after a page refresh.
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
