# Proposed DB Schema

Current schema (as of [backend/server.js](../dyno-react-app/backend/server.js)) works but has two denormalization smells:

1. **`Car.manufacturer` / `Car.model` are free-text strings**, not refs. Matching happens via `slugToRegex` case-insensitive regex instead of an index lookup.
2. **`Manufacturer` embeds `models`, `colors`, `trims`** as arrays/maps keyed by model name. A model has no identity of its own — no `_id`, can't be referenced, can't carry its own fields (e.g. a model-level photo) without another map keyed by string.

This doc prototypes both current state and a proposed normalized shape, for discussion — nothing here is implemented.

## Current schema

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
        array models
        map colors "keyed by model name or *"
        map trims "keyed by model name"
    }
    Car {
        string manufacturer "free text, not a ref"
        string model "free text, not a ref"
        number year
        string nickname
        string transmission
        string trim
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
        object location "display, lat, lng"
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
        string manufacturer "free text"
        string model "free text"
        number yearFrom
        number yearTo
    }

    Human ||--o{ Car : "owns (legacy owner field)"
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

## Proposed schema

Promote **Model** to its own collection under Manufacturer. `Car` and `WishlistItem` reference `Model` by ObjectId instead of matching manufacturer/model strings. Colors and trims move from Manufacturer-level maps to fields on Model.

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
    }
    Car {
        objectId model FK "replaces manufacturer+model strings"
        number year
        string nickname
        string transmission
        object colorInfo "name, hex, isCustom"
        string trim
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
        object location "display, lat, lng"
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
        objectId model FK "replaces manufacturer+model strings"
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

### What this fixes

- Model page lookups (`/cars/:mfr/:model`) become an indexed `Model.findOne({ manufacturer, name })` (still slug-matched for the URL, but resolves to one doc, then everything else joins on `Model._id`) instead of regex string matching against every `Car`.
- Model gets identity — can carry its own thumbnail, description, or stats later without inventing another map keyed by string.
- Renaming a model (typo fix, canonicalization) is one doc update instead of a fan-out rewrite across every `Car`/`WishlistItem` string field.

### What it costs

- Every write path that currently sends `manufacturer`/`model` strings (car creation, wishlist creation, the admin manufacturer/model editor) needs to resolve or create the `Model` doc first.
- Migration: existing `Car.manufacturer`/`Car.model` strings need a one-time backfill matching them to (or creating) `Model` docs, then dropping the string fields.
- Frontend slug helpers ([src/lib/modelSlug.ts](../dyno-react-app/src/lib/modelSlug.ts)) still operate on strings for the URL — no change there, just an extra resolution step server-side.

Not decided yet: whether `legacy owner field` (`Car.owner`, already mid-migration to `Ownership`) gets cleaned up in the same pass — separate concern, worth doing before or after but not shown as a diff in the proposed diagram above since it's already underway.
