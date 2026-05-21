#!/usr/bin/env node
// Sync Playwright tests → Qase cases.
//
// One Qase suite per `test.describe(...)` block in each spec file.
// One Qase case per `test(...)` inside that describe, with an external_id of
// the form `<spec-filename>::<test-name>` so the sync is idempotent — re-runs
// won't create duplicates or rename existing cases.
//
// Each case's body is also parsed into Qase test steps. UI tests collapse
// consecutive `page.click`/`fill`/etc into one action whose expected_result is
// the next `expect(...)`. API tests emit one step per axios call.
//
// To override the auto-generated steps for a given test, add comments at the
// top of the test body:
//
//   test("...", async ({ page }) => {
//     // @qase-step: Open the New Experience modal
//     // @qase-step: Select a previous car, then choose "Spotted"
//     // @qase-expect: The modal shows the location-tagging step
//     // @qase-step: Click Skip
//     // @qase-expect: The modal closes
//     ...real code...
//   });
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

// Returns: [{ specFile, describes: [{ title, tests: [{ title, body }] }] }]
// `body` is the raw source between the test's `async ({ page }) => {` and its
// closing `})` — used downstream to derive Qase steps.
//
// Tracks brace depth to know which describe a `test(...)` belongs to. Assumes
// one top-level describe per spec (matches our current codebase) but would
// still tolerate multiple — tests fall under the most recent open describe.
function parseSpec(specPath) {
  const src = fs.readFileSync(specPath, "utf8");
  const lines = src.split("\n");
  const describes = [];
  let currentDescribe = null;
  let depth = 0;
  let describeDepth = -1;
  // Body-capture state: when we enter a `test(...)`, remember its depth, then
  // collect lines until depth returns to that level.
  let currentTest = null;
  let testDepth = -1;
  let testBodyLines = [];

  for (const line of lines) {
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
      if (title) {
        currentTest = { title, body: "" };
        currentDescribe.tests.push(currentTest);
        testDepth = depth;
        testBodyLines = [];
      }
    } else if (currentTest) {
      testBodyLines.push(line);
    }

    // On a test-opening line the parameter destructure `({ page })` contains a
    // pair of braces that would confuse the depth counter. Skip to after `=> {`
    // for brace counting on that specific line.
    let braceScanFrom = 0;
    if (testMatch) {
      const arrow = line.indexOf("=>");
      if (arrow !== -1) braceScanFrom = arrow;
    }
    for (let i = braceScanFrom; i < line.length; i++) {
      const ch = line[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (currentTest && depth <= testDepth) {
          // The `test(` opens at depth N, the arrow's `{` puts us at N+1, and
          // closing back to N means the test body is complete. Drop the line
          // containing the closing `})` itself (already partially captured).
          currentTest.body = testBodyLines.slice(0, -1).join("\n");
          currentTest = null;
          testDepth = -1;
          testBodyLines = [];
        }
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

// ── Body → steps translation ─────────────────────────────────────────────
//
// Tests can opt out of auto-translation by placing `// @qase-step: …` and
// `// @qase-expect: …` comments at the top of the test body. Otherwise the
// body is parsed line-by-line into action/expected pairs. Two flavours:
//
//   UI tests   — group consecutive actions (clicks, fills, navigates, …);
//                next `expect(...)` becomes the expected_result.
//   API tests  — same shape but each axios call is its own step, and the
//                action describes the HTTP request shape.

function extractOverrideSteps(body) {
  const lines = body.split("\n");
  const steps = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const stepMatch = line.match(/^\/\/\s*@qase-step:?\s*(.+)$/);
    const expectMatch = line.match(/^\/\/\s*@qase-expect:?\s*(.+)$/);
    if (stepMatch) {
      if (current) steps.push(current);
      current = { action: stepMatch[1].trim(), expected_result: "" };
    } else if (expectMatch && current) {
      current.expected_result = (current.expected_result
        ? current.expected_result + "\n"
        : "") + expectMatch[1].trim();
    } else if (line && !line.startsWith("//")) {
      // First real code line — stop scanning for comments
      break;
    }
  }
  if (current) steps.push(current);
  return steps;
}

// Trim a quoted-string snippet to readable text (drop wrapping quotes/backticks).
function unquote(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith("`") && s.endsWith("`"))) {
    return s.slice(1, -1);
  }
  return s;
}

