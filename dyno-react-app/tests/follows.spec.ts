import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, asAlex, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Following / Followers", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => { await pageAsSam(page); });

  test.afterEach(async () => {
    asSam();
    await axios.delete(`${API}/follows`, { data: { followee: FIXTURES.users.alex } }).catch(() => {});
    asAlex();
    await axios.delete(`${API}/follows`, { data: { followee: FIXTURES.users.sam } }).catch(() => {});
    asSam();
  });

  test("profile header shows follower + following counts as links", async ({ page }) => {
    // Sam follows Alex, Alex follows Sam (so both counts are 1)
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex });
    asAlex();
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.sam });
    asSam();

    await page.goto("/profile");
    const following = page.locator(".profile-count", { hasText: "following" });
    const followers = page.locator(".profile-count", { hasText: "followers" });
    await expect(following).toContainText("1");
    await expect(followers).toContainText("1");
    // Both link to the dedicated list pages
    await expect(following).toHaveAttribute("href", new RegExp(`/users/${FIXTURES.users.sam}/following$`));
    await expect(followers).toHaveAttribute("href", new RegExp(`/users/${FIXTURES.users.sam}/followers$`));
  });

  test("/users/:id/following lists people the user follows", async ({ page }) => {
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex });

    await page.goto(`/users/${FIXTURES.users.sam}/following`);
    await expect(page.locator(".model-title")).toContainText("Following");
    await expect(page.locator(".friend-item .friend-name")).toHaveText(["Alex Rivera"]);
  });

  test("/users/:id/followers lists people who follow the user", async ({ page }) => {
    asAlex();
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.sam });
    asSam();

    await page.goto(`/users/${FIXTURES.users.sam}/followers`);
    await expect(page.locator(".model-title")).toContainText("Followers");
    await expect(page.locator(".friend-item .friend-name")).toHaveText(["Sam Lawrence"]);
  });

  test("clicking a follower count navigates to the followers list page", async ({ page }) => {
    asAlex();
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.sam });
    asSam();

    await page.goto("/profile");
    await page.locator(".profile-count", { hasText: "followers" }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${FIXTURES.users.sam}/followers$`));
    await expect(page.locator(".friend-item .friend-name")).toHaveText(["Sam Lawrence"]);
  });

  test("UserProfileView shows counts that link to the right user's pages", async ({ page }) => {
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex });

    await page.goto(`/users/${FIXTURES.users.alex}`);
    const followers = page.locator(".profile-count", { hasText: "followers" });
    await expect(followers).toContainText("1");
    await expect(followers).toHaveAttribute("href", new RegExp(`/users/${FIXTURES.users.alex}/followers$`));
  });
});
