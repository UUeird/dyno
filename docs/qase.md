# Qase Integration Notes

What we learned while wiring Playwright → Qase for this project. Captured here so the same wheel doesn't get re-invented if we port this to another repo or extract it into a plugin.

The local implementation is [scripts/sync-qase.js](../dyno-react-app/scripts/sync-qase.js). This document covers the *principles* behind it — API quirks, formatting limits, and the design decisions that fell out of those quirks.

## API basics

- **Base URL**: `https://api.qase.io/v1`
- **Auth**: `Token: <api-token>` header. The token comes from Qase → Apps → API Tokens. It carries the account's permissions; treat it like a password.
- **Project scope**: most endpoints take a project *code* (e.g. `DYNO`) in the path, not the numeric ID. The code is the all-caps suffix in URLs like `app.qase.io/project/DYNO`.
- **Pagination**: list endpoints (`/case/{code}`, `/suite/{code}`, `/run/{code}`) accept `limit` (max 100) and `offset`. The shape is `{ result: { entities: [...], total, filtered, count } }`. To enumerate everything, paginate until a page returns fewer than `limit` items.

## Field shapes — what surprised us

### `external_id` is write-only on the free tier

The natural way to make a sync idempotent is to set `external_id` on each case and look it up next time. That field exists in the API schema and accepts values on create — but **the free tier (and at least some paid tiers) does not return it on read**. `GET /case/{code}/{id}` shows `external_id: null` even immediately after a write that included it.

**Our workaround**: embed a sentinel into the `description` markdown and parse it back out:

```
External ID: `feed.spec.ts::shows Friends and Public switcher buttons`
```

Round-trips reliably because Qase preserves description text verbatim. Same trick can carry other metadata you need — we also embed a `Steps hash: <sha>` to detect when steps have drifted and need re-syncing.

### Steps live in `steps[]`, not as separate resources

Test steps are *not* a sub-collection. They're a JSON array on the case itself:

```json
{
  "steps": [
    { "action": "Click 'Submit'", "expected_result": "Modal closes" },
    { "action": "Reload the page", "expected_result": "" }
  ]
}
```

You PATCH the entire array; there's no per-step CRUD. This means:

