import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Want to drive wishlist", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => { await pageAsSam(page); });

  test.afterEach(async () => {
    await axios.delete(`${API}/wishlist`, {
      data: { model: FIXTURES.models.civic },
    }).catch(() => {});
    await axios.delete(`${API}/wishlist`, {
      data: { model: FIXTURES.models.impala },
    }).catch(() => {});
    // Wipe sam's drove experiences for Civic so tests stay independent
    const { data: exps } = await axios.get(`${API}/experiences`);
    for (const e of exps) {
      if (e.loggedBy?._id === FIXTURES.users.sam && e.type === "drove" && e.car?.manufacturer === "Honda") {
        await axios.delete(`${API}/experiences/${e._id}`).catch(() => {});
      }
    }
  });

  test("POST /api/wishlist adds an item with no year range", async () => {
    const { data } = await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
    });
    expect(data.model).toBe(FIXTURES.models.civic);
    expect(data.yearFrom).toBeNull();
    expect(data.yearTo).toBeNull();
  });

  test("POST /api/wishlist accepts year range", async () => {
    const { data } = await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2012,
      yearTo: 2015,
    });
    expect(data.yearFrom).toBe(2012);
    expect(data.yearTo).toBe(2015);
  });

  test("POST /api/wishlist rejects if user already drove a matching car", async () => {
    // Civic fixture is 2012
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    try {
      await axios.post(`${API}/wishlist`, {
        model: FIXTURES.models.civic,
      });
      throw new Error("should have 409'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(409);
    }

    const { data } = await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2020,
      yearTo: 2024,
    });
    expect(data.yearFrom).toBe(2020);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("drove experience auto-removes matching wishlist items", async () => {
    await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2010,
      yearTo: 2015,
    });

    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    const { data: list } = await axios.get(`${API}/users/${FIXTURES.users.sam}/wishlist`);
    expect(list.every((i: any) => i.model !== "Civic")).toBe(true);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("drove experience does NOT remove wishlist with non-matching range", async () => {
    await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2020,
      yearTo: 2024,
    });

    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    const { data: list } = await axios.get(`${API}/users/${FIXTURES.users.sam}/wishlist`);
    expect(list.some((i: any) => i.model === "Civic")).toBe(true);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("model page includes wishlist state and drivenYears for user", async () => {
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    const { data } = await axios.get(
      `${API}/models/honda/civic?userId=${FIXTURES.users.sam}`
    );
    expect(data.wishlist.drivenYears).toContain(2012);
    expect(data.wishlist.wishlisted).toBe(false);

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("model page shows Driven button when user has driven this model", async ({ page }) => {
    const { data: exp } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    });

    await page.goto("/cars/honda/civic");
    const drivenBtn = page.locator(".btn-wishlist--driven");
    await expect(drivenBtn).toBeVisible();
    await expect(drivenBtn).toContainText("Driven");
    await expect(drivenBtn).toBeDisabled();

    await axios.delete(`${API}/experiences/${exp.experience._id}`);
  });

  test("model page allows wishlisting with year range via form", async ({ page }) => {
    await page.goto("/cars/chevrolet/impala");
    await page.locator(".btn-wishlist").click();
    await page.locator(".wishlist-year-input").first().fill("2018");
    await page.locator(".wishlist-year-input").nth(1).fill("2020");
    await page.locator(".wishlist-form .btn-primary").click();

    await expect(page.locator(".btn-wishlist--active")).toBeVisible();
    await expect(page.locator(".btn-wishlist-range")).toContainText("2018–2020");
  });

  test("profile page shows year range on wishlist item", async ({ page }) => {
    await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2012,
      yearTo: 2015,
    });

    await page.goto("/profile");
    const tile = page.locator(".wishlist-tile").first();
    await expect(tile).toBeVisible();
    await expect(tile.locator(".wishlist-tile-year-badge")).toContainText("2012–2015");
    await expect(tile.locator("a.wishlist-tile-link")).toHaveAttribute("href", "/cars/honda/civic");
  });

  test("wishlist tile uses thumbnail of a representative car when available", async () => {
    const { data: photo } = await axios.post(`${API}/cars/${FIXTURES.cars.civic}/photos/url`, {
      url: "https://example.com/civic.jpg",
    });

    await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
      yearFrom: 2010,
      yearTo: 2015,
    });

    const { data } = await axios.get(`${API}/users/${FIXTURES.users.sam}/wishlist`);
    const item = data.find((i: any) => i.model === "Civic");
    expect(item.thumbnailUrl).toBe("https://example.com/civic.jpg");
    expect(item.representativeYear).toBe(2012);

    await axios.delete(`${API}/photos/${photo._id}`);
  });

  test("wishlist tile shows placeholder when no car has a photo", async () => {
    await axios.post(`${API}/wishlist`, {
      model: FIXTURES.models.civic,
    });

    const { data } = await axios.get(`${API}/users/${FIXTURES.users.sam}/wishlist`);
    const item = data.find((i: any) => i.model === "Civic");
    expect(item.thumbnailUrl).toBeNull();
  });
});
