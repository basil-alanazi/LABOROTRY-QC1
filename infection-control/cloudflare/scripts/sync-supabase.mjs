// Incremental copy Supabase -> D1: only rows that are new or changed are
// written, and rows deleted in Supabase are deleted in D1. Keeps the D1
// daily write allowance (100k rows on the free plan) for real changes.
//
//   SUPABASE_URL=... SUPABASE_KEY=... node cloudflare/scripts/sync-supabase.mjs          (dry run: counts only)
//   SUPABASE_URL=... SUPABASE_KEY=... node cloudflare/scripts/sync-supabase.mjs --apply  (write to remote D1)
//
// Also lists every stored file path the data refers to in
// .migration/files-now.json, for copying new attachments to R2.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TABLES } from "../worker/schema.js";
import { encodeValue } from "../worker/query.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".migration");
mkdirSync(out, { recursive: true });
const APPLY = process.argv.includes("--apply");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_KEY");
  process.exit(1);
}

async function supabaseRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(`${URL_}/rest/v1/${table}?select=*&order=id.asc&offset=${offset}&limit=1000`, {
          headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
        });
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function d1(sql) {
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", "infection-control", "--remote", "--json", "--command", sql], {
    cwd: root,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(raw.toString())[0].results;
}

function d1Rows(table) {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const page = d1(`SELECT * FROM "${table}" ORDER BY id LIMIT 5000 OFFSET ${offset}`);
    rows.push(...page);
    if (page.length < 5000) return rows;
  }
}

const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`);
const same = (a, b) => (a === null || a === undefined ? b === null || b === undefined : b !== null && b !== undefined && String(a) === String(b));

function collectFiles(row, files) {
  const walk = (k, v) => {
    if (!v) return;
    if (typeof v === "string") {
      if (/path$/i.test(k)) files.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(k, x));
    else if (typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(kk, vv);
  };
  for (const [k, v] of Object.entries(row)) walk(k, v);
}

const files = new Set();
const stmts = [];
const report = {};
for (const [table, def] of Object.entries(TABLES)) {
  const cols = def.cols;
  const src = await supabaseRows(table);
  const dst = new Map(d1Rows(table).map((r) => [r.id, r]));
  let ins = 0, upd = 0, del = 0;
  const seen = new Set();
  for (const row of src) {
    collectFiles(row, files);
    seen.add(row.id);
    const names = Object.keys(row).filter((n) => cols[n]);
    const enc = Object.fromEntries(names.map((n) => [n, encodeValue(cols[n].t, row[n])]));
    const cur = dst.get(row.id);
    if (cur && names.every((n) => same(enc[n], cur[n]))) continue;
    cur ? upd++ : ins++;
    stmts.push(`INSERT OR REPLACE INTO "${table}" (${names.map((n) => `"${n}"`).join(",")}) VALUES (${names.map((n) => lit(enc[n])).join(",")});`);
  }
  const gone = [...dst.keys()].filter((id) => !seen.has(id));
  for (let i = 0; i < gone.length; i += 200) {
    stmts.push(`DELETE FROM "${table}" WHERE id IN (${gone.slice(i, i + 200).map(lit).join(",")});`);
  }
  del = gone.length;
  report[table] = { supabase: src.length, d1: dst.size, new: ins, changed: upd, deleted: del };
  if (ins || upd || del) console.log(`${table.padEnd(28)} new ${ins}  changed ${upd}  deleted ${del}`);
}
writeFileSync(join(out, "files-now.json"), JSON.stringify([...files].sort(), null, 1));
writeFileSync(join(out, "sync-report.json"), JSON.stringify(report, null, 1));
const sqlFile = join(out, "sync.sql");
writeFileSync(sqlFile, "PRAGMA defer_foreign_keys = ON;\n" + stmts.join("\n") + "\n");
const totals = Object.values(report).reduce((a, r) => ({ n: a.n + r.new, c: a.c + r.changed, d: a.d + r.deleted }), { n: 0, c: 0, d: 0 });
console.log(`\nTotal: new ${totals.n}, changed ${totals.c}, deleted ${totals.d} (${stmts.length} statements), ${files.size} file paths`);
if (APPLY && stmts.length) {
  execFileSync("npx", ["wrangler", "d1", "execute", "infection-control", "--remote", "--file", sqlFile, "-y"], { cwd: root, stdio: "inherit" });
  console.log("Applied to D1.");
}
