# Working on Dyno

A social car-tracking app — see [README.md](README.md) for the user-facing description.

For deeper reference:
- **[docs/product.md](docs/product.md)** — concepts and flows
- **[docs/architecture.md](docs/architecture.md)** — stack, data flow, organization
- **[docs/api.md](docs/api.md)** — full endpoint reference

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

**No real authentication yet.** The current user is found by hardcoded email `sam@samelawrence.com` in [src/App.tsx](dyno-react-app/src/App.tsx). When testing logged-in behavior in E2E specs, use `FIXTURES.users.sam` for the user ID.

**API base URL** comes from `process.env.REACT_APP_API_URL` (falls back to `http://localhost:5000` in dev). Import `API` (root + `/api`) or `API_ORIGIN` (root only, for `/uploads/...` paths) from [src/lib/api.ts](dyno-react-app/src/lib/api.ts) — never hardcode URLs.

**Model URL slugs** are lowercase, hyphenated (`/cars/honda/civic`, `/cars/mercedes-benz/s-class`). Backend converts back via `slugToRegex` for case-insensitive matching. Helpers in [src/lib/modelSlug.ts](dyno-react-app/src/lib/modelSlug.ts).

## Style

- Don't add features, refactor, or abstractions beyond what the task requires
- Default to no comments unless the WHY is non-obvious
- No backwards-compatibility shims for in-progress code — change it directly
- Match the existing patterns (e.g. how schemas are defined in `server.js`, how views structure their data fetching)
