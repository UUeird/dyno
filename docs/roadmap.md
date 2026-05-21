# Roadmap

What's coming next. Items below are not committed plans — directional intent. Lifted out of the per-session scratch file (`~/.claude/plans/...`) so future-me and collaborators have visibility.

## Tech debt

- **N+1 queries in feed/experiences** — `attachOwnership` runs separate `Ownership.find()` and `Photo.find()` per car for every experience in the feed. Fine at current scale; will degrade noticeably as data grows. Fix: batch ownership and photo lookups by car ID before mapping.
- **`GET /api/experiences` open to unauthenticated callers** — intentional for the public feed, and location is already stripped for non-authors. But it's easy to accidentally expose future private fields here. Should add auth awareness so private fields are never leaked, even if the endpoint stays public.
- **`GET /api/experiences?followedBy` doesn't verify identity** — any caller can pass another user's ID as `followedBy` and get their social feed. No private data exposed today (location is stripped), but worth locking down so the requester can only query their own following list.
- **Search scans all matching cars before deduping** — `server.js` `GET /api/search` fetches unbounded car results then dedupes in memory. Needs a `.limit()` on the DB query, or a migration to a unique `{manufacturer, model}` index on a models collection.
- **Migrate frontend from CRA to Vite** — `react-scripts` pins old transitive deps (webpack-dev-server, nth-check, lodash inside Jest, etc.) that can't be upgraded without ejecting. ~18 Dependabot alerts are permanently stuck there. Vite would eliminate most of them and is much faster for dev/build. A day's migration work; not urgent but worth doing before the CRA maintenance situation gets worse.

## Soon

- **Push notifications / in-app alerts** — surface new follower, follower's drive, etc. iOS web push is finicky; investigate before committing to a shape.
- **Rotate exposed secrets** — Clerk `sk_`, Cloudinary, Atlas password were all pasted into AI conversations during initial setup. Cycle them.

## Later

### Wishlist: distinguish "want to drive" vs. "want to buy"

Today the Wishlist is one undifferentiated list. The intent of an entry varies — sometimes the user just wants to *experience* a car (a track day, a friend's lend), other times they want to *buy* it (to own, flip, collect, etc.). These have different signals (recommendations, garage planning) and we should split them.

**Likely shape (TBD):**

- Schema: add `intent: "drive" | "buy"` to `WishlistItem`, default `"drive"` for back-compat
- Model page wishlist button becomes a small two-state toggle / segmented control instead of a single "Want to drive" button
- Profile Wishlist section gains a filter or splits into two galleries (e.g. tabbed)
- A drove experience only auto-removes the *drive*-intent entries; buy-intent entries persist until the user actually acquires the car (we could auto-remove those when an `Ownership` is logged)

