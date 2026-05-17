// Fixed fixture IDs — stable across runs so tests can reference them by constant.
// These match what the seed API endpoint inserts into carsDB_test.
export const FIXTURES = {
  users: {
    sam:  "aaaaaaaaaaaaaaaaaaaaaaaa",
    alex: "bbbbbbbbbbbbbbbbbbbbbbbb",
  },
  cars: {
    civic:  "cccccccccccccccccccccccc",
    impala: "dddddddddddddddddddddddd",
    tesla:  "eeeeeeeeeeeeeeeeeeeeeeee",
  },
};
