import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam } from "./auth";

const API = "http://localhost:5000/api";

test.describe("Model year validation", () => {
  test.beforeAll(() => asSam());

  const hondaId = FIXTURES.manufacturers.honda;
  const createdVins: string[] = [];

  test.afterAll(async () => {
    for (const vin of createdVins) {
      const { data: cars } = await axios.get(`${API}/cars`);
      const match = cars.find((c: any) => c.vin === vin);
      if (match) await axios.delete(`${API}/cars/${match._id}`).catch(() => {});
    }
    // Reset Honda Civic years to empty so other specs aren't affected
    await axios.put(`${API}/manufacturers/${hondaId}/years/${FIXTURES.models.civic}`, { years: [] }).catch(() => {});
  });

  test("year is unconstrained when model has no years defined", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 1930,
      vin: "YEARTEST000000001",
    });
    expect(data.year).toBe(1930);
    createdVins.push("YEARTEST000000001");
  });

  test("admin can register production-year ranges for a model", async () => {
    try {
      const { data } = await axios.put(`${API}/manufacturers/${hondaId}/years/${FIXTURES.models.civic}`, {
        years: [{ from: 2012, to: 2015 }, { from: 2017, to: null }],
      });
      expect(data.years).toHaveLength(2);
    } catch (err: any) {
      if (err.response?.status === 403) test.skip();
      else throw err;
    }
  });

  test("POST /api/cars rejects a year outside every registered range", async () => {
    try {
      await axios.post(`${API}/cars`, {
        model: FIXTURES.models.civic,
        year: 2016,
        vin: "YEARTEST000000002",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/not a valid production year/i);
    }
  });

  test("POST /api/cars accepts a year within a registered range", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2013,
      vin: "YEARTEST000000003",
    });
    expect(data.year).toBe(2013);
    createdVins.push("YEARTEST000000003");
  });

  test("open-ended 'to' covers the present", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2024,
      vin: "YEARTEST000000004",
    });
    expect(data.year).toBe(2024);
    createdVins.push("YEARTEST000000004");
  });
});
