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
  manufacturers: {
    honda:     "111111111111111111111111",
    chevrolet: "222222222222222222222222",
    tesla:     "333333333333333333333333",
    toyota:    "444444444444444444444444",
    ford:      "555555555555555555555555",
    porsche:   "666666666666666666666666",
    subaru:    "777777777777777777777777",
  },
  models: {
    civic:       "100000000000000000000001",
    impala:      "100000000000000000000002",
    model3:      "100000000000000000000003",
    supra:       "100000000000000000000004",
    mustang:     "100000000000000000000005",
    porsche911:  "100000000000000000000006",
    wrx:         "100000000000000000000007",
    camaro:      "100000000000000000000008",
    landCruiser: "100000000000000000000009",
    modelS:      "10000000000000000000000a",
    accord:      "100000000000000000000101",
  },
};
