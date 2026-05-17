import { test, expect } from "@playwright/test";
import axios from "axios";

const API = "http://localhost:5000/api";

test.describe("Car creation requires VIN", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    for (const id of createdIds) {
      await axios.delete(`${API}/cars/${id}`).catch(() => {});
    }
  });

  test("POST /api/cars rejects missing VIN with 400", async () => {
    try {
      await axios.post(`${API}/cars`, {
        manufacturer: "Honda",
        model: "Civic",
        year: 2020,
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toMatch(/VIN/i);
    }
  });

  test("POST /api/cars rejects empty-string VIN with 400", async () => {
    try {
      await axios.post(`${API}/cars`, {
        manufacturer: "Honda",
        model: "Civic",
        year: 2020,
        vin: "   ",
      });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
    }
  });

  test("POST /api/cars succeeds with VIN", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      manufacturer: "Honda",
      model: "Civic",
      year: 2020,
      vin: "TESTVIN0000000001",
    });
    expect(data.vin).toBe("TESTVIN0000000001");
    createdIds.push(data._id);
  });

  test("POST /api/cars rejects duplicate VIN with 409", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      manufacturer: "Honda",
      model: "Civic",
      year: 2021,
      vin: "TESTVIN0000000002",
    });
    createdIds.push(data._id);

    try {
      await axios.post(`${API}/cars`, {
        manufacturer: "Honda",
        model: "Accord",
        year: 2019,
        vin: "TESTVIN0000000002",
      });
      throw new Error("should have 409'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(409);
    }
  });
});
