import { test, expect } from "@playwright/test";
import axios from "axios";
import { asSam } from "./auth";
import { FIXTURES } from "./seed";

const API = "http://localhost:5000/api";

test.describe("Car VIN handling", () => {
  test.beforeAll(() => asSam());
  const createdIds: string[] = [];

  test.afterAll(async () => {
    for (const id of createdIds) {
      await axios.delete(`${API}/cars/${id}`).catch(() => {});
    }
  });

  test("POST /api/cars accepts missing VIN", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2020,
    });
    expect(data._id).toBeTruthy();
    expect(data.vin == null || data.vin === "").toBe(true);
    createdIds.push(data._id);
  });

  test("POST /api/cars accepts blank VIN (treated as no VIN)", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2020,
      vin: "   ",
    });
    expect(data._id).toBeTruthy();
    expect(data.vin == null || data.vin === "").toBe(true);
    createdIds.push(data._id);
  });

  test("POST /api/cars succeeds with VIN", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2020,
      vin: "TESTVIN0000000001",
    });
    expect(data.vin).toBe("TESTVIN0000000001");
    createdIds.push(data._id);
  });

  test("POST /api/cars rejects duplicate VIN with 409", async () => {
    const { data } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2021,
      vin: "TESTVIN0000000002",
    });
    createdIds.push(data._id);

    try {
      await axios.post(`${API}/cars`, {
        model: FIXTURES.models.accord,
        year: 2019,
        vin: "TESTVIN0000000002",
      });
      throw new Error("should have 409'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(409);
    }
  });

  test("multiple cars with no VIN do not conflict", async () => {
    // Sparse unique index means absence is allowed for as many records as we want
    const { data: a } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2018,
    });
    const { data: b } = await axios.post(`${API}/cars`, {
      model: FIXTURES.models.civic,
      year: 2019,
    });
    expect(a._id).not.toBe(b._id);
    createdIds.push(a._id, b._id);
  });
});
