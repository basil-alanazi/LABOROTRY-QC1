import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";

export default function ForceChangePassword() {
  const { changePassword, logout } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    const res = await changePassword(newPassword);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-teal-700">
          <ShieldPlus className="h-10 w-10" />
          <h1 className="text-xl font-bold text-slate-800">Set a New Password</h1>
          <p className="text-center text-sm text-slate-500">
            You're using a temporary password — choose a new one to continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            className="input"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="input"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Continue"}
          </button>
          <button type="button" onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
