import { describe, it, expect } from "vitest";
import {
  getSearchText,
  getSearchResults,
  getBholiSearchScore,
  getResultsCountLabel
} from "../../src/App.jsx";
import { restaurants, bholliJuice, kfc, mcdonalds, greeno } from "./fixtures.js";

describe("getSearchText", () => {
  it("flattens name, categories and menu categories into lowercase searchable text", () => {
    const text = getSearchText(bholliJuice);
    expect(text).toContain("bholli juice");
    expect(text).toContain("beverages");
    expect(text).toContain("juice");
    expect(text).toBe(text.toLowerCase());
  });
});

describe("getSearchResults", () => {
  it("returns all items for an empty query", () => {
    expect(getSearchResults("", restaurants)).toBe(restaurants);
    expect(getSearchResults("   ", restaurants)).toBe(restaurants);
  });

  it("filters to exact substring matches for a normal query", () => {
    const results = getSearchResults("kfc", restaurants);
    expect(results).toEqual([kfc]);
  });

  it("falls back to all items when nothing matches", () => {
    const results = getSearchResults("zzzznomatch", restaurants);
    expect(results).toEqual(restaurants);
  });

  it("ranks Bholli-type juice bars first for a 'bhol' query and drops fast-food-only spots", () => {
    const results = getSearchResults("bholi", restaurants);
    expect(results[0]).toBe(bholliJuice);
    // healthy juice/shake shops survive the curated ranking...
    expect(results).toContain(greeno);
    // ...while burger-only chains are filtered out below the score threshold
    expect(results).not.toContain(mcdonalds);
    expect(results).not.toContain(kfc);
  });
});

describe("getBholiSearchScore", () => {
  it("scores a Bholli juice shop far higher than a burger chain", () => {
    expect(getBholiSearchScore(bholliJuice, "bhol")).toBeGreaterThan(
      getBholiSearchScore(mcdonalds, "bhol")
    );
  });
});

describe("getResultsCountLabel", () => {
  it("reports the real result count for normal queries", () => {
    expect(getResultsCountLabel("kfc", [kfc])).toBe("1 Restaurants found");
  });

  it("uses the curated count for the bholi demo query", () => {
    expect(getResultsCountLabel("bholi", restaurants)).toBe("128 Restaurants found");
  });
});
