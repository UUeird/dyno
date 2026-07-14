# DB Schema

Reference ER diagram for the schemas defined in [backend/server.js](../dyno-react-app/backend/server.js).

`Model` is its own collection under `Manufacturer` — `Car` and `WishlistItem` reference it by ObjectId rather than matching free-text manufacturer/model strings. Colors and trims live on the `Model` document itself.

```mermaid
erDiagram
    Human {
        string name
        string email
        string avatarUrl
        string clerkId
        string username
    }
    Manufacturer {
        string name
    }
    Model {
        objectId manufacturer FK
        string name
        array colors "name, hex, isCustom"
        array trims "name, years[] (from, to, features[])"
        array drivetrains "flat string list, e.g. FWD/RWD/AWD"
    }
    Car {
        objectId model FK
        number year
        string nickname
        string transmission
        object colorInfo "name, hex, isCustom"
        string trim
        string drivetrain
        string vin
        objectId thumbnailPhoto FK
    }
    Photo {
        objectId car FK
        objectId uploadedBy FK
        string url
        string cloudinaryPublicId
        string caption
    }
    Ownership {
        objectId car FK
        objectId owner FK
        date from
        date to
    }
    Experience {
        objectId car FK
        string type "spotted or drove"
        date date
        string notes
        number rating
        objectId loggedBy FK
        object location "display, lat, lng - spotted only"
        array route "lat, lng points - drove only"
        object weather "tempC, conditions, windKph, precipitationMm"
    }
    Follow {
        objectId follower FK
        objectId followee FK
    }
    Reaction {
        objectId experience FK
        objectId human FK
        string emoji
    }
    BadgeSeries {
        string slug
        string name
        array levels "level, name, emoji, description"
    }
    UserBadge {
        objectId human FK
        string seriesSlug
        number level
    }
    WishlistItem {
        objectId human FK
        objectId model FK
        number yearFrom
        number yearTo
    }

    Manufacturer ||--o{ Model : "manufacturer"
    Model ||--o{ Car : "model"
    Model ||--o{ WishlistItem : "model"
    Human ||--o{ Ownership : "owner"
    Car ||--o{ Ownership : "car"
    Human ||--o{ Photo : "uploadedBy"
    Car ||--o{ Photo : "car"
    Car ||--|| Photo : "thumbnailPhoto"
    Car ||--o{ Experience : "car"
    Human ||--o{ Experience : "loggedBy"
    Human ||--o{ Follow : "follower"
    Human ||--o{ Follow : "followee"
    Experience ||--o{ Reaction : "experience"
    Human ||--o{ Reaction : "human"
    Human ||--o{ UserBadge : "human"
    Human ||--o{ WishlistItem : "human"
```

## Notes

- API responses still expose `manufacturer`/`model` as display-name strings (populated from the `Model` ref and flattened server-side) — most read paths, including the `/cars/:manufacturer/:model` URL slugs, are name-based and unaffected by the ref underneath.
- Manufacturer selection in car/wishlist forms is dropdown-based, populated from the `Manufacturer`/`Model` registry — there's no free-text manufacturer entry outside the admin "add manufacturer" form, which is the correct place to name a new one.
- `Car.owner` is a legacy field mid-migration to `Ownership` (see `migrateLegacyOwners()` in server.js) — unrelated to the Model work above, still in progress.
- `Experience.loggedBy` is required — every experience must be logged by an authenticated Human (enforced by `requireAuth` on the creating route), so the `Human ||--o{ Experience` edge is a true one-or-many, not optional.
- `Experience.location` and `Experience.route` are mutually exclusive by `type`: `spotted` populates `location` (single point), `drove` populates `route` (path as an array of points). Backend accepts `route` in `POST /api/experiences`; no frontend map/path-drawing UI exists yet.
- `Model.drivetrains` is a flat string list (unlike `trims`, drivetrain doesn't vary by year) — same free-form-fallback validation pattern as trims: a model with no drivetrains registered imposes no constraint on `Car.drivetrain`.
