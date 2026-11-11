import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Languages } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { supabase } from "../lib/supabaseClient";
import rabiaLogo from "../assets/rabia-logo.jpg";

export default function Login() {
  const { login } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Lets a link elsewhere in the app (e.g. the "Doctor Login" button on the
  // public QR employee profile page) send the user straight to a specific
  // screen after signing in, instead of always landing on the default route.
  const next = searchParams.get("next");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (res.ok) navigate(next ? decodeURIComponent(next) : "/");
    else setError(res.error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Languages className="h-3.5 w-3.5" />
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </div>
        <div className="mb-6 flex flex-col items-center gap-2 text-teal-700">
          <img src={rabiaLogo} alt="Rabia Hospital" className="h-16 w-16 rounded-lg object-contain" />
          <h1 className="text-xl font-bold text-slate-800">{t("Infection Control")}</h1>
          <p className="text-sm text-slate-500">{t("Infection Control System")}</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t("Username")}</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t("Password")}</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {supabase.isMock && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {t("Preview mode — try: owner / owner123 (full access) or ward / ward123 (entry only)")}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? t("Signing in...") : t("Log in")}
          </button>
        </form>
      </div>
    </div>
  );
}
