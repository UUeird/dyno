import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";

const API = "http://localhost:5000/api";

test.describe("Achievement badges", () => {
  test("logging first drove awards First Ignition badge via API", async () => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      loggedBy: FIXTURES.users.sam,
    });

    const driveCountBadge = data.newBadges.find((b: any) => b.seriesSlug === "drive-count");
    expect(driveCountBadge).toBeTruthy();
    expect(driveCountBadge.name).toBe("First Ignition");
    expect(driveCountBadge.level).toBe(1);

    await axios.delete(`${API}/experiences/${data.experience._id}`);
  });

  test("badge toast appears in UI after logging first drive", async ({ page }) => {
    // Clear only badges+experiences so Sam earns First Ignition again
    await fetch(`${API}/test/reset-badges`, { method: "POST" });

    await page.goto("/profile");
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();
    await page.locator(".experience-option--primary").click();

    // Toast should appear
    await expect(page.locator(".badge-toast")).toBeVisible({ timeout: 7000 });
    await expect(page.locator(".badge-toast-name")).toBeVisible();

    // Dismiss all badge pages (may be multiple badges earned at once)
    while (await page.locator(".badge-toast").isVisible()) {
      await page.locator(".badge-toast-btn").click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator(".badge-toast")).not.toBeVisible();

    // Cleanup
    const exps = await axios.get(`${API}/experiences`);
    const created = exps.data.find((e: any) => e.type === "drove" && e.loggedBy?._id === FIXTURES.users.sam);
    if (created) await axios.delete(`${API}/experiences/${created._id}`);
  });

  test("badge shelf shows on profile after earning a badge", async ({ page }) => {
    // Pre-seed a badge via API
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      loggedBy: FIXTURES.users.sam,
    });

    await page.goto("/profile");
    await expect(page.locator(".badge-shelf")).toBeVisible();
    await expect(page.locator(".badge-circle").first()).toBeVisible();

    await axios.delete(`${API}/experiences/${data.experience._id}`);
  });

  test("GET /api/users/:id/badges returns correct badge data", async () => {
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      loggedBy: FIXTURES.users.sam,
    });

    const { data: badges } = await axios.get(`${API}/users/${FIXTURES.users.sam}/badges`);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]).toHaveProperty("seriesSlug");
    expect(badges[0]).toHaveProperty("emoji");

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });
});
