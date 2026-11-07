import { test, expect, Page } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, asAlex, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/**";

async function createLoose(extra: Record<string, unknown> = {}) {
  const { data } = await axios.post(`${API}/experiences`, {
    vehicleModel: FIXTURES.models.civic,
    type: "spotted",
    notes: "link-experience-spec",
    ...extra,
  });
  return data.experience._id as string;
}

async function findExp(id: string) {
  const { data } = await axios.get(`${API}/experiences`);
  return data.find((e: any) => e._id === id);
}

async function openLinkModal(page: Page) {
  const row = page.locator(".experience-item", { hasText: "link-experience-spec" });
  await row.locator(".btn-menu").click();
  await row.locator("button:has-text('Link to a car')").click();
  await expect(page.locator(".modal h2")).toContainText("Link to a car");
}

test.describe("Link a loose experience to a car", () => {
  const createdCarIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    asSam();
    await pageAsSam(page);
  });

  test.afterEach(async () => {
    asSam();
    const { data: exps } = await axios.get(`${API}/experiences`);
    for (const e of exps.filter((e: any) => e.notes === "link-experience-spec")) {
      await axios.delete(`${API}/experiences/${e._id}`).catch(() => {});
    }
    for (const id of createdCarIds.splice(0)) await axios.delete(`${API}/cars/${id}`).catch(() => {});
  });

  test("PATCH links the car and clears the loose fields", async () => {
    const expId = await createLoose({ yearGuess: 2018, colorGuess: "Blue" });
    const { data: car } = await axios.post(`${API}/cars`, { model: FIXTURES.models.civic, year: 2018, vin: "LINKEXP0000000001" });
    createdCarIds.push(car._id);

    const { data } = await axios.patch(`${API}/experiences/${expId}/car`, { car: car._id });
    expect(String(data.experience.car)).toBe(car._id);

    const exp = await findExp(expId);
    expect(exp.car._id).toBe(car._id);
    expect(exp.vehicleModel ?? null).toBeNull();
    expect(exp.yearGuess ?? null).toBeNull();
    expect(exp.colorGuess ?? null).toBeNull();
  });

  test("PATCH rejects another user's experience and an already-linked one", async () => {
    const expId = await createLoose();
    const { data: car } = await axios.post(`${API}/cars`, { model: FIXTURES.models.civic, year: 2018, vin: "LINKEXP0000000002" });
    createdCarIds.push(car._id);

    asAlex();
    const forbidden = await axios.patch(`${API}/experiences/${expId}/car`, { car: car._id }).catch((e) => e.response);
    expect(forbidden.status).toBe(403);

    asSam();
    const injected = await axios.patch(`${API}/experiences/${expId}/car`, { car: { $ne: null } }).catch((e) => e.response);
    expect(injected.status).toBe(400);

    await axios.patch(`${API}/experiences/${expId}/car`, { car: car._id });
    const again = await axios.patch(`${API}/experiences/${expId}/car`, { car: car._id }).catch((e) => e.response);
    expect(again.status).toBe(400);
  });

  test("UI: VIN of an existing car links immediately", async ({ page }) => {
    const expId = await createLoose();
    const { data: car } = await axios.post(`${API}/cars`, { model: FIXTURES.models.civic, year: 2017, vin: "LINKEXP0000000003" });
    createdCarIds.push(car._id);
    await page.route(VPIC, () => { throw new Error("should not decode an existing car"); });
    await page.goto("/profile");

    await openLinkModal(page);
    await page.fill(".vin-input", "LINKEXP0000000003");
    await page.click("button:has-text('Look up')");
    await expect(page.locator(".modal")).not.toBeVisible();

    const exp = await findExp(expId);
    expect(exp.car._id).toBe(car._id);
    const row = page.locator(".experience-item", { hasText: "link-experience-spec" });
    await expect(row.locator(".experience-loose-badge")).toHaveCount(0);
    await expect(row).toContainText("2017 Honda Civic");
  });

  test("UI: unknown VIN that won't decode prefills the form from the loose guesses, then creates + links", async ({ page }) => {
    const expId = await createLoose({ yearGuess: 2016 });
    await page.route(VPIC, (route) => route.fulfill({ status: 503, body: "down" }));
    await page.goto("/profile");

    await openLinkModal(page);
    await page.fill(".vin-input", "LINKEXP0000000004");
    await page.click("button:has-text('Look up')");

    await expect(page.locator(".modal h2")).toContainText("Add a New Car");
    await expect(page.locator('select[name="manufacturer"]')).toHaveValue("Honda");
    await expect(page.locator('select[name="model"]')).toHaveValue(FIXTURES.models.civic);
    await expect(page.locator('input[name="year"]')).toHaveValue("2016");
    await expect(page.locator('input[name="vin"]')).toHaveValue("LINKEXP0000000004");

    const trim = page.locator('.modal select[name="trim"]');
    if (await trim.count()) await trim.selectOption({ index: 1 });
    const drivetrain = page.locator('.modal select[name="drivetrain"]');
    if (await drivetrain.count()) await drivetrain.selectOption({ index: 1 });
    await page.click("button:has-text('Next →')");
    await expect(page.locator(".modal")).not.toBeVisible();

    const exp = await findExp(expId);
    expect(exp.car?.vin).toBe("LINKEXP0000000004");
    createdCarIds.push(exp.car._id);
  });
});
