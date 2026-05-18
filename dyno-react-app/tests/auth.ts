import axios from "axios";
import { Page } from "@playwright/test";
import { FIXTURES } from "./seed";

// The test backend (carsDB_test) bypasses Clerk and reads `x-test-user-id` as the
// authenticated user's Mongo _id. These helpers attach that header to:
//   - direct axios calls (the imperative test API),
//   - the page's network requests (so the React app makes authenticated requests too).
// Most tests act as Sam; tests that exercise multi-user flows can switch with asAlex()
// or asUser(id).

export function asUser(userId: string) {
  axios.defaults.headers.common["x-test-user-id"] = userId;
}

export function asSam() {
  asUser(FIXTURES.users.sam);
}

export function asAlex() {
  asUser(FIXTURES.users.alex);
}

export async function authenticatePage(page: Page, userId: string) {
  // Backend test-mode bypass: every request from the browser carries the user id.
  await page.setExtraHTTPHeaders({ "x-test-user-id": userId });
  // Frontend test-mode shim (src/lib/auth.tsx): localStorage flag makes the React
  // app treat the user as signed in (bypassing Clerk's UI state).
  await page.addInitScript((id) => {
    window.localStorage.setItem("dyno_test_auth", id);
  }, userId);
}

export async function pageAsSam(page: Page) {
  await authenticatePage(page, FIXTURES.users.sam);
}
