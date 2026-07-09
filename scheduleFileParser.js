import * as XLSX from "xlsx";

function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

// Fuzzy-matches a raw header cell against the known staff roster.
function matchStaffName(raw, staffNames) {
  const norm = normalize(raw);
  if (!norm) return null;
  let exact = staffNames.find((n) => normalize(n) === norm);
  if (exact) return exact;
  let partial = staffNames.find((n) => norm.includes(normalize(n)) || normalize(n).includes(norm));
  return partial || null;
}

// Tries to read a date/day cell into a day-of-month number (1-31).
// Accepts plain numbers ("1", "2"...), "1 Wed", full dates, or Excel date serials.
function parseDayCell(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    // A small number is almost certainly already a day-of-month (1-31).
    if (raw >= 1 && raw <= 31) return raw;
    return null;
  }
  const str = String(raw).trim();
  const numMatch = str.match(/^(\d{1,2})/);
  if (numMatch) return Number(numMatch[1]);
  const dateMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) return Number(dateMatch[3]);
  return null;
}

// Parses a cell's raw text into { shift_code, is_late, is_absent, is_sick }.
// Accepts "M", "M L", "M-L-A", "OFF", etc. Flags are standalone L/A/S tokens.
function parseCellValue(raw) {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const tokens = str.split(/[\s\-\/,]+/).filter(Boolean);
  let shift_code = "";
  let is_late = false, is_absent = false, is_sick = false;
  tokens.forEach((t) => {
    const up = t.toUpperCase();
    if (up === "L") is_late = true;
    else if (up === "A") is_absent = true;
    else if (up === "S") is_sick = true;
    else if (!shift_code) shift_code = t;
  });
  if (!shift_code && !is_late && !is_absent && !is_sick) return null;
  return { shift_code: shift_code || "", is_late, is_absent, is_sick };
}

// Detects orientation and extracts entries.
// Returns { entries, unmatchedStaffHeaders, orientation }
// entries: [{ staffName, day, shift_code, is_late, is_absent, is_sick }]
function extractScheduleFromGrid(grid, staffNames) {
  if (grid.length < 2) return { entries: [], unmatchedStaffHeaders: [] };

  const headerRow = grid[0];
  const firstCol = grid.map((r) => r[0]);

  // Orientation A: header row (excluding col 0) = staff names, first column = day.
  const headerMatches = headerRow.slice(1).filter((h) => matchStaffName(h, staffNames)).length;
  // Orientation B: first column (excluding row 0) = staff names, header row = days.
  const colMatches = firstCol.slice(1).filter((h) => matchStaffName(h, staffNames)).length;

  const entries = [];
  const unmatchedStaffHeaders = [];

  if (headerMatches >= colMatches && headerMatches > 0) {
    // Staff across columns, days down rows.
    const staffForCol = headerRow.map((h, i) => (i === 0 ? null : matchStaffName(h, staffNames)));
    headerRow.forEach((h, i) => { if (i > 0 && !staffForCol[i]) unmatchedStaffHeaders.push(h); });
    grid.slice(1).forEach((row) => {
      const day = parseDayCell(row[0]);
      if (day === null) return;
      row.forEach((cell, i) => {
        if (i === 0) return;
        const staffName = staffForCol[i];
        if (!staffName) return;
        const parsedCell = parseCellValue(cell);
        if (parsedCell) entries.push({ staffName, day, ...parsedCell });
      });
    });
    return { entries, unmatchedStaffHeaders, orientation: "staff-columns" };
  }

  if (colMatches > 0) {
    // Staff down rows, days across columns.
    const staffForRow = firstCol.map((h, i) => (i === 0 ? null : matchStaffName(h, staffNames)));
    firstCol.forEach((h, i) => { if (i > 0 && !staffForRow[i]) unmatchedStaffHeaders.push(h); });
    grid.slice(1).forEach((row, ri) => {
      const staffName = staffForRow[ri + 1];
      if (!staffName) return;
      row.forEach((cell, ci) => {
        if (ci === 0) return;
        const day = parseDayCell(headerRow[ci]);
        if (day === null) return;
        const parsedCell = parseCellValue(cell);
        if (parsedCell) entries.push({ staffName, day, ...parsedCell });
      });
    });
    return { entries, unmatchedStaffHeaders, orientation: "staff-rows" };
  }

  return { entries: [], unmatchedStaffHeaders: [] };
}

async function parseSpreadsheet(file, staffNames) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return extractScheduleFromGrid(grid, staffNames);
}

async function parseWord(file, staffNames) {
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
  return extractScheduleFromGrid(grid, staffNames);
}

// Public entry point. staffNames = array of existing staff_members.full_name.
export async function parseScheduleFile(file, staffNames) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return parseSpreadsheet(file, staffNames);
  if (["docx"].includes(ext)) return parseWord(file, staffNames);
  throw new Error("صيغة غير مدعومة. استخدم ملف Excel (.xlsx/.xls/.csv) أو Word (.docx).");
}
