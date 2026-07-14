import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Drivetrain validation", () => {
  test.beforeAll(() => asSam());

  const hondaId = FIXTURES.manufacturers.honda;
  const createdVins: string[] = [];

  test.afterAll(async () => {
    for (const vin of createdVins) {
      const { data: cars } = await axios.get(`${API}/cars`);
      const match = cars.find((c: any) => c.vin === vin);
      if (match) await axios.delete(`${API}/cars/${match._id}`).catch(() => {});
    }
    // Reset Honda Civic drivetrains to empty so other specs aren't affected
    await axios.put(`${API}/manufacturers/${hondaId}/drivetrains/${FIXTURES.models.civic}`, { drivetrains: [] }).catch(() => {});
  });

  test("drivetrain is free-form when model has no drivetrains defined", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2015,
      vin: "DTTEST0000000001",
      drivetrain: "Something Custom",
    });
    expect(data.drivetrain).toBe("Something Custom");
    createdVins.push("DTTEST0000000001");
  });

  test("admin can register drivetrains for a model", async () => {
    try {
      const { data } = await axios.put(`${API}/manufacturers/${hondaId}/drivetrains/${FIXTURES.models.civic}`, {
        drivetrains: ["FWD", "AWD"],
      });
      expect(data.drivetrains).toHaveLength(2);
    } catch (err: any) {
      if (err.response?.status === 403) test.skip();
      else throw err;
    }
  });

  test("POST /api/cars rejects unknown drivetrain when model has drivetrains defined", async () => {
    try {
      await axios.post(`${API}/cars`, {
        model: FIXTURES.models.civic,
        year: 2014,
        vin: "DTTEST0000000002",
        drivetrain: "RWD",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/not a valid drivetrain/i);
    }
  });

  test("POST /api/cars rejects missing drivetrain when model has drivetrains defined", async () => {
    try {
      await axios.post(`${API}/cars`, {
        model: FIXTURES.models.civic,
        year: 2014,
        vin: "DTTEST0000000003",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/drivetrain is required/i);
    }
  });

  test("POST /api/cars accepts drivetrain within registered options", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2014,
      vin: "DTTEST0000000004",
      drivetrain: "AWD",
    });
    expect(data.drivetrain).toBe("AWD");
    createdVins.push("DTTEST0000000004");
  });
});
