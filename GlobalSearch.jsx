import React, { useState, useEffect, useMemo } from "react";
import { Search, X, FlaskConical, Users, Table2, FolderOpen, Wrench } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function GlobalSearch({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    function onKeyDown(e) {
      const isK = e.key === "k" || e.key === "K";
      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open && data === null) {
      (async () => {
        const [
          { data: panels }, { data: staff }, { data: tables }, { data: files },
          { data: equipment }, { data: reject }, { data: panic }, { data: corrective },
          { data: infection }, { data: shifts }, { data: lots }, { data: incidents }, { data: knowledge },
        ] = await Promise.all([
          supabase.from("qc_panels").select("id,name,department,device,analytes").eq("deleted", false),
          supabase.from("staff_members").select("id,full_name,job_number,department").eq("deleted", false),
          supabase.from("custom_tables").select("id,title,columns").eq("deleted", false),
          supabase.from("files_library").select("id,filename,description").eq("deleted", false),
          supabase.from("equipment").select("id,name,department,serial_number").eq("deleted", false),
          supabase.from("reject_samples").select("id,sample_id,test_name,reason,rejected_by").eq("deleted", false).limit(200),
          supabase.from("panic_values").select("id,patient_id,test_name,result").eq("deleted", false).limit(200),
          supabase.from("corrective_actions").select("id,issue_description,responsible_person").eq("deleted", false).limit(200),
          supabase.from("infection_diseases").select("id,patient_id,infection_type,ward_department").eq("deleted", false).limit(200),
          supabase.from("shift_templates").select("id,code,name").eq("deleted", false),
          supabase.from("qc_control_lots").select("id,lot_number,panel_id,manufacturer").limit(200),
          supabase.from("incident_reports").select("id,description,incident_type,department,status").eq("deleted", false).limit(200),
          supabase.from("knowledge_base").select("id,title,category,description").eq("deleted", false).limit(200),
        ]);
        setData({
          panels: panels || [], staff: staff || [], tables: tables || [], files: files || [],
          equipment: equipment || [], reject: reject || [], panic: panic || [], corrective: corrective || [],
          infection: infection || [], shifts: shifts || [], lots: lots || [], incidents: incidents || [], knowledge: knowledge || [],
        });
      })();
    }
  }, [open]);

  const results = useMemo(() => {
    if (!data || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    const has = (s) => (s || "").toLowerCase().includes(q);
    const out = { panels: [], staff: [], tables: [], files: [], equipment: [], records: [] };

    data.panels.forEach((p) => {
      if (has(p.name) || has(p.device)) out.panels.push({ id: p.id, label: p.name, sub: `${p.department}${p.device ? " · " + p.device : ""}`, tab: "qc" });
      (p.analytes || []).forEach((a) => { if (has(a.name)) out.panels.push({ id: p.id, label: `${a.name} — ${p.name}`, sub: "analyte", tab: "qc" }); });
    });
    data.staff.forEach((s) => {
      if (has(s.full_name) || has(s.job_number)) out.staff.push({ id: s.id, label: s.full_name, sub: `${s.job_number ? "#" + s.job_number + " · " : ""}${s.department}`, tab: "staff" });
    });
    data.tables.forEach((t) => {
      if (has(t.title) || (t.columns || []).some(has)) out.tables.push({ id: t.id, label: t.title, sub: (t.columns || []).join(", "), tab: "tables" });
    });
    data.files.forEach((f) => {
      if (has(f.filename) || has(f.description)) out.files.push({ id: f.id, label: f.filename, sub: f.description, tab: "files" });
    });
    data.equipment.forEach((e) => {
      if (has(e.name) || has(e.serial_number)) out.equipment.push({ id: e.id, label: e.name, sub: `${e.department}${e.serial_number ? " · SN " + e.serial_number : ""}`, tab: "equipment" });
    });
    data.reject.forEach((r) => { if (has(r.sample_id) || has(r.test_name) || has(r.reason)) out.records.push({ id: r.id, label: r.sample_id || r.test_name, sub: "Reject Sample", tab: "reject" }); });
    data.panic.forEach((r) => { if (has(r.patient_id) || has(r.test_name)) out.records.push({ id: r.id, label: r.patient_id || r.test_name, sub: "Panic Value", tab: "panic" }); });
    data.corrective.forEach((r) => { if (has(r.issue_description)) out.records.push({ id: r.id, label: r.issue_description?.slice(0, 40), sub: "Corrective Action", tab: "corrective" }); });
    data.infection.forEach((r) => { if (has(r.patient_id) || has(r.infection_type)) out.records.push({ id: r.id, label: r.patient_id || r.infection_type, sub: "Infection Disease", tab: "infection" }); });
    data.lots.forEach((l) => { if (has(l.lot_number) || has(l.manufacturer)) out.records.push({ id: l.id, label: `Lot ${l.lot_number}`, sub: "Control Lot", tab: "controls" }); });
    data.incidents.forEach((r) => { if (has(r.description) || has(r.incident_type)) out.records.push({ id: r.id, label: r.description?.slice(0, 40) || r.incident_type, sub: "Incident", tab: "incident" }); });
    data.knowledge.forEach((k) => { if (has(k.title) || has(k.description)) out.records.push({ id: k.id, label: k.title, sub: k.category || "Knowledge Base", tab: "knowledge" }); });
    return out;
  }, [data, query]);

  function go(tab) {
    onNavigate(tab);
    setOpen(false);
    setQuery("");
  }

  if (!open) return null;
  const groups = [
    { key: "panels", label: "QC Panels", icon: FlaskConical },
    { key: "staff", label: "Staff", icon: Users },
    { key: "tables", label: "Tables", icon: Table2 },
    { key: "files", label: "Files", icon: FolderOpen },
    { key: "equipment", label: "Equipment", icon: Wrench },
    { key: "records", label: "Records", icon: FlaskConical },
  ];
  const totalResults = results ? Object.values(results).reduce((s, arr) => s + arr.length, 0) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 16px 16px", zIndex: 100 }} onClick={() => setOpen(false)}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "70vh", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #EEF2F0" }}>
          <Search size={16} color="#8A9694" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search anything… (Esc to close)" style={{ flex: 1, border: "none", outline: "none", fontSize: 15 }} />
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: "auto", maxHeight: "calc(70vh - 52px)" }}>
          {!query.trim() ? (
            <div style={{ padding: 20, fontSize: 12.5, color: "#8A9694", textAlign: "center" }}>Type to search QC panels, staff, equipment, tables, files, and records.</div>
          ) : totalResults === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: "#8A9694", textAlign: "center" }}>No results for "{query}"</div>
          ) : (
            groups.map((g) => results[g.key]?.length > 0 && (
              <div key={g.key} style={{ padding: "8px 6px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8A9694", padding: "2px 10px" }}>{g.label.toUpperCase()}</div>
                {results[g.key].slice(0, 6).map((item, idx) => (
                  <button key={idx} onClick={() => go(item.tab)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2B2E" }}>{item.label}</div>
                    {item.sub && <div style={{ fontSize: 11, color: "#8A9694" }}>{item.sub}</div>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
