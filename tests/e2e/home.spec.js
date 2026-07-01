import { test, expect } from "@playwright/test";

test.describe("home + discovery", () => {
  test("renders the storefront shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/bringit/i);
    // hero promo is visible
    await expect(page.locator(".site-header")).toBeVisible();
    // restaurant cards are rendered from the seed data
    const cards = page.locator("article.restaurant-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("serves a valid PWA manifest", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(href);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name || manifest.short_name).toBeTruthy();
  });

  test("search overlay finds restaurants and routes to results", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /search for restaurants/i }).click();

    const input = page.locator(".search-overlay input").first();
    await expect(input).toBeVisible();
    await input.fill("burger");
    await input.press("Enter");

    await expect(page).toHaveURL(/\/search\//);
    await expect(page.locator("h1.result-title")).toContainText(/Restaurants found/i);
    await expect(page.locator("article.restaurant-card").first()).toBeVisible();
  });

  test("a suggested search chip drives a query", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /search for restaurants/i }).click();
    const chip = page.locator(".search-overlay .recent-select").first();
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect(page).toHaveURL(/\/search\//);
    await expect(page.locator("h1.result-title")).toContainText(/Restaurants found/i);
  });
});
