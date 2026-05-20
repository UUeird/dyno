# Roadmap

What's coming next. Items below are not committed plans — directional intent. Lifted out of the per-session scratch file (`~/.claude/plans/...`) so future-me and collaborators have visibility.

## Soon

- **Push notifications / in-app alerts** — surface new follower, follower's drive, etc. iOS web push is finicky; investigate before committing to a shape.
- **Rotate exposed secrets** — Clerk `sk_`, Cloudinary, Atlas password were all pasted into AI conversations during initial setup. Cycle them.

## Later

### Wishlist: distinguish "want to drive" vs. "want to own"

Today the Wishlist is one undifferentiated list. The intent of an entry varies — sometimes the user just wants to *experience* a car (a track day, a friend's lend), other times they want to *own* it. These have different signals (recommendations, garage planning) and we should split them.

**Likely shape (TBD):**

- Schema: add `intent: "drive" | "own"` to `WishlistItem`, default `"drive"` for back-compat
- Model page wishlist button becomes a small two-state toggle / segmented control instead of a single "Want to drive" button
- Profile Wishlist section gains a filter or splits into two galleries (e.g. tabbed)
- A drove experience only auto-removes the *drive*-intent entries; own-intent entries persist until the user actually owns the car (we could auto-remove those when an `Ownership` is logged)

### Location tagging on spots

Optional city/neighborhood field on **spotted** experiences. Waiting on location services being set up in the app — once we have proper geocoding/place lookup, this becomes much more useful than a free-text field.

**Scope (when we pick this back up):**

- Schema: `location` field on `experienceSchema` (shape TBD based on geocoding integration)
- Modal: location picker on the spotted flow
- Display: small "📍 Brooklyn, NY" line under the experience card
- Aggregate top locations on model pages
