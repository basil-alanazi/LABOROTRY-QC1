import React, { useState, useEffect } from "react";
import { Plus, Trash2, Save, Upload } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

// Pre-tested color combinations so the owner can pick a good-looking theme
// in one click instead of guessing hex codes.
const THEME_PRESETS = [
  { name: "Ocean Teal", accent: "#0F7173", sidebar: "#1B2B2E", bg: "#F0F3F2" },
  { name: "Fresh Green", accent: "#2F8F5B", sidebar: "#173026", bg: "#F1F7F3" },
  { name: "Deep Blue", accent: "#3E6ACF", sidebar: "#141E33", bg: "#F0F2F8" },
  { name: "Warm Sunset", accent: "#D8862B", sidebar: "#2B211B", bg: "#F8F3EC" },
  { name: "Royal Purple", accent: "#7A4FA3", sidebar: "#221A2E", bg: "#F4F0F8" },
  { name: "Slate Gray", accent: "#516361", sidebar: "#222A29", bg: "#F2F3F3" },
];

export const BUILT_IN_PAGES = [
  { key: "qc", label: "QC Entry (+ Approvals if admin)" },
  { key: "grid", label: "Monthly grid" },
  { key: "controls", label: "Control stock" },
  { key: "riqas", label: "RIQAS" },
  { key: "files", label: "Files" },
  { key: "chart", label: "Chart" },
  { key: "export", label: "Export" },
  { key: "tables", label: "Tables (browse all)" },
  { key: "staff", label: "Staff (roster + daily assignment)" },
  { key: "schedule", label: "Schedule (+ Shift templates if admin)" },
  { key: "equipment", label: "Equipment" },
  { key: "lotcompare", label: "Lot comparison" },
  { key: "kpi", label: "KPI" },
  { key: "audit", label: "Audit trail" },
  { key: "backup", label: "Full Backup" },
  { key: "reject", label: "Reject Sample" },
  { key: "panic", label: "Panic Value" },
  { key: "corrective", label: "Corrective Action" },
  { key: "infection", label: "Infection Disease" },
  { key: "calculate", label: "Calculate" },
  { key: "myschedule", label: "My Schedule" },
  { key: "assignment", label: "Daily Assignment" },
  { key: "breakhistory", label: "Break History" },
];

// Suggested role presets — same permission system, just a quicker starting point.
export const ROLE_PRESETS = {
  "QC Admin": [{ page: "qc", level: "admin" }, { page: "controls", level: "admin" }, { page: "riqas", level: "admin" }, { page: "chart", level: "admin" }, { page: "grid", level: "admin" }],
  "Staff Admin": [{ page: "staff", level: "admin" }, { page: "schedule", level: "admin" }],
  "Registration Admin": [{ page: "tables", level: "admin" }, { page: "files", level: "admin" }],
};

