import React, { useState } from "react";
import { Camera, Loader2, Check, X } from "lucide-react";

// Loads the Tesseract.js OCR library from a CDN the first time it's needed
// (keeps it out of the main app bundle since most people won't use this).
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Couldn't load the text-recognition library — check your connection."));
    document.head.appendChild(script);
  });
}

// Common lab test aliases — each inner array is a group of names/abbreviations
// that all refer to the same test. Lets "Glucose" match "GLU", "TG" match
// "Triglycerides", etc., even when the letters don't overlap at all.
const ALIAS_GROUPS = [
  ["glucose", "glu", "bg", "rbs", "fbs", "blood glucose"],
  ["triglycerides", "tg", "trig", "trg"],
  ["cholesterol", "chol", "tc", "total cholesterol"],
  ["hdl", "hdl-c", "hdl cholesterol"],
  ["ldl", "ldl-c", "ldl cholesterol"],
  ["urea", "bun", "blood urea nitrogen"],
  ["creatinine", "crea", "creat", "cr"],
  ["uric acid", "ua", "uricacid"],
  ["total protein", "tp", "protein"],
  ["albumin", "alb"],
  ["total bilirubin", "tbil", "t.bil", "bilirubin total"],
  ["direct bilirubin", "dbil", "d.bil", "bilirubin direct"],
  ["alanine aminotransferase", "alt", "sgpt"],
  ["aspartate aminotransferase", "ast", "sgot"],
  ["alkaline phosphatase", "alp", "alk phos"],
  ["gamma gt", "ggt", "gamma-gt", "gamma glutamyl transferase"],
  ["amylase", "amyl", "amy"],
  ["lipase", "lip"],
  ["calcium", "ca", "ca2+"],
  ["magnesium", "mg", "mg2+"],
  ["phosphorus", "phos", "po4"],
  ["sodium", "na", "na+"],
  ["potassium", "k", "k+"],
  ["chloride", "cl", "cl-"],
  ["iron", "fe"],
  ["ferritin", "ferr"],
  ["crp", "c-reactive protein", "c reactive protein"],
  ["hemoglobin", "hb", "hgb"],
  ["hematocrit", "hct"],
  ["white blood cells", "wbc"],
  ["red blood cells", "rbc"],
  ["platelets", "plt"],
  ["ck-total", "ck", "creatine kinase", "cpk"],
  ["troponin", "trop", "trop i", "troponin i"],
  ["tsh", "thyroid stimulating hormone"],
  ["hba1c", "a1c", "glycated hemoglobin"],
];
function aliasGroupFor(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9+.\- ]/g, "").trim();
  return ALIAS_GROUPS.find((group) => group.includes(n));
}

// Edit distance — same idea as findCloseMatch in scheduleUtils, but more
// forgiving for short lab abbreviations (TG/TRG, UA/URIC, etc.) which that
// shared helper deliberately ignores below 4 characters.
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
function tokenMatchesAnalyte(token, analyteName) {
  const t = token.toLowerCase().replace(/[^a-z0-9+.\- ]/g, "").trim();
  const n = analyteName.toLowerCase().replace(/[^a-z0-9+.\- ]/g, "").trim();
  if (!t || !n) return false;
  if (t === n || t.includes(n) || n.includes(t)) return true;

  // Same clinical test under a different abbreviation (e.g. TG vs Triglycerides)?
  const groupA = aliasGroupFor(t);
  const groupB = aliasGroupFor(n);
  if (groupA && groupA === groupB) return true;

  const maxDist = n.length <= 3 ? 1 : 2; // short abbreviations (TG, UA…) tolerate 1 typo; longer names tolerate 2
  return editDistance(t, n) <= maxDist;
}

