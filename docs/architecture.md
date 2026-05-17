# Architecture

## Stack

- **Frontend**: React 18 + TypeScript, react-router-dom v6, Axios, CRA (`react-scripts ^3.0.1`)
- **Backend**: Node.js + Express 4, Mongoose 8, Multer (file uploads)
- **Database**: MongoDB (no managed service, local instance on port 27017)
- **E2E**: Playwright, runs against an isolated `carsDB_test` database

## Process model

Two long-running processes in dev:

| Process | Port | Source | Started with |
|---------|------|--------|-------------|
| Backend (Express) | 5000 | `dyno-react-app/backend/server.js` | `cd backend && npm run dev` (nodemon) |
| Frontend (CRA dev server) | 3000 | `dyno-react-app/src/` | `cd dyno-react-app && npm start` |

The frontend hits the backend at `http://localhost:5000/api/...` directly (no proxy, CORS enabled server-side).

## Data flow

```
User action in browser
  → React view (src/views/) calls axios.{get,post,put,delete}
  → Express route in backend/server.js
  → Mongoose model (defined inline in server.js)
  → MongoDB (carsDB)
```

All views are stateful components that fetch their own data via `useEffect`. There is no centralized state library (Redux, Zustand) — top-level state for shared data (humans, cars, experiences, following) lives in [src/App.tsx](../dyno-react-app/src/App.tsx) and is passed down as props.

### App-level state

[src/App.tsx](../dyno-react-app/src/App.tsx) holds the canonical lists used across views:
- `humans`, `cars`, `manufacturers`, `experiences` — fetched once on mount
- `following` — list of followee IDs; refetched when `currentUserId` resolves
- `currentUserId` — derived from `humans.find(h => h.email === "sam@samelawrence.com")` (auth placeholder)

View-specific data (e.g. model page aggregate, profile data, badges, wishlist) is fetched by the view itself.

### Async response races

When a view's `useEffect` re-fires on a dependency change (e.g. `currentUserId` resolving after first render), in-flight requests can resolve out of order. The pattern to handle this is a `cancelled` flag in the effect cleanup — see [src/views/CarModelView.tsx](../dyno-react-app/src/views/CarModelView.tsx) for an example. Without it, the stale response can overwrite newer state.

## Backend organization

All routes, schemas, and helpers are in a single file: [backend/server.js](../dyno-react-app/backend/server.js).

Structure of the file:
1. Mongoose connection + schemas (Human, Manufacturer, Photo, Car, Ownership, Experience, Follow, Reaction, BadgeSeries, UserBadge, WishlistItem)
2. Badge series seeder + evaluators (`BADGE_EVALUATORS`, `evaluateBadges`)
3. Migration helpers
4. Helper functions (`attachOwnership`, `slugToRegex`, `yearMatchesWishlist`)
5. Routes, grouped by resource
6. Test-only routes (gated behind `DB_NAME === "carsDB_test"`)

When adding a new resource, follow the existing pattern: schema near the top, then routes in the appropriate section.

### Database environment

The backend reads `MONGO_DB` env var to choose the database (default `carsDB`). Tests start a separate backend process with `MONGO_DB=carsDB_test`.

The dev DB persists across restarts. The test DB is fully wiped and reseeded at the start of every test run via `POST /api/test/seed`.

## URL slug conventions

Model pages use lowercase, hyphenated slugs: `/cars/honda/civic`, `/cars/mercedes-benz/s-class`.

- Frontend helper: [src/lib/modelSlug.ts](../dyno-react-app/src/lib/modelSlug.ts) (`modelSlug(name)`, `modelPath(mfr, model)`)
- Backend reverse: `slugToRegex(slug)` in server.js — builds a case-insensitive regex that matches both spaces and hyphens in the canonical name (so `mercedes-benz` matches `Mercedes-Benz` or `Mercedes Benz`)

## File uploads

Photos uploaded via `POST /api/cars/:id/photos` are stored on disk in `backend/uploads/` and served at `/uploads/<filename>`. Photo records in MongoDB store the relative URL. Deleting a photo removes both the DB record and the file.

External photos can be added via `POST /api/cars/:id/photos/url` (just stores the URL, no file copy).

## Testing

See [CLAUDE.md](../CLAUDE.md) for the testing workflow. Key architectural points:
- Tests run serially (workers: 1) — they share a DB
- The Playwright global setup kills any process on port 5000, starts an isolated test backend with `MONGO_DB=carsDB_test`, seeds via `POST /api/test/seed`, then teardown restarts the dev backend
- Fixture IDs are stable hex strings — see [tests/seed.ts](../dyno-react-app/tests/seed.ts)
- New collections need to be added to the wipe list inside `POST /api/test/seed` or tests will leak data across runs

## Known parser/tooling quirks

react-scripts 3.0.1 ships with Babel 7's TypeScript plugin from early 2019. Several modern TS constructs fail with a misleading "(0:undefined)" error:
- `Array<[number, number]>` and other inline tuple generics — use parallel arrays
- CSS custom property keys inside `React.CSSProperties` — use `transitionDelay` or a CSS class

When you see `Cannot read properties of undefined (reading 'map') (0:undefined)`, suspect Babel before your logic.