- Editing one step requires sending all of them.
- Step ordering is implicit (array position).
- Each step on read gets a server-assigned `position` (1-indexed), `hash`, and a nested `steps: []` for nested step blocks (which we don't use).
- An empty `expected_result` round-trips as `null` on read but `""` is fine on write.

### Title, description, preconditions, postconditions

- All four accept plain text or markdown. Qase preserves text verbatim — we confirmed `**bold**`, `` `code` ``, bullet lists, and `\n` line breaks all survive a write/read round-trip exactly as sent.
- Markdown *rendering* in the Qase web UI is partial. Backticks/code render, bullets render, **bold** renders. Don't bet on advanced features (tables, fenced code blocks with language tags) without spot-checking the UI.
- `preconditions` and `postconditions` are top-level fields, not steps. Use them for "User is signed in" / "Data is cleaned up" rather than burning a step on it.

### Enum fields that look numeric

- `severity`: 1=blocker, 2=critical, 3=major, 4=normal, 5=minor, 6=trivial
- `priority`: 1=low, 2=medium, 3=high
- `type`: 1=other, 2=functional, … (full list in [Qase docs](https://qase.io/api/v1/))
- `automation`: 0=not automated, 1=to be automated, 2=automated
- `behavior`: 1=positive, 2=negative, 3=destructive

If you sync from a code-driven source you almost always want `severity: 4, priority: 2, automation: 2`. The defaults Qase picks for new cases are different and can mislead reviewers.

### Suite hierarchy

- `POST /suite/{code}` accepts a `parent_id` for nesting. Without it, the suite is a top-level folder.
- Suites are matched by **title within a parent**, not globally — so two suites named "Feed" can coexist if they live under different parents. The sync script uses a `Map<title, suite>` which only works because we have a flat top-level hierarchy. A nested layout would need `Map<parentId+title, suite>`.

## Sync design principles

These fell out of using Qase day-to-day. Order matters — earlier ones constrain later ones.

### 1. The code is the source of truth, not Qase

Treat Qase as a *projection* of your test suite. Edits made in the Qase UI will be overwritten the next time the sync runs (intentional — otherwise drift accumulates silently). If a tester wants different prose, the change goes into the source (we use `// @qase-step:` annotations for that — see below).

If you want a two-way sync, you need a real ID mapping table on disk and conflict resolution. Don't do that unless someone is asking for it; one-way sync from code is dramatically simpler.

### 2. Idempotency requires a stable external key

Even though Qase's `external_id` field is unreliable, you still need *some* stable identifier so the second sync run doesn't create duplicates of every case. Pick a key shape that survives test renames you care about:

- `<spec-file>::<test-name>` — what we use. Renaming a test creates a "new" case + orphan; renaming a spec file does the same. Tradeoff: renames are visible (good for review) but orphans need manual cleanup.
- `<spec-file>::<line-number>` — survives renames but breaks on *any* reorder. Don't.
- A UUID stored in a code comment — survives renames *and* reorders, but requires injecting UUIDs into every test. Heavy.

Whatever you choose, embed it in `description` so it survives the API not exposing `external_id`.

### 3. Detect drift, don't re-PATCH every run

Without a drift check, every run rewrites every case — which is slow (one HTTP request per case) and noisy in audit logs. We compute a SHA over the generated steps and embed it as `Steps hash: <sha>` in the description. On the next run:

- If the stored hash equals the freshly computed hash → no PATCH.
- If they differ → PATCH and update the hash.

The hash should cover *everything you generate*. We hash the steps array; if we also generated descriptions or preconditions from code, we'd extend the hash to those.

### 4. Support manual overrides without losing auto-generation

QA testers will want better prose for some steps than a parser can produce. Two ways to handle it:

- **Override in the source** (what we do): tests can declare `// @qase-step:` and `// @qase-expect:` at the top of the body. The sync script checks for those first and uses them verbatim if present; otherwise it parses the body.
- **Override in Qase**: respect a "do not sync" tag/marker on the Qase case, and skip those cases. Worse, because the override is invisible from the test author's POV.

Source-side overrides win because they live next to the test and ship in the same PR.

### 5. Auto-parsing is heuristic, not a parser

We don't run a real TypeScript parser. We walk the test body line-by-line with a small set of regex/string-search recognizers:

- `page.click(...)` → "Click X"
- `page.fill(SEL, VAL)` → "Fill SEL with VAL"
- `page.locator(SEL).click()` / `.first()` / `.nth(N)` → "Click element matching SEL"
- `axios.get/post/...(URL, ...)` → "Send GET /api/..."
- `expect(page.locator(SEL)).toBeVisible()` → "SEL is visible"
- ... and a dozen more

Things this approach gets wrong, that real parsing would handle:

- Stored locators (`const stars = page.locator(...)`, then `stars.nth(3).click()`) — we recognize the *form* and emit "Click the stored `stars` locator (index 3)", which is honest about the limitation.
- Loops, conditionals, and helper functions — flattened or dropped.
- Template literals with complex interpolation in selectors.

That's fine if you accept that the auto-output is a *first draft* that QA can promote to manual overrides for high-value tests. It's not fine if you need perfect step descriptions for compliance — in that case, mandate overrides.

### 6. Pre-/post-statement handling

Tests usually have setup (create data) and teardown (delete data) wrapping the actual flow. Both look like `axios.*` calls in a UI test.

We distinguish them by *position*: axios calls **before** the first `page.*` interaction become "Setup: …" lines in the first step. axios calls **after** are assumed to be cleanup and silently dropped. This is a heuristic but holds up well in practice because `try { … } finally { axios.delete(...) }` is the dominant pattern.

If a test does setup, UI work, more setup, UI work, the second setup will be dropped. That's a reasonable place to use a manual override.

### 7. Quote/paren-aware string parsing matters

The first version of our parser used regexes like `page\.locator\(([^)]+)\)`. That breaks the moment a selector contains parens — and Playwright selectors *love* parens (`'.foo:has-text("Bar")'`). Same for comments: `// Alex's car` opens a "string" in any quote-naive scanner and silently swallows the next half of the file.

The fixes:

- Walk character by character, tracking paren/bracket depth.
- Maintain a `quote` mode that's only exited by the same quote character (and respects `\` escapes).
- Maintain a `// line comment` mode that disables quote and depth tracking until the next newline.
- Don't count `{` / `}` as depth for *statement grouping* — only expressions. Otherwise `try { … }` blocks swallow their contents into one logical line.

These four together make multi-line statement reconstruction reliable. Without them, ~30% of tests produced subtly wrong steps.

## What we'd do differently in a plugin

If we extracted this into a reusable package, the changes worth making:

- **Use a real TypeScript AST** (e.g. `@typescript-eslint/parser` or `typescript`'s compiler API) instead of line-walking. Solves variable-binding, comments, template literals, and JSX in one shot. We didn't do this because the dependency surface was bigger than the script.
- **Pluggable matchers**. Our `describeAction` / `describeExpect` / `describeAxios` are hardcoded for Playwright + axios. Other stacks (Cypress, supertest, fetch) need their own. Expose them as a `matchers: { actions: [], expects: [], requests: [] }` config.
- **Config file** for project code, default severity/priority, suite parent IDs, and override comment syntax. We hardcoded the comment markers (`@qase-step`, `@qase-expect`); a plugin should let projects pick their own.
- **Run-aware sync**. We only sync cases. Qase also has Test Runs — each push could open a run and the CI result of the Playwright suite could close it. We don't do this because we don't have CI yet, but it's the natural next step.
- **Diff preview in dry-run**. Today `--dry-run` prints "would update case X (steps)". It should show the actual before/after diff so the author can sanity-check before committing.
- **Orphan detection**. Cases that exist in Qase but no longer correspond to any test should be reported (or optionally deleted). We don't do this — they pile up over time.

## Things to remember if you cycle the token

- The pre-push hook reads `QASE_API_TOKEN` from `.env.local`. Rotating the token means updating that file *and* any CI environment that runs the sync.
- A failing sync **doesn't block git push** by design (see `scripts/hooks/pre-push`). That's so a Qase outage doesn't strand you, but it also means an invalid token will silently print a warning and you might not notice for a while. If you rotate, do a manual `npm run sync-qase` immediately to catch problems early.
