// Reads culture & sensitivity reports (text PDFs such as the RaiDx reports)
// in the browser and turns them into antibiogram isolates. Nothing is
// uploaded: the PDF is read locally and only the resulting isolate is saved.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Rebuild text lines from positioned text items (same y = same line).
async function pdfLines(file) {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str.trim() });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join("  "));
    lines.push("<<PAGE>>");
  }
  return lines;
}

const SPECIMENS = [
  [/urine|\bmsu\b|catheter urine/i, "urine"],
  [/blood/i, "blood"],
  [/csf|cerebrospinal/i, "csf"],
  [/sputum|tracheal|\bbal\b|bronch|respiratory|endotracheal|\bett\b/i, "sputum"],
  [/stool|faec|fec/i, "stool"],
  [/urethral/i, "urethral"],
  [/vagin|\bhvs\b|cervi/i, "other"],
  [/wound|pus|swab|abscess|tissue|ulcer|aspirate/i, "pus"],
];

// Report antibiotic names that differ from the engine's names.
const ABX_ALIASES = {
  "cotrimoxazole": "Trimethoprim/Sulfamethoxazole",
  "trimethoprimsulfamethoxazole": "Trimethoprim/Sulfamethoxazole",
  "sulfamethoxazoletrimethoprim": "Trimethoprim/Sulfamethoxazole",
  "trimethoprimsulpha": "Trimethoprim/Sulfamethoxazole",
  "amoxicillinclavulanicacid": "Amoxicillin/Clavulanate",
  "amoxicillinclavulanate": "Amoxicillin/Clavulanate",
  "augmentin": "Amoxicillin/Clavulanate",
  "ampicillinsulbactam": "Ampicillin/Sulbactam",
  "piperacillintazobactam": "Piperacillin/Tazobactam",
  "tazocin": "Piperacillin/Tazobactam",
  "ceftazidimeavibactam": "Ceftazidime/Avibactam",
  "rifampin": "Rifampicin",
  "cefuroximeaxetil": "Cefuroxime",
  "ticarcillinclavulanicacid": "Ticarcillin/Clavulanate",
  "ceftolozanetazobactam": "Ceftolozane/Tazobactam",
  "imipenemcilastatin": "Imipenem",
};
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
// Two-part names the report wraps onto two lines ("Piperacillin /" then
// "Tazobactam" below): the part before the slash, with the slash, names the
// combination — never the single drug.
const SLASH_PREFIX = {
  piperacillin: "Piperacillin/Tazobactam",
  trimethoprim: "Trimethoprim/Sulfamethoxazole",
  sulfamethoxazole: "Trimethoprim/Sulfamethoxazole",
  amoxicillin: "Amoxicillin/Clavulanate",
  ampicillin: "Ampicillin/Sulbactam",
  ceftazidime: "Ceftazidime/Avibactam",
  ceftolozane: "Ceftolozane/Tazobactam",
  ticarcillin: "Ticarcillin/Clavulanate",
  imipenem: "Imipenem",
};

