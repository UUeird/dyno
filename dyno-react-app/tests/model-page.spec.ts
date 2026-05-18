import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Car model page", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => { await pageAsSam(page); });

  test("GET /api/models/:mfr/:model returns aggregate data", async () => {
    // Log a rated experience so the average computes to something specific
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 4,
    });

    const { data } = await axios.get(`${API}/models/honda/civic`);
    expect(data.manufacturer).toBe("Honda");
    expect(data.model).toBe("Civic");
    expect(data.cars.length).toBeGreaterThanOrEqual(1);
    expect(data.experiences.length).toBeGreaterThanOrEqual(1);
    expect(data.rating.average).toBe(4);
    expect(data.rating.count).toBe(1);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("unknown model returns 404", async () => {
    try {
      await axios.get(`${API}/models/fnord/fakemodel`);
      throw new Error("should have 404'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(404);
    }
  });

  test("/cars/honda/civic renders model page with rating block", async ({ page }) => {
    // Seed: log a rated experience
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 3.5,
    });

    await page.goto("/cars/honda/civic");
    await expect(page.locator(".model-title")).toContainText("Honda Civic");
    await expect(page.locator(".model-rating-block")).toBeVisible();
    await expect(page.locator(".model-rating-score")).toContainText("3.5");
    await expect(page.locator(".star-icon").first()).toBeVisible();

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("model name in feed is a clickable link", async ({ page }) => {
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    await page.goto("/");
    const link = page.locator(".experience-list .model-name-link").first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/cars/honda/civic");

    // Clicking navigates to the model page
    await link.click();
    await expect(page).toHaveURL(/\/cars\/honda\/civic$/);
    await expect(page.locator(".model-title")).toContainText("Honda Civic");

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("model with no ratings shows empty state for rating block", async ({ page }) => {
    // Impala has no rated experiences after teardown — log one unrated drove
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.impala,
      type: "drove",
    });

    await page.goto("/cars/chevrolet/impala");
    await expect(page.locator(".model-title")).toContainText("Chevrolet Impala");
    await expect(page.locator(".model-rating-block .empty-state")).toContainText("No ratings yet");

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });
});
