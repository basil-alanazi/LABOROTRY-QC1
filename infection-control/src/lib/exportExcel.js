import * as XLSX from "xlsx";

// sheets: [{ name, headers, rows }] where rows is an array of arrays
// matching headers, in order.
export function downloadExcel(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, headers, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
