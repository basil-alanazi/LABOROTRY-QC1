import * as XLSX from "xlsx";

const COLUMN_HINTS = {
  code: ["code", "shift code", "shift", "كود"],
  name: ["name", "shift name", "label", "اسم"],
  start: ["start", "from", "بداية"],
  end: ["end", "to", "نهاية"],
  hours: ["hours", "time", "key", "الوقت", "الدوام"],
  color: ["color", "colour", "لون"],
  night: ["night"],
  off: ["off", "vacation", "day off"],
};

function normalizeHeader(h) {
  return String(h ?? "").trim().toLowerCase();
}

function guessColumnRoles(headers) {
  const roles = {};
  const used = new Set();
  for (const role of Object.keys(COLUMN_HINTS)) {
    let bestIdx = null;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const norm = normalizeHeader(h);
      if (bestIdx === null && COLUMN_HINTS[role].some((kw) => norm.includes(kw))) bestIdx = i;
    });
    if (bestIdx !== null) { roles[role] = bestIdx; used.add(bestIdx); }
  }
  return roles;
}

// Converts "7:00AM", "7:00 AM", "07:00", "19:30" into 24h "HH:MM".
function parseTimeToHHMM(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  // Excel sometimes gives a fraction-of-day number for time cells.
  if (typeof raw === "number") {
    const totalMinutes = Math.round(raw * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const str = String(raw).trim();
  const m = str.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?$/);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] ? m[3].toUpperCase() : null;
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Splits a combined range string like "7:00AM-4:30PM" or "7:00 AM to 4:30 PM"
// into { start, end } in 24h "HH:MM".
function parseTimeRange(raw) {
  const str = String(raw ?? "").trim();
  if (!str) return { start: "", end: "" };
  const parts = str.split(/-|–|to/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { start: "", end: "" };
  return { start: parseTimeToHHMM(parts[0]), end: parseTimeToHHMM(parts[1]) };
}

function isOffLike(name, code) {
  const s = `${name} ${code}`.toLowerCase();
  return s.includes("off") || s.includes("vacation") || s.includes("day off");
}

function extractShiftsFromGrid(grid) {
  if (!grid.length) return [];
  const firstRow = grid[0].map(normalizeHeader);
  const looksLikeHeader = firstRow.some((h) => Object.values(COLUMN_HINTS).flat().some((kw) => h.includes(kw)));
  const headerRow = looksLikeHeader ? grid[0] : [];
  const dataRows = looksLikeHeader ? grid.slice(1) : grid;
  const roles = looksLikeHeader ? guessColumnRoles(headerRow) : {};
  if (roles.code === undefined) roles.code = 0;

  const results = [];
  for (const row of dataRows) {
    const code = row[roles.code];
    if (!code || String(code).trim() === "") continue;
    const codeStr = String(code).trim();
    const name = roles.name !== undefined ? String(row[roles.name] ?? "").trim() : codeStr;

    let start = "", end = "";
    if (roles.start !== undefined && roles.end !== undefined) {
      start = parseTimeToHHMM(row[roles.start]);
      end = parseTimeToHHMM(row[roles.end]);
    } else if (roles.hours !== undefined) {
      const range = parseTimeRange(row[roles.hours]);
      start = range.start; end = range.end;
    } else {
      // Fallback: no recognizable time columns — try any other column that
      // looks like a "start-end" range string (e.g. "7:00AM-4:30PM").
      for (let i = 0; i < row.length; i++) {
        if (i === roles.code) continue;
        const range = parseTimeRange(row[i]);
        if (range.start && range.end) { start = range.start; end = range.end; break; }
      }
    }

    const color = roles.color !== undefined ? String(row[roles.color] ?? "").trim() : "";
    const nightRaw = roles.night !== undefined ? String(row[roles.night] ?? "").trim().toLowerCase() : "";
    const night_shift = ["1", "true", "yes", "y", "نعم"].includes(nightRaw);
    const offRaw = roles.off !== undefined ? String(row[roles.off] ?? "").trim().toLowerCase() : "";
    const is_off = ["1", "true", "yes", "y", "نعم"].includes(offRaw) || (!start && !end) || isOffLike(name, codeStr);

    results.push({ code: codeStr, name: name || codeStr, start_time: is_off ? "" : start, end_time: is_off ? "" : end, color: color || "", night_shift, is_off });
  }
  return results;
}

async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return extractShiftsFromGrid(grid);
}

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
  if (grid.length) return extractShiftsFromGrid(grid);

  // Fallback: a legend-style text block like "D/7:00AM-4:30PM  D2/7:00AM-5:00PM ...".
  const text = html.replace(/<[^>]+>/g, " ");
  const pairs = text.match(/[A-Za-z0-9*]+\s*\/\s*[\d:apmAPM.\- ]+/g) || [];
  return pairs.map((p) => {
    const [code, timeStr] = p.split("/").map((s) => s.trim());
    const range = parseTimeRange(timeStr);
    const is_off = !range.start && !range.end;
    return { code, name: code, start_time: range.start, end_time: range.end, color: "", night_shift: false, is_off };
  }).filter((r) => r.code);
}

export async function parseShiftTemplateFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return { rows: await parseSpreadsheet(file) };
  if (["docx"].includes(ext)) return { rows: await parseWord(file) };
  throw new Error("Unsupported file type. Use an Excel file (.xlsx/.xls/.csv) or Word (.docx).");
}
