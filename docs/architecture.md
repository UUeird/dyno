# Architecture

## Stack

- **Frontend**: React 18 + TypeScript, react-router-dom v6, Axios, CRA (`react-scripts ^5.0.1`)
- **Backend**: Node.js + Express 4, Mongoose 8, Multer (file uploads)
- **Auth**: Clerk (`@clerk/clerk-react` on frontend, `@clerk/express` on backend) — magic-link email
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
- `currentUserId` — derived by fetching `GET /api/me` once Clerk reports the user signed in. Resolves to the user's `Human._id`. Backend auto-provisions a Human on first authenticated request.

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

## Authentication

Uses [Clerk](https://clerk.com) (magic-link email only — no passwords, no OAuth yet).

### Flow
1. User visits `/sign-in` (or `/sign-up`). Clerk's `<SignIn />` / `<SignUp />` components handle the UI.
2. User enters email; Clerk sends a magic-link email.
3. User clicks the link → returns to the app signed in. Clerk session JWT is stored in browser cookies.
4. Frontend's axios interceptor ([src/lib/api.ts](../dyno-react-app/src/lib/api.ts)) attaches the JWT as `Authorization: Bearer <token>` on every API request.
5. Backend's `clerkMiddleware()` validates the JWT and sets `req.auth.userId`.
6. `getCurrentHuman(req)` looks up the user's `Human` record by `clerkId`, **auto-provisioning one on first request** using the name/email/avatarUrl from the Clerk profile.
7. `requireAuth` middleware rejects unauthenticated requests on write endpoints with 401.

### Mapping Clerk users to Human records
Clerk owns identity (user IDs, emails, OAuth tokens). The app's domain data (experiences, follows, etc.) still references its own `Human` collection. The link: `humanSchema.clerkId` (sparse unique).

### Test-mode bypass
When `MONGO_DB=carsDB_test`, the backend skips `clerkMiddleware()` and reads `x-test-user-id` from request headers instead. The header value is a Mongo `_id` of a seeded fixture user. See `getCurrentHuman()` in [backend/server.js](../dyno-react-app/backend/server.js).

The frontend has a parallel test shim at [src/lib/auth.tsx](../dyno-react-app/src/lib/auth.tsx) — it exports replacements for Clerk's `useAuth`/`SignedIn`/`SignedOut`/`UserButton`/`RedirectToSignIn` that check `localStorage.dyno_test_auth` first. Playwright sets both the HTTP header and the localStorage flag via `pageAsSam(page)` in [tests/auth.ts](../dyno-react-app/tests/auth.ts).

## Testing

See [CLAUDE.md](../CLAUDE.md) for the testing workflow. Key architectural points:
- Tests run serially (workers: 1) — they share a DB
- The Playwright global setup kills any process on port 5000, starts an isolated test backend with `MONGO_DB=carsDB_test`, seeds via `POST /api/test/seed`, then teardown restarts the dev backend
- Fixture IDs are stable hex strings — see [tests/seed.ts](../dyno-react-app/tests/seed.ts)
- New collections need to be added to the wipe list inside `POST /api/test/seed` or tests will leak data across runs
- Specs call `asSam()` (or `asAlex()` etc.) once per describe; UI tests also call `pageAsSam(page)` in `beforeEach` so the React app treats the page as signed-in
