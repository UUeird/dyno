#!/usr/bin/env node
// Sync Playwright tests → Qase cases.
//
// One Qase suite per `test.describe(...)` block in each spec file.
// One Qase case per `test(...)` inside that describe, with an external_id of
// the form `<spec-filename>::<test-name>` so the sync is idempotent — re-runs
// won't create duplicates or rename existing cases.
//
// Required env: QASE_API_TOKEN, QASE_PROJECT_CODE (defaults to "DYNO")
//
// Usage: node scripts/sync-qase.js [--dry-run]

const fs = require("fs");
const path = require("path");

// Convenience: also load QASE_* from .env.local if present, so the user doesn't
// need to inline the token on every invocation.
const envLocalPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(QASE_[A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TOKEN = process.env.QASE_API_TOKEN;
const PROJECT = process.env.QASE_PROJECT_CODE || "DYNO";
const DRY_RUN = process.argv.includes("--dry-run");

if (!TOKEN) {
  console.error("Missing QASE_API_TOKEN env var");
  process.exit(1);
}

const TESTS_DIR = path.resolve(__dirname, "..", "tests");
const API_BASE = "https://api.qase.io/v1";

async function qase(method, route, body) {
  const res = await fetch(`${API_BASE}${route}`, {
    method,
    headers: { Token: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Qase ${method} ${route} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── Spec parsing ─────────────────────────────────────────────────────────

// Pull the first string literal after a test/describe call on a line. Handles
// "...", '...', and `...` and tolerates the other quote types appearing inside.
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

// Returns: [{ specFile, describes: [{ title, tests: [{ title }] }] }]
// Tracks brace depth to know which describe a `test(...)` belongs to.
// Assumes one top-level describe per spec (matches our current codebase) but
// would still tolerate multiple — tests fall under the most recent open describe.
function parseSpec(specPath) {
  const src = fs.readFileSync(specPath, "utf8");
  const lines = src.split("\n");
  const describes = [];
  // Stack of open `{...}` blocks. Each entry is { kind: 'describe' | 'test' | 'block', depth }.
  // Simpler: just track which describe is currently active by line number and depth.
  let currentDescribe = null;
  let depth = 0;
  let describeDepth = -1;

  for (const line of lines) {
    // Detect describe / test BEFORE counting braces so we capture the opening brace
    const describeMatch = line.match(/^\s*test\.describe\(/);
    const testMatch = line.match(/^\s*test\(/);
    if (describeMatch) {
      const title = extractString(line);
      if (title) {
        currentDescribe = { title, tests: [] };
        describes.push(currentDescribe);
        describeDepth = depth;
      }
    } else if (testMatch && currentDescribe) {
      const title = extractString(line);
      if (title) currentDescribe.tests.push({ title });
    }

    // Crude brace counter — sufficient for our test files which don't have
    // braces in strings near test/describe lines.
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth <= describeDepth) {
          currentDescribe = null;
          describeDepth = -1;
        }
      }
    }
  }

  return { specFile: path.basename(specPath), describes };
}

function loadAllSpecs() {
  const files = fs.readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => path.join(TESTS_DIR, f));
  return files.map(parseSpec);
}

// ── Sync ─────────────────────────────────────────────────────────────────

// Page through paginated Qase list endpoints.
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

async function ensureSuite(title, existingByTitle) {
  if (existingByTitle.has(title)) return existingByTitle.get(title);
  if (DRY_RUN) {
    console.log(`[dry] would create suite: ${title}`);
    return { id: `dry-${title}`, title };
  }
  const res = await qase("POST", `/suite/${PROJECT}`, { title });
  const id = res.result.id;
  const created = { id, title };
  existingByTitle.set(title, created);
  console.log(`+ suite: ${title} (id ${id})`);
  return created;
}

async function ensureCase(title, suiteId, externalId, existingByExternalId) {
  const existing = existingByExternalId.get(externalId);
  if (existing) {
    // If the title drifted (e.g. test was renamed), patch it
    if (existing.title !== title || existing.suite_id !== suiteId) {
      if (DRY_RUN) {
        console.log(`[dry] would update case ${existing.id}: title=${title} suite=${suiteId}`);
        return existing;
      }
      await qase("PATCH", `/case/${PROJECT}/${existing.id}`, { title, suite_id: suiteId });
      console.log(`~ case: ${title} (id ${existing.id})`);
    }
    return existing;
  }
  if (DRY_RUN) {
    console.log(`[dry] would create case: ${title} (external_id ${externalId})`);
    return { id: `dry-${externalId}`, title, suite_id: suiteId };
  }
  const description = `Playwright E2E test\n\nSource: \`tests/${externalId.split("::")[0]}\`\nExternal ID: \`${externalId}\``;
  const res = await qase("POST", `/case/${PROJECT}`, {
    title,
    suite_id: suiteId,
    description,
    severity: 4, // "normal" — sensible default; UI can override
    priority: 2, // "medium"
  });
  const id = res.result.id;
  console.log(`+ case: ${title} (id ${id})`);
  return { id, title, suite_id: suiteId };
}

async function main() {
  const specs = loadAllSpecs();
  const totalTests = specs.reduce(
    (n, s) => n + s.describes.reduce((m, d) => m + d.tests.length, 0),
    0,
  );
  console.log(`Found ${specs.length} spec files, ${totalTests} tests total${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Load existing suites + cases up front so we can diff in memory
  const suites = await paginate(`/suite/${PROJECT}`);
  const suitesByTitle = new Map(suites.map((s) => [s.title, s]));
  const cases = await paginate(`/case/${PROJECT}`);
  // Qase's free tier doesn't surface `external_id` on responses, so we embed a
  // tagged marker in the description on creation and parse it back out on read.
  const casesByExternalId = new Map();
  const externalIdRegex = /External ID:\s*`([^`]+)`/;
  for (const c of cases) {
    const m = c.description && c.description.match(externalIdRegex);
    if (m) casesByExternalId.set(m[1], c);
  }

  for (const spec of specs) {
    for (const d of spec.describes) {
      const suite = await ensureSuite(d.title, suitesByTitle);
      for (const t of d.tests) {
        const externalId = `${spec.specFile}::${t.title}`;
        await ensureCase(t.title, suite.id, externalId, casesByExternalId);
      }
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
