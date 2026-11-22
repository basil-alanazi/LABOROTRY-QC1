// One display format for dates everywhere on screen: DD/MM/YYYY (the way
// staff write them). Stored values stay ISO (YYYY-MM-DD); inputs keep
// their native date pickers. Timestamps show their date part.
export function fmtDate(value) {
  if (!value) return value ?? "";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}
