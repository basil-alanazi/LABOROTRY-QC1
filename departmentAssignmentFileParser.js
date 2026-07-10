import * as XLSX from "xlsx";

function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

function matchStaffName(raw, staffNames) {
  const norm = normalize(raw);
  if (!norm) return null;
  let exact = staffNames.find((n) => normalize(n) === norm);
  if (exact) return exact;
  if (norm.length < 5) return null;
  let partial = staffNames.find((n) => norm.includes(normalize(n)) || normalize(n).includes(norm));
  return partial || null;
}

function parseDayCell(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
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

// Unlike shift codes, a department name can contain spaces ("Blood Bank"),
// so the whole cell text is kept as-is (just trimmed).
function parseCellValue(raw) {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  return { department_name: str };
}

function extractAssignmentsFromGrid(grid, staffNames) {
  if (grid.length < 2) return { entries: [], unmatchedStaffHeaders: [] };

  const maxCols = Math.max(...grid.map((r) => r.length), 0);

  let bestRowIdx = -1, bestRowMatches = 0;
  for (let r = 0; r < Math.min(10, grid.length - 1); r++) {
    const matches = grid[r].slice(1).filter((h) => matchStaffName(h, staffNames)).length;
    if (matches > bestRowMatches) { bestRowMatches = matches; bestRowIdx = r; }
  }

  let bestColIdx = -1, bestColMatches = 0;
  for (let c = 0; c < Math.min(4, maxCols); c++) {
    const matches = grid.slice(1).filter((row) => matchStaffName(row[c], staffNames)).length;
    if (matches > bestColMatches) { bestColMatches = matches; bestColIdx = c; }
  }

  const entries = [];
  const unmatchedStaffHeaders = [];

  if (bestRowMatches >= bestColMatches && bestRowMatches > 0) {
    const headerRow = grid[bestRowIdx];
    const staffForCol = headerRow.map((h, i) => (i === 0 ? null : matchStaffName(h, staffNames)));
    headerRow.forEach((h, i) => { if (i > 0 && h && String(h).trim() && !staffForCol[i]) unmatchedStaffHeaders.push(h); });
    grid.slice(bestRowIdx + 1).forEach((row) => {
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

  if (bestColMatches > 0) {
    const daysRow = grid[0];
    const staffForRow = grid.map((row, i) => (i === 0 ? null : matchStaffName(row[bestColIdx], staffNames)));
    grid.forEach((row, i) => { if (i > 0 && row[bestColIdx] && String(row[bestColIdx]).trim() && !staffForRow[i]) unmatchedStaffHeaders.push(row[bestColIdx]); });
    grid.forEach((row, ri) => {
      if (ri === 0) return;
      const staffName = staffForRow[ri];
      if (!staffName) return;
      row.forEach((cell, ci) => {
        if (ci <= bestColIdx) return;
        const day = parseDayCell(daysRow[ci]);
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
  return extractAssignmentsFromGrid(grid, staffNames);
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
  return extractAssignmentsFromGrid(grid, staffNames);
}

// Public entry point. staffNames = array of existing staff_members.full_name.
export async function parseAssignmentFile(file, staffNames) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return parseSpreadsheet(file, staffNames);
  if (["docx"].includes(ext)) return parseWord(file, staffNames);
  throw new Error("Unsupported file type. Use an Excel file (.xlsx/.xls/.csv) or Word (.docx).");
}
