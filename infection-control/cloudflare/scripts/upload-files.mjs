// Puts every file downloaded by download-files.mjs into the R2 bucket,
// under "<bucket>/<path>" — the same key the Worker serves at /files/...
//
//   node cloudflare/scripts/upload-files.mjs --remote   (real Cloudflare)
//   node cloudflare/scripts/upload-files.mjs --local    (wrangler dev)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mig = join(root, ".migration");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const R2_BUCKET = "infection-control-files";
const manifest = JSON.parse(readFileSync(join(mig, "files-manifest.json"), "utf8"));

let done = 0;
const failed = [];
for (const f of manifest) {
  const key = `${f.bucket}/${f.path}`;
  try {
    // Cloudflare answers 429 when objects are put too fast — back off and retry.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(
          "npx",
          ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", join(mig, "files", f.bucket, f.path), "--content-type", f.type, target],
          { cwd: root, stdio: "pipe" }
        );
        break;
      } catch (err) {
        if (attempt >= 5 || !/429|Too Many/i.test(String(err.stderr || err))) throw err;
        execFileSync("node", ["-e", `setTimeout(()=>{}, ${15000 * attempt})`]);
      }
    }
    done++;
    if (done % 25 === 0) console.log(`${done}/${manifest.length}`);
  } catch (err) {
    failed.push(key);
    console.error(`FAILED ${key}: ${String(err.stderr || err).slice(0, 200)}`);
  }
}
console.log(`uploaded ${done}/${manifest.length}${failed.length ? `, failed ${failed.length}` : ""}`);
if (failed.length) process.exit(1);