// Best-effort: pull the first argument inside `(...)` out of a call expression.
// Properly tracks string quoting so commas/parens inside strings don't confuse
// the depth counter (e.g. `'.foo:has-text("bar")'`).
function firstArg(s) {
  const open = s.indexOf("(");
  if (open === -1) return null;
  let depth = 0;
  let quote = null;
  let arg = "";
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    const prev = s[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      arg += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      if (!(depth === 1 && arg === "")) arg += ch;
      else arg += ch;
      continue;
    }
    if (ch === "(") { depth++; if (depth === 1) continue; }
    else if (ch === ")") { depth--; if (depth === 0) return arg.trim(); }
    else if (ch === "," && depth === 1) return arg.trim();
    arg += ch;
  }
  return arg.trim() || null;
}

// Find the index just past the matching `)` for the `(` at position `start`.
// Respects nested parens and string quoting so selectors with embedded
// parens/quotes (`'.foo:has-text("Bar")'`) don't break the scan.
function endOfCall(s, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    const prev = s[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// Translate a single Playwright action call into a one-line description.
function describeAction(call) {
  // page.goto("/path")
  if (call.includes("page.goto(")) {
    const start = call.indexOf("page.goto(") + "page.goto".length;
    return `Navigate to "${unquote(firstArg(call.slice(start)) || "")}"`;
  }
  if (/page\.reload\(/.test(call)) {
    return "Reload the page";
  }
  if (call.includes("page.click(")) {
    const start = call.indexOf("page.click(") + "page.click".length;
    const arg = unquote(firstArg(call.slice(start)) || "");
    if (arg.startsWith("text=")) return `Click "${arg.slice(5)}"`;
    return `Click element matching \`${arg}\``;
  }
  if (call.includes("page.fill(")) {
    const start = call.indexOf("page.fill(") + "page.fill".length;
    const end = endOfCall(call, start);
    const inside = call.slice(start + 1, end - 1);
    const parts = inside.split(/,(?![^"`']*["`'])/);
    const selector = unquote((parts[0] || "").trim());
    const value = unquote((parts[1] || "").trim());
    return `Fill \`${selector}\` with "${value}"`;
  }
  if (/page\.press\(/.test(call)) {
    const start = call.indexOf("page.press(") + "page.press".length;
    const end = endOfCall(call, start);
    const inside = call.slice(start + 1, end - 1);
    const parts = inside.split(",");
    return `Press key ${unquote((parts[1] || "").trim())} on \`${unquote((parts[0] || "").trim())}\``;
  }
  if (/page\.hover\(/.test(call)) {
    return "Hover over the previous element";
  }
  // page.locator(SEL).click() / .first().click() / .nth(N).click() / .hover() / .fill(...)
  if (call.includes("page.locator(")) {
    const start = call.indexOf("page.locator(") + "page.locator".length;
    const sel = unquote(firstArg(call.slice(start)) || "");
    const tail = call.slice(endOfCall(call, start));
    return locatorTail(tail, `\`${sel}\``);
  }
  // Stored-locator forms: `someVar.nth(N).click()`, `someVar.click()`, etc.
  // Without variable tracking we don't know the underlying selector, so we
  // reference the variable name by way of a brief note.
  const stored = call.match(/^(?:await\s+)?(\w+)\.(?:nth\(\d+\)|first\(\)|last\(\)|click\(|hover\(|fill\()/);
  if (stored) {
    return locatorTail(call, `the stored \`${stored[1]}\` locator`);
  }
  return null;
}

function locatorTail(tail, label) {
  if (/\.click\(/.test(tail)) {
    if (/\.first\(\)/.test(tail)) return `Click the first element of ${label}`;
    const nth = tail.match(/\.nth\((\d+)\)/);
    if (nth) return `Click ${label} (index ${nth[1]})`;
    return `Click element matching ${label}`;
  }
  if (/\.hover\(/.test(tail)) return `Hover over ${label}`;
  if (/\.fill\(/.test(tail)) {
    const fillStart = tail.indexOf(".fill(") + ".fill".length;
    const val = unquote(firstArg(tail.slice(fillStart)) || "");
    return `Fill ${label} with "${val}"`;
  }
  return null;
}

// Translate an expect(...) line into a one-line description.
// Pulls the locator's selector via firstArg() (handles nested parens/strings),
// then matches off the matcher tail.
function describeExpect(call) {
  let selector = null;
  const locIdx = call.indexOf("page.locator(");
  if (locIdx !== -1) {
    const after = call.slice(locIdx + "page.locator".length);
    selector = unquote(firstArg(after) || "");
  }

  // Order matters: more specific matchers first
  if (/\.not\.toBeVisible\(\)/.test(call) && selector !== null) {
    return `Element \`${selector}\` is NOT visible`;
  }
  if (/\.toBeVisible\(\)/.test(call) && selector !== null) {
    return `Element \`${selector}\` is visible`;
  }
  if (/\.toBeAttached\(\)/.test(call) && selector !== null) {
    return `Element \`${selector}\` is attached to the DOM`;
  }
  let m;
  if ((m = call.match(/\.toContainText\(([^)]+)\)/)) && selector !== null) {
    return `\`${selector}\` contains text "${unquote(m[1])}"`;
  }
  if ((m = call.match(/\.toHaveClass\(([^)]+)\)/)) && selector !== null) {
    return `\`${selector}\` has class matching ${m[1].trim()}`;
  }
  if ((m = call.match(/\.toHaveAttribute\(([^)]+)\)/)) && selector !== null) {
    const parts = m[1].split(",");
    return `\`${selector}\` has attribute ${unquote((parts[0] || "").trim())}="${unquote((parts[1] || "").trim())}"`;
  }
  if ((m = call.match(/\.toHaveCount\((\d+)\)/)) && selector !== null) {
    return `\`${selector}\` appears ${m[1]} time(s)`;
  }
  if ((m = call.match(/expect\(page\)\.toHaveURL\(([^)]+)\)/))) {
    return `URL matches ${m[1].trim()}`;
  }
  // Generic API/data assertion — strip the await prefix and re-render the expression.
  const stripped = call.replace(/^await\s+/, "").replace(/;\s*$/, "");
  return `Assertion: \`${stripped}\``;
}

// Translate an axios call into a request description.
function describeAxios(call) {
  const m = call.match(/axios\.(get|post|put|patch|delete)\(/);
  if (!m) return null;
  const method = m[1].toUpperCase();
  const callStart = call.indexOf(`axios.${m[1]}`) + `axios.${m[1]}`.length;
  const rawUrl = firstArg(call.slice(callStart));
  if (!rawUrl) return null;
  const url = rawUrl
    .replace(/^`/, "").replace(/`$/, "")
    .replace(/\$\{API\}/g, "/api")
    .replace(/\$\{FIXTURES\.users\.(\w+)\}/g, "{$1-user-id}")
    .replace(/\$\{FIXTURES\.cars\.(\w+)\}/g, "{$1-car-id}")
    .replace(/\$\{(\w+)\}/g, "{$1}");
  return `Send ${method} ${url}`;
}

// Collapse multi-line *expressions* into one "logical line", but leave block
// braces alone so try/finally bodies still parse as separate statements.
// Tracks paren/bracket depth and string state, and skips // line comments so
// apostrophes inside comments don't open a phantom quote.
function collapseStatements(body) {
  const out = [];
  let buf = "";
  let depth = 0;
  let quote = null;
  let inLineComment = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inLineComment) {
      buf += ch;
      if (ch === "\n") {
        inLineComment = false;
        if (depth === 0) {
          const trimmed = buf.trim();
          if (trimmed) out.push(trimmed);
          buf = "";
        }
      }
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote && body[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "/" && body[i + 1] === "/") {
      inLineComment = true;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; buf += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "\n" && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// Main translator: body → list of { action, expected_result }.
function bodyToSteps(body) {
  const override = extractOverrideSteps(body);
  if (override.length > 0) return override;

  const lines = collapseStatements(body);
  const isApi = !/\bpage\./.test(body) && /\baxios\./.test(body);

  const steps = [];
  let actionLines = [];
  let expectLines = [];
  let seenUiInteraction = false;

  const flush = () => {
    if (actionLines.length === 0 && expectLines.length === 0) return;
    const action = actionLines.length === 0
      ? "Verify the resulting state"
      : actionLines.length === 1
        ? actionLines[0]
        : actionLines.map((a) => `- ${a}`).join("\n");
    const expected = expectLines.length === 0
      ? ""
      : expectLines.length === 1
        ? expectLines[0]
        : expectLines.map((e) => `- ${e}`).join("\n");
    steps.push({ action, expected_result: expected });
    actionLines = [];
    expectLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;

    // Hitting a new action after we've already captured expectations means the
    // previous step is complete — push it and start fresh.
    if (expectLines.length > 0) {
      const looksLikeAction = isApi
        ? !!describeAxios(line)
        : (!!describeAction(line) || (!seenUiInteraction && !!describeAxios(line)));
      if (looksLikeAction) flush();
    }

    if (isApi) {
      const ax = describeAxios(line);
      if (ax) {
        if (actionLines.length) flush();
        actionLines.push(ax);
        continue;
      }
    } else {
      const act = describeAction(line);
      if (act) {
        seenUiInteraction = true;
        actionLines.push(act);
        continue;
      }
      // Treat axios calls before any UI interaction as test setup ("Given …").
      // Setup after page activity is almost always cleanup — skip those.
      if (!seenUiInteraction) {
        const ax = describeAxios(line);
        if (ax) {
          if (actionLines.length && actionLines[actionLines.length - 1].startsWith("Setup:") === false) {
            // Promote subsequent setup calls into the same step
          }
          actionLines.push(`Setup: ${ax}`);
          continue;
        }
      }
    }

    if (/^(await\s+)?expect\(/.test(line)) {
      const exp = describeExpect(line);
      expectLines.push(exp);
      continue;
    }
  }
  flush();

  return steps;
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

function stepsHash(steps) {
  const json = JSON.stringify(steps.map((s) => [s.action, s.expected_result]));
  return require("crypto").createHash("sha1").update(json).digest("hex").slice(0, 12);
}

function buildDescription(externalId, hash) {
  return [
    "Playwright E2E test",
    "",
    `Source: \`tests/${externalId.split("::")[0]}\``,
    `External ID: \`${externalId}\``,
    `Steps hash: \`${hash}\``,
  ].join("\n");
}

const HASH_REGEX = /Steps hash:\s*`([^`]+)`/;

async function ensureCase(title, suiteId, externalId, steps, existingByExternalId) {
  const hash = stepsHash(steps);
  const description = buildDescription(externalId, hash);
  const existing = existingByExternalId.get(externalId);
  if (existing) {
    const existingHashMatch = existing.description && existing.description.match(HASH_REGEX);
    const existingHash = existingHashMatch ? existingHashMatch[1] : null;
    const stepsDrift = existingHash !== hash;
    const titleDrift = existing.title !== title || existing.suite_id !== suiteId;
    if (titleDrift || stepsDrift) {
      if (DRY_RUN) {
        const what = [titleDrift && "title/suite", stepsDrift && "steps"].filter(Boolean).join("+");
        console.log(`[dry] would update case ${existing.id} (${what}): ${title}`);
        return existing;
      }
      await qase("PATCH", `/case/${PROJECT}/${existing.id}`, {
        title, suite_id: suiteId, description, steps,
      });
      const what = [titleDrift && "title", stepsDrift && "steps"].filter(Boolean).join("+");
      console.log(`~ case: ${title} (id ${existing.id}, ${what})`);
    }
    return existing;
  }
  if (DRY_RUN) {
    console.log(`[dry] would create case: ${title} (external_id ${externalId}, ${steps.length} steps)`);
    return { id: `dry-${externalId}`, title, suite_id: suiteId };
  }
  const res = await qase("POST", `/case/${PROJECT}`, {
    title,
    suite_id: suiteId,
    description,
    steps,
    severity: 4, // "normal" — sensible default; UI can override
    priority: 2, // "medium"
  });
  const id = res.result.id;
  console.log(`+ case: ${title} (id ${id}, ${steps.length} steps)`);
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
        const steps = bodyToSteps(t.body || "");
        await ensureCase(t.title, suite.id, externalId, steps, casesByExternalId);
      }
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
