// Generates a .doc file Word can open directly, from a simple headers+rows
// table. Uses the classic "HTML wrapped in Word XML namespaces" trick —
// no heavy library needed, and Word opens it natively.
export function downloadTableAsWord(title, headers, rows, filename) {
  const escape = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const headerRow = `<tr>${headers.map((h) => `<th style="border:1px solid #999;padding:6px;background:#F0F3F2;font-size:11px;">${escape(h)}</th>`).join("")}</tr>`;
  const bodyRows = rows.map((row) =>
    `<tr>${row.map((cell) => `<td style="border:1px solid #ccc;padding:5px;font-size:11px;">${escape(cell)}</td>`).join("")}</tr>`
  ).join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>${escape(title)}</title></head>
    <body>
      <h2 style="font-family:Calibri,Arial,sans-serif;">${escape(title)}</h2>
      <table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;">
        ${headerRow}
        ${bodyRows}
      </table>
    </body>
    </html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
