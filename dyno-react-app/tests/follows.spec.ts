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

  test("profile page Following section only lists people the user follows", async ({ page }) => {
    // Sam follows Alex
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex });

    await page.goto("/profile");
    const followingHeader = page.locator(".profile-section-heading", { hasText: "Following" });
    await expect(followingHeader).toBeVisible();
    const followingList = followingHeader.locator("xpath=following-sibling::ul[1]");
    await expect(followingList.locator(".friend-name")).toHaveText(["Alex Rivera"]);
  });

  test("profile page Followers section is empty when no one follows you", async ({ page }) => {
    await page.goto("/profile");
    const followersHeader = page.locator(".profile-section-heading", { hasText: "Followers" });
    await expect(followersHeader).toBeVisible();
    const empty = followersHeader.locator("xpath=following-sibling::p[1]");
    await expect(empty).toContainText("No followers");
  });

  test("profile page Followers section lists people who follow you", async ({ page }) => {
    // Alex follows Sam
    asAlex();
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.sam });
    asSam();

    await page.goto("/profile");
    const followersHeader = page.locator(".profile-section-heading", { hasText: "Followers" });
    const followersList = followersHeader.locator("xpath=following-sibling::ul[1]");
    await expect(followersList.locator(".friend-name")).toHaveText(["Alex Rivera"]);
  });

  test("UserProfileView shows Following + Followers for any user", async ({ page }) => {
    // Sam follows Alex
    await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex });

    await page.goto(`/users/${FIXTURES.users.alex}`);
    const followersHeader = page.locator(".profile-section-heading", { hasText: "Followers" });
    const followersList = followersHeader.locator("xpath=following-sibling::ul[1]");
    await expect(followersList.locator(".friend-name")).toHaveText(["Sam Lawrence"]);

    const followingHeader = page.locator(".profile-section-heading", { hasText: "Following" });
    const followingEmpty = followingHeader.locator("xpath=following-sibling::p[1]");
    await expect(followingEmpty).toContainText("Not following");
  });
});
