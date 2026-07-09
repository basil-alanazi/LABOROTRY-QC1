import * as XLSX from "xlsx";

// Keyword sets used to guess which column is which, regardless of exact header text.
const COLUMN_HINTS = {
  name: ["analyte", "test", "parameter", "name", "item", "التحليل", "اسم"],
  low: ["low", "min", "lower", "from", "أدنى", "الأدنى"],
  high: ["high", "max", "upper", "to", "أعلى", "الأعلى"],
  mean: ["mean", "target", "avg", "average", "متوسط"],
  sd: ["sd", "std", "deviation", "s.d", "انحراف"],
  unit: ["unit", "units", "وحدة"],
};

function normalizeHeader(h) {
  return String(h ?? "").trim().toLowerCase();
}

// Given a list of header strings, guess the role of each column index.
// Returns e.g. { name: 0, low: 2, high: 3, mean: null, sd: null, unit: 1 }
function guessColumnRoles(headers) {
  const roles = { name: null, low: null, high: null, mean: null, sd: null, unit: null };
  const used = new Set();

  for (const role of Object.keys(COLUMN_HINTS)) {
    let bestIdx = null;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const norm = normalizeHeader(h);
      if (bestIdx === null && COLUMN_HINTS[role].some((kw) => norm.includes(kw))) {
        bestIdx = i;
      }
    });
    if (bestIdx !== null) {
      roles[role] = bestIdx;
      used.add(bestIdx);
    }
  }
  return roles;
}

// If headers didn't give us a "name" column (e.g. no header row at all),
// fall back to: first column that's mostly text (not numeric) is the name.
function fallbackNameColumn(rows, roles, colCount) {
  if (roles.name !== null) return roles.name;
  for (let c = 0; c < colCount; c++) {
    if (Object.values(roles).includes(c)) continue;
    const sample = rows.slice(0, 10).map((r) => r[c]);
    const textCount = sample.filter((v) => v !== undefined && v !== "" && isNaN(Number(v))).length;
    if (textCount >= sample.filter((v) => v !== undefined && v !== "").length * 0.6) return c;
  }
  return 0;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

// Turns a raw 2D array (first row may or may not be a header) into
// { name, unit, low, high, mean, sd } rows.
function extractRangesFromGrid(grid) {
  if (!grid.length) return { rows: [], usedHeaderRow: false };

  const firstRow = grid[0].map(normalizeHeader);
  const looksLikeHeader = firstRow.some((h) =>
    Object.values(COLUMN_HINTS).flat().some((kw) => h.includes(kw))
  );

  const headerRow = looksLikeHeader ? grid[0] : [];
  const dataRows = looksLikeHeader ? grid.slice(1) : grid;
  const colCount = Math.max(...grid.map((r) => r.length), 0);

  const roles = looksLikeHeader ? guessColumnRoles(headerRow) : { name: null, low: null, high: null, mean: null, sd: null, unit: null };
  roles.name = fallbackNameColumn(dataRows, roles, colCount);

  // If we still have no low/high/mean at all, try positional fallback:
  // Name, Unit, Low, High (a common simple layout) when there are exactly 4 columns.
  if (roles.low === null && roles.high === null && roles.mean === null && colCount === 4 && roles.name === 0) {
    roles.unit = roles.unit ?? 1;
    roles.low = 2;
    roles.high = 3;
  } else if (roles.low === null && roles.high === null && roles.mean === null && colCount === 3 && roles.name === 0) {
    roles.low = 1;
    roles.high = 2;
  }

  const results = [];
  for (const row of dataRows) {
    const name = row[roles.name];
    if (!name || String(name).trim() === "") continue;
    const entry = {
      name: String(name).trim(),
      unit: roles.unit !== null ? String(row[roles.unit] ?? "").trim() : "",
      rangeLow: roles.low !== null ? toNumberOrNull(row[roles.low]) : null,
      rangeHigh: roles.high !== null ? toNumberOrNull(row[roles.high]) : null,
      mean: roles.mean !== null ? toNumberOrNull(row[roles.mean]) : null,
      sd: roles.sd !== null ? toNumberOrNull(row[roles.sd]) : null,
    };
    if (entry.rangeLow === null && entry.rangeHigh === null && entry.mean === null && entry.sd === null) continue;
    results.push(entry);
  }

  return { rows: results, usedHeaderRow: looksLikeHeader, roles };
}

// Parses an .xlsx/.xls/.csv file into grid rows via SheetJS, then extracts ranges.
async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return extractRangesFromGrid(grid);
}

// Parses a .docx file: tries to find a table via mammoth's raw HTML conversion,
// then falls back to line-based "Name: Low-High" style text parsing.
async function parseWord(file) {
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  const buf = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });

  const grid = [];
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/);
  if (tableMatch) {
    const rowMatches = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
    rowMatches.forEach((rowHtml) => {
      const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) || [];
      const cells = cellMatches.map((c) => c.replace(/<[^>]+>/g, "").trim());
      if (cells.length) grid.push(cells);
    });
  }

  if (grid.length) return extractRangesFromGrid(grid);

  // Fallback: parse plain text lines like "Glucose: 70-110 mg/dL" or "Glucose 70 110"
  const text = html.replace(/<[^>]+>/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const results = [];
  const lineRegex = /^([A-Za-z\u0600-\u06FF0-9 .%/-]+?)[:\s]+([\d.]+)\s*[-–to]+\s*([\d.]+)\s*([a-zA-Z%/]*)/i;
  for (const line of lines) {
    const m = line.match(lineRegex);
    if (m) {
      results.push({ name: m[1].trim(), unit: m[4] || "", rangeLow: Number(m[2]), rangeHigh: Number(m[3]), mean: null, sd: null });
    }
  }
  return { rows: results, usedHeaderRow: false };
}

// Public entry point: detects file type and returns { rows, usedHeaderRow }.
// rows: [{ name, unit, rangeLow, rangeHigh, mean, sd }, ...]
export async function parseRangeFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return parseSpreadsheet(file);
  if (["docx"].includes(ext)) return parseWord(file);
  throw new Error("صيغة غير مدعومة. استخدم ملف Excel (.xlsx/.xls/.csv) أو Word (.docx).");
}
