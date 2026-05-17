import { test, expect } from "@playwright/test";
import axios from "axios";

const API = "http://localhost:5000/api";

test.describe("Search", () => {
  test("GET /api/search returns empty for short queries", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "h" } });
    expect(data.models).toEqual([]);
    expect(data.users).toEqual([]);
  });

  test("GET /api/search matches models by manufacturer or model substring", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "civ" } });
    expect(data.models.some((m: any) => m.model === "Civic")).toBe(true);
  });

  test("GET /api/search matches manufacturer substring", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "hon" } });
    expect(data.models.some((m: any) => m.manufacturer === "Honda")).toBe(true);
  });

  test("GET /api/search dedupes models across multiple car instances", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "civic" } });
    const civics = data.models.filter(
      (m: any) => m.manufacturer === "Honda" && m.model === "Civic"
    );
    expect(civics.length).toBe(1);
  });

  test("GET /api/search matches users by name substring", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "sam" } });
    expect(data.users.some((u: any) => u.name === "Sam Lawrence")).toBe(true);
  });

  test("GET /api/search is case-insensitive", async () => {
    const { data } = await axios.get(`${API}/search`, { params: { q: "HONDA" } });
    expect(data.models.some((m: any) => m.manufacturer === "Honda")).toBe(true);
  });

  test("search bar in header navigates to model page on click", async ({ page }) => {
    await page.goto("/");
    await page.locator(".search-input").fill("civic");
    const result = page.locator(".search-result", { hasText: "Honda Civic" }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/cars\/honda\/civic$/);
  });

  test("search bar navigates to user profile on click", async ({ page }) => {
    await page.goto("/");
    await page.locator(".search-input").fill("alex");
    const result = page.locator(".search-result", { hasText: "Alex" }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/users\//);
  });

  test("search dropdown shows No results for nonsense query", async ({ page }) => {
    await page.goto("/");
    await page.locator(".search-input").fill("zzqxnope");
    await expect(page.locator(".search-empty")).toContainText("No results");
  });
});
