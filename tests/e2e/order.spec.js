import { test, expect } from "@playwright/test";
import { ORDER_CODE, blockRemoteImages, mockOrderGateway, seedStoredOrder } from "./gateway.js";

/*
 * Order tracking against a (mocked) gateway.
 *
 * What these specs are really about is the honesty of the screen: the stage
 * shown is the stage the server reported, a gateway we cannot reach says so
 * instead of animating, and a cancelled order reads as cancelled.
 *
 * Each spec seeds a server-accepted order into local storage and lands straight
 * on /order, and drives the 10-second poll with Playwright's clock rather than
 * real time, so the whole file runs in seconds and never races.
 */

// The service worker sits between the page and the network; blocking it keeps
// route interception deterministic.
test.use({ serviceWorkers: "block" });

const activeStage = (page) => page.locator(".ot-step.active .ot-step-body strong");

test.describe("order tracking", () => {
  test("renders the stage the server reports, and refreshes it on the poll", async ({ page }) => {
    await blockRemoteImages(page);
    await page.clock.install();
    await seedStoredOrder(page);
    const gateway = await mockOrderGateway(page, { stage: "placed" });

    await page.goto("/order");

    await expect(page.locator(".ot-order-code")).toContainText(ORDER_CODE);
    await expect(page.locator(".ot-live-pill")).toHaveText(/live/i);
    await expect(activeStage(page)).toHaveText("Order placed");
    expect(gateway.reads).toBe(1);

    // The kitchen moves on. Nothing in the client knows that until it asks.
    gateway.stage = "preparing";
    gateway.status = "RESTAURANT_PREPARING";
    gateway.history = [{ stage: "placed" }, { stage: "confirmed" }, { stage: "preparing" }];

    await page.clock.runFor(11_000);

    await expect(activeStage(page)).toHaveText("Preparing your food");
    await expect(page.locator(".ot-step.done")).toHaveCount(2);
    expect(gateway.reads).toBeGreaterThan(1);
  });

  test("stops polling once the order is delivered", async ({ page }) => {
    await blockRemoteImages(page);
    await page.clock.install();
    await seedStoredOrder(page, { stage: "on_the_way" });
    const gateway = await mockOrderGateway(page, {
      stage: "delivered",
      status: "DELIVERED",
      history: [{ stage: "placed" }, { stage: "confirmed" }, { stage: "preparing" }, { stage: "on_the_way" }, { stage: "delivered" }]
    });

    await page.goto("/order");

    await expect(page.locator(".ot-status-card.delivered")).toBeVisible();
    await expect(page.locator(".ot-rating")).toBeVisible();
    const readsAtDelivery = gateway.reads;

    // A full minute of (virtual) time later, nothing more has been asked for.
    await page.clock.runFor(60_000);
    expect(gateway.reads).toBe(readsAtDelivery);
  });

  test("says it cannot reach bringit instead of inventing progress", async ({ page }) => {
    await blockRemoteImages(page);
    await seedStoredOrder(page);
    await mockOrderGateway(page, { offline: true });

    await page.goto("/order");

    await expect(page.locator(".ot-notice.warn")).toContainText(/can't reach bringit right now, retrying/i);
    await expect(page.locator(".ot-live-pill")).toHaveText(/last known/i);
    // Still the last stage the server actually reported. Nothing advanced.
    await expect(activeStage(page)).toHaveText("Order placed");
  });

  test("recovers on its own once the gateway answers again", async ({ page }) => {
    await blockRemoteImages(page);
    await page.clock.install();
    await seedStoredOrder(page);
    const gateway = await mockOrderGateway(page, { offline: true });

    await page.goto("/order");
    await expect(page.locator(".ot-notice.warn")).toBeVisible();

    gateway.offline = false;
    gateway.stage = "on_the_way";
    gateway.history = [{ stage: "placed" }, { stage: "confirmed" }, { stage: "preparing" }, { stage: "on_the_way" }];

    // First retry is one poll interval after the failure.
    await page.clock.runFor(11_000);

    await expect(page.locator(".ot-notice.warn")).toHaveCount(0);
    await expect(page.locator(".ot-live-pill")).toHaveText(/live/i);
    await expect(activeStage(page)).toHaveText("On the way");
  });

  test("labels an order left behind by the old simulated checkout as a demo", async ({ page }) => {
    await blockRemoteImages(page);
    // Exactly what the pre-gateway flow wrote: a locally minted code, no token,
    // no server stage.
    await seedStoredOrder(page, { code: "BRG-OLD1", token: undefined, stage: undefined, status: undefined });
    await mockOrderGateway(page);

    await page.goto("/order");

    await expect(page.locator(".ot-notice.demo")).toContainText(/never sent to bringit/i);
    await expect(page.locator(".ot-live-pill")).toHaveCount(0);
  });

  test("renders a cancelled order as cancelled rather than falling back to placed", async ({ page }) => {
    await blockRemoteImages(page);
    await seedStoredOrder(page, { stage: "confirmed", status: "RESTAURANT_CONFIRMED" });
    await mockOrderGateway(page, {
      stage: "confirmed",
      status: "RESTAURANT_CONFIRMED",
      history: [{ stage: "placed" }, { stage: "confirmed" }]
    });

    await page.goto("/order");
    await expect(activeStage(page)).toHaveText("Restaurant confirmed");

    await page.getByRole("button", { name: /cancel order/i }).click();

    await expect(page.locator(".ot-status-card.cancelled")).toBeVisible();
    await expect(page.locator(".ot-status-eyebrow")).toHaveText("Cancelled");
    await expect(page.locator(".ot-step.cancelled .ot-step-body strong")).toHaveText("Order cancelled");
    // The journey stops where it stopped: stages that will never happen are not
    // listed as still to come.
    await expect(page.locator(".ot-step.todo")).toHaveCount(0);
  });

  test("shows the gateway's reason when a cancellation comes too late", async ({ page }) => {
    await blockRemoteImages(page);
    await seedStoredOrder(page, { stage: "confirmed" });
    await mockOrderGateway(page, { stage: "confirmed", cancelTooLate: true });

    await page.goto("/order");
    await page.getByRole("button", { name: /cancel order/i }).click();

    await expect(page.locator(".ot-cancel-error")).toContainText(/already/i);
    await expect(page.locator(".ot-status-card.cancelled")).toHaveCount(0);
  });
});
