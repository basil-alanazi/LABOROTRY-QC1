import * as XLSX from "xlsx";

const COLUMN_HINTS = {
  name: ["name", "full name", "employee", "staff", "اسم", "الموظف"],
  job_number: ["job", "number", "id", "employee id", "رقم", "الرقم الوظيفي"],
  department: ["department", "dept", "section", "قسم", "الاقسام"],
};

function normalizeHeader(h) {
  return String(h ?? "").trim().toLowerCase();
}

function guessColumnRoles(headers) {
  const roles = { name: null, job_number: null, department: null };
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

function extractStaffFromGrid(grid) {
  if (!grid.length) return [];
  const firstRow = grid[0].map(normalizeHeader);
  const looksLikeHeader = firstRow.some((h) => Object.values(COLUMN_HINTS).flat().some((kw) => h.includes(kw)));
  const headerRow = looksLikeHeader ? grid[0] : [];
  const dataRows = looksLikeHeader ? grid.slice(1) : grid;
  const roles = looksLikeHeader ? guessColumnRoles(headerRow) : { name: 0, job_number: 1, department: 2 };
  if (roles.name === null) roles.name = 0;

  const results = [];
  for (const row of dataRows) {
    const name = row[roles.name];
    if (!name || String(name).trim() === "") continue;
    results.push({
      full_name: String(name).trim(),
      job_number: roles.job_number !== null ? String(row[roles.job_number] ?? "").trim() : "",
      department: roles.department !== null ? String(row[roles.department] ?? "").trim() : "",
    });
  }
  return results;
}

async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return extractStaffFromGrid(grid);
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
  if (grid.length) return extractStaffFromGrid(grid);

  // Fallback: one name per line, optionally "Name, JobNumber, Department"
  const text = html.replace(/<[^>]+>/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const [full_name, job_number, department] = line.split(",").map((s) => (s || "").trim());
    return { full_name, job_number: job_number || "", department: department || "" };
  }).filter((r) => r.full_name);
}

export async function parseStaffFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return { rows: await parseSpreadsheet(file) };
  if (["docx"].includes(ext)) return { rows: await parseWord(file) };
  throw new Error("صيغة غير مدعومة. استخدم ملف Excel (.xlsx/.xls/.csv) أو Word (.docx).");
}
