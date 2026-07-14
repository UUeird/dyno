import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Loose (unidentified-vehicle) experiences", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
  });

  test.afterEach(async () => {
    const { data: exps } = await axios.get(`${API}/experiences`);
    const created = exps.filter((e: any) => e.loggedBy?._id === FIXTURES.users.sam && !e.car);
    for (const exp of created) await axios.delete(`${API}/experiences/${exp._id}`).catch(() => {});
  });

  test("POST /api/experiences accepts vehicleModel without a car for a spotted experience", async () => {
    const { data } = await axios.post(`${API}/experiences`, {
      vehicleModel: FIXTURES.models.civic,
      yearGuess: 2018,
      colorGuess: "Blue",
      type: "spotted",
    });
    expect(data.experience.car).toBeFalsy();
    expect(String(data.experience.vehicleModel)).toBe(FIXTURES.models.civic);
  });

  test("POST /api/experiences rejects a drove experience without a car", async () => {
    try {
      await axios.post(`${API}/experiences`, {
        vehicleModel: FIXTURES.models.civic,
        type: "drove",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/car is required for a drove experience/i);
    }
  });

  test("POST /api/experiences rejects both car and vehicleModel set", async () => {
    const { data: cars } = await axios.get(`${API}/cars`);
    try {
      await axios.post(`${API}/experiences`, {
        car: cars[0]._id,
        vehicleModel: FIXTURES.models.civic,
        type: "spotted",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/mutually exclusive/i);
    }
  });

  test("GET /api/experiences returns a loose experience with vehicleManufacturer/vehicleModel names, no car", async () => {
    const { data: created } = await axios.post(`${API}/experiences`, {
      vehicleModel: FIXTURES.models.civic,
      type: "spotted",
    });
    const { data: exps } = await axios.get(`${API}/experiences`);
    const found = exps.find((e: any) => e._id === created.experience._id);
    expect(found.car).toBeFalsy();
    expect(found.vehicleManufacturer).toBe("Honda");
    expect(found.vehicleModel).toBe("Civic");
  });

  test("UI: 'Just spotted it' flow creates a loose experience without a car", async ({ page }) => {
    await page.click("text=+ New");
    await page.click("text=Just spotted it");
    await page.selectOption("select[name=manufacturer]", { label: "Honda" });
    await page.selectOption("select[name=model]", { label: "Civic" });
    await page.click("button:has-text('Next →')");
    await expect(page.locator(".modal h2")).toContainText("Where did you spot it?");
    await page.locator('.experience-option:has(.option-label:text-is("Skip"))').click();
    await expect(page.locator(".modal")).not.toBeVisible();

    const { data: exps } = await axios.get(`${API}/experiences`);
    const created = exps.find((e: any) => e.loggedBy?._id === FIXTURES.users.sam && !e.car && e.vehicleModel === "Civic");
    expect(created).toBeTruthy();
  });
});
