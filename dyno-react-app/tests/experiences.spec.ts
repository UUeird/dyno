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

  test("location is stripped from the model page API response for non-authors", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "spotted",
        location: { display: "Topanga, CA", lat: 34.0936, lng: -118.6017 },
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      // Alex views the Civic model page — should not see Sam's location
      const model = await axios.get(`${API}/models/honda/civic`, {
        headers: { "x-test-user-id": FIXTURES.users.alex },
      });
      const exp = model.data.experiences.find((e: any) => e._id === expId);
      expect(exp).toBeDefined();
      expect(exp?.location).toBeUndefined();

      // Sam viewing the same page sees the location
      const ownModel = await axios.get(`${API}/models/honda/civic`, {
        headers: { "x-test-user-id": FIXTURES.users.sam },
      });
      const ownExp = ownModel.data.experiences.find((e: any) => e._id === expId);
      expect(ownExp?.location?.display).toBe("Topanga, CA");
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });
});

test.describe("Weather snapshot on experiences", () => {
  test("weather is attached when lat/lng are provided", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "spotted",
        location: { display: "Malibu, CA", lat: 34.0259, lng: -118.7798 },
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      expect(data.experience.weather).toBeDefined();
      expect(data.experience.weather).not.toBeNull();
      expect(typeof data.experience.weather.tempC).toBe("number");
      expect(typeof data.experience.weather.conditions).toBe("string");
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("weather is absent when no location is provided", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "drove",
        rating: 4,
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      expect(data.experience.weather == null).toBeTruthy();
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("a drive's weather is read at the hour of its first GPS fix", async () => {
    const at = new Date(Date.now() - 2 * 86400000);
    at.setUTCHours(6, 0, 0, 0);
    const day = at.toISOString().slice(0, 10);
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "drove",
        route: [
          { lat: 37.8199, lng: -122.4783, t: at.toISOString() },
          { lat: 37.8324, lng: -122.4797, t: new Date(at.getTime() + 600000).toISOString() },
        ],
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      const params = new URLSearchParams({
        latitude: "37.8199", longitude: "-122.4783", start_date: day, end_date: day,
        hourly: "temperature_2m", timezone: "GMT",
      });
      const ref = await axios.get(`https://api.open-meteo.com/v1/forecast?${params}`);
      expect(data.experience.weather.tempC).toBe(ref.data.hourly.temperature_2m[6]);
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });

  test("weather is stripped from another user's view, same as location", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic,
        type: "spotted",
        location: { display: "Santa Monica, CA", lat: 34.0195, lng: -118.4912 },
      }, { headers: { "x-test-user-id": FIXTURES.users.sam } });
      expId = data.experience._id;

      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, {
        headers: { "x-test-user-id": FIXTURES.users.alex },
      });
      const exp = profile.data.experiences.find((e: any) => e._id === expId);
      expect(exp?.weather).toBeUndefined();
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, { headers: { "x-test-user-id": FIXTURES.users.sam } });
    }
  });
});

test.describe("Route elevation on drove experiences", () => {
  const SAM = { headers: { "x-test-user-id": FIXTURES.users.sam } };
  // Ocean-level at the Golden Gate Bridge up to Hawk Hill.
  const ROUTE = [
    { lat: 37.8199, lng: -122.4783, t: "2026-11-01T17:00:00Z" },
    { lat: 37.8324, lng: -122.4797, t: "2026-11-01T17:05:00Z" },
    { lat: 37.8257, lng: -122.4995, t: "2026-11-01T17:12:00Z" },
  ];

  test("route points get elevations and a gain/loss summary", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic, type: "drove", route: ROUTE,
      }, SAM);
      expId = data.experience._id;

      const { route, elevation } = data.experience;
      expect(route).toHaveLength(3);
      expect(route[0].t).toBe("2026-11-01T17:00:00.000Z");
      for (const p of route) expect(typeof p.ele).toBe("number");
      expect(elevation.gainM).toBeGreaterThan(0);
      expect(elevation.maxM).toBeGreaterThan(elevation.minM);
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, SAM);
    }
  });

  test("drive path and elevation profile are shown on own profile", async ({ page }) => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic, type: "drove", route: ROUTE,
      }, SAM);
      expId = data.experience._id;

      await pageAsSam(page);
      await page.goto("/profile");
      const map = page.getByTestId("drive-map");
      await expect(map).toHaveCount(1);
      await expect(map.locator("path.leaflet-interactive")).toHaveCount(3);

      const profile = page.getByTestId("elevation-profile");
      await expect(profile).toBeVisible();
      await expect(profile).toContainText(`↑ ${Math.round(data.experience.elevation.gainM)} m`);
      await expect(page.getByTestId("experience-weather").first()).toContainText(`${Math.round(data.experience.weather.tempC)}°C`);
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, SAM);
    }
  });

  test("malformed route is rejected", async () => {
    const err = await axios.post(`${API}/experiences`, {
      car: FIXTURES.cars.civic, type: "drove", route: [{ lat: 200, lng: 0 }],
    }, SAM).catch((e) => e.response);
    expect(err.status).toBe(400);
  });

  test("elevation is stripped from another user's view", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic, type: "drove", route: ROUTE,
      }, SAM);
      expId = data.experience._id;

      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, {
        headers: { "x-test-user-id": FIXTURES.users.alex },
      });
      const exp = profile.data.experiences.find((e: any) => e._id === expId);
      expect(exp).toBeDefined();
      expect(exp.elevation).toBeUndefined();
      expect(exp.route).toBeUndefined();
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, SAM);
    }
  });
});

