import { test, expect } from "@playwright/test";
import {
  ADDRESS_STORAGE_KEY,
  PROFILE_ID,
  SESSION_STORAGE_KEY,
  SESSION_TOKEN,
  VERIFICATION_CODE,
  blockRemoteImages,
  mockAccountApi,
  seedAddress,
  seedSession
} from "./gateway.js";

/*
 * Accounts and the delivery address.
 *
 * The header used to render two string literals: the name "Afzal" and the
 * address "Flat 23E Lahore". These specs are about them being state now — a real
 * sign-in puts a real name there, a chosen address puts a real address there,
 * and when there is neither the header says so instead of making one up.
 */

test.use({ serviceWorkers: "block" });

const accountButton = (page) => page.locator(".account-button");
const locationChip = (page) => page.locator(".location-chip");

test.describe("accounts", () => {
  test("offers a sign in rather than claiming somebody is signed in", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page);

    await page.goto("/");

    await expect(accountButton(page)).toHaveText(/sign in/i);
    await expect(page.locator(".site-header")).not.toContainText("Afzal");
  });

  test("signs in, shows the name in the header, and signs out again", async ({ page }) => {
    await blockRemoteImages(page);
    const api = await mockAccountApi(page);

    await page.goto("/");
    await accountButton(page).click();

    await page.getByPlaceholder("you@example.com").fill("afzal@example.com");
    await page.getByPlaceholder("Your password").fill("Doc#2026");
    await page.locator(".auth-submit").click();

    await expect(page.locator(".auth-overlay")).toHaveCount(0);
    await expect(accountButton(page)).toHaveText(/afzal/i);
    expect(api.logins).toBe(1);

    // The session carries the customer profile id, because that is the id an
    // order is keyed to upstream.
    const session = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY));
    expect(session.token).toBe(SESSION_TOKEN);
    expect(session.profileId).toBe(PROFILE_ID);

    await accountButton(page).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(accountButton(page)).toHaveText(/sign in/i);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();
  });

  test("keeps the signed-in name across a reload", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page);
    await seedSession(page);

    await page.goto("/");
    await expect(accountButton(page)).toHaveText(/afzal/i);

    await page.reload();
    await expect(accountButton(page)).toHaveText(/afzal/i);
  });

  test("ignores a session the server has already expired", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page);
    await seedSession(page, { expiresAt: Date.parse("2020-01-01T00:00:00Z") });

    await page.goto("/");

    await expect(accountButton(page)).toHaveText(/sign in/i);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();
  });

  test("says what went wrong instead of signing nobody in", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page);

    await page.goto("/");
    await accountButton(page).click();
    await page.getByPlaceholder("you@example.com").fill("afzal@example.com");
    await page.getByPlaceholder("Your password").fill("not-the-password");
    await page.locator(".auth-submit").click();

    await expect(page.locator(".auth-error")).toContainText(/don't match/i);
    await expect(page.locator(".auth-overlay")).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();
  });

  test("says it cannot reach bringit rather than failing silently", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page, { offline: true });

    await page.goto("/");
    await accountButton(page).click();
    await page.getByPlaceholder("you@example.com").fill("afzal@example.com");
    await page.getByPlaceholder("Your password").fill("Doc#2026");
    await page.locator(".auth-submit").click();

    await expect(page.locator(".auth-error")).toContainText(/can't reach bringit/i);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();
  });

  test("creates an account through the verification step", async ({ page }) => {
    await blockRemoteImages(page);
    const api = await mockAccountApi(page, { verified: false, password: "Doc#2026" });

    await page.goto("/");
    await accountButton(page).click();
    await page.getByRole("tab", { name: /create account/i }).click();

    await page.getByPlaceholder("Your name").fill("Afzal");
    await page.getByPlaceholder("you@example.com").fill("afzal@example.com");
    await page.getByPlaceholder("+92 300 0000000").fill("+923009998888");
    await page.getByPlaceholder("Pick a password").fill("Doc#2026");
    await page.locator(".auth-submit").click();

    // Register leaves the account PENDING_VERIFICATION, so there is a code step
    // before anybody is signed in.
    await expect(page.getByRole("heading", { name: /check your phone/i })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();

    await page.getByPlaceholder("6-digit code").fill("000000");
    await page.locator(".auth-submit").click();
    await expect(page.locator(".auth-error")).toContainText(/code isn't right/i);

    await page.getByPlaceholder("6-digit code").fill(VERIFICATION_CODE);
    await page.locator(".auth-submit").click();

    await expect(page.locator(".auth-overlay")).toHaveCount(0);
    await expect(accountButton(page)).toHaveText(/afzal/i);
    expect(api.profiles).toBe(1);
  });
});

