import { test, expect, Page } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/**";

function mockVpic(page: Page, row: Record<string, string> | null) {
  return page.route(VPIC, (route) =>
    row
      ? route.fulfill({ json: { Results: [row] } })
      : route.fulfill({ status: 503, body: "down" })
  );
}

async function lookUp(page: Page, vin: string) {
  await page.click("text=+ New");
  await page.click("text=Search by VIN");
  await page.fill(".vin-input", vin);
  await page.click("button:has-text('Look up')");
}

test.describe("VIN lookup + decode", () => {
  test.beforeAll(() => asSam());
  const createdCarIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
  });

  test.afterAll(async () => {
    for (const id of createdCarIds) await axios.delete(`${API}/cars/${id}`).catch(() => {});
  });

  test("existing car with that VIN skips straight to the experience step", async ({ page }) => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2020,
      vin: "VINDECODE00000001",
    });
    createdCarIds.push(data._id);
    await page.route(VPIC, () => { throw new Error("should not decode an existing car"); });
    await page.reload();

    await lookUp(page, "VINDECODE00000001");
    await expect(page.locator(".modal h2")).toContainText("What was this experience?");
    await expect(page.locator(".modal .modal-subtitle")).toContainText("2020 Honda Civic");
  });

  test("decoded make/model matching the registry prefills the new-car form", async ({ page }) => {
    await mockVpic(page, { Make: "HONDA", Model: "Civic", ModelYear: "2019" });
    await lookUp(page, "VINDECODE00000002");

    await expect(page.locator(".modal h2")).toContainText("Add a New Car");
    await expect(page.locator(".vin-notice")).toContainText("Decoded as 2019 Honda Civic");
    await expect(page.locator('select[name="manufacturer"]')).toHaveValue("Honda");
    await expect(page.locator('select[name="model"]')).toHaveValue(FIXTURES.models.civic);
    await expect(page.locator('input[name="year"]')).toHaveValue("2019");
    await expect(page.locator('input[name="vin"]')).toHaveValue("VINDECODE00000002");
  });

  test("decoded model not in the registry prefills manufacturer only", async ({ page }) => {
    await mockVpic(page, { Make: "HONDA", Model: "Ridgeline", ModelYear: "2022" });
    await lookUp(page, "VINDECODE00000003");

    await expect(page.locator(".vin-notice")).toContainText("isn't in the registry yet");
    await expect(page.locator('select[name="manufacturer"]')).toHaveValue("Honda");
    await expect(page.locator('select[name="model"]')).toHaveValue("");
    await expect(page.locator('input[name="vin"]')).toHaveValue("VINDECODE00000003");
  });

  test("decode failure falls back to the manual form with the VIN kept", async ({ page }) => {
    await mockVpic(page, null);
    await lookUp(page, "VINDECODE00000004");

    await expect(page.locator(".vin-notice")).toContainText("Couldn't decode this VIN");
    await expect(page.locator('select[name="manufacturer"]')).toHaveValue("");
    await expect(page.locator('input[name="vin"]')).toHaveValue("VINDECODE00000004");
  });
});
