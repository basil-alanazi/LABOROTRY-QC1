// Uploads the built site (../dist) to R2 under "_site/", where the Worker
// serves it from. Run after `VITE_BACKEND=cloudflare npm run build`.
//   node cloudflare/scripts/upload-site.mjs --remote | --local
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "..", "dist");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".mp3": "audio/mpeg",
};
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// index.html last, so it never points at assets that aren't uploaded yet.
const files = walk(dist).sort((a, b) => (a.endsWith("index.html") ? 1 : b.endsWith("index.html") ? -1 : 0));
for (const f of files) {
  const key = "_site/" + relative(dist, f).split("\\").join("/");
  const type = TYPES[extname(f).toLowerCase()] || "application/octet-stream";
  execFileSync("npx", ["wrangler", "r2", "object", "put", `infection-control-files/${key}`, "--file", f, "--content-type", type, target], { cwd: root, stdio: "pipe" });
}
console.log(`uploaded ${files.length} site files (${target})`);