export default function OwnerSettings({ config, reload }) {
  const [title, setTitle] = useState(config.app_title || "QC Log");
  const [subtitle, setSubtitle] = useState(config.app_subtitle || "");
  const [color, setColor] = useState(config.theme_color || "#0F7173");
  const [sidebarColor, setSidebarColor] = useState(config.sidebar_color || "#1B2B2E");
  const [pageBgColor, setPageBgColor] = useState(config.page_bg_color || "#F0F3F2");
  const [logoUrl, setLogoUrl] = useState(config.logo_url || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [hiddenPages, setHiddenPages] = useState(config.hidden_pages || []);
  const [startTemplate, setStartTemplate] = useState(config.notif_start_template || "");
  const [endTemplate, setEndTemplate] = useState(config.notif_end_template || "");
  const [notifMsg, setNotifMsg] = useState("");
  const [calcSettings, setCalcSettings] = useState({
    egfr_formula: "ckdepi2021",
    aniongap_include_k: false,
    corrcalcium_units: "us",
    default_lipid_unit: "mg/dL",
    default_buncreat_unit: "mg/dL (US)",
    ...(config.calculator_settings || {}),
  });
  const [calcMsg, setCalcMsg] = useState("");
  const [msg, setMsg] = useState("");

  const [accounts, setAccounts] = useState(null);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [editingStaffAccount, setEditingStaffAccount] = useState(null);
  const [customTables, setCustomTables] = useState([]);
  const [showNewAccount, setShowNewAccount] = useState(false);

  async function loadExtras() {
    const { data: a } = await supabase.from("portal_accounts").select("*").order("username");
    const { data: sa } = await supabase.from("staff_accounts").select("*").order("username");
    const { data: t } = await supabase.from("custom_tables").select("*").eq("deleted", false).order("title");
    setAccounts(a || []);
    setStaffAccounts(sa || []);
    setCustomTables(t || []);
  }
  useEffect(() => { loadExtras(); }, []);

  async function saveBranding() {
    const { error } = await supabase.from("app_config").update({
      app_title: title, app_subtitle: subtitle, theme_color: color,
      sidebar_color: sidebarColor, page_bg_color: pageBgColor, logo_url: logoUrl,
      hidden_pages: hiddenPages,
    }).eq("id", 1);
    setMsg(error ? "Could not save." : "Saved.");
    reload();
    setTimeout(() => setMsg(""), 2500);
  }

  async function uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const path = `logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("attachments").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      alert("Could not upload logo — check your Supabase Storage setup.");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  function toggleHidden(key) {
    setHiddenPages((h) => (h.includes(key) ? h.filter((x) => x !== key) : [...h, key]));
  }

  async function deleteAccount(id) {
    if (!confirm("Remove this account?")) return;
    await supabase.from("portal_accounts").delete().eq("id", id);
    loadExtras();
  }

  async function saveCalcSettings() {
    const { error } = await supabase.from("app_config").update({ calculator_settings: calcSettings }).eq("id", 1);
    setCalcMsg(error ? "Could not save." : "Saved.");
    reload();
    setTimeout(() => setCalcMsg(""), 2500);
  }

  async function saveNotifTemplates() {
    const { error } = await supabase.from("app_config").update({ notif_start_template: startTemplate, notif_end_template: endTemplate }).eq("id", 1);
    setNotifMsg(error ? "Could not save." : "Saved.");
    reload();
    setTimeout(() => setNotifMsg(""), 2500);
  }

  async function resetPassword(table, id, currentUsername) {
    const newPw = prompt(`New password for ${currentUsername}:`);
    if (!newPw) return;
    await supabase.from(table).update({ password: newPw, must_change_password: true }).eq("id", id);
    loadExtras();
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Owner settings</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 24 }}>Only visible to you.</div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>BRANDING</div>
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12, marginBottom: 30 }}>
        <label style={labelStyle}>App name (shown at the top)<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={labelStyle}>Subtitle<input style={inputStyle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></label>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", marginBottom: 6 }}>Quick themes (tested combinations)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {THEME_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => { setColor(p.accent); setSidebarColor(p.sidebar); setPageBgColor(p.bg); }}
                title={p.name}
                style={{ border: "1px solid #E1E8E5", borderRadius: 8, padding: 6, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
              >
                <div style={{ display: "flex", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: 16, height: 24, background: p.sidebar }} />
                  <div style={{ width: 16, height: 24, background: p.accent }} />
                  <div style={{ width: 16, height: 24, background: p.bg, border: "1px solid #E1E8E5" }} />
                </div>
                <div style={{ fontSize: 10, color: "#516361" }}>{p.name}</div>
              </button>
            ))}
          </div>
        </div>

        <label style={labelStyle}>Accent color (buttons, highlights)
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid #C7D1CE", borderRadius: 6, padding: 2 }} />
            <input style={{ ...inputStyle, flex: 1 }} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </label>

        <label style={labelStyle}>Sidebar color
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input type="color" value={sidebarColor} onChange={(e) => setSidebarColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid #C7D1CE", borderRadius: 6, padding: 2 }} />
            <input style={{ ...inputStyle, flex: 1 }} value={sidebarColor} onChange={(e) => setSidebarColor(e.target.value)} />
          </div>
        </label>

        <label style={labelStyle}>Page background color
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input type="color" value={pageBgColor} onChange={(e) => setPageBgColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid #C7D1CE", borderRadius: 6, padding: 2 }} />
            <input style={{ ...inputStyle, flex: 1 }} value={pageBgColor} onChange={(e) => setPageBgColor(e.target.value)} />
          </div>
        </label>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", marginBottom: 6 }}>Logo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid #E1E8E5" }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "#F0F3F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#8A9694" }}>none</div>
            )}
            <label style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Upload size={13} /> {uploadingLogo ? "Uploading…" : "Upload logo image"}
              <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploadingLogo} style={{ display: "none" }} />
            </label>
            {logoUrl && <button onClick={() => setLogoUrl("")} style={{ background: "none", border: "none", color: "#C1432B", fontSize: 12 }}>Remove</button>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", marginBottom: 6 }}>Hide these pages from everyone (including admins)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...BUILT_IN_PAGES, ...customTables.map((t) => ({ key: `table:${t.id}`, label: `Table: ${t.title}` }))].map((p) => (
              <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, background: hiddenPages.includes(p.key) ? "#FBEAE6" : "#F0F3F2", color: hiddenPages.includes(p.key) ? "#C1432B" : "#516361", padding: "4px 9px", borderRadius: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={hiddenPages.includes(p.key)} onChange={() => toggleHidden(p.key)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        <button onClick={saveBranding} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Save size={14} /> Save branding
        </button>
        {msg && <div style={{ fontSize: 12.5, color: "#2F6B4F" }}>{msg}</div>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>ALL ACCOUNTS & PASSWORDS</div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>
        Every individual login (passwords are private — use Reset to set a new one if someone's locked out; they can also change it themselves from My Profile). Fixed accounts (staff/admin/owner) are managed from Settings — this covers the individual employee and custom accounts.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 30 }}>
        {staffAccounts.length === 0 && (accounts || []).length === 0 && <div style={{ fontSize: 13, color: "#8A9694" }}>No individual accounts yet.</div>}
        {staffAccounts.map((s) => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#516361", background: "#F0F3F2", padding: "2px 7px", borderRadius: 4 }}>STAFF</span>
              <div style={{ flex: 1, fontWeight: 600 }}>{s.username}</div>
              {s.must_change_password && <span style={{ fontSize: 10, color: "#B8860B" }}>must change on next login</span>}
              <button onClick={() => setEditingStaffAccount(s)} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 11.5, fontWeight: 700 }}>Permissions</button>
              <button onClick={() => resetPassword("staff_accounts", s.id, s.username)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 5, padding: "4px 8px", fontSize: 11 }}>Reset</button>
            </div>
            {(s.permissions || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                {s.permissions.map((p) => (
                  <span key={p.page} style={{ fontSize: 10.5, background: p.level === "admin" ? "#FBF3DF" : "#F0F3F2", color: p.level === "admin" ? "#B8860B" : "#516361", padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>
                    +{pageLabel(p.page, customTables)} · {p.level}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {(accounts || []).map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 14px", fontSize: 12.5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#3E6ACF", background: "#E7F0FB", padding: "2px 7px", borderRadius: 4 }}>CUSTOM</span>
            <div style={{ flex: 1, fontWeight: 600 }}>{a.username}</div>
            {a.must_change_password && <span style={{ fontSize: 10, color: "#B8860B" }}>must change on next login</span>}
            <button onClick={() => resetPassword("portal_accounts", a.id, a.username)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 5, padding: "4px 8px", fontSize: 11 }}>Reset</button>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, letterSpacing: 0.3 }}>CALCULATOR SETTINGS</div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>Only shown here where more than one valid formula genuinely exists — applies to every account.</div>
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 14, marginBottom: 30 }}>
        <label style={labelStyle}>eGFR formula
          <select style={inputStyle} value={calcSettings.egfr_formula} onChange={(e) => setCalcSettings((c) => ({ ...c, egfr_formula: e.target.value }))}>
            <option value="ckdepi2021">CKD-EPI 2021 (race-free, default)</option>
            <option value="cockcroftgault">Cockcroft-Gault (needs weight)</option>
          </select>
        </label>
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={calcSettings.aniongap_include_k} onChange={(e) => setCalcSettings((c) => ({ ...c, aniongap_include_k: e.target.checked }))} />
          Anion Gap includes Potassium (Na + K − (Cl + HCO₃))
        </label>
        <label style={labelStyle}>Corrected Calcium units
          <select style={inputStyle} value={calcSettings.corrcalcium_units} onChange={(e) => setCalcSettings((c) => ({ ...c, corrcalcium_units: e.target.value }))}>
            <option value="us">US units (mg/dL calcium, g/dL albumin)</option>
            <option value="si">SI units (mmol/L calcium, g/L albumin)</option>
          </select>
        </label>
        <label style={labelStyle}>Default lipid panel unit
          <select style={inputStyle} value={calcSettings.default_lipid_unit} onChange={(e) => setCalcSettings((c) => ({ ...c, default_lipid_unit: e.target.value }))}>
            <option value="mg/dL">mg/dL</option>
            <option value="mmol/L">mmol/L</option>
          </select>
        </label>
        <label style={labelStyle}>Default BUN/Creatinine unit
          <select style={inputStyle} value={calcSettings.default_buncreat_unit} onChange={(e) => setCalcSettings((c) => ({ ...c, default_buncreat_unit: e.target.value }))}>
            <option value="mg/dL (US)">mg/dL (US)</option>
            <option value="SI (mmol/L urea, µmol/L creat)">SI (mmol/L urea, µmol/L creat)</option>
          </select>
        </label>
        <button onClick={saveCalcSettings} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Save calculator settings</button>
        {calcMsg && <div style={{ fontSize: 12.5, color: "#2F6B4F" }}>{calcMsg}</div>}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, marginBottom: 30, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>SHIFT REMINDER MESSAGES</div>
        <div style={{ fontSize: 12, color: "#7B8E8A" }}>
          Write your own wording for the push notifications. Use <strong>{"{name}"}</strong> for the employee's first name and <strong>{"{shift}"}</strong> for their shift code. Leave blank to use the default message.
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Shift starting soon (~1 hour before)
          <textarea value={startTemplate} onChange={(e) => setStartTemplate(e.target.value)} placeholder={"Good morning, {name}! Your {shift} shift starts in about an hour — don't be late."} rows={2} style={{ width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 13, marginTop: 4, boxSizing: "border-box", fontFamily: "inherit" }} />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Shift just ended
          <textarea value={endTemplate} onChange={(e) => setEndTemplate(e.target.value)} placeholder={"Goodbye, {name}! Your {shift} shift just ended — get home safe."} rows={2} style={{ width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 13, marginTop: 4, boxSizing: "border-box", fontFamily: "inherit" }} />
        </label>
        <button onClick={saveNotifTemplates} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Save reminder messages</button>
        {notifMsg && <div style={{ fontSize: 12.5, color: "#2F6B4F" }}>{notifMsg}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>CUSTOM ACCOUNTS</div>
        <button onClick={() => setShowNewAccount(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Plus size={13} /> New account</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>
        Give anyone their own login with exactly the pages they need. Pick "Admin" on a page for full control there (approve, decline, delete), or "Staff" for regular data entry only. One page → they land straight on it. More than one → they get a home screen to pick from.
      </div>

      {accounts === null ? (
        <div style={{ fontSize: 13, color: "#8A9694" }}>Loading…</div>
      ) : (accounts || []).length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A9694", marginBottom: 20 }}>No custom accounts yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {accounts.map((a) => <AccountRow key={a.id} account={a} customTables={customTables} onDelete={() => deleteAccount(a.id)} onSaved={loadExtras} />)}
        </div>
      )}

      {showNewAccount && <AccountModal customTables={customTables} table="portal_accounts" onClose={() => setShowNewAccount(false)} onCreated={loadExtras} />}
      {editingStaffAccount && (
        <AccountModal
          customTables={customTables}
          existing={editingStaffAccount}
          table="staff_accounts"
          onClose={() => setEditingStaffAccount(null)}
          onCreated={() => { loadExtras(); setEditingStaffAccount(null); }}
        />
      )}
    </div>
  );
}

function pageLabel(key, customTables) {
  if (key.startsWith("table:")) {
    const t = customTables.find((c) => c.id === key.slice(6));
    return t ? t.title : "(deleted table)";
  }
  return BUILT_IN_PAGES.find((p) => p.key === key)?.label || key;
}

function AccountRow({ account, customTables, onDelete, onSaved }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <AccountModal customTables={customTables} existing={account} table="portal_accounts" onClose={() => setEditing(false)} onCreated={() => { onSaved(); setEditing(false); }} />;
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{account.username}</div>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 12, fontWeight: 600 }}>Edit</button>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(account.permissions || []).map((p) => (
          <span key={p.page} style={{ fontSize: 11, background: p.level === "admin" ? "#FBF3DF" : "#F0F3F2", color: p.level === "admin" ? "#B8860B" : "#516361", padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>
            {pageLabel(p.page, customTables)} · {p.level}
          </span>
        ))}
        {(account.permissions || []).length === 0 && <span style={{ fontSize: 12, color: "#B8860B" }}>No pages granted yet</span>}
      </div>
    </div>
  );
}

function AccountModal({ customTables, existing, table = "portal_accounts", onClose, onCreated }) {
  const [username, setUsername] = useState(existing?.username || "");
  const [password, setPassword] = useState(existing?.password || "");
  const [perms, setPerms] = useState(() => {
    const map = {};
    (existing?.permissions || []).forEach((p) => { map[p.page] = p.level; });
    return map;
  });
  const [msg, setMsg] = useState("");

  const allPages = [
    ...BUILT_IN_PAGES,
    ...customTables.map((t) => ({ key: `table:${t.id}`, label: `Table: ${t.title}` })),
  ];

  function applyPreset(name) {
    const map = {};
    ROLE_PRESETS[name].forEach((p) => { map[p.page] = p.level; });
    setPerms(map);
  }

  function applyAllPages(level) {
    const map = {};
    allPages.forEach((p) => { map[p.key] = level; });
    setPerms(map);
  }

  function setLevel(key, level) {
    setPerms((p) => {
      const next = { ...p };
      if (!level) delete next[key];
      else next[key] = level;
      return next;
    });
  }

  async function save() {
    if (!username || !password) return;
    const permissions = Object.entries(perms).map(([page, level]) => ({ page, level }));
    if (existing) {
      const { error } = await supabase.from(table).update({ username, password, permissions }).eq("id", existing.id);
      if (error) { setMsg("Could not save — username may already exist."); return; }
    } else {
      const { error } = await supabase.from(table).insert({ username, password, permissions });
      if (error) { setMsg("Could not create — username may already exist."); return; }
    }
    onCreated();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>{existing ? "Edit account" : "New account"}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <label style={{ ...labelStyle, flex: 1 }}>Username<input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label style={{ ...labelStyle, flex: 1 }}>Password<input style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {Object.keys(ROLE_PRESETS).map((name) => (
            <button key={name} onClick={() => applyPreset(name)} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>{name}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => applyAllPages("admin")} style={{ background: "#FBF3DF", border: "1px solid #E8D9A8", color: "#B8860B", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 700 }}>⚡ Admin on everything</button>
          <button onClick={() => applyAllPages("staff")} style={{ background: "#F0F3F2", border: "1px solid #D6DEDA", color: "#516361", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 700 }}>⚡ Staff (view) on everything</button>
          <button onClick={() => setPerms({})} style={{ background: "none", border: "1px solid #C7D1CE", color: "#8A9694", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>Clear all</button>
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>PAGES & LEVEL</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {allPages.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F7F9F8", borderRadius: 7, padding: "7px 10px" }}>
              <div style={{ flex: 1, fontSize: 12.5 }}>{p.label}</div>
              {["none", "staff", "admin"].map((lvl) => (
                <label key={lvl} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                  <input
                    type="radio"
                    name={p.key}
                    checked={(perms[p.key] || "none") === lvl}
                    onChange={() => setLevel(p.key, lvl === "none" ? null : lvl)}
                  />
                  {lvl}
                </label>
              ))}
            </div>
          ))}
        </div>

        {msg && <div style={{ fontSize: 12, color: "#C1432B", marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} style={{ flex: 1, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>{existing ? "Save" : "Create account"}</button>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 8, padding: "11px 16px", fontSize: 14 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
