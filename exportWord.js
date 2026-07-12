// Generates a real .rtf file — RTF is a proper, well-defined document
// format every version of Word (desktop AND mobile) opens correctly,
// unlike the old "HTML renamed to .doc" trick which mobile Word apps
// sometimes reject or show as empty.
function rtfEscape(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/[\u0080-\uFFFF]/g, (c) => `\\u${c.charCodeAt(0)}?`);
}

export function downloadTableAsWord(title, headers, rows, filename) {
  const colCount = headers.length;
  const colWidth = Math.max(800, Math.floor(9000 / colCount));
  let acc = 0;
  const cellDefs = Array.from({ length: colCount }, () => { acc += colWidth; return `\\cellx${acc}`; }).join("");

  function rtfRow(cells, bold) {
    const cellText = cells.map((c) => `\\intbl ${bold ? "\\b " : ""}${rtfEscape(c)}${bold ? "\\b0 " : ""}\\cell`).join("");
    return `\\trowd\\trgaph108\\trleft0${cellDefs}${cellText}\\row\n`;
  }

  const body = [rtfRow(headers, true), ...rows.map((r) => rtfRow(r, false))].join("");

  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Calibri;}}
\\f0\\fs22
\\pard{\\b\\fs28 ${rtfEscape(title)}\\par}
\\pard
${body}
\\pard\\par
}`;

  const blob = new Blob([rtf], { type: "application/rtf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".rtf") ? filename : `${filename}.rtf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
