# Roadmap

What's coming next. Items below are not committed plans — directional intent. Lifted out of the per-session scratch file (`~/.claude/plans/...`) so future-me and collaborators have visibility.

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

