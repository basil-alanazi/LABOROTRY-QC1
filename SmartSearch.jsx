import React, { useState, useEffect, useMemo } from "react";
import { Search, X, FlaskConical, Users, Table2, FolderOpen, Wrench, AlertTriangle, Siren, ClipboardList, Biohazard } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function SmartSearch({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);

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
      if (has(p.name) || has(p.device)) out.panels.push({ id: p.id, label: p.name, sub: `${p.department}${p.device ? " · " + p.device : ""}` });
      (p.analytes || []).forEach((a) => { if (has(a.name)) out.panels.push({ id: p.id, label: `${a.name} — ${p.name}`, sub: "analyte" }); });
    });
    data.staff.forEach((s) => {
      if (has(s.full_name) || has(s.job_number)) out.staff.push({ id: s.id, label: s.full_name, sub: `${s.job_number ? "#" + s.job_number + " · " : ""}${s.department}` });
    });
    data.tables.forEach((t) => {
      if (has(t.title) || (t.columns || []).some(has)) out.tables.push({ id: t.id, label: t.title, sub: (t.columns || []).join(", ") });
    });
    data.files.forEach((f) => {
      if (has(f.filename) || has(f.description)) out.files.push({ id: f.id, label: f.filename, sub: f.description });
    });
    data.equipment.forEach((e) => {
      if (has(e.name) || has(e.serial_number)) out.equipment.push({ id: e.id, label: e.name, sub: `${e.department}${e.serial_number ? " · SN " + e.serial_number : ""}` });
    });
    data.shifts.forEach((s) => {
      if (has(s.code) || has(s.name)) out.equipment.push({ id: s.id, label: `Shift ${s.code}`, sub: s.name, key: "shifts" });
    });
    data.reject.forEach((r) => {
      if (has(r.sample_id) || has(r.test_name) || has(r.reason) || has(r.rejected_by)) out.records.push({ id: r.id, label: `${r.sample_id || r.test_name}`, sub: `Reject Sample · ${r.reason || ""}`, tab: "reject" });
    });
    data.panic.forEach((r) => {
      if (has(r.patient_id) || has(r.test_name) || has(r.result)) out.records.push({ id: r.id, label: `${r.patient_id || r.test_name}`, sub: `Panic Value · ${r.test_name || ""}`, tab: "panic" });
    });
    data.corrective.forEach((r) => {
      if (has(r.issue_description) || has(r.responsible_person)) out.records.push({ id: r.id, label: r.issue_description?.slice(0, 40) || "Corrective Action", sub: `Corrective Action · ${r.responsible_person || ""}`, tab: "corrective" });
    });
    data.infection.forEach((r) => {
      if (has(r.patient_id) || has(r.infection_type) || has(r.ward_department)) out.records.push({ id: r.id, label: `${r.patient_id || r.infection_type}`, sub: `Infection Disease · ${r.infection_type || ""}`, tab: "infection" });
    });
    data.lots.forEach((l) => {
      if (has(l.lot_number) || has(l.manufacturer)) out.records.push({ id: l.id, label: `Lot ${l.lot_number}`, sub: `Control Lot${l.manufacturer ? " · " + l.manufacturer : ""}`, tab: "controls" });
    });
    data.incidents.forEach((r) => {
      if (has(r.description) || has(r.incident_type) || has(r.department)) out.records.push({ id: r.id, label: r.description?.slice(0, 40) || r.incident_type || "Incident", sub: `Incident · ${r.status || ""}`, tab: "incident" });
    });
    data.knowledge.forEach((k) => {
      if (has(k.title) || has(k.description)) out.records.push({ id: k.id, label: k.title, sub: `${k.category || "Knowledge Base"}`, tab: "knowledge" });
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
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Troponin, D07, Alfatiih" style={{ flex: 1, border: "none", outline: "none", fontSize: 13 }} />
            <button onClick={() => { setOpen(false); setQuery(""); }} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={14} /></button>
          </div>
          {query.trim() && (
            <div style={{ borderTop: "1px solid #EEF2F0", maxHeight: 320, overflowY: "auto" }}>
              {totalResults === 0 ? (
                <div style={{ padding: 14, fontSize: 12.5, color: "#8A9694" }}>No matches.</div>
              ) : (
                <>
                  {results.panels.length > 0 && <ResultGroup icon={<FlaskConical size={13} />} label="Quality Control" items={results.panels} onItemClick={() => go("qc")} />}
                  {results.records.length > 0 && (
                    <div style={{ padding: "6px 4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "#8A9694", padding: "2px 8px" }}>RECORDS</div>
                      {results.records.slice(0, 8).map((i, idx) => (
                        <button key={idx} onClick={() => go(i.tab)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 5, display: "block" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1B2B2E" }}>{i.label}</div>
                          {i.sub && <div style={{ fontSize: 11, color: "#8A9694" }}>{i.sub}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                  {results.equipment.length > 0 && <ResultGroup icon={<Wrench size={13} />} label="Equipment & Shifts" items={results.equipment} onItemClick={() => go("equipment")} />}
                  {results.staff.length > 0 && <ResultGroup icon={<Users size={13} />} label="Staff" items={results.staff} onItemClick={() => go("staff")} />}
                  {results.tables.length > 0 && <ResultGroup icon={<Table2 size={13} />} label="Tables" items={results.tables} onItemClick={(i) => go(`opentable:${i.id}`)} />}
                  {results.files.length > 0 && <ResultGroup icon={<FolderOpen size={13} />} label="Files" items={results.files} onItemClick={() => go("files")} />}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ icon, label, items, onItemClick }) {
  return (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "#8A9694", padding: "2px 8px" }}>{icon} {label.toUpperCase()}</div>
      {items.slice(0, 6).map((i, idx) => (
        <button key={idx} onClick={() => onItemClick(i)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", borderRadius: 5, display: "block" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1B2B2E" }}>{i.label}</div>
          {i.sub && <div style={{ fontSize: 11, color: "#8A9694" }}>{i.sub}</div>}
        </button>
      ))}
    </div>
  );
}
