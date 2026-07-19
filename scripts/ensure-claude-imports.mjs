#!/usr/bin/env node
// Pre-commit guard: for every AGENTS.md added/changed in this commit, ensure a
// sibling CLAUDE.md that imports it (`@AGENTS.md`) — Claude Code auto-loads
// CLAUDE.md, not AGENTS.md. Missing bridges are created and staged into the
// same commit. Run with `--all` to backfill every tracked AGENTS.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const all = process.argv.includes("--all");
const IMPORT_RE = /@(\.\/)?AGENTS\.md\b/;

function git(args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function agentsFiles() {
    const raw = all
        ? git(["ls-files"])
        : git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]);
    return raw.split("\n").filter((f) => f && f.split("/").pop() === "AGENTS.md");
}

const created = [];
const patched = [];

for (const agents of agentsFiles()) {
    const dir = dirname(agents);
    const claude = dir === "." ? "CLAUDE.md" : join(dir, "CLAUDE.md");

    if (existsSync(claude)) {
        const content = readFileSync(claude, "utf8");
        if (IMPORT_RE.test(content)) continue; // already imports AGENTS.md
        writeFileSync(claude, `${content.replace(/\s*$/, "")}\n\n@AGENTS.md\n`);
        patched.push(claude);
    } else {
        writeFileSync(
            claude,
            "<!-- Auto-generated: Claude Code loads CLAUDE.md, not AGENTS.md. This imports it. -->\n@AGENTS.md\n",
        );
        created.push(claude);
    }
    git(["add", claude]);
}

for (const c of created) console.error(`ensure-claude-imports: created ${c}`);
for (const c of patched) console.error(`ensure-claude-imports: added @AGENTS.md to ${c}`);
process.exit(0);
