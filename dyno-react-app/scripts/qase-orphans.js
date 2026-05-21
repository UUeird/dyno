#!/usr/bin/env node
// List Qase cases that have no matching Playwright test.
//
// Used as a tester→dev inbox: when a tester creates a case in Qase for
// something not yet covered, this script surfaces it so the test can be
// written. Pairs with sync-qase.js, which is the dev→tester direction.
//
// A case is "orphaned" if its description has an `External ID:` marker that
// points to a `<spec>::<test-name>` pair which doesn't exist in tests/. Cases
// with no External ID marker are also reported — those were created in the
// Qase UI without a corresponding test.
//
// Required env: QASE_API_TOKEN, QASE_PROJECT_CODE (defaults to "DYNO")

const fs = require("fs");
const path = require("path");

const envLocalPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(QASE_[A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TOKEN = process.env.QASE_API_TOKEN;
const PROJECT = process.env.QASE_PROJECT_CODE || "DYNO";

if (!TOKEN) {
  console.error("Missing QASE_API_TOKEN env var");
  process.exit(1);
}

const TESTS_DIR = path.resolve(__dirname, "..", "tests");
const API_BASE = "https://api.qase.io/v1";

async function qase(method, route) {
  const res = await fetch(`${API_BASE}${route}`, {
    method,
    headers: { Token: TOKEN, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Qase ${method} ${route} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function paginate(route) {
  const limit = 100;
  let offset = 0;
  const all = [];
  while (true) {
    const sep = route.includes("?") ? "&" : "?";
    const page = await qase("GET", `${route}${sep}limit=${limit}&offset=${offset}`);
    const items = page.result?.entities || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

// Pull the first quoted string from a test/describe call line.
function extractString(line) {
  for (const quote of ['"', "'", "`"]) {
    const start = line.indexOf(`(${quote}`);
    if (start === -1) continue;
    const inner = line.slice(start + 2);
    const end = inner.indexOf(quote);
    if (end !== -1) return inner.slice(0, end);
  }
  return null;
}

// Returns a Set of "<spec>::<test-name>" external IDs currently in the repo.
function loadExistingExternalIds() {
  const files = fs.readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".spec.ts"));
  const ids = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(TESTS_DIR, f), "utf8");
    for (const line of src.split("\n")) {
      if (/^\s*test\(/.test(line)) {
        const title = extractString(line);
        if (title) ids.add(`${f}::${title}`);
      }
    }
  }
  return ids;
}

async function main() {
  const localIds = loadExistingExternalIds();
  const cases = await paginate(`/case/${PROJECT}`);
  const externalIdRegex = /External ID:\s*`([^`]+)`/;

  const orphanCases = [];
  const taggedOrphans = [];
  const untaggedCases = [];

  for (const c of cases) {
    const m = c.description && c.description.match(externalIdRegex);
    if (!m) {
      untaggedCases.push(c);
      continue;
    }
    const externalId = m[1];
    if (!localIds.has(externalId)) {
      orphanCases.push({ ...c, externalId });
    }
  }

  if (orphanCases.length === 0 && untaggedCases.length === 0) {
    console.log("No orphan cases — every Qase case maps to a Playwright test.");
    return;
  }

  if (orphanCases.length > 0) {
    console.log(`\n${orphanCases.length} orphan case(s) — were synced from a test that no longer exists (renamed or deleted):`);
    for (const c of orphanCases) {
      console.log(`  #${c.id}  ${c.title}`);
      console.log(`         External ID: ${c.externalId}`);
    }
  }

  if (untaggedCases.length > 0) {
    console.log(`\n${untaggedCases.length} untagged case(s) — created in the Qase UI, no corresponding test yet:`);
    for (const c of untaggedCases) {
      console.log(`  #${c.id}  ${c.title}`);
    }
    console.log("\nTo cover these: write tests in tests/<feature>.spec.ts, then re-run sync-qase to link them.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
