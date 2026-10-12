# Dyno

A social car-tracking app — think Untappd, but for the cars you've driven and spotted.

## What it does

The core loop:

1. **Log experiences** — drove or spotted a car, optionally with notes and a 0–5 star rating
2. **React** — leave 🔥 👀 🤙 emoji reactions on friends' experiences
3. **Follow** — your feed is filtered to you + people you follow
4. **Garage** — track cars you currently own and ones you've owned in the past
5. **Earn badges** — 7-series progressive achievement system (drive counts, brand diversity, EV pioneer, stick shift, etc.)
6. **Discover** — every `{manufacturer, model}` has its own page with a community rating aggregated from all logged experiences

The star rating UI is a custom-built **clock-fill star icon** that draws a bright stroke along the star's outline proportional to the rating, and expands into a row of mini-stars on hover/tap.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, react-router-dom, Axios |
| Backend | Node.js, Express 5, Multer + Cloudinary (photo uploads) |
| Database | MongoDB (Mongoose 8) |
| Auth | Clerk (magic-link email) |
| E2E testing | Playwright (isolated `carsDB_test`, fixture seeding) |
| Dev tooling | Nodemon |

## Project structure

```
dyno/
└── dyno-react-app/
    ├── src/               # React frontend
    │   ├── components/    # StarIcon, BadgeShelf, ReactionBar, etc.
    │   ├── views/         # Feed, Profile, Cars, CarModel, admin, sign-in
    │   └── lib/           # Small helpers (api, auth, modelSlug, etc.)
    ├── backend/           # Express API server
    ├── tests/             # Playwright E2E specs + setup
    └── playwright.config.ts
```

## Getting started

### Prerequisites

- Node.js (v18+)
- MongoDB running locally on the default port (`27017`)
- Clerk keys in `dyno-react-app/.env.local` and Clerk + Cloudinary keys in `dyno-react-app/backend/.env` — see "Env vars" in [CLAUDE.md](CLAUDE.md)

### Backend

```bash
cd dyno-react-app/backend
npm install
npm run dev         # starts the API server on port 5000
```

The backend seeds default badge series automatically on startup. To fill the local database with dummy users, cars, and activity, run `node seedDev.js` (`node seedDev.js --clear` removes it again). It only touches `carsDB` on localhost and leaves data you created through the app alone.

### Frontend

```bash
cd dyno-react-app
npm install
npm start           # starts the Vite dev server on port 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### E2E tests

```bash
cd dyno-react-app
npm run test:e2e            # headless run
npm run test:e2e:ui         # Playwright UI runner
```

The test harness kills the dev backend, starts an isolated backend against `carsDB_test`, seeds fixtures via `POST /api/test/seed`, runs the suite, then restarts the dev backend pointed back at `carsDB`. Tests run serially because they share a database.

## API endpoints

See [docs/api.md](docs/api.md) for the full endpoint reference. The main resources:

- `manufacturers`, `cars`, `humans`, `ownerships`, `photos`
- `experiences` (with notes, ratings, attached reactions)
- `reactions`, `follows`
- `users/:id/profile`, `users/:id/badges`, `users/:id/wishlist`
- `models/:mfr/:model` — model page aggregate
- Plus test-only endpoints (`/api/test/seed`, `/api/test/reset-badges`) that are only registered when `MONGO_DB=carsDB_test`
