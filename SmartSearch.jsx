import React, { useState, useEffect, useMemo } from "react";
import { Search, X, FlaskConical, Users, Table2, FolderOpen } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function SmartSearch({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (open && data === null) {
      (async () => {
        const [{ data: panels }, { data: staff }, { data: tables }, { data: files }] = await Promise.all([
          supabase.from("qc_panels").select("id,name,department,device,analytes").eq("deleted", false),
          supabase.from("staff_members").select("id,full_name,job_number,department").eq("deleted", false),
          supabase.from("custom_tables").select("id,title,columns").eq("deleted", false),
          supabase.from("files_library").select("id,filename,description").eq("deleted", false),
        ]);
        setData({ panels: panels || [], staff: staff || [], tables: tables || [], files: files || [] });
      })();
    }
  }, [open]);

  const results = useMemo(() => {
    if (!data || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    const out = { panels: [], staff: [], tables: [], files: [] };

    data.panels.forEach((p) => {
      if (p.name.toLowerCase().includes(q) || (p.device || "").toLowerCase().includes(q)) {
        out.panels.push({ id: p.id, label: p.name, sub: `${p.department}${p.device ? " · " + p.device : ""}` });
      }
      (p.analytes || []).forEach((a) => {
        if (a.name.toLowerCase().includes(q)) {
          out.panels.push({ id: p.id, label: `${a.name} — ${p.name}`, sub: "analyte" });
        }
      });
    });
    data.staff.forEach((s) => {
      if (s.full_name.toLowerCase().includes(q) || (s.job_number || "").toLowerCase().includes(q)) {
        out.staff.push({ id: s.id, label: s.full_name, sub: `${s.job_number ? "#" + s.job_number + " · " : ""}${s.department}` });
      }
    });
    data.tables.forEach((t) => {
      if (t.title.toLowerCase().includes(q) || (t.columns || []).some((c) => c.toLowerCase().includes(q))) {
        out.tables.push({ id: t.id, label: t.title, sub: (t.columns || []).join(", ") });
      }
    });
    data.files.forEach((f) => {
      if (f.filename.toLowerCase().includes(q) || (f.description || "").toLowerCase().includes(q)) {
        out.files.push({ id: f.id, label: f.filename, sub: f.description });
      }
    });
    return out;
  }, [data, query]);

  function go(tab) {
    onNavigate(tab);
    setOpen(false);
    setQuery("");
  }

  const totalResults = results ? Object.values(results).reduce((s, arr) => s + arr.length, 0) : 0;

  return (
    <div style={{ padding: "0 10px 10px" }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: "100%", background: "#22322F", border: "1px solid #39494A", color: "#8FA39E", borderRadius: 7, padding: "8px 10px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={13} /> Search…
        </button>
      ) : (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #C7D1CE" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
            <Search size={13} color="#8A9694" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Troponin" style={{ flex: 1, border: "none", outline: "none", fontSize: 13 }} />
            <button onClick={() => { setOpen(false); setQuery(""); }} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={14} /></button>
          </div>
          {query.trim() && (
            <div style={{ borderTop: "1px solid #EEF2F0", maxHeight: 280, overflowY: "auto" }}>
              {totalResults === 0 ? (
                <div style={{ padding: 14, fontSize: 12.5, color: "#8A9694" }}>No matches.</div>
              ) : (
                <>
                  {results.panels.length > 0 && <ResultGroup icon={<FlaskConical size={13} />} label="Quality Control" items={results.panels} onClick={() => go("qc")} />}
                  {results.staff.length > 0 && <ResultGroup icon={<Users size={13} />} label="Staff" items={results.staff} onClick={() => go("staff")} />}
                  {results.tables.length > 0 && <ResultGroup icon={<Table2 size={13} />} label="Tables" items={results.tables} onClick={() => go("tables")} />}
                  {results.files.length > 0 && <ResultGroup icon={<FolderOpen size={13} />} label="Files" items={results.files} onClick={() => go("files")} />}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ icon, label, items, onClick }) {
  return (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "#8A9694", padding: "2px 8px" }}>{icon} {label.toUpperCase()}</div>
      {items.slice(0, 6).map((i, idx) => (
        <button key={idx} onClick={onClick} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 5, display: "block" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1B2B2E" }}>{i.label}</div>
          {i.sub && <div style={{ fontSize: 11, color: "#8A9694" }}>{i.sub}</div>}
        </button>
      ))}
    </div>
  );
}
