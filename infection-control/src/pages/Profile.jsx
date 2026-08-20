import { useState } from "react";
import { Save } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";

const ROLE_LABELS = {
  owner: "Owner",
  ic: "Infection Control",
  staff: "Ward Staff",
};

export default function Profile() {
  const { session, changePassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (newPassword.length < 4) {
      setMessage({ type: "error", text: "Password must be at least 4 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords don't match" });
      return;
    }
    setBusy(true);
    const res = await changePassword(newPassword);
    setBusy(false);
    if (res.ok) {
      setMessage({ type: "success", text: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setMessage({ type: "error", text: res.error });
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Profile</h1>
        <p className="text-sm text-slate-500">Your account details.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
        <div>
          <span className="text-slate-500">Username:</span> {session?.username}
        </div>
        <div>
          <span className="text-slate-500">Display name:</span> {session?.displayName}
        </div>
        <div>
          <span className="text-slate-500">Role:</span> {ROLE_LABELS[session?.role] || session?.role}
        </div>
        {session?.department && (
          <div>
            <span className="text-slate-500">Department:</span> {session.department}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Change Password</h2>
        <input
          type="password"
          className="input"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-emerald-600"}`}>{message.text}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {busy ? "Saving..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
