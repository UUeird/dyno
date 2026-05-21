import { test, expect, Page } from "@playwright/test";
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

  test("navigates library → experience type → spotted → location step → skip, closes modal", async ({ page }) => {
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Spotted"))').click();
    // Location step appears
    await expect(page.locator(".modal h2")).toContainText("Where did you spot it?");
    await page.locator('.experience-option:has(.option-label:text-is("Skip"))').click();
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

  test("rating is saved and shown on profile", async ({ page }) => {
    try {
      await page.click("text=+ New");
      await page.click("text=Previous car");
      await page.locator(".library-item").first().click();
      await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();

      // Set 5-star rating
      await page.locator(".star-rating--interactive .star").nth(4).click();
      await page.locator(".experience-option--primary").click();

      // Star icon should appear on own profile (own posts excluded from feed)
      await page.reload();
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

test.describe("Location tagging on spotted experiences", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
  });

  async function logSpottedWithLocation(page: Page, location: string) {
    await page.click("text=+ New");
    await page.click("text=Previous car");
    await page.locator(".library-item").first().click();
    await page.locator('.experience-option:has(.option-label:text-is("Spotted"))').click();
    await expect(page.locator(".modal h2")).toContainText("Where did you spot it?");
    await page.fill(".location-input", location);
    await page.locator('.experience-option:has(.option-label:text-is("Log Spot"))').click();
    await expect(page.locator(".modal")).not.toBeVisible();
  }

  test("typed location is saved and shown on own profile", async ({ page }) => {
    try {
      await logSpottedWithLocation(page, "Brooklyn, NY");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".experience-location")).toContainText("Brooklyn, NY");
    } finally {
      const exps = await axios.get(`${API}/experiences`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      const created = exps.data.find((e: any) => e.type === "spotted" && e.loggedBy?._id === FIXTURES.users.sam);
      if (created) await axios.delete(`${API}/experiences/${created._id}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("location is not present in the feed when viewed by another user", async ({ page }) => {
    try {
      await logSpottedWithLocation(page, "Santa Monica, CA");

      // Alex's feed should not include Sam's location
      const feedResp = await axios.get(`${API}/experiences`, { headers: { "x-test-user-id": FIXTURES.users.alex } });
      const created = feedResp.data.find((e: any) => e.type === "spotted" && e.loggedBy?._id === FIXTURES.users.sam);
      expect(created).toBeDefined();
      expect(created.location).toBeUndefined();
    } finally {
      const exps = await axios.get(`${API}/experiences`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      const created = exps.data.find((e: any) => e.type === "spotted" && e.loggedBy?._id === FIXTURES.users.sam);
      if (created) await axios.delete(`${API}/experiences/${created._id}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("location is present in own profile API response", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "spotted",
        location: { display: "Malibu, CA", lat: 34.0259, lng: -118.7798 },
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, {
        headers: { "x-test-user-id": FIXTURES.users.sam },
      });
      const exp = profile.data.experiences.find((e: any) => e._id === expId);
      expect(exp?.location?.display).toBe("Malibu, CA");
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("location is stripped from another user's profile API response", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "spotted",
        location: { display: "Malibu, CA", lat: 34.0259, lng: -118.7798 },
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      // Alex views Sam's profile — should not see location
      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, {
        headers: { "x-test-user-id": FIXTURES.users.alex },
      });
      const exp = profile.data.experiences.find((e: any) => e._id === expId);
      expect(exp?.location).toBeUndefined();
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });
});
