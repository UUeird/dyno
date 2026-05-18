import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Log experience modal", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
  });

  test("opens modal on '+ New'", async ({ page }) => {
    await page.click("text=+ New");
    await expect(page.locator(".modal")).toBeVisible();
    await expect(page.locator(".modal h2")).toContainText("New Experience");
  });

  test("navigates library → experience type → spotted, closes modal", async ({ page }) => {
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Spotted"))').click();
    // Modal closes
    await expect(page.locator(".modal")).not.toBeVisible();

    // Cleanup: delete the experience just created
    const exps = await axios.get(`${API}/experiences`);
    const created = exps.data.find((e: any) => e.type === "spotted" && e.loggedBy?._id === FIXTURES.users.sam);
    if (created) await axios.delete(`${API}/experiences/${created._id}`);
  });

  test("drove flow shows star rating step", async ({ page }) => {
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();
    await expect(page.locator(".drove-rating-step")).toBeVisible();
    await expect(page.locator(".star-rating--interactive")).toBeVisible();
  });

  test("star tap sets rating, re-tap drops to half star", async ({ page }) => {
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();

    const stars = page.locator(".star-rating--interactive .star");

    // Tap 4th star → rating 4
    await stars.nth(3).click();
    await expect(page.locator(".experience-option--primary .option-desc")).toContainText("4 stars");

    // Tap 4th star again → rating 3.5
    await stars.nth(3).click();
    await expect(page.locator(".experience-option--primary .option-desc")).toContainText("3.5 stars");
    await expect(stars.nth(3)).toHaveClass(/star--half/);

    // Close without saving
    await page.click(".modal-close");
  });

  test("rating is saved and shown in feed", async ({ page }) => {
    try {
      await page.click("text=+ New");
      await page.click("text=Previous car");
      await page.locator(".library-item").first().click();
      await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();

      // Set 5-star rating
      await page.locator(".star-rating--interactive .star").nth(4).click();
      await page.locator(".experience-option--primary").click();

      // Navigate to feed and verify the star icon (now clock-fill) appears
      await page.goto("/");
      const icon = page.locator(".star-icon").first();
      await expect(icon).toBeVisible();
      await expect(icon).toHaveClass(/star-icon--filled/);
    } finally {
      // Always clean up so we don't leak state to other tests
      const exps = await axios.get(`${API}/experiences`);
      const created = exps.data.find((e: any) => e.rating === 5 && e.loggedBy?._id === FIXTURES.users.sam);
      if (created) await axios.delete(`${API}/experiences/${created._id}`);
    }
  });
});