test.describe("Drive ratings (smile, pavement, traffic)", () => {
  const SAM = { headers: { "x-test-user-id": FIXTURES.users.sam } };

  test("picked in the drove flow, saved, and shown on profile", async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
    try {
      await page.click("text=+ New");
      await page.click("text=Previous car");
      await page.locator(".library-item").first().click();
      await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();

      await page.getByRole("radiogroup", { name: "Smiles" }).getByRole("radio", { name: "🤩" }).click();
      await page.getByRole("radiogroup", { name: "Pavement" }).getByRole("radio", { name: "Smooth" }).click();
      const traffic = page.getByRole("radiogroup", { name: "Traffic" });
      await traffic.getByRole("radio", { name: "Heavy" }).click();
      await traffic.getByRole("radio", { name: "Heavy" }).click();
      await expect(traffic.getByRole("radio", { checked: true })).toHaveCount(0);
      await traffic.getByRole("radio", { name: "Open road" }).click();
      await page.locator(".experience-option--primary").click();
      await expect(page.locator(".modal")).not.toBeVisible();

      await page.reload();
      const ratings = page.getByTestId("drive-ratings").first();
      await expect(ratings).toContainText("Epic");
      await expect(ratings).toContainText("Smooth pavement");
      await expect(ratings).toContainText("Open road");
    } finally {
      const exps = await axios.get(`${API}/experiences`);
      const created = exps.data.find((e: any) => e.smile === 5 && e.loggedBy?._id === FIXTURES.users.sam);
      if (created) await axios.delete(`${API}/experiences/${created._id}`, SAM);
    }
  });

  test("are public, unlike route data", async () => {
    let expId: string | undefined;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: FIXTURES.cars.civic, type: "drove", smile: 4, pavement: 1, traffic: 2,
      }, SAM);
      expId = data.experience._id;
      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, {
        headers: { "x-test-user-id": FIXTURES.users.alex },
      });
      const exp = profile.data.experiences.find((e: any) => e._id === expId);
      expect(exp).toMatchObject({ smile: 4, pavement: 1, traffic: 2 });
    } finally {
      if (expId) await axios.delete(`${API}/experiences/${expId}`, SAM);
    }
  });

  for (const [name, body] of [
    ["out-of-range smile", { type: "drove", smile: 6 }],
    ["non-integer pavement", { type: "drove", pavement: 1.5 }],
    ["drive rating on a spotted experience", { type: "spotted", traffic: 2 }],
  ] as const) {
    test(`rejects ${name}`, async () => {
      const err = await axios.post(`${API}/experiences`, { car: FIXTURES.cars.civic, ...body }, SAM)
        .catch((e) => e.response);
      expect(err.status).toBe(400);
    });
  }
});

