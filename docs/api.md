# API Reference

Base URL: `http://localhost:5000/api`

All requests/responses are JSON unless noted (photo upload is `multipart/form-data`).

## Authentication

Most write endpoints require a valid Clerk session JWT in `Authorization: Bearer <token>`. Reads are mostly public.

When authenticated, the caller's `Human` record is derived from the Clerk user id (auto-provisioned on first request). **You no longer pass `loggedBy`, `human`, `follower`, or `uploadedBy` in request bodies** — they come from the session.

Endpoints that require auth respond `401 Unauthorized` if the JWT is missing or invalid. The "Auth" column in each endpoint below indicates whether it requires a session. **Admin-only** endpoints (marked `🔒 admin`) additionally check that the caller's email is in the backend's `ADMIN_EMAILS` env (comma-separated, case-insensitive); non-admins get `403`.

In test mode (`MONGO_DB=carsDB_test`), the bypass header `x-test-user-id: <mongo-id>` replaces the JWT.

ObjectId values are 24-char hex strings. Dates are ISO 8601 strings.

## Conventions

- `POST` returns `201 Created` with the created object
- `PUT`/`PATCH` returns `200 OK` with the updated object
- `DELETE` returns `200 OK` with `{message: "..."}` or `{ok: true}`
- Errors return `4xx` with `{error: "..."}`
- `populate`d references are returned as nested objects, not just IDs (see each endpoint)

---

## Humans

### `GET /api/humans`
Returns all users, sorted by name.

**Response**: `Human[]`
```ts
type Human = { _id, name, email?, avatarUrl?, clerkId? }
```

### `GET /api/me` 🔒
Returns the signed-in user's `Human` record. Auto-provisions on first call (using name/email/avatar from the Clerk profile).

**Response**: `Human`

### `POST /api/humans` 🔒
Legacy. Humans are now provisioned automatically on first authenticated request — this endpoint stays for test fixtures.

**Body**: `{name, email?, avatarUrl?}`
**Response**: `Human`

---

## Manufacturers

### `GET /api/manufacturers`
Returns all manufacturers, sorted by name. Includes `models`, `colors` (keyed by model or `"*"` for fallback), `trims` (keyed by model), and `drivetrains` (keyed by model).

**Response**: `Manufacturer[]`

### `POST /api/manufacturers` 🔒 admin
**Body**: `{name, models?}` (models is an optional initial array)
**Errors**:
- `400` if name is missing
- `409` if a manufacturer with that name already exists

### `PATCH /api/manufacturers/:id/models` 🔒 admin
Add a model to an existing manufacturer. No-op if the model is already in the list.
**Body**: `{model}`

### `DELETE /api/manufacturers/:id/models/:model` 🔒 admin
Remove a model. Rejects with 409 if any `Car` document references it. Also clears any trim entries for the model.

### `PUT /api/manufacturers/:id/trims/:model` 🔒 admin
Replace the full trim list for one model. Other models' trims are untouched.

**Body**:
```ts
{
  trims: {
    name: string,
    years: { from: number | null, to: number | null }[]
  }[]
}
```
- `from`/`to` are inclusive years; either may be `null` for open-ended
- Multiple year ranges per trim are allowed (e.g. a trim that came and went)
- Year sanity-checked: 1900–2100, `from ≤ to`

**Errors**:
- `400` if the model isn't in the manufacturer's `models` list
- `400` on invalid year values

### `PUT /api/manufacturers/:id/drivetrains/:model` 🔒 admin
Replace the full drivetrain list for one model. Other models' drivetrains are untouched.

**Body**: `{ drivetrains: string[] }` (e.g. `["FWD", "RWD", "AWD"]`)

**Errors**:
- `400` if the model isn't in the manufacturer's `models` list

---

## Cars

### `GET /api/cars`
Returns all cars with ownership info attached (`currentOwners`, `ownershipHistory`, `photos`, `thumbnail`).

### `POST /api/cars` 🔒
**Body**: `{manufacturer, model, year, vin?, nickname?, transmission?, colorInfo?, trim?, drivetrain?}`
- `vin` is optional. When provided, it must be unique (sparse unique index) — the server returns 409 on a duplicate. Multiple cars with no VIN coexist.
- `colorInfo` is `{name, hex?, isCustom?}`. Optional. Set `isCustom: true` when the color isn't a canonical manufacturer color (e.g. aftermarket wrap). The legacy plain-string `color` field is read on responses for backward compatibility but new writes should use `colorInfo`.
- `trim` validation rules:
  - Model has no trims registered at all → free-form, any string accepted (including empty)
  - Model has trims registered but none cover the chosen year → free-form fallback (any string accepted)
  - Model has trims that cover the chosen year → trim is required and must be one of them
