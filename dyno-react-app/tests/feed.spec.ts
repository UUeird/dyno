import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Feed", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/");
  });

  test("shows feed heading and subtitle", async ({ page }) => {
    await expect(page.locator("h2")).toContainText("Feed");
    await expect(page.locator(".view-subtitle")).toBeVisible();
  });

  test("shows empty state when no followed experiences", async ({ page }) => {
    await expect(page.locator(".empty-state")).toContainText("No activity yet");
  });

  test("shows experience after it is logged by current user", async ({ page }) => {
    // Log an experience via API
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });
    const expId = data.experience._id;

    // Reload and verify it appears
    await page.reload();
    await expect(page.locator(".experience-list")).toBeVisible();
    await expect(page.locator(".experience-car").first()).toContainText("Civic");

    // Cleanup
    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("experience with notes shows note text", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      notes: "Canyon run, perfect conditions",
    });
    const expId = data.experience._id;

    await page.reload();
    await expect(page.locator(".experience-notes").first()).toContainText("Canyon run");

    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("drove experience with rating shows filled star icon", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 3.5,
    });
    const expId = data.experience._id;

    await page.reload();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveClass(/star-icon--filled/);
    // Fill path is rendered for non-zero ratings
    await expect(icon.locator(".star-icon-glow")).toBeAttached();

    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("drove experience with no rating shows unrated (greyed) star icon", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });
    const expId = data.experience._id;

    await page.reload();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toHaveClass(/star-icon--unrated/);
    // No fill path when unrated
    await expect(icon.locator(".star-icon-glow")).toHaveCount(0);

    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("drove experience with 0-star rating shows empty (outline-only) star icon", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 0,
    });
    const expId = data.experience._id;

    await page.reload();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toHaveClass(/star-icon--empty/);
    // No fill path when rating is 0
    await expect(icon.locator(".star-icon-glow")).toHaveCount(0);

    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("hovering star icon expands to full rating row (desktop)", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 3.5,
    });
    const expId = data.experience._id;

    await page.reload();
    const wrap = page.locator(".star-icon-wrap").first();
    const expandRow = wrap.locator(".star-icon-expand-row");

    // Pre-hover: expand row is collapsed (max-width 0)
    const collapsedWidth = await expandRow.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(collapsedWidth).toBe(0);

    await wrap.hover();
    // After hover: expand row has width
    await page.waitForTimeout(350); // wait for transition
    const expandedWidth = await expandRow.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(expandedWidth).toBeGreaterThan(40);

    await axios.delete(`${API}/experiences/${expId}`);
  });

  test("reaction bar renders on each feed card", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "spotted",
    });
    const expId = data.experience._id;

    await page.reload();
    await expect(page.locator(".reaction-bar").first()).toBeVisible();

    await axios.delete(`${API}/experiences/${expId}`);
  });
});
