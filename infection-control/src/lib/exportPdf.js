import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// tables: [{ title, headers, rows }] where rows is an array of arrays
// matching headers, in order.
export function downloadPdf(filename, docTitle, tables) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(docTitle, 14, 15);

  let y = 22;
  tables.forEach(({ title, headers, rows }, idx) => {
    if (idx > 0) doc.addPage();
    if (title) {
      doc.setFontSize(11);
      doc.text(title, 14, y);
    }
    autoTable(doc, {
      startY: title ? y + 4 : y,
      head: [headers],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [13, 148, 136] },
      margin: { left: 14, right: 14 },
    });
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