- `drivetrain` validation rules (no year dimension — drivetrain doesn't vary by trim/year the way trim availability does):
  - Model has no drivetrains registered at all → free-form, any string accepted (including empty)
  - Model has drivetrains registered → drivetrain is required and must be one of them

**Errors**:
- `400` if missing required fields (manufacturer/model/year), or if manufacturer/model not in the Manufacturer registry
- `400` if the trim isn't valid for the (model, year) combination
- `400` if the drivetrain isn't valid for the model
- `409` if a car with this VIN already exists

### `PUT /api/cars/:id` 🔒
Update a car. If `manufacturer` or `model` is changed, the new combination is validated against the Manufacturer registry. If `trim`, `year`, `model`, or `manufacturer` change, the trim is re-validated against the effective values using the same rules as `POST /api/cars`. Same re-validation applies to `drivetrain` when it, `model`, or `manufacturer` change.

### `DELETE /api/cars/:id` 🔒
Cascades: also deletes the car's `Ownership` and `Photo` records.

### `PATCH /api/cars/:id/thumbnail` 🔒
**Body**: `{photoId}` (or null to clear)
Sets which Photo is the car's thumbnail.

---

## Photos

### `GET /api/cars/:id/photos`
List photos for a car, sorted by `createdAt` ascending.

### `POST /api/cars/:id/photos` 🔒
**Content-Type**: `multipart/form-data`
**Fields**: `photo` (file), `caption?`
File is stored in `backend/uploads/` and served at `/uploads/<filename>`. `uploadedBy` is derived from the session.

### `POST /api/cars/:id/photos/url` 🔒
Add a photo by URL (for seeding or external images).
**Body**: `{url, caption?}`

### `DELETE /api/photos/:id` 🔒
Removes the DB record. If the URL is local (`/uploads/...`), also deletes the file. Clears `thumbnailPhoto` references on any cars.

---

## Ownerships

Tracks who owned a car and when. `from: null` = "since forever". `to: null` = "still owns".

### `GET /api/ownerships?car=<id>`
Lists ownership records (optionally filtered by car), sorted by `from`. `owner` is populated.

### `POST /api/ownerships` 🔒
**Body**: `{car, owner, from?, to?}` (the `owner` here is the Human being recorded as an owner, not necessarily the caller — e.g. you can log that a friend used to own a car)

**Validation**:
- Neither `from` nor `to` may be in the future
- If both supplied, `from` must be ≤ `to`

### `PUT /api/ownerships/:id` 🔒
Edit a single ownership's date range. Pass `null` to clear either date; omit to leave it untouched. Same validation as POST.

**Body**: `{from?, to?}`

### `PATCH /api/ownerships/:id/end` 🔒
End an ongoing ownership.
**Body**: `{to?}` (defaults to now). The `to` date may not be in the future.

### `DELETE /api/ownerships/:id` 🔒

---

## Experiences

### `GET /api/experiences?followedBy=<userId>`
Returns experiences with `car`, `loggedBy`, and `reactions` populated, sorted newest first.

When `followedBy` is provided, filters to experiences logged by that user OR anyone they follow (feed mode). Without it, returns all experiences.

### `POST /api/experiences` 🔒
**Body**: `{car, type, notes?, rating?}`
- `type`: `"drove"` | `"spotted"`
- `rating`: number 0–5 (half-step increments allowed), only meaningful for drove
- `loggedBy` is derived from the session

**Response**: `{experience, newBadges}` where `newBadges` is an array of badges leveled up by this action (often empty).

**Side effects** for `type === "drove"`:
- Any of the user's wishlist items matching `{manufacturer, model}` are checked against `yearMatchesWishlist(car.year, item.yearFrom, item.yearTo)` and removed if the car satisfies them
- Badges are re-evaluated for the user; new levels are persisted to `UserBadge` and returned in `newBadges`

### `DELETE /api/experiences/:id` 🔒
Returns `403` if the experience belongs to another user.

---

## Reactions

### `POST /api/experiences/:id/reactions` 🔒
**Body**: `{emoji}`
Idempotent per `(experience, current user)`: if a reaction already exists, the emoji is updated. Otherwise a new reaction is created.

### `DELETE /api/experiences/:id/reactions` 🔒
Removes the current user's reaction from the experience.

---

## Follows

### `GET /api/follows?follower=<id>&followee=<id>`
Both filters optional. Returns `Follow[]` with `follower` and `followee` populated.

### `POST /api/follows` 🔒
**Body**: `{followee}` (follower derived from session)
**Errors**:
- `400` if `follower === followee` ("cannot follow yourself")
- `409` if the follow already exists

### `DELETE /api/follows`
### `DELETE /api/follows` 🔒
**Body**: `{followee}` (follower derived from session)

---

## User profile / badges

### `GET /api/users/:id/profile`
Aggregate profile data.

**Response**:
```ts
{
  human: Human,
  experiences: Experience[],     // all the user's experiences with reactions attached
  ownedCars: Car[],              // cars where the user has an ownership with to: null
  following: Human[],
  followers: Human[],
  badges: BadgeInfo[],
}
```

### `GET /api/users/:id/badges`
Just the earned badge list (subset of the profile response). Each entry includes `maxLevel` so the UI can render a ring with the right number of segments.

### `GET /api/users/:id/badges/all`
Every series with current progress. Used by the "all badges" page.

**Response**:
```ts
{
  seriesSlug: string,
  seriesName: string,
  unit: string,              // human-readable progress unit (e.g. "drives", "EV drives")
  level: number,             // 0 if locked
  maxLevel: number,
  count: number,             // user's current count
  prevThreshold: number,     // count needed for current level (0 if locked)
  nextThreshold: number | null,  // null if maxed
  thresholds: number[],
  levels: { level, name, emoji, description }[],
  awardedAt: string | null,
}[]
```

---

## Wishlist ("Want to drive")

### `POST /api/wishlist` 🔒
**Body**: `{manufacturer, model, yearFrom?, yearTo?}` (human derived from session)
- `yearFrom: null, yearTo: null` (or omitted) means "any year"
- Either can be null to leave one end open

**Behavior**: Upsert by `(human, manufacturer, model)` — there is only ever one wishlist entry per user per model.

**Errors**:
- `409` if the user has a drove experience whose car satisfies the requested year range

### `DELETE /api/wishlist` 🔒
**Body**: `{manufacturer, model}` (human derived from session)
Always returns `{ok: true}` (no-op if nothing to delete).

### `GET /api/users/:id/wishlist`
Returns the user's wishlist items, newest first. Each item is enriched with a representative thumbnail URL pulled from a matching car (preferring cars within the year range when set).

```ts
type WishlistItem = {
  _id, human, manufacturer, model,
  yearFrom: number | null,
  yearTo: number | null,
  thumbnailUrl: string | null,      // photo URL of a representative car, or null
  representativeYear: number | null, // year of the car whose photo was chosen
  createdAt, updatedAt,
}
```

---

## Model pages

### `GET /api/models/:mfr/:model?userId=<id>`
Aggregate data for a model. URL params are lowercase, hyphenated slugs (`honda/civic`, `mercedes-benz/s-class`). Matching is case-insensitive, and hyphens in the slug match either spaces or hyphens in the canonical name.

**Response**:
```ts
{
  manufacturer: string,        // canonicalized from stored data
  model: string,               // canonicalized
  cars: Car[],                 // all instances
  experiences: Experience[],   // all experiences for any instance, newest first
  rating: {
    average: number | null,    // null if no rated experiences
    count: number,             // # of rated experiences
    totalExperiences: number,
  },
  wishlist: {
    count: number,             // # of users with this model on their wishlist
    wishlisted: boolean,       // if userId provided: does this user have a wishlist item?
    item: WishlistItem | null, // if userId provided and wishlisted: the item
    drivenYears: number[],     // if userId provided: years from user's drove experiences
  },
}
```

**Errors**:
- `404` if no Car matches the slug pair

---

## Search

### `GET /api/search?q=<query>`
Substring, case-insensitive search across models and users.

- Minimum query length: 2 characters (shorter returns empty arrays)
- Max 10 results per type

**Response**:
```ts
{
  models: { manufacturer: string, model: string }[],  // unique pairs derived from Car
  users: Human[],                                      // matched by name
}
```

---

## Test-only endpoints

These are registered only when the backend is running with `MONGO_DB=carsDB_test`.

### `POST /api/test/seed`
Drops all collections (humans, cars, experiences, reactions, userbadges, follows, manufacturers, wishlistitems) and reseeds the canonical test fixtures.

Fixture IDs are stable across runs — see [tests/seed.ts](../dyno-react-app/tests/seed.ts).

### `POST /api/test/reset-badges`
Wipes only `experiences`, `reactions`, and `userbadges` — leaves humans/cars/manufacturers intact. Used between badge-related tests.
