// Proves the published tarball holds only runtime files and the licence.
import { execFileSync } from "node:child_process";

const out = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const files = JSON.parse(out)[0].files.map((f) => f.path);
const bad = files.filter((p) => !/^(dist\/|README\.md$|LICENSE$|package\.json$)/.test(p));
if (bad.length || !files.includes("LICENSE") || !files.includes("dist/index.js")) {
    console.error("PACK FAIL", { bad, files });
    process.exit(1);
}
console.log(`PACK OK: ${files.length} files`);
