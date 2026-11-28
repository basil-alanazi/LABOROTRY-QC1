// English / Arabic for the antibiogram module. The page is written in Arabic;
// in English mode every Arabic string (static or rendered) is looked up here.
// Numbers inside a string are matched as {n}, so "أقل من 30" and "أقل من 20"
// share one entry. Language comes from ?lang= or the site's saved choice.
(function () {
  "use strict";
  var lang = "en";
  try {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "ar" || q === "en") lang = q;
    else if (localStorage.getItem("ic_lang") === "ar") lang = "ar";
  } catch (e) {}

  var EN = {
    "الأنتي بايوغرام": "Antibiogram",
    "الأنتي بايوغرام التراكمي": "Cumulative Antibiogram",
    "نسبة العزلات الحساسة (%S) حسب CLSI M{n}": "Percent susceptible (%S) per CLSI M{n}",
    "الفترة:": "Period:",
    "البداية": "start",
    "الآن": "now",
    "إلى": "to",
    "+ إضافة عزلة": "+ Add isolate",
    "طباعة": "Print",
    "تصدير CSV": "Export CSV",
    "تصدير البيانات": "Export data",
    "استيراد": "Import",
    "العزلات": "Isolates",
    "المستبعدة": "Excluded",
    "من تاريخ": "From",
    "إلى تاريخ": "To",
    "الموقع": "Location",
    "الكل": "All",
    "منوّم": "Inpatient",
    "العناية المركزة": "ICU",
    "عيادات": "Outpatient",
    "طوارئ": "ER",
    "غير محدد": "Not specified",
    "العينة": "Specimen",
    "كل العينات": "All specimens",
    "بول فقط": "Urine only",
    "غير البول": "Non-urine",
    "أول عزلة لكل مريض": "First isolate per patient",
    "استبعاد الملوِّثات": "Exclude contaminants",
    "العزلات المسجلة": "Isolates entered",
    "المحتسبة": "Included",
    "كائنات أقل من {n} عزلة": "Organisms with < {n} isolates",
    "العزلات المستبعدة من الحساب": "Isolates excluded from the calculation",
    "إعادة البيانات الأصلية": "Reset to original data",
    "إضافة عزلة": "Add isolate",
    "تعديل عزلة": "Edit isolate",
    "رقم الملف MRN *": "MRN *",
    "رقم الطلب": "Order no.",
    "تاريخ الجمع *": "Collection date *",
    "نوع العينة": "Specimen type",
    "بول": "Urine",
    "دم": "Blood",
    "صديد/مسحة جرح": "Pus / wound swab",
    "صديد": "Pus",
    "إفرازات الإحليل": "Urethral discharge",
    "إحليل": "Urethral",
    "قشع/تنفسي": "Sputum / respiratory",
    "تنفسي": "Respiratory",
    "سائل نخاعي": "CSF",
    "نخاعي": "CSF",
    "براز": "Stool",
    "أخرى": "Other",
    "الكائن المعزول *": "Organism *",
    "نمط المقاومة": "Resistance pattern",
    "عينة مسح (Screening)": "Screening specimen",
    "ملوِّث محتمل": "Possible contaminant",
    "مسح": "Screening",
    "نتائج الحساسية: اضغط S أو I أو R، واضغط مرة ثانية للإلغاء.": "Susceptibility results: tap S, I or R; tap again to clear.",
    "عرض كل المضادات": "Show all antibiotics",
    "عرض مضادات الكائن فقط": "Show this organism's antibiotics only",
    "حفظ": "Save",
    "حذف": "Delete",
    "إلغاء": "Cancel",
    "تعديل": "Edit",
    "لا توجد عزلات مطابقة للفلاتر.": "No isolates match the filters.",
    "الكائن": "Organism",
    "، ": ", ",
    "⚠ N<{n}: يُفسَّر بحذر": "⚠ N<{n}: interpret with caution",
    "≥{n}% حساس": "≥{n}% susceptible",
    "الرقم الكبير = %S، وبين القوسين عدد العزلات المختبرة · — = لم يُختبر أو غير مناسب للكائن":
      "Large number = %S, in brackets = isolates tested · — = not tested or not appropriate for the organism",
    "محسوبة على أول عزلة لكل مريض لكل كائن، مع استبعاد عينات المسح والملوِّثات المحتملة (CLSI M{n}).":
      "Calculated on the first isolate per patient per organism, excluding screening specimens and possible contaminants (CLSI M{n}).",
    "النتيجة المتوسطة (I) تُحسب كغير حساسة.": "Intermediate (I) results count as non-susceptible.",
    "المضادات ذات المقاومة الطبيعية لا تُعرض (CLSI M{n} Appendix B). Nitrofurantoin يُحسب من عينات البول فقط.":
      "Antibiotics with intrinsic resistance are not shown (CLSI M{n} Appendix B). Nitrofurantoin is calculated from urine specimens only.",
    "MRSA وMSSA في صفين منفصلين، وأنواع العنقوديات سالبة التخثر مدمجة في صف CoNS.":
      "MRSA and MSSA are in separate rows; coagulase-negative staphylococci are combined in the CoNS row.",
    "الكائن الذي عدد عزلاته أقل من {n} لا يُعتمد عليه إحصائياً.": "Organisms with fewer than {n} isolates are not statistically reliable.",
    "الأنتي بايوغرام دليل للعلاج التجريبي فقط، ولا يغني عن نتيجة مزرعة المريض.":
      "The antibiogram guides empirical therapy only; it does not replace the patient's own culture result.",
    "التاريخ": "Date",
    "المقاومة": "Resistance",
    "مقاوم لـ": "Resistant to",
    "لا توجد عزلات.": "No isolates.",
    "سبب الاستبعاد": "Reason excluded",
    "لا توجد عزلات مستبعدة.": "No excluded isolates.",
    "حذف هذه العزلة نهائياً؟": "Delete this isolate permanently?",
    "موافق = دمج مع البيانات الحالية\nإلغاء = استبدال البيانات الحالية": "OK = merge with the current data\nCancel = replace the current data",
    "الملف غير صالح: يجب أن يكون مصفوفة JSON من العزلات.": "Invalid file: it must be a JSON array of isolates.",
    "استبدال كل البيانات الحالية بالبيانات الأصلية؟": "Replace all current data with the original data?",
    // engine: groups, exclusion reasons, antibiotic classes
    "البكتيريا سالبة الغرام": "Gram-negative bacteria",
    "البكتيريا موجبة الغرام": "Gram-positive bacteria",
    "كائنات خاصة (Fastidious)": "Fastidious organisms",
    "خارج الفترة": "Outside the period",
    "خارج الموقع المحدد": "Outside the selected location",
    "ليست عينة بول": "Not a urine specimen",
    "عينة بول": "Urine specimen",
    "بنسلينات": "Penicillins",
    "بنسلين+مثبط": "Penicillin + inhibitor",
    "سيفالوسبورين ج{n}": "Cephalosporin gen {n}",
    "سيفالوسبورين ج{n} فموي": "Oral cephalosporin gen {n}",
    "سيفالوسبورين+مثبط": "Cephalosporin + inhibitor",
    "مونوباكتام": "Monobactam",
    "كاربابينيم": "Carbapenem",
    "أمينوغليكوزيد": "Aminoglycoside",
    "فلوروكينولون": "Fluoroquinolone",
    "سلفوناميد": "Sulfonamide",
    "نيتروفوران (بول فقط)": "Nitrofuran (urine only)",
    "ماكروليد": "Macrolide",
    "لينكوزاميد": "Lincosamide",
    "تتراسيكلين": "Tetracycline",
    "غليكوببتيد": "Glycopeptide",
    "أوكسازوليدينون": "Oxazolidinone",
    "ليبوببتيد": "Lipopeptide",
    "ريفاميسين": "Rifamycin",
    "غليسيلسيكلين": "Glycylcycline",
    "هذا الطلب مسجّل من قبل لنفس البكتيريا. لا يُقبل التكرار.": "This order is already recorded for the same organism. Duplicates are not accepted.",
    "مكررة: نفس المريض ونفس البكتيريا مسجلة بتاريخ": "Duplicate: the same patient and organism is already recorded on",
    "لا يُقبل التكرار خلال": "duplicates are not accepted within",
    "يوم": "days",
    "Salmonella: لا تُعرض السيفالوسبورينات من الجيل الأول والثاني والسيفاميسينات والأمينوغليكوزيدات لأنها غير فعّالة سريرياً (CLSI M{n}).":
      "Salmonella: 1st/2nd-generation cephalosporins, cephamycins and aminoglycosides are not reported as they are not clinically effective (CLSI M{n}).",
    // values found in entered isolates
    "مقاومة غير نمطية — للمراجعة": "Atypical resistance — for review",
    "يُشتبه ESBL — يلزم التأكيد": "Suspected ESBL — confirmation needed"
  };
  // Strings that start with fixed Arabic and end with a value (an isolate id).
  var PREFIX = [["عزلة مكررة لنفس المريض", "Duplicate isolate for the same patient"]];
  var AR = /[؀-ۿ]/;

  function tr(s) {
    if (lang !== "en" || s == null) return s;
    s = String(s);
    if (!AR.test(s)) return s;
    var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
    var nums = [], key = core.replace(/\d+/g, function (d) { nums.push(d); return "{n}"; });
    var out = EN[key];
    if (out == null) {
      for (var i = 0; i < PREFIX.length; i++) if (core.indexOf(PREFIX[i][0]) === 0) return lead + PREFIX[i][1] + core.slice(PREFIX[i][0].length) + tail;
      // "Penicillin · بنسلينات" and similar joins: translate each part
      if (core.indexOf(" · ") > 0) return lead + core.split(" · ").map(tr).join(" · ") + tail;
      return s;
    }
    var k = 0;
    return lead + out.replace(/\{n\}/g, function () { return nums[k++]; }) + tail;
  }

  function trDOM(root) {
    if (lang !== "en") return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (!/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) && AR.test(n.nodeValue)) n.nodeValue = tr(n.nodeValue);
    root.querySelectorAll("[title],[placeholder]").forEach(function (el) {
      ["title", "placeholder"].forEach(function (a) { var v = el.getAttribute(a); if (v && AR.test(v)) el.setAttribute(a, tr(v)); });
    });
  }

  if (lang === "en") {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }
  window.ABG_I18N = { lang: lang, tr: tr, trDOM: trDOM };
})();
