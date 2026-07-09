import React, { useState, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import { zScore } from "./westgard";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

const DOT_COLOR = { pending: "#8A9694", green: "#2F6B4F", orange: "#B8860B", red: "#C1432B" };

export default function LeveyJennings({ panels, entries, baselines }) {
  const [panelId, setPanelId] = useState(panels[0]?.id || "");
  const panel = panels.find((p) => p.id === panelId);
  const [analyteName, setAnalyteName] = useState(panel?.analytes?.[0]?.name || "");

  React.useEffect(() => {
    if (panel && !panel.analytes?.some((a) => a.name === analyteName)) {
      setAnalyteName(panel.analytes?.[0]?.name || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  const baseline = baselines.find((b) => b.panel_id === panelId && b.analyte_name === analyteName && b.lot_number === panel?.lot_number);

  const points = useMemo(() => {
    if (!panel) return [];
    return entries
      .filter((e) => e.panel_id === panelId && e.values?.[analyteName] !== undefined)
      .map((e) => {
        const value = e.values[analyteName];
        const z = baseline ? zScore(value, baseline.mean, baseline.sd) : 0;
        return { date: e.date, value, z, color: e.colors?.[analyteName] || "pending" };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((p, i) => ({ ...p, x: i }));
  }, [entries, panelId, analyteName, baseline]);

  if (panels.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No QC panels set up yet.</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Levey-Jennings chart</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Every result for one analyte, plotted against its mean and ±1/2/3 SD lines. Point color matches its Westgard status.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {panel && (
          <select value={analyteName} onChange={(e) => setAnalyteName(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            {(panel.analytes || []).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        )}
      </div>

      {!baseline ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#B8860B", fontSize: 13.5 }}>
          No baseline established yet for this analyte + lot ({points.length}/20 results so far). The chart needs a Mean/SD before it can draw the reference lines.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#8A9694", marginBottom: 10 }}>
            Mean {baseline.mean.toFixed(2)} · SD {baseline.sd.toFixed(2)} · CV {((baseline.sd / baseline.mean) * 100).toFixed(1)}% · lot {panel.lot_number}
            {baseline.target_mean != null && (
              <> · Bias {(((baseline.mean - baseline.target_mean) / baseline.target_mean) * 100).toFixed(1)}% (target {baseline.target_mean})</>
            )}
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E1E8E5" />
              <XAxis dataKey="x" tickFormatter={(i) => points[i]?.date?.slice(5) || ""} fontSize={10.5} stroke="#8A9694" />
              <YAxis dataKey="value" fontSize={11} stroke="#8A9694" domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div style={{ background: "#1B2B2E", color: "#F0F3F2", padding: "8px 10px", borderRadius: 6, fontSize: 12 }}>
                      <div>{p.date}</div>
                      <div>Value: {p.value}</div>
                      <div>Z: {p.z.toFixed(2)}</div>
                      <div style={{ textTransform: "capitalize" }}>{p.color}</div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={baseline.mean} stroke="#516361" strokeWidth={1.5} label={{ value: "Mean", fontSize: 10, position: "right" }} />
              <ReferenceLine y={baseline.mean + baseline.sd} stroke="#C7D1CE" strokeDasharray="4 4" label={{ value: "+1SD", fontSize: 9, position: "right" }} />
              <ReferenceLine y={baseline.mean - baseline.sd} stroke="#C7D1CE" strokeDasharray="4 4" label={{ value: "-1SD", fontSize: 9, position: "right" }} />
              <ReferenceLine y={baseline.mean + 2 * baseline.sd} stroke="#D8A31A" strokeDasharray="4 4" label={{ value: "+2SD", fontSize: 9, position: "right" }} />
              <ReferenceLine y={baseline.mean - 2 * baseline.sd} stroke="#D8A31A" strokeDasharray="4 4" label={{ value: "-2SD", fontSize: 9, position: "right" }} />
              <ReferenceLine y={baseline.mean + 3 * baseline.sd} stroke="#C1432B" strokeDasharray="4 4" label={{ value: "+3SD", fontSize: 9, position: "right" }} />
              <ReferenceLine y={baseline.mean - 3 * baseline.sd} stroke="#C1432B" strokeDasharray="4 4" label={{ value: "-3SD", fontSize: 9, position: "right" }} />
              <Scatter data={points} line={{ stroke: "#C7D1CE", strokeWidth: 1 }}>
                {points.map((p, i) => <Cell key={i} fill={DOT_COLOR[p.color] || "#8A9694"} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          {points.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#8A9694", fontSize: 13 }}>No results yet for this analyte.</div>}
        </div>
      )}
    </div>
  );
}
