import { describe, it, expect } from "vitest";
import { formatPrice, slugify, getRestaurantSlug } from "../../src/App.jsx";

describe("formatPrice", () => {
  it("formats whole numbers with no decimals and a thousands separator", () => {
    expect(formatPrice(1500)).toBe("Rs. 1,500");
  });

  it("pads fractional amounts to two decimals", () => {
    expect(formatPrice(297.5)).toBe("Rs. 297.50");
    expect(formatPrice(297.55)).toBe("Rs. 297.55");
  });

  it("coerces invalid input to zero rather than crashing", () => {
    expect(formatPrice(undefined)).toBe("Rs. 0");
    expect(formatPrice("not-a-number")).toBe("Rs. 0");
    expect(formatPrice(null)).toBe("Rs. 0");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("KFC - Cavalry")).toBe("kfc-cavalry");
  });

  it("expands ampersands to 'and'", () => {
    expect(slugify("Bholli Juice & Dry Fruit")).toBe("bholli-juice-and-dry-fruit");
  });

  it("trims leading/trailing separators and falls back to 'bringit'", () => {
    expect(slugify("  ")).toBe("bringit");
    expect(slugify("!!!")).toBe("bringit");
    expect(slugify("---hello---")).toBe("hello");
  });
});

describe("getRestaurantSlug", () => {
  it("combines name and identifier into a stable slug", () => {
    const slug = getRestaurantSlug({ name: "KFC - Cavalry", id: "kfc" });
    expect(slug).toBe("kfc-cavalry-kfc");
  });

  it("prefers vendorCode when present", () => {
    const slug = getRestaurantSlug({ name: "KFC", vendorCode: "V123" });
    expect(slug).toBe("kfc-v123");
  });
});
