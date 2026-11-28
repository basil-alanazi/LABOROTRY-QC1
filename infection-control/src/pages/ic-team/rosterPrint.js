// Printed duty schedules — one template per department, copied from the
// paper schedules each department already uses:
//   ipc     — logo, "IPC DEPARTMENT / DEC 2026 SCHEDULE", Date/Staff corner,
//             grey name column, staff IDs + codes under the grid, Prepared
//             by / Reviewed by / Executive Director signatures
//   cssd    — logo, one-line "CSSD DEPARTMENT  DECEMBER 2026 SCHEDULE",
//             blue name column with the employee number under the name,
//             codes listed under the grid, HEAD OF DEPARTMENT / IPC DIRECTOR
//   laundry — no logo, Times font, "LAUNDRY DEPARTMENT / DECEMBER 2026 DUTY
//             SCHEDULE", shift codes and staff IDs on one line each, four
//             signature lines
// Fridays are shaded grey in all three, as on paper.
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function daysIn(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function isFriday(month, d) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
}

// A whole month of "V" prints as the word VACATION across the days, the way
// the CSSD paper schedule writes it.
function vacationMonth(s, days) {
  return days.every((d) => String(s.days?.[d] || "").toUpperCase() === "V");
}

export function rosterHtml({ dept, month, data, logoUrl, autoPrint }) {
  const layout = data.layout || dept;
  const [y, m] = month.split("-").map(Number);
  const days = Array.from({ length: daysIn(month) }, (_, i) => i + 1);
  const fri = (d) => (isFriday(month, d) ? ' class="fri"' : "");
  const cell = (s, d) => `<td${fri(d)}>${esc(s.days?.[d] || "")}</td>`;
  const staff = data.staff || [];
  const shifts = data.shifts || [];
  const footer = data.footer || [];
  const ids = staff.filter((s) => s.emp_no).map((s) => `${esc(s.name)}: ${esc(s.emp_no)}`);
  const script = autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>` : "";

  if (layout === "laundry") {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)} ${MONTHS[m - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:"Times New Roman",Times,serif;color:#000;margin:0;padding:8px}
h1{text-align:center;font-size:17px;margin:0 0 4px;font-weight:bold}h2{text-align:center;font-size:16px;margin:0 0 12px;font-weight:bold}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;text-align:center;font-size:11px;height:30px;padding:0}
th{font-weight:normal}th.s,td.s{width:110px;text-align:left;padding-left:5px;font-weight:bold;font-size:11px}.fri{background:#d0d0d0}
.codes{margin-top:12px;font-weight:bold;font-size:12px}.ids{margin-top:8px;font-weight:bold;font-size:12px}
.sigs{display:flex;justify-content:space-between;margin-top:28px;gap:24px}.sig{flex:1;font-weight:bold;font-size:12px}.sig .line{border-top:1px solid #000;margin-top:28px;width:80%}
</style></head><body>
<h1>${esc(data.title)}</h1><h2>${MONTHS[m - 1]} ${y} ${esc(data.suffix || "DUTY SCHEDULE")}</h2>
<table><thead><tr><th class="s">Staff</th>${days.map((d) => `<th${fri(d)}>${d}</th>`).join("")}</tr></thead>
<tbody>${staff.map((s) => `<tr><td class="s">${esc(s.name)}</td>${days.map((d) => cell(s, d)).join("")}</tr>`).join("")}</tbody></table>
<div class="codes">Shift codes: ${shifts.filter((s) => s.code !== "-").map((s) => `${esc(s.code)} = ${esc(s.label)}`).join(" /&nbsp;&nbsp; ")}</div>
<div class="ids">${ids.join(" / ")}</div>
<div class="sigs">${footer.map((f) => `<div class="sig">${esc(f.role)}${f.name ? `<div style="font-weight:normal">${esc(f.name)}</div>` : ""}<div class="line"></div></div>`).join("")}</div>
${script}</body></html>`;
  }

  if (layout === "cssd") {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)} ${MONTHS[m - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:8px}
.logo{text-align:center}.logo img{height:52px}h1{text-align:center;font-size:14px;font-weight:normal;margin:6px 0 10px;letter-spacing:.2px}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;text-align:center;font-size:11px;font-weight:bold;height:46px;padding:0}
th{height:44px;text-decoration:underline;vertical-align:top;padding-top:3px}.s{width:62px;background:#a6c1f0;text-align:left;padding-left:4px;vertical-align:top;padding-top:3px;text-decoration:none}
th.s{line-height:1.9}th.s span{text-decoration:underline}.fri{background:#e3e3e3}td.s small{display:block;margin-top:12px;font-size:11px}
.codes{margin:16px 0 0 60px;font-weight:bold;font-size:12px;line-height:1.35}.codes span{display:inline-block;width:18px}
.sigs{display:flex;justify-content:space-around;margin-top:60px}.sig{font-weight:bold;font-size:11px;text-decoration:underline;text-align:center}
</style></head><body>
${logoUrl ? `<div class="logo"><img src="${logoUrl}" alt=""></div>` : ""}
<h1>${esc(data.title)}&nbsp; ${MONTHS[m - 1]} ${y} ${esc(data.suffix || "SCHEDULE")}</h1>
<table><thead><tr><th class="s">Date<br><span>StafF</span></th>${days.map((d) => `<th${fri(d)}>${d}</th>`).join("")}</tr></thead>
<tbody>${staff.map((s) => `<tr><td class="s">${esc(s.name)}${s.emp_no ? `<small>${esc(s.emp_no)}</small>` : ""}</td>${(vacationMonth(s, days) ? days.map((d) => `<td${fri(d)}>${"VACATION"[d - 2] || ""}</td>`) : days.map((d) => cell(s, d))).join("")}</tr>`).join("")}</tbody></table>
<div class="codes">${shifts.map((s) => `<div><span>${esc(s.code)}</span> - &nbsp;${esc(s.label)}</div>`).join("")}</div>
<div class="sigs">${footer.map((f) => `<div class="sig">${esc(f.role)}${f.name ? `<div style="text-decoration:none;font-weight:normal">${esc(f.name)}</div>` : ""}</div>`).join("")}</div>
${script}</body></html>`;
  }

  // ipc
  const legend = shifts.filter((s) => s.code !== "OFF").map((s) => `${esc(s.code)}${/^O$/i.test(s.code) ? ":" : " ="} ${esc(s.label)}`);
  const prepared = footer.find((f) => /prepared/i.test(f.label));
  const reviewed = footer.filter((f) => f !== prepared);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)} ${MONTHS[m - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:8px}
.logo{text-align:center}.logo img{height:56px}h1{text-align:center;font-size:17px;margin:8px 0 4px}h2{text-align:center;font-size:17px;margin:0 0 10px}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;text-align:center;font-size:11px;height:34px;padding:0}
th{text-decoration:underline;font-weight:normal}th.corner{width:120px;background:#d9d9d9;position:relative;text-decoration:none;
background-image:linear-gradient(to top right,transparent calc(50% - 1px),#000 50%,transparent calc(50% + 1px))}
th.corner .dt{position:absolute;top:3px;right:8px;font-weight:bold}th.corner .st{position:absolute;bottom:3px;left:6px;font-weight:bold}
td.s{width:120px;background:#d9d9d9;text-align:left;padding-left:5px;font-size:12px}.fri{background:#d9d9d9}
.ids{display:flex;gap:60px;margin-top:14px;font-size:12px}.legend{display:flex;gap:60px;margin-top:10px;font-size:12px}
.foot{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:22px;font-size:12px;gap:16px}.foot .rv{grid-column:2/4}
.blk .nm{margin-top:6px}.reviewers{display:flex;justify-content:space-between;margin-top:34px}.reviewers div{min-width:200px}
.reviewers .line{border-top:1px solid #000;width:200px;margin-bottom:3px}
</style></head><body>
${logoUrl ? `<div class="logo"><img src="${logoUrl}" alt=""></div>` : ""}
<h1>${esc(data.title)}</h1><h2>${MONTHS[m - 1].slice(0, 3)} ${y} ${esc(data.suffix || "SCHEDULE")}</h2>
<table><thead><tr><th class="corner"><span class="dt">Date</span><span class="st">Staff</span></th>${days.map((d) => `<th${fri(d)}>${d}</th>`).join("")}</tr></thead>
<tbody>${staff.map((s) => `<tr><td class="s">${esc(s.name)}</td>${days.map((d) => cell(s, d)).join("")}</tr>`).join("")}</tbody></table>
<div class="ids">${ids.map((x) => `<span>${x}</span>`).join("")}</div>
<div class="legend">${legend.map((x) => `<span>${x}</span>`).join("")}</div>
<div class="foot"><div class="blk">${prepared ? `${esc(prepared.label)}:<div class="nm">${esc(prepared.name)}</div><div>${esc(prepared.role)}</div>` : ""}</div>
<div class="rv">${reviewed.length ? `Reviewed by:` : ""}<div class="reviewers">${reviewed
    .map((f) => `<div><div class="line"></div><b>${esc(f.name)}</b><div>${esc(f.role)}</div></div>`)
    .join("")}</div></div></div>
${script}</body></html>`;
}
