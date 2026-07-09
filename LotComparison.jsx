import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

export default function LotComparison({ panels }) {
  const [panelId, setPanelId] = useState(panels[0]?.id || "");
  const panel = panels.find((p) => p.id === panelId);
  const [analyteName, setAnalyteName] = useState(panel?.analytes?.[0]?.name || "");
  const [lots, setLots] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [lotA, setLotA] = useState("");
  const [lotB, setLotB] = useState("");

  useEffect(() => {
    if (panel && !panel.analytes?.some((a) => a.name === analyteName)) setAnalyteName(panel.analytes?.[0]?.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  useEffect(() => {
    (async () => {
      if (!panelId) return;
      const { data: cl } = await supabase.from("qc_control_lots").select("*").eq("panel_id", panelId).order("received_date", { ascending: false });
      const { data: bl } = await supabase.from("qc_baselines").select("*").eq("panel_id", panelId).eq("analyte_name", analyteName);
      setLots(cl || []);
      setBaselines(bl || []);
      if ((cl || []).length >= 2) {
        setLotA(cl[1].lot_number);
        setLotB(cl[0].lot_number);
      }
    })();
  }, [panelId, analyteName]);

  if (panels.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No QC panels set up yet.</div>;

  const baselineFor = (lot) => baselines.find((b) => b.lot_number === lot);
  const bA = baselineFor(lotA);
  const bB = baselineFor(lotB);
  const meanDiffPct = bA && bB ? (((bB.mean - bA.mean) / bA.mean) * 100).toFixed(1) : null;
  const sdDiffPct = bA && bB ? (((bB.sd - bA.sd) / bA.sd) * 100).toFixed(1) : null;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Lot comparison</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Compare the normal range between two control lots for the same analyte — useful right after a lot change.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} style={inputStyle}>
          {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {panel && (
          <select value={analyteName} onChange={(e) => setAnalyteName(e.target.value)} style={inputStyle}>
            {(panel.analytes || []).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        )}
      </div>

      {lots.length < 2 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>This device needs at least 2 recorded lots to compare (change lots from Settings).</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            <select value={lotA} onChange={(e) => setLotA(e.target.value)} style={inputStyle}>
              {lots.map((l) => <option key={l.id} value={l.lot_number}>Lot {l.lot_number} ({l.received_date})</option>)}
            </select>
            <span style={{ alignSelf: "center", color: "#8A9694" }}>vs</span>
            <select value={lotB} onChange={(e) => setLotB(e.target.value)} style={inputStyle}>
              {lots.map((l) => <option key={l.id} value={l.lot_number}>Lot {l.lot_number} ({l.received_date})</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <LotCard title={`Lot ${lotA}`} baseline={bA} />
            <LotCard title={`Lot ${lotB}`} baseline={bB} />
          </div>

          {bA && bB && (
            <div style={{ marginTop: 16, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>DIFFERENCE (Lot {lotB} vs Lot {lotA})</div>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: Math.abs(meanDiffPct) > 10 ? "#C1432B" : "#2F6B4F" }}>{meanDiffPct > 0 ? "+" : ""}{meanDiffPct}%</div>
                  <div style={{ fontSize: 11.5, color: "#8A9694" }}>Mean shift</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: Math.abs(sdDiffPct) > 20 ? "#C1432B" : "#2F6B4F" }}>{sdDiffPct > 0 ? "+" : ""}{sdDiffPct}%</div>
                  <div style={{ fontSize: 11.5, color: "#8A9694" }}>SD shift</div>
                </div>
              </div>
              {Math.abs(meanDiffPct) > 10 && <div style={{ fontSize: 12, color: "#C1432B", marginTop: 10 }}>⚠ Mean shifted more than 10% between lots — worth a closer look before trusting the new lot's results.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LotCard({ title, baseline }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</div>
      {baseline ? (
        <>
          <div style={{ fontSize: 13 }}>Mean: <b>{baseline.mean.toFixed(2)}</b></div>
          <div style={{ fontSize: 13 }}>SD: <b>{baseline.sd.toFixed(2)}</b></div>
          <div style={{ fontSize: 13 }}>CV%: <b>{((baseline.sd / baseline.mean) * 100).toFixed(1)}%</b></div>
          <div style={{ fontSize: 11, color: "#8A9694", marginTop: 6 }}>from {baseline.point_count} results</div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "#B8860B" }}>No baseline established for this lot yet.</div>
      )}
    </div>
  );
}
