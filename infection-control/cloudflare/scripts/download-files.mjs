// Downloads every attached file listed in .migration/files.json from
// Supabase Storage into .migration/files/<bucket>/<path>. File paths in the
// database don't record their bucket, so each path is tried against the
// buckets in turn. Then run upload-files.mjs to put them in R2.
//
//   SUPABASE_URL=... node cloudflare/scripts/download-files.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mig = join(root, ".migration");
const URL_ = process.env.SUPABASE_URL;
const BUCKETS = [
  "employee-health-attachments",
  "ic-round-attachments",
  "nursing-round-attachments",
  "quality-round-attachments",
  "tracker-attachments",
  "case-attachments",
  "hh-attachments",
  "ipc-calendar-attachments",
  "message-attachments",
];

const paths = JSON.parse(readFileSync(join(mig, "files.json"), "utf8"));
const manifest = [];
const missing = [];
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

async function tryGet(bucket, path) {
  const res = await fetch(`${URL_}/storage/v1/object/public/${bucket}/${enc(path)}`);
  if (!res.ok) return null;
  return { type: res.headers.get("content-type") || "application/octet-stream", buf: Buffer.from(await res.arrayBuffer()) };
}

let i = 0;
async function worker() {
  while (i < paths.length) {
    const path = paths[i++];
    let found = false;
    for (const bucket of BUCKETS) {
      const dest = join(mig, "files", bucket, path);
      if (existsSync(dest)) {
        found = true;
        break;
      }
      const got = await tryGet(bucket, path);
      if (got) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, got.buf);
        manifest.push({ bucket, path, type: got.type, bytes: got.buf.length });
        found = true;
        break;
      }
    }
    if (!found) missing.push(path);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(join(mig, "files-manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(join(mig, "files-missing.json"), JSON.stringify(missing, null, 1));
const mb = manifest.reduce((a, f) => a + f.bytes, 0) / 1e6;
console.log(`downloaded ${manifest.length} files (${mb.toFixed(1)} MB), not found: ${missing.length}`);
