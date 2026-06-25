# Working on Dyno

A social car-tracking app — see [README.md](README.md) for the user-facing description.

For deeper reference:
- **[docs/product.md](docs/product.md)** — concepts and flows
- **[docs/architecture.md](docs/architecture.md)** — stack, data flow, organization
- **[docs/api.md](docs/api.md)** — full endpoint reference
- **[docs/qase.md](docs/qase.md)** — Qase API quirks and sync-design principles (portable to other projects)
- **[plan.json](plan.json)** — what's queued up next, as a kanban board, managed via
  the hosted tada board (`https://tada-board.fly.dev`, project `dyno`). View/edit it with
  the tada MCP server, wired in `.mcp.json`. That file is gitignored (it references the
  per-machine `${TADA_HOME}` path), so set it up on a fresh clone: `cp .mcp.json.example
  .mcp.json`, then export `TADA_HOME` (path to your local tada checkout, containing
  `mcp_server.py`) in your shell profile. The write API key is **not** configured here —
  the tada server auto-loads `TADA_API_KEY` from a gitignored `.env` in `$TADA_HOME`. Set
  that once in the tada repo and writes work everywhere. Restart Claude Code after changing
  the env so the MCP server re-launches.

## Repo layout

```
dyno/
└── dyno-react-app/
    ├── src/             # React frontend (CRA, react-scripts 3.0.1)
    ├── backend/         # Express + Mongoose API server
    └── tests/           # Playwright E2E specs
```

Everything lives under `dyno-react-app/`. There is no other source tree.

## Running the dev environment

The backend and frontend run independently:

```bash
# Backend (port 5000, hits MongoDB carsDB on localhost:27017)
cd dyno-react-app/backend && npm run dev

# Frontend (port 3000)
cd dyno-react-app && npm start
```

MongoDB must be running locally on default port 27017. Two databases are used:
- `carsDB` — dev database (what `npm run dev` connects to by default)
- `carsDB_test` — isolated test database (set via `MONGO_DB=carsDB_test`)

## Running tests

**Only run the spec file relevant to the feature being worked on.** Never run the full suite to verify a change — it's expensive in tokens and time.

```bash
cd dyno-react-app
npx playwright test tests/<spec>.spec.ts      # one spec
npx playwright test -g "test name"            # single test by title
```

Tests must be run from `dyno-react-app/` (not `backend/`) — `testDir: "./tests"` resolves relative to cwd.

The test harness (`tests/global-setup.ts`):
1. Kills any process on port 5000 (`pkill -f "node server.js"`)
2. Starts the backend with `MONGO_DB=carsDB_test`
3. Seeds fixtures via `POST /api/test/seed` (which drops + recreates collections, including `wishlistitems`)
4. After the suite, `global-teardown.ts` restarts the dev backend against `carsDB`

Tests run **serially** (workers: 1) because they share a DB.

Fixture IDs are stable across runs — see [tests/seed.ts](dyno-react-app/tests/seed.ts) for the IDs and what they map to (Sam, Alex, Civic, Impala, Tesla Model 3).

## Syncing tests to Qase

We mirror Playwright tests into Qase as test cases for tracking + manual run reporting. The sync runs automatically on every `git push` (via a pre-push hook installed by `npm install`), and can also be invoked manually:

```bash
cd dyno-react-app
npm run sync-qase            # creates/updates cases (code → Qase)
npm run sync-qase -- --dry-run   # preview without writing
npm run qase-orphans         # list Qase cases with no matching test (tester inbox)
npm run qase-drift           # list cases where the tester edited Qase prose (drift inbox)
```

Mechanics:
- One Qase suite per `test.describe(...)` block
- One Qase case per `test(...)` inside a describe
- Each case's test steps are parsed from the test body: consecutive UI actions collapse into one step whose `expected_result` is the next `expect(...)`. API tests emit one step per axios call. A `Steps hash: <sha>` marker in the description detects when steps have drifted and triggers an update
- Idempotency: each case's description embeds `External ID: \`<spec>.spec.ts::<test name>\``. The script parses that marker from existing cases on every run
- **Overriding auto-generated steps**: add `// @qase-step: …` and `// @qase-expect: …` comments at the top of the test body. The script uses those verbatim instead of parsing the code — useful for tests where the auto-parsed steps read mechanically and a QA tester needs better prose
- **Before editing a test that may have been polished by a tester in Qase**, run `npm run qase-drift`. If it reports the case as TESTER-REFINED or CONFLICT, lift the tester's prose into `// @qase-step:` / `// @qase-expect:` annotations *before* changing the test body — otherwise the next sync will overwrite their work. The drift script is manual on purpose; it's not in the pre-push hook
- Required env (read from `.env.local`): `QASE_API_TOKEN`, optionally `QASE_PROJECT_CODE` (defaults to `DYNO`)
- Implementation: [scripts/sync-qase.js](dyno-react-app/scripts/sync-qase.js)

