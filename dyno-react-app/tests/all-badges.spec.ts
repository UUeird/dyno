import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";

const API = "http://localhost:5000/api";

test.describe("All badges page", () => {
  test.afterEach(async () => {
    const { data: exps } = await axios.get(`${API}/experiences`);
    for (const e of exps) {
      if (e.loggedBy?._id === FIXTURES.users.sam) {
        await axios.delete(`${API}/experiences/${e._id}`).catch(() => {});
      }
    }
    await axios.post(`${API}/test/reset-badges`).catch(() => {});
  });

  test("GET /api/users/:id/badges/all returns every series with progress", async () => {
    const { data } = await axios.get(`${API}/users/${FIXTURES.users.sam}/badges/all`);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(7);
    for (const p of data) {
      expect(typeof p.seriesSlug).toBe("string");
      expect(typeof p.maxLevel).toBe("number");
      expect(typeof p.level).toBe("number");
      expect(typeof p.count).toBe("number");
      expect(Array.isArray(p.thresholds)).toBe(true);
    }
  });

  test("progress reflects user activity", async () => {
    // Drive a car → drive-count should bump
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      loggedBy: FIXTURES.users.sam,
    });

    const { data } = await axios.get(`${API}/users/${FIXTURES.users.sam}/badges/all`);
    const driveCount = data.find((p: any) => p.seriesSlug === "drive-count");
    expect(driveCount.count).toBe(1);
    expect(driveCount.level).toBe(1);
    expect(driveCount.nextThreshold).toBe(10);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("/badges route renders for current user", async ({ page }) => {
    await page.goto("/badges");
    await expect(page.locator(".model-title")).toContainText("Your Badges");
    await expect(page.locator(".all-badges-item").first()).toBeVisible();
  });

  test("/users/:id/badges renders for any user", async ({ page }) => {
    await page.goto(`/users/${FIXTURES.users.alex}/badges`);
    await expect(page.locator(".model-title")).toContainText("Alex");
    await expect(page.locator(".all-badges-item").first()).toBeVisible();
  });

  test("See all link in profile badge shelf navigates to all-badges page", async ({ page }) => {
    await page.goto("/profile");
    await page.locator(".badge-shelf-see-all").click();
    await expect(page).toHaveURL(/\/users\/.+\/badges$/);
  });

  test("locked badges render greyed with empty ring", async ({ page }) => {
    await page.goto("/badges");
    // With no experiences, all badges should be locked
    await expect(page.locator(".badge-circle--locked").first()).toBeVisible();
  });

  test("progress bar fills proportionally", async ({ page }) => {
    // Drive 5 cars to put drive-count halfway to level 2 (threshold 10)
    const exps = [];
    for (let i = 0; i < 5; i++) {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "drove",
        loggedBy: FIXTURES.users.sam,
      });
      exps.push(data.experience._id);
    }

    await page.goto("/badges");
    const item = page.locator(".all-badges-item", { hasText: "Miles & Memories" });
    await expect(item.locator(".all-badges-progress-meta")).toContainText("5 / 10");

    for (const id of exps) await axios.delete(`${API}/experiences/${id}`);
  });
});
