import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam, asAlex, pageAsSam } from "./auth";

const API = "http://localhost:5000/api";

const samHeaders = { "x-test-user-id": FIXTURES.users.sam };
const alexHeaders = { "x-test-user-id": FIXTURES.users.alex };

async function samFollowsAlex() {
  await axios.post(`${API}/follows`, { followee: FIXTURES.users.alex }, { headers: samHeaders });
}
async function samUnfollowsAlex() {
  await axios.delete(`${API}/follows`, { data: { followee: FIXTURES.users.alex }, headers: samHeaders });
}

test.describe("Feed", () => {
  test.beforeAll(() => asSam());
  test.beforeEach(async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/");
  });

  test("shows Friends and Public switcher buttons", async ({ page }) => {
    await expect(page.locator(".feed-switcher-btn").nth(0)).toContainText("Friends");
    await expect(page.locator(".feed-switcher-btn").nth(1)).toContainText("Public");
    await expect(page.locator(".feed-switcher-btn--active")).toContainText("Friends");
  });

  test("shows empty state in Friends when not following anyone", async ({ page }) => {
    await expect(page.locator(".empty-state")).toContainText("No activity from people you follow");
  });

  test("own experiences do not appear in either tab", async ({ page }) => {
    const { data } = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.civic, type: "drove" }, { headers: samHeaders });
    const expId = data.experience._id;

    await page.reload();
    // Check Friends tab
    const items = page.locator(".experience-item");
    expect(await items.count()).toBe(0);

    // Check Public tab
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    expect(await items.count()).toBe(0);

    await axios.delete(`${API}/experiences/${expId}`, { headers: samHeaders });
  });

  test("followed user's experience appears in Friends tab", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.civic, type: "drove" }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();
    await samFollowsAlex();

    try {
      await page.reload();
      // Friends tab is active by default
      await expect(page.locator(".experience-list")).toBeVisible();
      await expect(page.locator(".experience-car").first()).toContainText("Civic");
    } finally {
      await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
      await samUnfollowsAlex();
      asSam();
    }
  });

  test("unfollowed user's experience appears in Public tab", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.civic, type: "spotted" }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    try {
      await page.reload();
      // Friends tab should be empty, Public should show Alex's post
      await expect(page.locator(".empty-state")).toBeVisible();
      await page.locator('.feed-switcher-btn:has-text("Public")').click();
      await expect(page.locator(".experience-list")).toBeVisible();
      await expect(page.locator(".experience-car").first()).toContainText("Civic");
    } finally {
      await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
    }
  });

  test("experience with notes shows note text", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      notes: "Canyon run, perfect conditions",
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    await expect(page.locator(".experience-notes").first()).toContainText("Canyon run");

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });

  test("drove experience with rating shows filled star icon", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 3.5,
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveClass(/star-icon--filled/);
    await expect(icon.locator(".star-icon-glow")).toBeAttached();

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });

  test("drove experience with no rating shows unrated star icon", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toHaveClass(/star-icon--unrated/);
    await expect(icon.locator(".star-icon-glow")).toHaveCount(0);

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });

  test("drove experience with 0-star rating shows empty star icon", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 0,
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    const icon = page.locator(".star-icon").first();
    await expect(icon).toHaveClass(/star-icon--empty/);
    await expect(icon.locator(".star-icon-glow")).toHaveCount(0);

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });

  test("hovering star icon expands to full rating row (desktop)", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "drove",
      rating: 3.5,
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    const wrap = page.locator(".star-icon-wrap").first();
    const expandRow = wrap.locator(".star-icon-expand-row");

    const collapsedWidth = await expandRow.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(collapsedWidth).toBe(0);

    await wrap.hover();
    await page.waitForTimeout(350);
    const expandedWidth = await expandRow.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(expandedWidth).toBeGreaterThan(40);

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });

  test("reaction bar renders on each feed card", async ({ page }) => {
    asAlex();
    const { data } = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic,
      type: "spotted",
    }, { headers: alexHeaders });
    const expId = data.experience._id;
    asSam();

    await page.reload();
    await page.locator('.feed-switcher-btn:has-text("Public")').click();
    await expect(page.locator(".reaction-bar").first()).toBeVisible();

    await axios.delete(`${API}/experiences/${expId}`, { headers: alexHeaders });
  });
});

test.describe("Friends feed API authorization", () => {
  test.beforeAll(() => asSam());

  test("rejects unauthenticated followedBy queries", async () => {
    const res = await axios.get(`${API}/experiences?followedBy=${FIXTURES.users.sam}`, {
      headers: { "x-test-user-id": "" },
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  test("rejects followedBy when it doesn't match the requester", async () => {
    const res = await axios.get(`${API}/experiences?followedBy=${FIXTURES.users.alex}`, {
      headers: samHeaders,
      validateStatus: () => true,
    });
    expect(res.status).toBe(403);
  });

  test("accepts followedBy=me and returns own + followees' experiences", async () => {
    await samFollowsAlex();
    const { data: samExp } = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.civic, type: "drove" }, { headers: samHeaders });
    const { data: alexExp } = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.impala, type: "drove" }, { headers: alexHeaders });
    try {
      const res = await axios.get(`${API}/experiences?followedBy=me`, { headers: samHeaders });
      const ids = res.data.map((e: { _id: string }) => e._id);
      expect(ids).toContain(samExp.experience._id);
      expect(ids).toContain(alexExp.experience._id);
    } finally {
      await axios.delete(`${API}/experiences/${samExp.experience._id}`, { headers: samHeaders });
      await axios.delete(`${API}/experiences/${alexExp.experience._id}`, { headers: alexHeaders });
      await samUnfollowsAlex();
    }
  });
});
