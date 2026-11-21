// Copies every row out of the live Supabase database into a SQL file that
// `wrangler d1 execute --file` can load into D1, and lists every attached
// file so copy-files.mjs can move them to R2.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon or service key> \
//     node cloudflare/scripts/export-supabase.mjs
//
// Output goes to cloudflare/.migration/ (git-ignored — it contains patient
// and staff data and must never be committed).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TABLES } from "../worker/schema.js";
import { encodeValue } from "../worker/query.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".migration");
mkdirSync(out, { recursive: true });

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_KEY");
  process.exit(1);
}
const PAGE = 1000;

async function fetchTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const order = TABLES[table].cols.id ? "id.asc" : Object.keys(TABLES[table].cols)[0] + ".asc";
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*&order=${order}&offset=${offset}&limit=${PAGE}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Every place a stored file path can live, so the files can be copied too.
function collectFiles(table, row, files) {
  for (const [k, v] of Object.entries(row)) {
    if (!v) continue;
    if (typeof v === "string" && /(_path)$/.test(k)) files.add(v);
    if (typeof v === "object") {
      const walk = (x) => {
        if (!x) return;
        if (Array.isArray(x)) x.forEach(walk);
        else if (typeof x === "object") {
          for (const [kk, vv] of Object.entries(x)) {
            if (typeof vv === "string" && /path$/i.test(kk)) files.add(vv);
            else walk(vv);
          }
        }
      };
      walk(v);
    }
  }
}

const files = new Set();
let sql = "PRAGMA defer_foreign_keys = ON;\n";
const summary = {};
for (const table of Object.keys(TABLES)) {
  const rows = await fetchTable(table);
  summary[table] = rows.length;
  const cols = TABLES[table].cols;
  sql += `DELETE FROM "${table}";\n`;
  for (const row of rows) {
    collectFiles(table, row, files);
    const names = Object.keys(row).filter((n) => cols[n]);
    const vals = names.map((n) => sqlLiteral(encodeValue(cols[n].t, row[n])));
    sql += `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(",")}) VALUES (${vals.join(",")});\n`;
  }
  console.log(`${table.padEnd(28)} ${rows.length}`);
}
writeFileSync(join(out, "data.sql"), sql);
writeFileSync(join(out, "files.json"), JSON.stringify([...files].sort(), null, 1));
writeFileSync(join(out, "row-counts.json"), JSON.stringify(summary, null, 1));
console.log(`\n${Object.values(summary).reduce((a, b) => a + b, 0)} rows, ${files.size} file paths -> ${out}`);
