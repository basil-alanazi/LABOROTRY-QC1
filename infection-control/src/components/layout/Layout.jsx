import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Menu,
  Package,
  Settings as SettingsIcon,
  LogOut,
  ShieldPlus,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth.jsx";
import { supabase } from "../../lib/supabaseClient";

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-700"
  }`;

export default function Layout({ children }) {
  const { session, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const navLinks = (
    <>
      {isAdmin && (
        <NavLink to="/" end className={linkClass} onClick={() => setSidebarOpen(false)}>
          <ClipboardList className="h-4 w-4" />
          Daily Checklists
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/records" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <ListChecks className="h-4 w-4" />
          Records
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/dashboard" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/employee-health" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <HeartPulse className="h-4 w-4" />
          Employee Health
        </NavLink>
      )}
      <NavLink to="/stock" className={linkClass} onClick={() => setSidebarOpen(false)}>
        <Package className="h-4 w-4" />
        Stock Requests
      </NavLink>
      {isAdmin && (
        <NavLink to="/settings" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <SettingsIcon className="h-4 w-4" />
          Settings
        </NavLink>
      )}
      <NavLink to="/profile" className={linkClass} onClick={() => setSidebarOpen(false)}>
        <UserCircle className="h-4 w-4" />
        Profile
      </NavLink>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2 text-teal-700">
            <ShieldPlus className="h-6 w-6" />
            <span className="text-lg font-bold">Infection Control</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600 md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{navLinks}</nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-500 hover:text-slate-800 md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden md:block" />
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
        </header>
        {supabase.isMock && (
          <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
            Preview mode — sample data, not connected to a real database. Nothing is saved after a page refresh.
          </div>
        )}
        <main className="flex-1 px-4 py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
