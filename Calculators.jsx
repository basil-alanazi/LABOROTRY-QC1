import React, { useState } from "react";
import { Beaker, Activity, FlaskConical, Droplet, ArrowLeft } from "lucide-react";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box", width: "100%" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

function num(v) {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function ResultBox({ children }) {
  return <div style={{ background: "#E8F2EC", border: "1px solid #2F6B4F33", borderRadius: 8, padding: "12px 16px", marginTop: 14, fontSize: 14, color: "#2F6B4F", fontWeight: 600 }}>{children}</div>;
}
function WarnBox({ children }) {
  return <div style={{ background: "#FBF3DF", border: "1px solid #E9CE8A", borderRadius: 8, padding: "10px 14px", marginTop: 10, fontSize: 12.5, color: "#8A6416" }}>{children}</div>;
}

function UnitToggle({ unit, setUnit, options }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => setUnit(o)}
          style={{
            border: "1px solid " + (unit === o ? "#0F7173" : "#C7D1CE"),
            background: unit === o ? "#0F7173" : "#fff",
            color: unit === o ? "#fff" : "#516361",
            borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600,
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function LipidCalc({ settings }) {
  const [unit, setUnit] = useState(settings?.default_lipid_unit || "mg/dL");
  const [chol, setChol] = useState("");
  const [tg, setTg] = useState("");
  const [hdl, setHdl] = useState("");
  const c = num(chol), t = num(tg), h = num(hdl);
  const valid = c !== null && t !== null && h !== null;
  const divisor = unit === "mg/dL" ? 5 : 2.2; // TG/5 in mg/dL, TG/2.2 in mmol/L
  const tgWarnThreshold = unit === "mg/dL" ? 400 : 4.5;
  const vldl = valid ? t / divisor : null;
  const ldl = valid ? c - h - vldl : null;

  return (
    <div>
      <UnitToggle unit={unit} setUnit={setUnit} options={["mg/dL", "mmol/L"]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Total Cholesterol ({unit})<input style={inputStyle} type="number" value={chol} onChange={(e) => setChol(e.target.value)} /></label>
        <label style={labelStyle}>Triglycerides ({unit})<input style={inputStyle} type="number" value={tg} onChange={(e) => setTg(e.target.value)} /></label>
        <label style={labelStyle}>HDL ({unit})<input style={inputStyle} type="number" value={hdl} onChange={(e) => setHdl(e.target.value)} /></label>
      </div>
      {valid && (
        <ResultBox>
          VLDL = {vldl.toFixed(2)} {unit} &nbsp;·&nbsp; LDL (Friedewald) = {ldl.toFixed(2)} {unit}
        </ResultBox>
      )}
      {valid && t >= tgWarnThreshold && <WarnBox>TG ≥ {tgWarnThreshold} {unit} — Friedewald formula isn't reliable at this level. A direct LDL measurement is recommended.</WarnBox>}
    </div>
  );
}


function AnionGapCalc({ settings }) {
  const includeK = !!settings?.aniongap_include_k;
  const [na, setNa] = useState("");
  const [k, setK] = useState("");
  const [cl, setCl] = useState("");
  const [hco3, setHco3] = useState("");
  const n = num(na), kk = num(k), c = num(cl), h = num(hco3);
  const valid = n !== null && c !== null && h !== null && (!includeK || kk !== null);
  const gap = valid ? (n + (includeK ? kk : 0)) - (c + h) : null;
  const normalRange = includeK ? "~10–20" : "~8–16";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Na⁺<input style={inputStyle} type="number" value={na} onChange={(e) => setNa(e.target.value)} /></label>
        {includeK && <label style={labelStyle}>K⁺<input style={inputStyle} type="number" value={k} onChange={(e) => setK(e.target.value)} /></label>}
        <label style={labelStyle}>Cl⁻<input style={inputStyle} type="number" value={cl} onChange={(e) => setCl(e.target.value)} /></label>
        <label style={labelStyle}>HCO₃⁻<input style={inputStyle} type="number" value={hco3} onChange={(e) => setHco3(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>Anion Gap {includeK ? "(with K⁺)" : ""} = {gap.toFixed(1)} mmol/L (normal range {normalRange})</ResultBox>}
    </div>
  );
}

function BunCreatCalc({ settings }) {
  const [unit, setUnit] = useState(settings?.default_buncreat_unit || "mg/dL (US)");
  const [bun, setBun] = useState("");
  const [creat, setCreat] = useState("");
  const b = num(bun), c = num(creat);
  const valid = b !== null && c !== null && c !== 0;
  // Always compute the ratio in US units (mg/dL) internally for a consistent result.
  const bunMgDl = valid ? (unit === "mg/dL (US)" ? b : b * 2.8) : null; // Urea mmol/L -> BUN mg/dL
  const creatMgDl = valid ? (unit === "mg/dL (US)" ? c : c / 88.4) : null; // Creatinine µmol/L -> mg/dL
  const ratio = valid ? bunMgDl / creatMgDl : null;

  return (
    <div>
      <UnitToggle unit={unit} setUnit={setUnit} options={["mg/dL (US)", "SI (mmol/L urea, µmol/L creat)"]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>{unit === "mg/dL (US)" ? "BUN (mg/dL)" : "Urea (mmol/L)"}<input style={inputStyle} type="number" value={bun} onChange={(e) => setBun(e.target.value)} /></label>
        <label style={labelStyle}>{unit === "mg/dL (US)" ? "Creatinine (mg/dL)" : "Creatinine (µmol/L)"}<input style={inputStyle} type="number" value={creat} onChange={(e) => setCreat(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>BUN/Creatinine Ratio = {ratio.toFixed(1)} (normal range ~10–20)</ResultBox>}
    </div>
  );
}

function UrineProteinCalc() {
  const [protein, setProtein] = useState("");
  const [creat, setCreat] = useState("");
  const p = num(protein), c = num(creat);
  const valid = p !== null && c !== null && c !== 0;
  const ratio = valid ? p / c : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Urine Protein<input style={inputStyle} type="number" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
        <label style={labelStyle}>Urine Creatinine<input style={inputStyle} type="number" value={creat} onChange={(e) => setCreat(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>Protein/Creatinine Ratio = {ratio.toFixed(2)}</ResultBox>}
    </div>
  );
}

function CkMbCalc() {
  const [ckmb, setCkmb] = useState("");
  const [cktotal, setCktotal] = useState("");
  const m = num(ckmb), t = num(cktotal);
  const valid = m !== null && t !== null && t !== 0;
  const index = valid ? (m / t) * 100 : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>CK-MB<input style={inputStyle} type="number" value={ckmb} onChange={(e) => setCkmb(e.target.value)} /></label>
        <label style={labelStyle}>CK Total<input style={inputStyle} type="number" value={cktotal} onChange={(e) => setCktotal(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>CK-MB Index = {index.toFixed(1)}% {index > 25 ? "(suggests macro-CK or non-cardiac source)" : ""}</ResultBox>}
    </div>
  );
}

function TibcCalc() {
  const [iron, setIron] = useState("");
  const [tibc, setTibc] = useState("");
  const i = num(iron), t = num(tibc);
  const valid = i !== null && t !== null && t !== 0;
  const sat = valid ? (i / t) * 100 : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Serum Iron<input style={inputStyle} type="number" value={iron} onChange={(e) => setIron(e.target.value)} /></label>
        <label style={labelStyle}>TIBC<input style={inputStyle} type="number" value={tibc} onChange={(e) => setTibc(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>Transferrin Saturation = {sat.toFixed(1)}%</ResultBox>}
    </div>
  );
}

function DilutionCalc() {
  const [volume, setVolume] = useState("");
  const [factor, setFactor] = useState("");
  const v = num(volume), f = num(factor);
  const valid = v !== null && f !== null && f > 0;
  const diluent = valid ? v * (f - 1) : null;
  const total = valid ? v * f : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Sample volume you have<input style={inputStyle} type="number" value={volume} onChange={(e) => setVolume(e.target.value)} /></label>
        <label style={labelStyle}>Dilution factor (e.g. 2 for 1:2)<input style={inputStyle} type="number" value={factor} onChange={(e) => setFactor(e.target.value)} /></label>
      </div>
      {valid && (
        <ResultBox>
          Add {diluent.toFixed(2)} of diluent to your {v} of sample &nbsp;→&nbsp; total volume = {total.toFixed(2)}
        </ResultBox>
      )}
    </div>
  );
}

function EgfrCalc({ settings }) {
  const formula = settings?.egfr_formula || "ckdepi2021";
  const [creat, setCreat] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("female");
  const [weight, setWeight] = useState("");
  const c = num(creat), a = num(age), w = num(weight);
  const needsWeight = formula === "cockcroftgault";
  const valid = c !== null && c > 0 && a !== null && a > 0 && (!needsWeight || (w !== null && w > 0));

  let result = null;
  let label = "";
  if (valid) {
    if (formula === "cockcroftgault") {
      const sexFactor = sex === "female" ? 0.85 : 1;
      result = ((140 - a) * w * sexFactor) / (72 * c);
      label = "Creatinine Clearance (Cockcroft-Gault)";
    } else {
      const kappa = sex === "female" ? 0.7 : 0.9;
      const alpha = sex === "female" ? -0.241 : -0.302;
      const sexFactor = sex === "female" ? 1.012 : 1;
      const minRatio = Math.min(c / kappa, 1);
      const maxRatio = Math.max(c / kappa, 1);
      result = 142 * Math.pow(minRatio, alpha) * Math.pow(maxRatio, -1.2) * Math.pow(0.9938, a) * sexFactor;
      label = "eGFR (CKD-EPI 2021)";
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Creatinine (mg/dL)<input style={inputStyle} type="number" value={creat} onChange={(e) => setCreat(e.target.value)} /></label>
        <label style={labelStyle}>Age (years)<input style={inputStyle} type="number" value={age} onChange={(e) => setAge(e.target.value)} /></label>
        <label style={labelStyle}>Sex
          <select style={inputStyle} value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        {needsWeight && <label style={labelStyle}>Weight (kg)<input style={inputStyle} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>}
      </div>
      {valid && (
        <ResultBox>
          {label} = {result.toFixed(1)} mL/min{formula === "ckdepi2021" ? "/1.73m²" : ""}
          {result < 60 && " — suggests reduced kidney function"}
        </ResultBox>
      )}
    </div>
  );
}

function CorrectedCalciumCalc({ settings }) {
  const units = settings?.corrcalcium_units || "us";
  const [calcium, setCalcium] = useState("");
  const [albumin, setAlbumin] = useState("");
  const ca = num(calcium), al = num(albumin);
  const valid = ca !== null && al !== null;
  const corrected = valid ? (units === "si" ? ca + 0.02 * (40 - al) : ca + 0.8 * (4.0 - al)) : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Total Calcium ({units === "si" ? "mmol/L" : "mg/dL"})<input style={inputStyle} type="number" value={calcium} onChange={(e) => setCalcium(e.target.value)} /></label>
        <label style={labelStyle}>Albumin ({units === "si" ? "g/L" : "g/dL"})<input style={inputStyle} type="number" value={albumin} onChange={(e) => setAlbumin(e.target.value)} /></label>
      </div>
      {valid && <ResultBox>Corrected Calcium = {corrected.toFixed(2)} {units === "si" ? "mmol/L" : "mg/dL"}</ResultBox>}
    </div>
  );
}

function OsmolalityCalc() {
  const [na, setNa] = useState("");
  const [glucose, setGlucose] = useState("");
  const [bun, setBun] = useState("");
  const [measured, setMeasured] = useState("");
  const n = num(na), g = num(glucose), b = num(bun), m = num(measured);
  const valid = n !== null && g !== null && b !== null;
  const calc = valid ? 2 * n + g / 18 + b / 2.8 : null;
  const gap = valid && m !== null ? m - calc : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Na⁺ (mmol/L)<input style={inputStyle} type="number" value={na} onChange={(e) => setNa(e.target.value)} /></label>
        <label style={labelStyle}>Glucose (mg/dL)<input style={inputStyle} type="number" value={glucose} onChange={(e) => setGlucose(e.target.value)} /></label>
        <label style={labelStyle}>BUN (mg/dL)<input style={inputStyle} type="number" value={bun} onChange={(e) => setBun(e.target.value)} /></label>
        <label style={labelStyle}>Measured Osm (optional)<input style={inputStyle} type="number" value={measured} onChange={(e) => setMeasured(e.target.value)} /></label>
      </div>
      {valid && (
        <ResultBox>
          Calculated Osmolality = {calc.toFixed(1)} mOsm/kg
          {gap !== null && <> &nbsp;·&nbsp; Osmolar Gap = {gap.toFixed(1)} {gap > 10 ? "(elevated — consider unmeasured osmoles)" : ""}</>}
        </ResultBox>
      )}
    </div>
  );
}

function FeNaCalc() {
  const [urineNa, setUrineNa] = useState("");
  const [plasmaNa, setPlasmaNa] = useState("");
  const [urineCreat, setUrineCreat] = useState("");
  const [plasmaCreat, setPlasmaCreat] = useState("");
  const un = num(urineNa), pn = num(plasmaNa), uc = num(urineCreat), pc = num(plasmaCreat);
  const valid = un !== null && pn !== null && pn !== 0 && uc !== null && uc !== 0 && pc !== null;
  const fena = valid ? ((un * pc) / (pn * uc)) * 100 : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>Urine Na⁺<input style={inputStyle} type="number" value={urineNa} onChange={(e) => setUrineNa(e.target.value)} /></label>
        <label style={labelStyle}>Plasma Na⁺<input style={inputStyle} type="number" value={plasmaNa} onChange={(e) => setPlasmaNa(e.target.value)} /></label>
        <label style={labelStyle}>Urine Creatinine<input style={inputStyle} type="number" value={urineCreat} onChange={(e) => setUrineCreat(e.target.value)} /></label>
        <label style={labelStyle}>Plasma Creatinine<input style={inputStyle} type="number" value={plasmaCreat} onChange={(e) => setPlasmaCreat(e.target.value)} /></label>
      </div>
      {valid && (
        <ResultBox>
          FENa = {fena.toFixed(2)}% {fena < 1 ? "(suggests prerenal)" : fena > 2 ? "(suggests intrinsic renal)" : ""}
        </ResultBox>
      )}
      <WarnBox>Urine and plasma creatinine must be in the same unit (both mg/dL or both µmol/L) — the ratio cancels the unit out either way.</WarnBox>
    </div>
  );
}

const CALCULATORS = [
  { key: "lipid", label: "LDL / VLDL", icon: Activity, group: "Lipid Panel", desc: "From Total Cholesterol, TG, and HDL", Comp: LipidCalc },
  { key: "egfr", label: "eGFR", icon: Activity, group: "Renal & Electrolytes", desc: "CKD-EPI 2021 (race-free) — from Creatinine, age, sex", Comp: EgfrCalc },
  { key: "aniongap", label: "Anion Gap", icon: Beaker, group: "Renal & Electrolytes", desc: "From Na, Cl, HCO₃", Comp: AnionGapCalc },
  { key: "buncreat", label: "BUN/Creatinine Ratio", icon: Beaker, group: "Renal & Electrolytes", desc: "From BUN and Creatinine", Comp: BunCreatCalc },
  { key: "urineprotein", label: "Urine Protein/Creatinine", icon: Beaker, group: "Renal & Electrolytes", desc: "From urine protein and creatinine", Comp: UrineProteinCalc },
  { key: "fena", label: "FENa", icon: Beaker, group: "Renal & Electrolytes", desc: "Fractional excretion of sodium", Comp: FeNaCalc },
  { key: "osmolality", label: "Osmolality + Gap", icon: Beaker, group: "Renal & Electrolytes", desc: "Calculated osmolality and osmolar gap", Comp: OsmolalityCalc },
  { key: "ckmb", label: "CK-MB Index", icon: FlaskConical, group: "Chemistry", desc: "From CK-MB and CK Total", Comp: CkMbCalc },
  { key: "tibc", label: "Transferrin Saturation", icon: FlaskConical, group: "Chemistry", desc: "From Serum Iron and TIBC", Comp: TibcCalc },
  { key: "corrcalcium", label: "Corrected Calcium", icon: FlaskConical, group: "Chemistry", desc: "Adjusted for albumin", Comp: CorrectedCalciumCalc },
  { key: "dilution", label: "Dilution", icon: Droplet, group: "Dilution", desc: "How much diluent to add", Comp: DilutionCalc },
];

export default function Calculators({ config }) {
  const [open, setOpen] = useState(null);
  const settings = config?.calculator_settings || {};

  if (open) {
    const calc = CALCULATORS.find((c) => c.key === open);
    const Comp = calc.Comp;
    return (
      <div>
        <button onClick={() => setOpen(null)} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> Back to calculators</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{calc.label}</h2>
        <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>{calc.desc}</div>
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 18 }}>
          <Comp settings={settings} />
        </div>
      </div>
    );
  }

  const groups = [...new Set(CALCULATORS.map((c) => c.group))];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Calculate</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Quick lab calculators — pick one.</div>
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>{g.toUpperCase()}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {CALCULATORS.filter((c) => c.group === g).map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.key} onClick={() => setOpen(c.key)} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 12, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <Icon size={22} color="#0F7173" />
                  <div style={{ fontWeight: 700, fontSize: 13, textAlign: "center" }}>{c.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
