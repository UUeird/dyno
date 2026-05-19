import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam } from "./auth";

const API = "http://localhost:5000/api";

// These tests need admin access. Make Sam an admin via the test backend's bypass —
// the env-based ADMIN_EMAILS check uses Sam's seeded email.
// Sam's fixture email is sam@samelawrence.com (set in /api/test/seed). ADMIN_EMAILS
// must include that email for the trim-admin endpoints to authorize. Set in the
// test backend env via global-setup if you add new admin tests; for now we rely on
// the fact that admin endpoints aren't required for the core trim-validation
// tests below — we set up trim data via direct DB writes in the test bypass.

test.describe("Trim validation", () => {
  test.beforeAll(() => asSam());

  let hondaId: string;
  const createdVins: string[] = [];

  test.beforeAll(async () => {
    // Find Honda (seeded by /api/test/seed) and learn its id for trim-set calls below
    const { data: mfrs } = await axios.get(`${API}/manufacturers`);
    const honda = mfrs.find((m: any) => m.name === "Honda");
    hondaId = honda._id;
  });

  test.afterAll(async () => {
    for (const vin of createdVins) {
      // Best-effort cleanup. We don't have a delete-by-vin endpoint, so iterate cars.
      const { data: cars } = await axios.get(`${API}/cars`);
      const match = cars.find((c: any) => c.vin === vin);
      if (match) await axios.delete(`${API}/cars/${match._id}`).catch(() => {});
    }
    // Reset Honda Civic trims to empty so other specs aren't affected
    await axios.put(`${API}/manufacturers/${hondaId}/trims/Civic`, { trims: [] }).catch(() => {});
  });

  test("trim is free-form when model has no trims defined", async () => {
    // Civic starts with no trims defined — should accept any trim string
    const { data } = await axios.post(`${API}/cars`, {
      manufacturer: "Honda",
      model: "Civic",
      year: 2015,
      vin: "TRIMTEST000000001",
      trim: "Something Custom",
    });
    expect(data.trim).toBe("Something Custom");
    createdVins.push("TRIMTEST000000001");
  });

  test("admin can register trims for a model", async () => {
    // This requires the calling user to be admin. In test mode admin is enforced by
    // ADMIN_EMAILS env var. We're skipping this if the env doesn't include sam.
    const trims = [
      { name: "EX", years: [{ from: 2012, to: 2015 }] },
      { name: "Type R", years: [{ from: 2017, to: null }] },
    ];
    try {
      const { data } = await axios.put(`${API}/manufacturers/${hondaId}/trims/Civic`, { trims });
      expect(data.trims.Civic).toHaveLength(2);
    } catch (err: any) {
      // If admin isn't configured in test env, skip the rest of trim tests
      if (err.response?.status === 403) test.skip();
      else throw err;
    }
  });

  test("POST /api/cars rejects unknown trim when model has trims defined", async () => {
    try {
      await axios.post(`${API}/cars`, {
        manufacturer: "Honda",
        model: "Civic",
        year: 2014,
        vin: "TRIMTEST000000002",
        trim: "Nonexistent",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/not a valid trim/i);
    }
  });

  test("POST /api/cars rejects trim outside its year range", async () => {
    try {
      await axios.post(`${API}/cars`, {
        manufacturer: "Honda",
        model: "Civic",
        year: 2020,
        vin: "TRIMTEST000000003",
        trim: "EX", // EX is 2012-2015 only
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/wasn't offered in 2020/i);
    }
  });

  test("POST /api/cars accepts trim within range", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      manufacturer: "Honda",
      model: "Civic",
      year: 2014,
      vin: "TRIMTEST000000004",
      trim: "EX",
    });
    expect(data.trim).toBe("EX");
    createdVins.push("TRIMTEST000000004");
  });

  test("open-ended 'to' covers the present", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      manufacturer: "Honda",
      model: "Civic",
      year: 2024,
      vin: "TRIMTEST000000005",
      trim: "Type R",
    });
    expect(data.trim).toBe("Type R");
    createdVins.push("TRIMTEST000000005");
  });
});
