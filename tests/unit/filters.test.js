import { describe, it, expect } from "vitest";
import {
  applyRestaurantFilters,
  getCuisineFilterOptions,
  getRatingValue,
  getDeliveryMinutes,
  restaurantMatchesOffer,
  DEFAULT_FILTERS
} from "../../src/App.jsx";
import { restaurants, kfc, mcdonalds, bholliJuice, greeno } from "./fixtures.js";

describe("getRatingValue", () => {
  it("parses a string rating to a number", () => {
    expect(getRatingValue({ rating: "4.7" })).toBe(4.7);
  });
  it("defaults to 0 for a missing/invalid rating", () => {
    expect(getRatingValue({})).toBe(0);
    expect(getRatingValue({ rating: "N/A" })).toBe(0);
  });
});

describe("getDeliveryMinutes", () => {
  it("prefers the numeric deliveryMinutes field", () => {
    expect(getDeliveryMinutes({ deliveryMinutes: 25 })).toBe(25);
  });
  it("extracts minutes from a time string", () => {
    expect(getDeliveryMinutes({ time: "From 15 min" })).toBe(15);
  });
  it("returns a large sentinel when no time info exists", () => {
    expect(getDeliveryMinutes({})).toBe(999);
  });
});

describe("applyRestaurantFilters", () => {
  it("returns the same set (default order) with default filters", () => {
    const result = applyRestaurantFilters(restaurants, DEFAULT_FILTERS);
    expect(result).toHaveLength(restaurants.length);
    expect(result[0]).toBe(restaurants[0]);
  });

  it("drops restaurants under 4 stars when rating4 is set", () => {
    const result = applyRestaurantFilters(restaurants, { ...DEFAULT_FILTERS, rating4: true });
    expect(result).toContain(kfc);
    expect(result).not.toContain(mcdonalds); // 3.8 stars
  });

  it("filters by cuisine term", () => {
    const result = applyRestaurantFilters(restaurants, { ...DEFAULT_FILTERS, cuisines: ["Healthy Food"] });
    expect(result).toContain(bholliJuice);
    expect(result).toContain(greeno);
    expect(result).not.toContain(kfc);
  });

  it("sorts by fastest delivery", () => {
    const result = applyRestaurantFilters(restaurants, { ...DEFAULT_FILTERS, sort: "Fastest delivery" });
    const minutes = result.map(getDeliveryMinutes);
    const sorted = [...minutes].sort((a, b) => a - b);
    expect(minutes).toEqual(sorted);
  });

  it("sorts top rated highest first", () => {
    const result = applyRestaurantFilters(restaurants, { ...DEFAULT_FILTERS, sort: "Top rated" });
    expect(result[0]).toBe(greeno); // 4.9
  });

  it("keeps only super restaurants / very-high-rated when superRestaurant is set", () => {
    const result = applyRestaurantFilters(restaurants, { ...DEFAULT_FILTERS, superRestaurant: true });
    expect(result).toContain(greeno);
    expect(result).not.toContain(mcdonalds);
  });
});

describe("restaurantMatchesOffer", () => {
  it("matches free delivery by fee text or zero fee", () => {
    expect(restaurantMatchesOffer(kfc, "Free delivery", 1)).toBe(true);
    expect(restaurantMatchesOffer(greeno, "Free delivery", 1)).toBe(true);
    expect(restaurantMatchesOffer(mcdonalds, "Free delivery", 1)).toBe(false);
  });

  it("matches deals by tag presence", () => {
    expect(restaurantMatchesOffer(bholliJuice, "Deals", 1)).toBe(true);
    expect(restaurantMatchesOffer(kfc, "Deals", 1)).toBe(false);
  });
});

describe("getCuisineFilterOptions", () => {
  it("returns distinct cuisine labels ranked by frequency", () => {
    const options = getCuisineFilterOptions(restaurants);
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContain("Beverages");
    // excluded generic buckets should never appear
    expect(options).not.toContain("Deals");
  });

  it("falls back to defaults for empty input", () => {
    const options = getCuisineFilterOptions([]);
    expect(options).toContain("Burgers");
  });
});
