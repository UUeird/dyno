#!/usr/bin/env node
// Detect tester edits in the Qase UI and surface them as input for the next
// round of test design.
//
// The sync (scripts/sync-qase.js) is one-way: code → Qase. When a manual tester
// refines step prose in Qase, that edit lives only on the Qase side and gets
// overwritten the next time the underlying test is touched. This script finds
// those edits before they're lost.
//
// Three categories of drift are reported:
//
//   TESTER-REFINED   — code unchanged, Qase prose edited.
//                      Action: lift the refined prose into `// @qase-step:`
//                      annotations on the test, so it survives future syncs.
//
//   CONFLICT         — code changed AND Qase prose edited.
//                      Most interesting case: the tester's insight may still
//                      apply to the new behavior, may be obsoleted, or may
//                      reveal a gap in the AI-generated steps. A human (or AI
//                      in chat) should reconcile.
//
//   CODE-AHEAD       — code changed, Qase prose untouched.
//                      Informational: the next sync will quietly overwrite.
//                      Listed so dry-runs aren't surprising.
//
// Idempotency: drift is detected by comparing the live Qase steps to the
// `Steps hash:` marker the sync script embedded in the description. The same
// hash that sync uses to decide "do I need to PATCH?" is repurposed here to
// decide "has Qase changed since I last pushed?".
//
// Required env: QASE_API_TOKEN, QASE_PROJECT_CODE (defaults to "DYNO")

const fs = require("fs");
const path = require("path");
const { loadAllSpecs, bodyToSteps, stepsHash } = require("./sync-qase");

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

// The list endpoint returns cases without their `steps` array — we have to
// fetch each case individually to get steps.
async function fetchCase(id) {
  const res = await qase("GET", `/case/${PROJECT}/${id}`);
  return res.result;
}

// Normalize live Qase steps into the same shape used by stepsHash() in the
// sync script — { action, expected_result } pairs. The API returns extra
// fields (position, hash, nested steps) that we ignore, and `expected_result`
// comes back as null when empty even though we wrote "".
function normalizeLiveSteps(steps) {
  return (steps || []).map((s) => ({
    action: s.action || "",
    expected_result: s.expected_result || "",
  }));
}

function formatSteps(steps) {
  if (!steps.length) return "    (no steps)";
  return steps
    .map((s, i) => {
      const expected = s.expected_result
        ? `\n      → ${s.expected_result.split("\n").join("\n        ")}`
        : "";
      return `    ${i + 1}. ${s.action.split("\n").join("\n       ")}${expected}`;
    })
    .join("\n");
}

async function main() {
  const specs = loadAllSpecs();
  const testsByExternalId = new Map();
  for (const spec of specs) {
    for (const d of spec.describes) {
      for (const t of d.tests) {
        testsByExternalId.set(`${spec.specFile}::${t.title}`, t);
      }
    }
  }

  const cases = await paginate(`/case/${PROJECT}`);
  const externalIdRegex = /External ID:\s*`([^`]+)`/;
  const hashRegex = /Steps hash:\s*`([^`]+)`/;

  const taggedCases = [];
  for (const c of cases) {
    if (!c.description) continue;
    const idMatch = c.description.match(externalIdRegex);
    if (!idMatch) continue;
    const hashMatch = c.description.match(hashRegex);
    if (!hashMatch) continue; // sync was never run for this case — skip
    taggedCases.push({
      id: c.id,
      title: c.title,
      externalId: idMatch[1],
      storedHash: hashMatch[1],
    });
  }

  console.log(`Checking ${taggedCases.length} synced case(s) for drift…\n`);

  const refined = [];
  const conflicts = [];
  const codeAhead = [];

  for (const summary of taggedCases) {
    const test = testsByExternalId.get(summary.externalId);
    if (!test) continue; // orphan — covered by qase-orphans

    const fresh = bodyToSteps(test.body || "");
    const freshHash = stepsHash(fresh);

    const full = await fetchCase(summary.id);
    const live = normalizeLiveSteps(full.steps);
    const liveHash = stepsHash(live);

    const qaseEdited = liveHash !== summary.storedHash;
    const codeChanged = freshHash !== summary.storedHash;

    if (!qaseEdited && !codeChanged) continue;
    if (qaseEdited && !codeChanged) refined.push({ summary, live, fresh });
    else if (!qaseEdited && codeChanged) codeAhead.push({ summary, live, fresh });
    else conflicts.push({ summary, live, fresh });
  }

  if (refined.length === 0 && conflicts.length === 0 && codeAhead.length === 0) {
    console.log("No drift — every synced case matches its last-pushed state.");
    return;
  }

  if (refined.length > 0) {
    console.log(`\n━━━ TESTER-REFINED (${refined.length}) ━━━`);
    console.log("Code unchanged; tester edited Qase prose. Lift the refined");
    console.log("prose into `// @qase-step:` / `// @qase-expect:` annotations");
    console.log("on the test to preserve it across future syncs.\n");
    for (const item of refined) {
      console.log(`  #${item.summary.id}  ${item.summary.title}`);
      console.log(`         ${item.summary.externalId}`);
      console.log(`         ── Tester's current Qase steps:`);
      console.log(formatSteps(item.live));
      console.log();
    }
  }

  if (conflicts.length > 0) {
    console.log(`\n━━━ CONFLICT (${conflicts.length}) ━━━`);
    console.log("Both code and Qase prose changed since last sync. The");
    console.log("tester's edit may still apply to the new behavior, may be");
    console.log("obsoleted, or may reveal a gap in the auto-generated steps.");
    console.log("Reconcile by hand (or in chat with an AI assistant).\n");
    for (const item of conflicts) {
      console.log(`  #${item.summary.id}  ${item.summary.title}`);
      console.log(`         ${item.summary.externalId}`);
      console.log(`         ── Tester's current Qase steps:`);
      console.log(formatSteps(item.live));
      console.log(`         ── Steps the next sync WOULD push (from current code):`);
      console.log(formatSteps(item.fresh));
      console.log();
    }
  }

  if (codeAhead.length > 0) {
    console.log(`\n━━━ CODE-AHEAD (${codeAhead.length}) ━━━`);
    console.log("Code changed; Qase prose untouched. The next sync will");
    console.log("overwrite cleanly. Listed for awareness only.\n");
    for (const item of codeAhead) {
      console.log(`  #${item.summary.id}  ${item.summary.title}`);
      console.log(`         ${item.summary.externalId}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