**Pre-push hook**: [scripts/hooks/pre-push](dyno-react-app/scripts/hooks/pre-push) runs the sync before each push. Failures don't block — if Qase is unreachable the push proceeds and a warning prints. The hook is installed by `scripts/install-hooks.js`, which runs as a `postinstall` script — collaborators get it set up automatically when they run `npm install`. They can also re-run with `npm run install-hooks`.

## Adding a feature — typical pattern

1. **Schema** in [backend/server.js](dyno-react-app/backend/server.js) (single-file Express server, all schemas defined inline)
2. **Endpoints** — add to `server.js`, follow the existing style (try/catch with 500 on error)
3. **Test-only collection wiping** — if you add a new collection, add it to the list in the `/api/test/seed` endpoint so test runs stay isolated
4. **Frontend types** in [src/types.ts](dyno-react-app/src/types.ts)
5. **Views/components** in [src/views/](dyno-react-app/src/views/) and [src/components/](dyno-react-app/src/components/)
6. **Routes** wired up in [src/App.tsx](dyno-react-app/src/App.tsx)
7. **E2E spec** in `tests/<feature>.spec.ts` — clean up created data in `afterEach` since tests share the DB

## Quirks to know

**react-scripts 3.0.1's Babel 7 + TypeScript plugin is from early 2019.** It chokes on some modern TS:
- Inline tuple type generics like `Array<[number, number]>` — use parallel `number[]` arrays
- CSS custom property keys inside `React.CSSProperties` casts — use `transitionDelay` inline or a CSS class

The error you'll see is `Syntax error: Cannot read properties of undefined (reading 'map') (0:undefined)` with no useful line info. If you see `(0:undefined)`, suspect a Babel parser limit before suspecting your logic.

**Stale async responses can overwrite newer state.** When a `useEffect` re-fires on a dependency change (e.g. `currentUserId` loading later than the component mounting), in-flight requests can resolve out of order. Use a `cancelled` flag in the effect cleanup to drop stale responses. Example pattern in [src/views/CarModelView.tsx](dyno-react-app/src/views/CarModelView.tsx).

**Authentication uses Clerk** (magic-link email). Frontend wraps the app in `<ClerkProvider>` (see [src/index.tsx](dyno-react-app/src/index.tsx)); backend uses `clerkMiddleware()` and checks the bearer token. On a user's first authenticated request, the backend auto-provisions a `Human` record linked by `clerkId` — see `getCurrentHuman()` in [backend/server.js](dyno-react-app/backend/server.js). Write endpoints require auth via `requireAuth` middleware.

**Test-mode auth bypass.** Running with `MONGO_DB=carsDB_test` skips Clerk and reads the user from the `x-test-user-id` header. Specs use the `asSam()` / `asAlex()` / `asUser(id)` helpers from [tests/auth.ts](dyno-react-app/tests/auth.ts) for API calls, and `pageAsSam(page)` to authenticate the browser (sets the header on all requests AND a `localStorage.dyno_test_auth` flag that the frontend's [src/lib/auth.tsx](dyno-react-app/src/lib/auth.tsx) shim reads to short-circuit Clerk's `<SignedIn>` / `<SignedOut>` gates).

**Env vars.**
- `dyno-react-app/.env.local` (gitignored): `REACT_APP_CLERK_PUBLISHABLE_KEY`
- `dyno-react-app/backend/.env` (gitignored): `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLOUDINARY_URL`, optionally `ADMIN_EMAILS` (comma-separated list of admin user emails — needed to access admin-only endpoints)

**Manufacturer registry.** On backend startup, `seedManufacturers()` idempotently inserts a starter list of ~20 brands. Admins (users whose email is in `ADMIN_EMAILS`) can add more manufacturers and models via `/admin/manufacturers`. New cars must reference an existing manufacturer+model combination, so this is how the registry grows.

**API base URL** comes from `process.env.REACT_APP_API_URL` (falls back to `http://localhost:5000` in dev). Import `API` (root + `/api`) or `API_ORIGIN` (root only, for `/uploads/...` paths) from [src/lib/api.ts](dyno-react-app/src/lib/api.ts) — never hardcode URLs.

**Model URL slugs** are lowercase, hyphenated (`/cars/honda/civic`, `/cars/mercedes-benz/s-class`). Backend converts back via `slugToRegex` for case-insensitive matching. Helpers in [src/lib/modelSlug.ts](dyno-react-app/src/lib/modelSlug.ts).

## Style

- Don't add features, refactor, or abstractions beyond what the task requires
- Default to no comments unless the WHY is non-obvious
- No backwards-compatibility shims for in-progress code — change it directly
- Match the existing patterns (e.g. how schemas are defined in `server.js`, how views structure their data fetching)
