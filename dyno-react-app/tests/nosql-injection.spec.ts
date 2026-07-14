import { test, expect } from "@playwright/test";
import axios from "axios";
import { FIXTURES } from "./seed";
import { asSam } from "./auth";

const API = "http://localhost:5000/api";

// Regression coverage for the 2026-07-14 CodeQL triage: several routes passed
// req.query/req.body values straight into a Mongoose filter.
//
// Body-based injection (POST/DELETE with a JSON body) is the sharper risk:
// Mongoose only casts a value against the schema type when building a
// document, not when it sits in a filter, so a JSON body like
// {"model": {"$ne": null}} reaches Mongo as a real operator.
//
// Query-string injection is narrower on this app's Express version (5,
// default "simple" parser) — bracket notation like ?car[$ne]=x does NOT
// nest into an object (that needs the "extended"/qs parser Express 5 no
// longer defaults to). But a *repeated* query key (?car=a&car=b) still
// becomes an array, and Mongoose passes an array filter value through to
// MongoDB, which treats it as an implicit $in — so a client can still
// broaden a single-id filter into a multi-id one without any bracket
// notation. That's the technique used below for the GET routes.
test.describe("NoSQL injection guards", () => {
  test.beforeAll(() => asSam());

  test("POST /api/wishlist rejects an operator object as model", async () => {
    try {
      await axios.post(`${API}/wishlist`, { model: { $ne: null } });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
    }
  });

  test("DELETE /api/wishlist rejects an operator object as model", async () => {
    try {
      await axios.delete(`${API}/wishlist`, { data: { model: { $ne: null } } });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
    }
  });

  test("DELETE /api/follows rejects an operator object as followee", async () => {
    try {
      await axios.delete(`${API}/follows`, { data: { followee: { $ne: null } } });
      throw new Error("should have 400'd");
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
    }
  });

  test("GET /api/ownerships ignores a repeated ?car= turning into an implicit $in", async () => {
    // ?car=<civic-id>&car=<impala-id> parses to req.query.car = [civicId, impalaId].
    // Unguarded, Mongo treats that array as $in, so a caller scoped to one
    // car's ownerships gets a second car's ownerships bundled in too.
    // Seed a fresh ownership on Impala (Civic already has one via fixtures)
    // so the two possible outcomes are distinguishable: real $in over
    // [civic, impala] -> exactly those two; the guard's "ignore the invalid
    // shape, fall back to no filter" -> every ownership, a strictly larger set.
    const { data: newOwnership } = await axios.post(`${API}/ownerships`, {
      car: FIXTURES.cars.impala,
      owner: FIXTURES.users.alex,
    });
    try {
      const { data: unfiltered } = await axios.get(`${API}/ownerships`);
      const { data: withArray } = await axios.get(`${API}/ownerships`, {
        params: { car: [FIXTURES.cars.civic, FIXTURES.cars.impala] },
      });
      expect(withArray.length).toBe(unfiltered.length);
      expect(unfiltered.length).toBeGreaterThan(2);
    } finally {
      await axios.delete(`${API}/ownerships/${newOwnership._id}`).catch(() => {});
    }
  });

  test("model page ?userId= ignores an array value turning into an implicit $in", async () => {
    // Seed a wishlist item for Civic from Sam, so an unguarded array value
    // that happens to include Sam's id alongside a bogus one would still
    // leak Sam's item back to a caller not claiming to be Sam specifically.
    await axios.post(`${API}/wishlist`, { model: FIXTURES.models.civic }).catch(() => {});
    try {
      const res = await axios.get(`${API}/models/Honda/Civic`, {
        params: { userId: ["000000000000000000000000", FIXTURES.users.sam] },
      });
      // The guard only accepts a single string id, so an array collapses to
      // "no userId provided" rather than matching via implicit $in.
      expect(res.data.wishlistItem).toBeFalsy();
    } finally {
      await axios.delete(`${API}/wishlist`, { data: { model: FIXTURES.models.civic } }).catch(() => {});
    }
  });
});
