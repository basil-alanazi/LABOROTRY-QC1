/*!
 * antibiogram-engine.js
 * منطق حساب الأنتي بايوغرام التراكمي وفق مبادئ CLSI M39.
 * لا يعتمد على أي مكتبة، ويعمل في المتصفح (window.AntibiogramEngine) وفي Node (require).
 *
 * القواعد المطبّقة:
 *  1. الفترة الزمنية: حسب تاريخ الجمع (from / to).
 *  2. أول عزلة لكل مريض لكل كائن خلال الفترة (MRN + الكائن).
 *  3. استبعاد عينات المسح (screening) والملوِّثات المحتملة (contaminant).
 *  4. نسبة الحساسية = S ÷ (S + I + R). يُعامَل I كأنه غير حساس.
 *  5. تُعرض لكل كائن المضادات المناسبة له فقط (تُستبعد المقاومة الطبيعية حسب CLSI M100 Appendix B).
 *  6. علامة تحذير لأي كائن عدد عزلاته أقل من 30.
 *  7. المضادات الخاصة بالبول (Nitrofurantoin) تُحسب من عينات البول فقط.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AntibiogramEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_ISOLATES = 30;

  // المضادات: الاسم، الاختصار، الفئة
  var ANTIBIOTICS = [
    ["Penicillin", "PEN", "بنسلينات"], ["Oxacillin", "OXA", "بنسلينات"], ["Ampicillin", "AMP", "بنسلينات"],
    ["Amoxicillin/Clavulanate", "AMC", "بنسلين+مثبط"], ["Ampicillin/Sulbactam", "SAM", "بنسلين+مثبط"],
    ["Piperacillin/Tazobactam", "TZP", "بنسلين+مثبط"],
    ["Cefazolin", "CFZ", "سيفالوسبورين ج1"], ["Cefuroxime", "CXM", "سيفالوسبورين ج2"], ["Cefoxitin", "FOX", "سيفالوسبورين ج2"],
    ["Ceftriaxone", "CRO", "سيفالوسبورين ج3"], ["Cefotaxime", "CTX", "سيفالوسبورين ج3"], ["Ceftazidime", "CAZ", "سيفالوسبورين ج3"],
    ["Cefixime", "CFM", "سيفالوسبورين ج3 فموي"], ["Cefepime", "FEP", "سيفالوسبورين ج4"],
    ["Ceftazidime/Avibactam", "CZA", "سيفالوسبورين+مثبط"], ["Aztreonam", "ATM", "مونوباكتام"],
    ["Ertapenem", "ETP", "كاربابينيم"], ["Imipenem", "IPM", "كاربابينيم"], ["Meropenem", "MEM", "كاربابينيم"],
    ["Gentamicin", "GEN", "أمينوغليكوزيد"], ["Amikacin", "AMK", "أمينوغليكوزيد"], ["Tobramycin", "TOB", "أمينوغليكوزيد"],
    ["Ciprofloxacin", "CIP", "فلوروكينولون"], ["Levofloxacin", "LVX", "فلوروكينولون"], ["Moxifloxacin", "MXF", "فلوروكينولون"],
    ["Trimethoprim/Sulfamethoxazole", "SXT", "سلفوناميد"], ["Nitrofurantoin", "NIT", "نيتروفوران (بول فقط)"],
    ["Erythromycin", "ERY", "ماكروليد"], ["Azithromycin", "AZM", "ماكروليد"], ["Clindamycin", "CLI", "لينكوزاميد"],
    ["Tetracycline", "TCY", "تتراسيكلين"], ["Doxycycline", "DOX", "تتراسيكلين"],
    ["Vancomycin", "VAN", "غليكوببتيد"], ["Teicoplanin", "TEC", "غليكوببتيد"], ["Linezolid", "LZD", "أوكسازوليدينون"],
    ["Daptomycin", "DAP", "ليبوببتيد"], ["Rifampicin", "RIF", "ريفاميسين"],
    ["Tigecycline", "TGC", "غليسيلسيكلين"]
  ].map(function (a) { return { name: a[0], code: a[1], cls: a[2] }; });

  var URINE_ONLY = { "Nitrofurantoin": true };

  // لوحات المضادات لكل كائن (المقاومة الطبيعية والمضادات غير المناسبة مستبعدة)
  var ENT = ["Ampicillin", "Amoxicillin/Clavulanate", "Ampicillin/Sulbactam", "Piperacillin/Tazobactam", "Cefazolin",
    "Cefuroxime", "Cefoxitin", "Ceftriaxone", "Cefotaxime", "Ceftazidime", "Cefepime", "Ceftazidime/Avibactam", "Aztreonam",
    "Ertapenem", "Imipenem", "Meropenem", "Gentamicin", "Amikacin", "Tobramycin", "Ciprofloxacin", "Levofloxacin",
    "Trimethoprim/Sulfamethoxazole", "Nitrofurantoin"];
  function without(list, drop) { return list.filter(function (x) { return drop.indexOf(x) < 0; }); }
  var STAPH = ["Oxacillin", "Penicillin", "Erythromycin", "Clindamycin", "Trimethoprim/Sulfamethoxazole", "Tetracycline",
    "Doxycycline", "Gentamicin", "Levofloxacin", "Moxifloxacin", "Rifampicin", "Vancomycin", "Teicoplanin", "Linezolid", "Daptomycin"];

  // group: GN سالبة الغرام | GP موجبة الغرام | FAST كائنات خاصة
  // reportAs: اسم المجموعة في الجدول (يدمج أنواع العنقوديات سالبة التخثر مثلاً)
  var ORGANISMS = {
    "Escherichia coli": { group: "GN", panel: ENT },
    "Klebsiella pneumoniae": { group: "GN", panel: without(ENT, ["Ampicillin"]) },
    "Klebsiella oxytoca": { group: "GN", panel: without(ENT, ["Ampicillin"]) },
    "Proteus mirabilis": { group: "GN", panel: without(ENT, ["Nitrofurantoin", "Tetracycline", "Doxycycline"]) },
    "Enterobacter cloacae": { group: "GN", panel: without(ENT, ["Ampicillin", "Amoxicillin/Clavulanate", "Ampicillin/Sulbactam", "Cefazolin", "Cefoxitin"]) },
    "Serratia marcescens": { group: "GN", panel: without(ENT, ["Ampicillin", "Amoxicillin/Clavulanate", "Ampicillin/Sulbactam", "Cefazolin", "Cefuroxime", "Cefoxitin", "Nitrofurantoin"]) },
    "Pseudomonas aeruginosa": { group: "GN", panel: ["Piperacillin/Tazobactam", "Ceftazidime", "Cefepime", "Ceftazidime/Avibactam", "Aztreonam", "Imipenem", "Meropenem", "Gentamicin", "Amikacin", "Tobramycin", "Ciprofloxacin", "Levofloxacin"] },
    // Salmonella (CLSI M100): 1st/2nd-generation cephalosporins, cephamycins and
    // aminoglycosides can test susceptible but are not clinically effective, so
    // they are not reported.
    "Salmonella enterica": { group: "GN", panel: ["Ampicillin", "Piperacillin/Tazobactam", "Ceftriaxone", "Cefotaxime", "Ceftazidime", "Cefepime",
      "Aztreonam", "Ertapenem", "Imipenem", "Meropenem", "Ciprofloxacin", "Levofloxacin", "Trimethoprim/Sulfamethoxazole", "Azithromycin", "Tigecycline"] },
    "Acinetobacter baumannii": { group: "GN", panel: ["Ampicillin/Sulbactam", "Piperacillin/Tazobactam", "Ceftazidime", "Cefepime", "Imipenem", "Meropenem", "Gentamicin", "Amikacin", "Tobramycin", "Ciprofloxacin", "Levofloxacin", "Trimethoprim/Sulfamethoxazole"] },
    "Staphylococcus aureus (MSSA)": { group: "GP", panel: STAPH },
    "Staphylococcus aureus (MRSA)": { group: "GP", panel: without(STAPH, ["Oxacillin", "Penicillin"]) },
    "Staphylococcus epidermidis": { group: "GP", panel: without(STAPH, ["Penicillin"]), reportAs: "Coagulase-negative Staphylococci (CoNS)" },
    "Staphylococcus hominis": { group: "GP", panel: without(STAPH, ["Penicillin"]), reportAs: "Coagulase-negative Staphylococci (CoNS)" },
    "Staphylococcus haemolyticus": { group: "GP", panel: without(STAPH, ["Penicillin"]), reportAs: "Coagulase-negative Staphylococci (CoNS)" },
    "Enterococcus faecalis": { group: "GP", panel: ["Ampicillin", "Vancomycin", "Teicoplanin", "Linezolid", "Daptomycin", "Nitrofurantoin"] },
    "Enterococcus faecium": { group: "GP", panel: ["Ampicillin", "Vancomycin", "Teicoplanin", "Linezolid", "Daptomycin", "Nitrofurantoin"] },
    "Streptococcus pyogenes (GAS)": { group: "GP", panel: ["Penicillin", "Ceftriaxone", "Erythromycin", "Clindamycin", "Vancomycin"] },
    "Neisseria gonorrhoeae": { group: "FAST", panel: ["Ceftriaxone", "Cefixime", "Cefotaxime", "Cefuroxime", "Cefepime", "Azithromycin", "Ciprofloxacin", "Tetracycline"] }
  };
  var GROUPS = [
    { key: "GN", title: "البكتيريا سالبة الغرام" },
    { key: "GP", title: "البكتيريا موجبة الغرام" },
    { key: "FAST", title: "كائنات خاصة (Fastidious)" }
  ];

  function orgInfo(name) { return ORGANISMS[name] || { group: "GN", panel: null }; }
  function reportKey(name) { var o = ORGANISMS[name]; return (o && o.reportAs) || name; }

  /**
   * @param {Array} isolates  مصفوفة عزلات بالشكل الموصوف في README
   * @param {Object} opt { from, to, location, specimen, excludeContaminants, firstIsolateOnly, minIsolates }
   * @returns {{groups, included, excluded, abx}}
   */
  function compute(isolates, opt) {
    opt = opt || {};
    var minN = opt.minIsolates || MIN_ISOLATES;
    var excludeCont = opt.excludeContaminants !== false;
    var firstOnly = opt.firstIsolateOnly !== false;
    var excluded = [], pool = [];

    (isolates || []).slice().sort(function (a, b) {
      return String(a.collectedAt).localeCompare(String(b.collectedAt));
    }).forEach(function (x) {
      var why = null;
      if (opt.from && x.collectedAt < opt.from) why = "خارج الفترة";
      else if (opt.to && x.collectedAt > opt.to) why = "خارج الفترة";
      else if (opt.location && opt.location !== "all" && x.location !== opt.location) why = "خارج الموقع المحدد";
      else if (opt.specimen === "urine" && x.specimen !== "urine") why = "ليست عينة بول";
      else if (opt.specimen === "nonurine" && x.specimen === "urine") why = "عينة بول";
      else if (x.screening) why = "عينة مسح (Screening)";
      else if (excludeCont && x.contaminant) why = "ملوِّث محتمل";
      if (why) {
        // العزلات خارج الفلاتر لا تُعرض في قائمة المستبعدات؛ تُعرض الاستبعادات بحسب قواعد M39 فقط
        if (why === "عينة مسح (Screening)" || why === "ملوِّث محتمل") excluded.push({ isolate: x, reason: why });
        return;
      }
      pool.push(x);
    });

    var seen = {}, included = [];
    pool.forEach(function (x) {
      var k = String(x.mrn).trim().toUpperCase() + "|" + reportKey(x.organism);
      if (firstOnly && seen[k]) { excluded.push({ isolate: x, reason: "عزلة مكررة لنفس المريض (" + seen[k] + ")" }); return; }
      seen[k] = x.collectedAt;
      included.push(x);
    });

    var byOrg = {};
    included.forEach(function (x) {
      var key = reportKey(x.organism);
      if (!byOrg[key]) byOrg[key] = { organism: key, group: orgInfo(x.organism).group, panel: orgInfo(x.organism).panel, n: 0, cells: {}, members: {} };
      var row = byOrg[key];
      row.n++; row.members[x.organism] = true;
      Object.keys(x.results || {}).forEach(function (abx) {
        var r = String(x.results[abx] || "").toUpperCase();
        if (r !== "S" && r !== "I" && r !== "R") return;
        if (URINE_ONLY[abx] && x.specimen !== "urine") return;
        var c = row.cells[abx] || (row.cells[abx] = { S: 0, I: 0, R: 0 });
        c[r]++;
      });
    });

    var groups = GROUPS.map(function (g) {
      var rows = Object.keys(byOrg).map(function (k) { return byOrg[k]; })
        .filter(function (r) { return r.group === g.key; })
        .sort(function (a, b) { return b.n - a.n || a.organism.localeCompare(b.organism); })
        .map(function (r) {
          var panel = r.panel || Object.keys(r.cells);
          var cells = {};
          panel.forEach(function (abx) {
            var c = r.cells[abx];
            if (!c) return;
            var t = c.S + c.I + c.R;
            cells[abx] = { tested: t, S: c.S, I: c.I, R: c.R, pctS: t ? Math.round((c.S / t) * 100) : null };
          });
          return { organism: r.organism, members: Object.keys(r.members), n: r.n, lowN: r.n < minN, cells: cells };
        });
      var used = {};
      rows.forEach(function (r) { Object.keys(r.cells).forEach(function (a) { used[a] = true; }); });
      var abx = ANTIBIOTICS.filter(function (a) { return used[a.name]; });
      return { key: g.key, title: g.title, rows: rows, antibiotics: abx };
    }).filter(function (g) { return g.rows.length; });

    return { groups: groups, included: included, excluded: excluded, minIsolates: minN };
  }

  function band(p) { return p == null ? "" : p >= 90 ? "high" : p >= 70 ? "mid" : "low"; }

  function toCSV(result) {
    var lines = [];
    result.groups.forEach(function (g) {
      lines.push([g.title].join(","));
      lines.push(["Organism", "N"].concat(g.antibiotics.map(function (a) { return a.name; })).join(","));
      g.rows.forEach(function (r) {
        lines.push(['"' + r.organism + (r.lowN ? " (N<" + result.minIsolates + ")" : "") + '"', r.n].concat(
          g.antibiotics.map(function (a) { var c = r.cells[a.name]; return c ? c.pctS + "% (" + c.tested + ")" : ""; })).join(","));
      });
      lines.push("");
    });
    return "﻿" + lines.join("\n");
  }

  // Duplicate entry rule (hospital policy): the same patient (MRN) with the
  // same organism again within 14 days for blood cultures, or 30 days for any
  // other specimen, is a duplicate and is not accepted. The same order number
  // with the same organism is always a duplicate. MRSA/MSSA count as the same
  // organism (S. aureus).
  var DUP_DAYS_BLOOD = 14, DUP_DAYS_OTHER = 30;
  function sameOrg(a, b) {
    var n = function (o) { return String(o || "").replace(/\s*\(.*\)\s*/g, "").trim().toLowerCase(); };
    return n(a) === n(b);
  }
  function findDuplicate(isolates, rec) {
    var mrn = String(rec.mrn || "").trim().toLowerCase();
    if (!mrn || !rec.organism) return null;
    var t = Date.parse(rec.collectedAt);
    for (var i = 0; i < isolates.length; i++) {
      var x = isolates[i];
      if (x.id && rec.id && x.id === rec.id) continue;
      if (String(x.mrn || "").trim().toLowerCase() !== mrn || !sameOrg(x.organism, rec.organism)) continue;
      if (rec.orderId && x.orderId && String(rec.orderId).trim() === String(x.orderId).trim()) {
        return { isolate: x, days: 0, window: 0, sameOrder: true };
      }
      var window = rec.specimen === "blood" || x.specimen === "blood" ? DUP_DAYS_BLOOD : DUP_DAYS_OTHER;
      var days = Math.abs(Math.round((t - Date.parse(x.collectedAt)) / 86400000));
      if (!isNaN(days) && days <= window) return { isolate: x, days: days, window: window, sameOrder: false };
    }
    return null;
  }

  return {
    ANTIBIOTICS: ANTIBIOTICS, ORGANISMS: ORGANISMS, GROUPS: GROUPS, MIN_ISOLATES: MIN_ISOLATES, URINE_ONLY: URINE_ONLY,
    compute: compute, band: band, toCSV: toCSV, reportKey: reportKey, orgInfo: orgInfo,
    findDuplicate: findDuplicate, DUP_DAYS_BLOOD: DUP_DAYS_BLOOD, DUP_DAYS_OTHER: DUP_DAYS_OTHER
  };
});
