import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  Droplets,
  FolderClock,
  HeartPulse,
  Languages,
  Menu,
  MessageSquare,
  Package,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  LogOut,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { supabase } from "../../lib/supabaseClient";
import rabiaLogo from "../../assets/rabia-logo.jpg";

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-teal-50 hover:text-teal-700"
  }`;

export default function Layout({ children }) {
  const { session, logout, isAdmin, canViewEmployeeHealth, canViewNursingRounds, canViewQualityRounds, canViewHaiSurveillance } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Powers the "Messages" badge — polled as a fallback, plus a realtime
  // subscription so it updates instantly on a real Supabase backend.
  useEffect(() => {
    if (!session?.username) return;
    let cancelled = false;
    async function loadUnread() {
      const { data } = await supabase.from("messages").select("id").eq("recipient_username", session.username).is("read_at", null);
      if (!cancelled) setUnreadCount((data ?? []).length);
    }
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    let channel;
    if (!supabase.isMock) {
      channel = supabase.channel("layout-messages").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnread).subscribe();
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.username]);

  const navLinks = (
    <>
      {canViewEmployeeHealth && (
        <NavLink to="/employee-health" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <HeartPulse className="h-4 w-4" />
          {t("Employee Health")}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/cases" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <ShieldAlert className="h-4 w-4" />
          {t("Suspected/Confirmed Cases")}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/ic-rounds" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <ClipboardCheck className="h-4 w-4" />
          {t("Daily IC Rounds")}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/hand-hygiene" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Droplets className="h-4 w-4" />
          {t("Hand Hygiene")}
        </NavLink>
      )}
      {canViewNursingRounds && (
        <NavLink to="/nursing-rounds" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <ShieldCheck className="h-4 w-4" />
          {t("Nursing Daily Rounds")}
        </NavLink>
      )}
      {canViewQualityRounds && (
        <NavLink to="/quality-rounds" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Sparkles className="h-4 w-4" />
          {t("Quality Daily Rounds")}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/trackers" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <FolderClock className="h-4 w-4" />
          {t("Trackers")}
        </NavLink>
      )}
      {canViewHaiSurveillance && (
        <NavLink to="/hai-surveillance" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Activity className="h-4 w-4" />
          {t("HAI Surveillance")}
        </NavLink>
      )}
      {(isAdmin || !(session?.canViewEmployeeHealth || session?.canViewNursingRounds || session?.canViewQualityRounds || session?.canViewHaiSurveillance)) && (
        <NavLink to="/stock" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <Package className="h-4 w-4" />
          {t("Stock Requests")}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/settings" className={linkClass} onClick={() => setSidebarOpen(false)}>
          <SettingsIcon className="h-4 w-4" />
          {t("Settings")}
        </NavLink>
      )}
      <NavLink to="/ipc-calendar" className={linkClass} onClick={() => setSidebarOpen(false)}>
        <CalendarDays className="h-4 w-4" />
        {t("IPC Calendar")}
      </NavLink>
      <NavLink to="/messages" className={linkClass} onClick={() => setSidebarOpen(false)}>
        <MessageSquare className="h-4 w-4" />
        {t("Messages")}
        {unreadCount > 0 && (
          <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </NavLink>
      <NavLink to="/profile" className={linkClass} onClick={() => setSidebarOpen(false)}>
        <UserCircle className="h-4 w-4" />
        {t("Profile")}
      </NavLink>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-30 flex w-64 flex-col border-e border-slate-200 bg-white transition-transform md:static md:translate-x-0 print:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2 text-teal-700">
            <img src={rabiaLogo} alt="Rabia Hospital" className="h-9 w-9 rounded-md object-contain" />
            <span className="text-lg font-bold">{t("Infection Control")}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600 md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{navLinks}</nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-500 hover:text-slate-800 md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{session?.displayName}</span>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title={lang === "ar" ? "English" : "العربية"}
            >
              <Languages className="h-4 w-4" />
              {lang === "ar" ? "EN" : "AR"}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <LogOut className="h-4 w-4" />
              {t("Log out")}
            </button>
          </div>
        </header>
        {supabase.isMock && (
          <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 print:hidden">
            {t("Preview mode — sample data, not connected to a real database. Nothing is saved after a page refresh.")}
          </div>
        )}
        <main className="flex-1 px-4 py-6 print:p-0">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