// RaiDx reports print dates either day/month/year or month/day/year. A part
// above 12 settles it; otherwise pick the order that keeps collection,
// receipt and report closest together (they are days apart, not months).
function readDates(text) {
  const tokens = [];
  const re = /(Registered|Collected|Received|Reported) At\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/gi;
  let m;
  while ((m = re.exec(text))) tokens.push({ k: m[1].toLowerCase(), a: +m[2], b: +m[3], y: m[4].length === 2 ? 2000 + +m[4] : +m[4] });
  if (!tokens.length) return { collected: "", order: "" };
  const iso = (t, dmy) => {
    const d = dmy ? t.a : t.b, mo = dmy ? t.b : t.a;
    return `${t.y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let dmy;
  if (tokens.some((t) => t.a > 12)) dmy = true;
  else if (tokens.some((t) => t.b > 12)) dmy = false;
  else {
    const span = (flag) => {
      const ts = tokens.map((t) => Date.parse(iso(t, flag)));
      return Math.max(...ts) - Math.min(...ts);
    };
    dmy = span(true) <= span(false);
  }
  const c = tokens.find((t) => t.k === "collected") || tokens.find((t) => t.k === "registered") || tokens[0];
  return { collected: iso(c, dmy), order: dmy ? "day/month" : "month/day" };
}

const NOT_AN_ORGANISM = /no (bacterial )?growth|normal (skin |flora|commensal)|mixed growth|contaminated specimen|no pathogen/i;

function matchOrganism(raw, organisms) {
  const clean = raw.replace(/\s+(ssp|subsp|spp)\.?(\s.*)?$/i, "").replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  // "Methicillin Resistant Staphylococcus aureus (MRSA)" -> the genus + species inside it
  const key = Object.keys(organisms).find((k) => {
    const kw = k.toLowerCase().replace(/\s*\(.*\)/, "");
    return lower === kw || lower.startsWith(kw + " ") || lower.includes(" " + kw) || lower.startsWith(kw);
  });
  return { name: key || clean, known: !!key };
}

/**
 * @param {File} file
 * @param {{ORGANISMS: object, ANTIBIOTICS: Array<{name:string}>}} engine
 * @returns {Promise<{file:string, isolates:Array, notes:string[]}>}
 */
export async function parseLabReport(file, engine) {
  const lines = await pdfLines(file);
  const text = lines.join("\n");
  const notes = [];
  const mrn = (/MRN:\s*([A-Za-z0-9-]+)/.exec(text) || [])[1] || "";
  const orderId = (/(?:Reservation ID|Order(?: No\.?| ID)?):\s*([A-Za-z0-9-]+)/i.exec(text) || [])[1] || "";
  const { collected } = readDates(text);
  const abxByNorm = {};
  engine.ANTIBIOTICS.forEach((a) => (abxByNorm[norm(a.name)] = a.name));
  const abxName = (s) => {
    if (/\/\s*$/.test(s)) return SLASH_PREFIX[norm(s)] || null;
    return abxByNorm[norm(s)] || ABX_ALIASES[norm(s)] || null;
  };

  // Each "Isolated Organism" starts a block running until the next one or the page end.
  const isolates = [];
  lines.forEach((line, i) => {
    const m = /Isolated Organism\s*\d*\s*:\s*(.+)$/i.exec(line);
    if (!m || NOT_AN_ORGANISM.test(m[1])) return;
    let title = "";
    for (let j = i; j >= 0 && j > i - 30; j--) if (/Culture/i.test(lines[j]) && !/Culture Result/i.test(lines[j])) { title = lines[j]; break; }
    const specimen = (SPECIMENS.find(([re]) => re.test(title)) || [null, "other"])[1];
    const results = {};
    const unknown = [];
    let comment = "";
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l === "<<PAGE>>" || /Isolated Organism/i.test(l)) break;
      if (/Resistant|Intermediate|Sensitive/i.test(l)) continue;
      if (/contamina/i.test(l)) comment += " contamination";
      if (/\bMRSA\b|\bESBL\b|\bCRE\b|carbapenem.?resistant|\bVRE\b/i.test(l)) comment += " " + l;
      const re = /([A-Za-z][A-Za-z/\- ]*?)\s+(S|I|R)(?=\s|$)/g;
      let r;
      while ((r = re.exec(l))) {
        const label = r[1].trim();
        if (/^(result|antibiotics?)$/i.test(label)) continue;
        const name = abxName(label);
        if (name) results[name] = r[2];
        else if (label.length > 3) unknown.push(label);
      }
    }
    const org = matchOrganism(m[1].trim(), engine.ORGANISMS);
    let organism = org.name;
    let mdro = "";
    if (/staphylococcus aureus/i.test(m[1])) {
      const mrsa = results.Oxacillin === "R" || results.Cefoxitin === "R" || /MRSA|methicillin.?resistant/i.test(comment + " " + m[1]);
      organism = mrsa ? "Staphylococcus aureus (MRSA)" : "Staphylococcus aureus (MSSA)";
    }
    // MDRO type from the MOH surveillance definitions, plus what the report says (ESBL etc.)
    const tags = new Set(engine.classifyMdro ? engine.classifyMdro(organism, results) : []);
    if (organism === "Staphylococcus aureus (MRSA)") tags.add("MRSA");
    for (const t of (comment.match(/\b(ESBL|CRE|VRE|MRSA)\b/gi) || [])) tags.add(t.toUpperCase());
    if (/carbapenem.?resistant/i.test(comment)) tags.add("CRE");
    mdro = [...tags].join(", ");
    const cons = /^Staphylococcus (epidermidis|hominis|haemolyticus)/.test(organism);
    const isolateNotes = [];
    if (!org.known) isolateNotes.push(`"${organism}" is not in the antibiogram organism list`);
    if (unknown.length) isolateNotes.push("Not recognised: " + [...new Set(unknown)].join(", "));
    if (!Object.keys(results).length) isolateNotes.push("No sensitivity results found");
    isolates.push({
      isolate: {
        mrn, orderId, collectedAt: collected, specimen, location: "unknown", organism, mdro,
        screening: false,
        contaminant: /contamination/.test(comment) || (cons && specimen === "blood"),
        results,
      },
      notes: isolateNotes,
    });
  });
  if (!isolates.length) {
    if (/no growth|negative/i.test(text) && !/Positive/i.test(text)) notes.push("No growth — nothing to add");
    else notes.push("No isolated organism found in this report");
  }
  if (!mrn) notes.push("MRN not found");
  if (!collected) notes.push("Collection date not found");
  return { file: file.name, isolates, notes };
}