test.describe("Route lookup from two points", () => {
  const SAM = { headers: { "x-test-user-id": FIXTURES.users.sam } };
  test.use({ geolocation: { latitude: 33.749, longitude: -84.388 }, permissions: ["geolocation"] });

  test("API returns a road route between two points", async () => {
    const { data } = await axios.get(`${API}/route-lookup`, {
      params: { from: "33.749,-84.388", to: "33.8053,-84.1455" }, ...SAM,
    });
    expect(data.route.length).toBeGreaterThan(10);
    expect(data.route.length).toBeLessThanOrEqual(500);
    expect(data.distanceM).toBeGreaterThan(20000);
    expect(data.durationS).toBeGreaterThan(0);
  });

  test("API rejects malformed points", async () => {
    const err = await axios.get(`${API}/route-lookup`, { params: { from: "abc", to: "1,2" }, ...SAM })
      .catch((e) => e.response);
    expect(err.status).toBe(400);
  });

  test("picking two points in the drove flow saves the route", async ({ page }) => {
    await pageAsSam(page);
    await page.goto("/profile");
    try {
      await page.click("text=+ New");
      await page.click("text=Previous car");
      await page.locator(".library-item").first().click();
      await page.locator('.experience-option:has(.option-label:text-is("Drove"))').click();
      await page.click("text=Add route");

      const map = page.getByTestId("route-picker-map");
      const hint = page.getByTestId("route-picker-hint");
      await expect(hint).toHaveText("Tap where the drive started");
      await page.waitForTimeout(500);
      const box = (await map.boundingBox())!;
      await map.click({ position: { x: box.width * 0.3, y: box.height * 0.5 } });
      await expect(hint).toHaveText("Now tap where it ended");
      await map.click({ position: { x: box.width * 0.7, y: box.height * 0.4 } });
      await expect(hint).toContainText(" km · ", { timeout: 15000 });
      await expect(map.locator("path.leaflet-interactive")).toHaveCount(3);

      await page.locator(".experience-option--primary").click();
      await expect(page.locator(".modal")).not.toBeVisible();
      await page.reload();
      await expect(page.getByTestId("drive-map").first()).toBeVisible();
    } finally {
      const exps = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, SAM);
      const created = exps.data.experiences.find((e: any) => e.route?.length > 2);
      if (created) await axios.delete(`${API}/experiences/${created._id}`, SAM);
    }
  });
});

test.describe("GPS drive recording", () => {
  const SAM = { headers: { "x-test-user-id": FIXTURES.users.sam } };
  const PATH = [
    { latitude: 33.7490, longitude: -84.3880 },
    { latitude: 33.7510, longitude: -84.3880 },
    { latitude: 33.7530, longitude: -84.3878 },
    { latitude: 33.7550, longitude: -84.3860 },
  ];
  test.use({ geolocation: PATH[0], permissions: ["geolocation"] });

  test("records a drive, survives a reload, and logs it", async ({ page, context }) => {
    await pageAsSam(page);
    await page.goto("/profile");
    try {
      await page.click("text=Start drive");
      await expect(page).toHaveURL(/\/record$/);
      await expect(page.getByTestId("recorder-gps")).toHaveText("GPS locked");
      await page.getByRole("button", { name: "Start drive" }).click();
      await expect(page.getByRole("button", { name: "Finish drive" })).toBeDisabled();

      const distance = page.getByTestId("recorder-distance");
      await context.setGeolocation(PATH[1]);
      await expect(distance).not.toHaveText("0.00");
      await context.setGeolocation(PATH[2]);
      await expect(distance).toHaveText("0.45");

      await page.reload();
      await expect(distance).toHaveText("0.45");
      await context.setGeolocation(PATH[3]);
      await expect(distance).not.toHaveText("0.45");

      await page.getByRole("button", { name: "Finish drive" }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.locator(".modal")).toBeVisible();
      await expect(page.locator('.experience-option:has-text("Spot")')).toHaveCount(0);
      await page.click("text=Previous car");
      await page.locator(".library-item").first().click();
      await expect(page.getByTestId("recorded-route-note")).toContainText("km");
      await page.locator(".experience-option--primary").click();
      await expect(page.locator(".modal")).not.toBeVisible();

      await page.reload();
      await expect(page.getByTestId("drive-map").first()).toBeVisible();
      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, SAM);
      const saved = profile.data.experiences.find((e: any) => e.route?.length === 4);
      expect(saved).toBeDefined();
      expect(saved.route.every((p: any) => typeof p.t === "string")).toBe(true);
    } finally {
      const profile = await axios.get(`${API}/users/${FIXTURES.users.sam}/profile`, SAM);
      for (const e of profile.data.experiences.filter((e: any) => e.route?.length === 4)) {
        await axios.delete(`${API}/experiences/${e._id}`, SAM);
      }
    }
  });
});