// Very rough line parser: for each known analyte, look for its name
// (or a close abbreviation) somewhere in the OCR text and grab the first
// number that follows it on the same or next line.
function extractValues(rawText, analytes) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const numberRe = /-?\d+[.,]?\d*/;
  const found = {};
  const unmatched = [];

  for (const a of analytes) {
    let hit = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const tokens = line.split(/\s+/);
      const matchIdx = tokens.findIndex((tok) => tokenMatchesAnalyte(tok, a.name));
      if (matchIdx === -1) continue;
      // Look for a number after the matched token on this line, else the next line.
      const restOfLine = tokens.slice(matchIdx + 1).join(" ");
      const numMatch = numberRe.exec(restOfLine) || numberRe.exec(line) || (lines[i + 1] ? numberRe.exec(lines[i + 1]) : null);
      if (numMatch) { hit = numMatch[0].replace(",", "."); break; }
    }
    if (hit !== null) found[a.name] = hit;
    else unmatched.push(a.name);
  }
  return { found, unmatched };
}

export default function ScanControlPhoto({ analytes, onExtracted }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null); // { found, unmatched }

  async function preprocessImage(file) {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
    // Cap the working size so very large phone photos don't slow things down.
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;
    // Grayscale + a simple contrast boost — this alone makes Tesseract's
    // output far more consistent across different lighting/angles.
    const contrast = 1.35;
    for (let i = 0; i < px.length; i += 4) {
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const boosted = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));
      px[i] = px[i + 1] = px[i + 2] = boosted;
    }
    ctx.putImageData(imgData, 0, 0);
    URL.revokeObjectURL(img.src);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress("Loading text reader…");
    try {
      const Tesseract = await loadTesseract();
      setProgress("Preparing photo…");
      const processed = await preprocessImage(file);
      setProgress("Reading photo… this can take a minute");
      const { data } = await Tesseract.recognize(processed, "eng", {
        logger: (m) => { if (m.status === "recognizing text") setProgress(`Reading photo… ${Math.round(m.progress * 100)}%`); },
      });
      const { found, unmatched } = extractValues(data.text, analytes);
      setResult({ found, unmatched });
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(false);
      setProgress("");
      e.target.value = "";
    }
  }

  function applyResults() {
    onExtracted(result.found);
    setResult(null);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #C7D1CE", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#516361", cursor: "pointer" }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        {busy ? (progress || "Working…") : "📷 Scan from photo (beta) — camera or gallery"}
        <input type="file" accept="image/*" onChange={handleFile} disabled={busy} style={{ display: "none" }} />
      </label>
      <div style={{ fontSize: 11, color: "#8A9694", marginTop: 4 }}>
        Free, on-device text reading — works best with a clear, well-lit, straight-on photo. <strong>Tip:</strong> take the photo first, crop it tight to just the results table (zoomed in, no extra background), then pick that cropped photo here — much more accurate than a full-page shot. <strong style={{ color: "#B8860B" }}>Decimal points are the most common misread</strong> (e.g. 15 instead of 1.5) — always double-check every number before saving.
      </div>

      {result && (
        <div style={{ marginTop: 10, background: "#F8FAF9", border: "1px solid #E1E8E5", borderRadius: 8, padding: 12, fontSize: 12.5 }}>
          {result.error ? (
            <div style={{ color: "#C1432B" }}>❌ {result.error}</div>
          ) : (
            <>
              {Object.keys(result.found).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: "#2F6B4F", marginBottom: 4 }}><Check size={13} style={{ verticalAlign: -2 }} /> Found {Object.keys(result.found).length} value{Object.keys(result.found).length === 1 ? "" : "s"}:</div>
                  {Object.entries(result.found).map(([name, val]) => (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between", color: "#516361" }}>
                      <span>{name}</span><span style={{ fontWeight: 600 }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.unmatched.length > 0 && (
                <div style={{ color: "#B8860B", marginBottom: 8 }}>
                  <X size={13} style={{ verticalAlign: -2 }} /> Couldn't find: {result.unmatched.join(", ")} — enter these manually.
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {Object.keys(result.found).length > 0 && (
                  <button onClick={applyResults} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 700 }}>Fill in these values</button>
                )}
                <button onClick={() => setResult(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12.5 }}>Dismiss</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
