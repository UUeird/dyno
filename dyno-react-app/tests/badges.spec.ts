import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Achievement badges", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => { await pageAsSam(page); });

  test("logging first drove awards First Ignition badge via API", async () => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    const driveCountBadge = data.newBadges.find((b: any) => b.seriesSlug === "drive-count");
    expect(driveCountBadge).toBeTruthy();
    expect(driveCountBadge.name).toBe("First Ignition");
    expect(driveCountBadge.level).toBe(1);

    await axios.delete(`${API}/experiences/${data.experience._id}`);
  });

  test("badge toast appears in UI after logging first drive", async ({ page }) => {
    await axios.post(`${API}/test/reset-badges`);

    await page.goto("/profile");
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();
    await page.locator(".experience-option--primary").click();

    await expect(page.locator(".badge-toast")).toBeVisible({ timeout: 7000 });
    await expect(page.locator(".badge-toast-name")).toBeVisible();

    while (await page.locator(".badge-toast").isVisible()) {
      await page.locator(".badge-toast-btn").click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator(".badge-toast")).not.toBeVisible();

    const exps = await axios.get(`${API}/experiences`);
    const created = exps.data.find((e: any) => e.type === "drove" && e.loggedBy?._id === FIXTURES.users.sam);
    if (created) await axios.delete(`${API}/experiences/${created._id}`);
  });

  test("badge shelf shows on profile after earning a badge", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
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
    });

    const { data: badges } = await axios.get(`${API}/users/${FIXTURES.users.sam}/badges`);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]).toHaveProperty("seriesSlug");
    expect(badges[0]).toHaveProperty("emoji");

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });
});
