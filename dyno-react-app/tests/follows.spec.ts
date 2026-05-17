import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";

const API = "http://localhost:5000/api";

test.describe("Following / Followers", () => {
  test.afterEach(async () => {
    // Clean up any follows created
    await axios.delete(`${API}/follows`, {
      data: { follower: FIXTURES.users.sam, followee: FIXTURES.users.alex },
    }).catch(() => {});
    await axios.delete(`${API}/follows`, {
      data: { follower: FIXTURES.users.alex, followee: FIXTURES.users.sam },
    }).catch(() => {});
  });

  test("profile page Following section only lists people the user follows", async ({ page }) => {
    // Sam follows Alex
    await axios.post(`${API}/follows`, {
      follower: FIXTURES.users.sam,
      followee: FIXTURES.users.alex,
    });

    await page.goto("/profile");
    const followingHeader = page.locator(".profile-section-heading", { hasText: "Following" });
    await expect(followingHeader).toBeVisible();
    // The list immediately after the Following header
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
    await axios.post(`${API}/follows`, {
      follower: FIXTURES.users.alex,
      followee: FIXTURES.users.sam,
    });

    await page.goto("/profile");
    const followersHeader = page.locator(".profile-section-heading", { hasText: "Followers" });
    const followersList = followersHeader.locator("xpath=following-sibling::ul[1]");
    await expect(followersList.locator(".friend-name")).toHaveText(["Alex Rivera"]);
  });

  test("UserProfileView shows Following + Followers for any user", async ({ page }) => {
    await axios.post(`${API}/follows`, {
      follower: FIXTURES.users.sam,
      followee: FIXTURES.users.alex,
    });

    await page.goto(`/users/${FIXTURES.users.alex}`);
    // Alex is followed by Sam → should appear in Alex's Followers
    const followersHeader = page.locator(".profile-section-heading", { hasText: "Followers" });
    const followersList = followersHeader.locator("xpath=following-sibling::ul[1]");
    await expect(followersList.locator(".friend-name")).toHaveText(["Sam Lawrence"]);

    // Alex follows nobody → empty Following section
    const followingHeader = page.locator(".profile-section-heading", { hasText: "Following" });
    const followingEmpty = followingHeader.locator("xpath=following-sibling::p[1]");
    await expect(followingEmpty).toContainText("Not following");
  });
});
