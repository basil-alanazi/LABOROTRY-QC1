import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import rabiaLogo from "../assets/rabia-logo.jpg";

export default function ForceChangePassword() {
  const { changePassword, logout } = useAuth();
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 4) {
      setError(t("Password must be at least 4 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("Passwords don't match"));
      return;
    }
    setBusy(true);
    const res = await changePassword(newPassword);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-teal-700">
          <img src={rabiaLogo} alt="Rabia Hospital" className="h-16 w-16 rounded-lg object-contain" />
          <h1 className="text-xl font-bold text-slate-800">{t("Set a New Password")}</h1>
          <p className="text-center text-sm text-slate-500">
            {t("You're using a temporary password — choose a new one to continue.")}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            className="input"
            placeholder={t("New password")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="input"
            placeholder={t("Confirm new password")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? t("Saving...") : t("Continue")}
          </button>
          <button type="button" onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">
            {t("Log out")}
          </button>
        </form>
      </div>
    </div>
  );
}
