import { test, expect } from "@playwright/test";
import { ORDER_CODE, ORDER_TOKEN, ORDERS_STORAGE_KEY, mockOrderGateway } from "./gateway.js";

const CART_KEY = "bringit-cart-v1";

// Open the first restaurant, then the first menu item's modal, and add it.
async function addFirstItemToCart(page) {
  await page.goto("/");
  await page.locator("article.restaurant-card").first().click();
  await expect(page.locator(".restaurant-page h1")).toBeVisible();

  const product = page.locator("article.product-card").first();
  await expect(product).toBeVisible();
  await product.click();

  const modal = page.locator(".item-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /add to cart/i }).click();
  await expect(modal).toBeHidden();
}

test.describe("cart + checkout", () => {
  test("adds an item, updates the header badge and persists to localStorage", async ({ page }) => {
    await addFirstItemToCart(page);

    const badge = page.locator(".cart-button span");
    await expect(badge).toHaveText("1");

    const stored = await page.evaluate((key) => localStorage.getItem(key), CART_KEY);
    const parsed = JSON.parse(stored);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].qty).toBe(1);
    expect(parsed[0].name).toBeTruthy();
  });

  test("adding the same item twice increments quantity, not line count", async ({ page }) => {
    await addFirstItemToCart(page);
    // add the same product again
    await page.locator("article.product-card").first().click();
    await page.locator(".item-modal").getByRole("button", { name: /add to cart/i }).click();

    await expect(page.locator(".cart-button span")).toHaveText("2");
    const parsed = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), CART_KEY));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].qty).toBe(2);
  });

  test("cart survives a page reload", async ({ page }) => {
    await addFirstItemToCart(page);
    await expect(page.locator(".cart-button span")).toHaveText("1");

    await page.reload();
    await expect(page.locator(".cart-button span")).toHaveText("1");
  });

  test("decrementing quantity to zero removes the line item", async ({ page }) => {
    await addFirstItemToCart(page);
    // navigate to the cart page via the header cart button
    await page.locator(".cart-button").click();
    await expect(page).toHaveURL(/\/cart/);

    // the minus control drops qty to 0 -> line removed -> empty cart state
    await page.locator(".qty-small button").first().click();
    await expect(page.locator(".cart-button span")).toHaveCount(0);
    const parsed = JSON.parse(await page.evaluate(() => localStorage.getItem("bringit-cart-v1")));
    expect(parsed).toHaveLength(0);
  });

  test("completes the checkout -> delivery -> place order flow", async ({ page }) => {
    // Placement is a real POST to the order gateway now, so the gateway is
    // mocked and the contact fields it requires are filled in.
    const gateway = await mockOrderGateway(page);

    await addFirstItemToCart(page);
    await page.locator(".cart-button").click();
    await expect(page).toHaveURL(/\/cart/);

    await page.getByRole("button", { name: /proceed to checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole("heading", { name: /delivery details/i })).toBeVisible();

    await page.getByPlaceholder("Your name").fill("Afzal");
    await page.getByPlaceholder("+92 300 0000000").fill("+92 300 1234567");
    await page.getByRole("button", { name: /place order/i }).click();
    // order celebration overlay flashes on success (it self-dismisses after ~1.4s)
    await expect(page.locator(".order-celebration")).toBeAttached();
    await expect(page).toHaveURL(/\/order/);
    expect(gateway.placements).toBe(1);

    // The code on screen is the server's, not a locally minted one, and the
    // token it handed back is stored next to it — it is the only credential that
    // can read this order back, so losing it loses the order.
    await expect(page.locator(".ot-order-code")).toContainText(ORDER_CODE);
    const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), ORDERS_STORAGE_KEY));
    expect(stored[0].code).toBe(ORDER_CODE);
    expect(stored[0].token).toBe(ORDER_TOKEN);
  });

  test("will not place an order without the contact details the gateway needs", async ({ page }) => {
    await mockOrderGateway(page);
    await addFirstItemToCart(page);
    await page.locator(".cart-button").click();
    await page.getByRole("button", { name: /proceed to checkout/i }).click();

    const placeOrder = page.getByRole("button", { name: /place order/i });
    await expect(placeOrder).toBeDisabled();
    await page.getByPlaceholder("Your name").fill("Afzal");
    await expect(placeOrder).toBeDisabled();
    await page.getByPlaceholder("+92 300 0000000").fill("+92 300 1234567");
    await expect(placeOrder).toBeEnabled();
  });

  test("keeps the cart and stays on checkout when the gateway is unreachable", async ({ page }) => {
    await mockOrderGateway(page, { offline: true });

    await addFirstItemToCart(page);
    await page.locator(".cart-button").click();
    await page.getByRole("button", { name: /proceed to checkout/i }).click();
    await page.getByPlaceholder("Your name").fill("Afzal");
    await page.getByPlaceholder("+92 300 0000000").fill("+92 300 1234567");
    await page.getByRole("button", { name: /place order/i }).click();

    // An order the server never accepted must never look placed: no tracking
    // screen, no confetti, no stored order — and the cart is left intact.
    await expect(page.locator(".checkout-error")).toContainText(/can't reach bringit/i);
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator(".order-celebration")).toHaveCount(0);
    await expect(page.locator(".cart-button span")).toHaveText("1");
    expect(await page.evaluate((key) => localStorage.getItem(key), ORDERS_STORAGE_KEY)).toBeNull();
  });
});
