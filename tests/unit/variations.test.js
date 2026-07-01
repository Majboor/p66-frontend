import { describe, it, expect } from "vitest";
import {
  getDefaultVariationId,
  getSelectedVariation,
  getVariationPricing,
  getVariationLabel,
  getMenuTabs
} from "../../src/App.jsx";
import { juiceItem, noVariationItem } from "./fixtures.js";

describe("getDefaultVariationId", () => {
  it("returns the first variation id when present", () => {
    expect(getDefaultVariationId(juiceItem)).toBe("small");
  });
  it("returns empty string when there are no variations", () => {
    expect(getDefaultVariationId(noVariationItem)).toBe("");
    expect(getDefaultVariationId(undefined)).toBe("");
  });
});

describe("getSelectedVariation", () => {
  it("finds the matching variation by id", () => {
    expect(getSelectedVariation(juiceItem, "large").variationId).toBe("large");
  });
  it("falls back to the first variation for an unknown id", () => {
    expect(getSelectedVariation(juiceItem, "nope").variationId).toBe("small");
  });
  it("returns null when the item has no variations", () => {
    expect(getSelectedVariation(noVariationItem, "x")).toBeNull();
  });
});

describe("getVariationPricing", () => {
  it("applies a 15% discount to the old price when the item is discounted", () => {
    const variation = getSelectedVariation(juiceItem, "large");
    const pricing = getVariationPricing(juiceItem, variation);
    // 467.5 * 0.85 = 397.375 -> rounded to 397.38
    expect(pricing.oldPrice).toBe(467.5);
    expect(pricing.price).toBe(397.38);
    expect(pricing.price).toBeLessThan(pricing.oldPrice);
  });

  it("falls back to item price when no variation is supplied", () => {
    const pricing = getVariationPricing(noVariationItem, null);
    expect(pricing.price).toBe(297.5);
    expect(pricing.oldPrice).toBe(350);
  });
});

describe("getVariationLabel", () => {
  it("uses the variation name when it differs from the item name", () => {
    expect(getVariationLabel(juiceItem, juiceItem.variations[1], 1)).toBe("Large");
  });
  it("falls back to a positional option label", () => {
    const sameName = { name: "Falsa Juice" };
    expect(getVariationLabel({ name: "Falsa Juice" }, sameName, 2)).toBe("Option 3");
  });
  it("returns empty string for a missing variation", () => {
    expect(getVariationLabel(juiceItem, null)).toBe("");
  });
});

describe("getMenuTabs", () => {
  it("builds tabs from menuCategories with counts", () => {
    const tabs = getMenuTabs({ menuCategories: [{ name: "Juice", itemCount: 14 }] });
    expect(tabs[0]).toBe("Juice (14)");
  });
  it("returns a default tab set when there are no menu categories", () => {
    const tabs = getMenuTabs({});
    expect(tabs).toContain("Popular (6)");
  });
});
