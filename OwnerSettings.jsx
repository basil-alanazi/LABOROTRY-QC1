import React, { useState, useEffect } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

const BUILT_IN_PAGES = [
  { key: "qc", label: "QC Entry (+ Approvals if admin)" },
  { key: "grid", label: "Monthly grid" },
  { key: "controls", label: "Control stock" },
  { key: "riqas", label: "RIQAS" },
  { key: "files", label: "Files" },
  { key: "chart", label: "Chart" },
  { key: "export", label: "Export" },
  { key: "tables", label: "Tables (browse all)" },
];

export default function OwnerSettings({ config, reload }) {
  const [title, setTitle] = useState(config.app_title || "QC Log");
  const [subtitle, setSubtitle] = useState(config.app_subtitle || "");
  const [color, setColor] = useState(config.theme_color || "#0F7173");
  const [msg, setMsg] = useState("");

  const [accounts, setAccounts] = useState(null);
  const [customTables, setCustomTables] = useState([]);
  const [showNewAccount, setShowNewAccount] = useState(false);

  async function loadExtras() {
    const { data: a } = await supabase.from("portal_accounts").select("*").order("username");
    const { data: t } = await supabase.from("custom_tables").select("*").eq("deleted", false).order("title");
    setAccounts(a || []);
    setCustomTables(t || []);
  }
  useEffect(() => { loadExtras(); }, []);

  async function saveBranding() {
    const { error } = await supabase.from("app_config").update({ app_title: title, app_subtitle: subtitle, theme_color: color }).eq("id", 1);
    setMsg(error ? "Could not save." : "Saved.");
    reload();
    setTimeout(() => setMsg(""), 2500);
  }

  async function deleteAccount(id) {
    if (!confirm("Remove this account?")) return;
    await supabase.from("portal_accounts").delete().eq("id", id);
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
        <label style={labelStyle}>Accent color
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid #C7D1CE", borderRadius: 6, padding: 2 }} />
            <input style={{ ...inputStyle, flex: 1 }} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </label>
        <button onClick={saveBranding} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Save size={14} /> Save branding
        </button>
        {msg && <div style={{ fontSize: 12.5, color: "#2F6B4F" }}>{msg}</div>}
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
      ) : accounts.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8A9694", marginBottom: 20 }}>No custom accounts yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {accounts.map((a) => <AccountRow key={a.id} account={a} customTables={customTables} onDelete={() => deleteAccount(a.id)} onSaved={loadExtras} />)}
        </div>
      )}

      {showNewAccount && <AccountModal customTables={customTables} onClose={() => setShowNewAccount(false)} onCreated={loadExtras} />}
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
    return <AccountModal customTables={customTables} existing={account} onClose={() => setEditing(false)} onCreated={() => { onSaved(); setEditing(false); }} />;
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

function AccountModal({ customTables, existing, onClose, onCreated }) {
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
      const { error } = await supabase.from("portal_accounts").update({ username, password, permissions }).eq("id", existing.id);
      if (error) { setMsg("Could not save — username may already exist."); return; }
    } else {
      const { error } = await supabase.from("portal_accounts").insert({ username, password, permissions });
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
