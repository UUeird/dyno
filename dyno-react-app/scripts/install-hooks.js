#!/usr/bin/env node
// Installs git hooks from scripts/hooks/ into the repo's .git/hooks/ directory.
//
// Runs automatically on `npm install` via the `postinstall` script. Safe to
// re-run: if a destination hook already exists with identical contents, no-op;
// otherwise the existing hook is backed up to <hook>.local before overwriting.
//
// --quiet suppresses success messages so npm install output stays readable.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const QUIET = process.argv.includes("--quiet");
const log = (msg) => { if (!QUIET) console.log(msg); };

function findGitDir() {
  try {
    const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    return path.join(root, ".git", "hooks");
  } catch {
    return null;
  }
}

const hooksSrc = path.resolve(__dirname, "hooks");
const hooksDst = findGitDir();
if (!hooksDst) {
  log("install-hooks: not in a git checkout, skipping");
  process.exit(0);
}
if (!fs.existsSync(hooksDst)) {
  log(`install-hooks: ${hooksDst} doesn't exist, skipping`);
  process.exit(0);
}

const hookFiles = fs.readdirSync(hooksSrc).filter((f) => !f.endsWith(".sample"));
let installed = 0;
for (const name of hookFiles) {
  const srcPath = path.join(hooksSrc, name);
  const dstPath = path.join(hooksDst, name);
  const desired = fs.readFileSync(srcPath, "utf8");

  if (fs.existsSync(dstPath)) {
    const current = fs.readFileSync(dstPath, "utf8");
    if (current === desired) continue; // already up to date
    // Back up any user-supplied hook with a different shape
    if (!current.startsWith("#!/usr/bin/env bash\n# Pre-push hook:")) {
      const backup = `${dstPath}.local`;
      fs.copyFileSync(dstPath, backup);
      log(`install-hooks: backed up existing ${name} → ${path.basename(backup)}`);
    }
  }

  fs.copyFileSync(srcPath, dstPath);
  fs.chmodSync(dstPath, 0o755);
  installed++;
}

if (installed > 0) log(`install-hooks: installed ${installed} git hook(s)`);
