import React, { useState } from "react";
import { Camera, Loader2, Check, X } from "lucide-react";
import { findCloseMatch } from "./scheduleUtils";

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

// Very rough line parser: for each known analyte, look for its name
// somewhere in the OCR text and grab the first decimal number that follows
// it on the same or next line.
function extractValues(rawText, analytes) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const numberRe = /-?\d+(\.\d+)?/;
  const found = {};
  const unmatched = [];

  for (const a of analytes) {
    let hit = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = findCloseMatch(line, [a.name]);
      const containsName = line.toLowerCase().includes(a.name.toLowerCase());
      if (containsName || match?.exact || match?.suggestion) {
        // Look for a number on this line (after the name) or the next line.
        const afterName = line.toLowerCase().split(a.name.toLowerCase())[1] || "";
        const numMatch = numberRe.exec(afterName) || numberRe.exec(line) || (lines[i + 1] ? numberRe.exec(lines[i + 1]) : null);
        if (numMatch) { hit = numMatch[0]; break; }
      }
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

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress("Loading text reader…");
    try {
      const Tesseract = await loadTesseract();
      setProgress("Reading photo… this can take a minute");
      const { data } = await Tesseract.recognize(file, "eng", {
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
        {busy ? (progress || "Working…") : "📷 Scan from photo (beta)"}
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} style={{ display: "none" }} />
      </label>
      <div style={{ fontSize: 11, color: "#8A9694", marginTop: 4 }}>
        Free, on-device text reading — works best with a clear, well-lit, straight-on photo. Always double-check the numbers before saving.
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