test.describe("delivery address", () => {
  test("admits it has no location instead of showing a made-up one", async ({ page }) => {
    await blockRemoteImages(page);

    await page.goto("/");

    await expect(locationChip(page)).toHaveText("Set your location");
    await expect(page.locator(".site-header")).not.toContainText("Flat 23E");
    // The "you're viewing a generic location" tip is now a true statement about
    // a real state, so it is the one case where it shows.
    await expect(page.locator(".location-tip")).toBeVisible();
  });

  test("sets an address and shows it in the header", async ({ page }) => {
    await blockRemoteImages(page);

    await page.goto("/");
    await locationChip(page).click();

    await page.getByRole("button", { name: /add an address/i }).click();
    await page.getByPlaceholder("House or flat, street").fill("12-C Main Boulevard");
    await page.getByPlaceholder("Gulberg, Model Town, …").fill("Gulberg III");
    await page.getByPlaceholder("Home, Work").fill("Home");
    await page.locator(".auth-submit").click();
    await page.locator(".auth-close").click();

    await expect(locationChip(page)).toHaveText("12-C Main Boulevard, Gulberg III");
    await expect(page.locator(".location-tip")).toHaveCount(0);

    const book = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), ADDRESS_STORAGE_KEY));
    expect(book.addresses).toHaveLength(1);
    expect(book.selectedId).toBe(book.addresses[0].id);
  });

  test("keeps several addresses and switches between them", async ({ page }) => {
    await blockRemoteImages(page);
    await seedAddress(page);

    await page.goto("/");
    await expect(locationChip(page)).toHaveText("12-C Main Boulevard, Gulberg III");

    await locationChip(page).click();
    await page.getByRole("button", { name: /add an address/i }).click();
    await page.getByPlaceholder("House or flat, street").fill("4 Shami Road");
    await page.getByPlaceholder("Gulberg, Model Town, …").fill("Cantt");
    await page.getByPlaceholder("Home, Work").fill("Work");
    await page.locator(".auth-submit").click();
    await page.locator(".auth-close").click();

    await expect(locationChip(page)).toHaveText("4 Shami Road, Cantt");

    // Both are kept, and picking one closes the panel and updates the chip.
    await locationChip(page).click();
    await expect(page.locator(".address-list li")).toHaveCount(2);
    await page.locator(".address-pick", { hasText: "Home" }).click();

    await expect(page.locator(".auth-overlay")).toHaveCount(0);
    await expect(locationChip(page)).toHaveText("12-C Main Boulevard, Gulberg III");
  });

  test("removes an address and falls back to one that still exists", async ({ page }) => {
    await blockRemoteImages(page);
    await seedAddress(page);

    await page.goto("/");
    await locationChip(page).click();
    await page.getByRole("button", { name: /remove home/i }).click();

    await expect(page.locator(".address-list")).toHaveCount(0);
    await page.locator(".auth-close").click();
    await expect(locationChip(page)).toHaveText("Set your location");
  });

  test("hands the chosen address and the signed-in contact to checkout", async ({ page }) => {
    await blockRemoteImages(page);
    await mockAccountApi(page);
    await seedSession(page);
    await seedAddress(page);

    await page.goto("/checkout");

    // Nothing is typed in: the form is seeded from the account and the address.
    await expect(page.getByPlaceholder("Your name")).toHaveValue("Afzal");
    await expect(page.getByPlaceholder("+92 300 0000000")).toHaveValue("+923009998888");
    await expect(page.locator(".delivery-form input").first()).toHaveValue("12-C Main Boulevard");
  });
});
