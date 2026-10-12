import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OrderApiError,
  cancelOrder,
  describeOrderApiError,
  fetchOrder,
  getRetryDelayMs,
  isPermanentRejection,
  isUnreachable,
  toTimestamp
} from "../../src/api/orders.js";
import {
  CANCELLED_STAGE,
  ORDER_STAGES,
  buildOrderRequest,
  createOrderRecord,
  getStageFraction,
  getStageIndex,
  isCancelledStage,
  isFinalStage,
  isRealOrder,
  mergeServerOrder,
  normalizeStage,
  readOrders,
  submitOrder
} from "../../src/OrderTracking.jsx";

const ORDERS_KEY = "bringit-orders-v1";

// A localStorage good enough for the order index: the real thing is a browser
// API and these tests deliberately run without a DOM.
function memoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => entries.clear()
  };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json; charset=utf-8" },
  json: async () => body
});

// The SPA-fallback trap: a static host rewriting an unknown path to index.html
// answers with HTTP 200 and HTML, so `ok` is true and `.json()` is what blows up.
const appShellResponse = () => ({
  ok: true,
  status: 200,
  headers: { get: () => "text/html; charset=utf-8" },
  json: async () => {
    throw new SyntaxError("Unexpected token '<'");
  }
});

const networkFailure = () => Promise.reject(new TypeError("Failed to fetch"));

const PLACED_PAYLOAD = {
  order_code: "BRG-7Q2M4X",
  order_token: "tok_f4c3b2a1",
  status: "PLACED_BY_CUSTOMER",
  stage: "placed",
  placed_at: "2026-10-12T09:15:00.000Z",
  eta_minutes: 32,
  totals: { subtotal: 1190, delivery_fee: 120, total: 1310 },
  items: [{ name: "Falsa Juice", qty: 2, unit_price: 297.5, line_total: 595 }]
};

const CART = [
  {
    id: "falsa-small",
    productId: "falsa",
    variationId: "small",
    variationName: "Small",
    name: "Falsa Juice",
    price: 297.5,
    qty: 2,
    image: "falsa.jpg",
    restaurantId: "bholli",
    restaurantName: "Bholli Juice & Dry Fruit - Liberty"
  }
];

const META = {
  brandSlug: "bholli",
  restaurantName: "Bholli Juice & Dry Fruit - Liberty",
  customerName: "Afzal",
  customerPhone: "+92 300 1234567",
  addressLine1: "Flat 23E",
  addressArea: "Gulberg",
  addressCity: "Lahore",
  addressUnit: "3rd floor",
  addressNote: "Ring the bell",
  paymentLabel: "Cash on delivery",
  etaMinutes: 25
};

beforeEach(() => {
  globalThis.window = { localStorage: memoryStorage() };
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
});

describe("stage mapping", () => {
  it("keeps the five customer stages the tracker already used, in order", () => {
    expect(ORDER_STAGES.map((stage) => stage.key)).toEqual([
      "placed",
      "confirmed",
      "preparing",
      "on_the_way",
      "delivered"
    ]);
    ORDER_STAGES.forEach((stage, index) => {
      expect(getStageIndex(stage.key)).toBe(index);
    });
  });

  it("lowercases what the gateway sends", () => {
    expect(normalizeStage("DELIVERED")).toBe("delivered");
    expect(normalizeStage("On_The_Way")).toBe("on_the_way");
  });

  it("parks an unknown or missing stage at the start rather than promoting it", () => {
    // These are upstream statuses, not customer stages — the gateway maps them,
    // and anything that leaks through must not look like progress.
    expect(normalizeStage("RESTAURANT_PREPARING")).toBe("placed");
    expect(normalizeStage("")).toBe("placed");
    expect(normalizeStage(undefined)).toBe("placed");
    expect(normalizeStage(null)).toBe("placed");
    expect(getStageIndex("who-knows")).toBe(0);
  });

  it("treats only delivered and cancelled as terminal", () => {
    expect(isFinalStage("delivered")).toBe(true);
    expect(isFinalStage("cancelled")).toBe(true);
    expect(isFinalStage("placed")).toBe(false);
    expect(isFinalStage("on_the_way")).toBe(false);
  });

  it("maps a stage to a position on the route instead of elapsed time", () => {
    expect(getStageFraction({ stage: "placed" })).toBe(0);
    expect(getStageFraction({ stage: "preparing" })).toBe(0.5);
    expect(getStageFraction({ stage: "delivered" })).toBe(1);
  });
});

describe("the cancelled stage", () => {
  it("is its own terminal stage, off the five-stage journey", () => {
    expect(CANCELLED_STAGE.key).toBe("cancelled");
    expect(normalizeStage("cancelled")).toBe("cancelled");
    expect(isCancelledStage("cancelled")).toBe(true);
    expect(isCancelledStage("placed")).toBe(false);
    expect(getStageIndex("cancelled")).toBe(-1);
    expect(isFinalStage("cancelled")).toBe(true);
  });

  it("does not fall through to placed when the gateway cancels an order", () => {
    const order = createOrderRecord(PLACED_PAYLOAD, CART, META);
    const cancelledOrder = mergeServerOrder(order, {
      ...PLACED_PAYLOAD,
      status: "CANCELLED",
      stage: "cancelled",
      history: [
        { stage: "placed", at: "2026-10-12T09:15:00.000Z" },
        { stage: "confirmed", at: "2026-10-12T09:17:00.000Z" }
      ]
    });

    expect(cancelledOrder.stage).toBe("cancelled");
    expect(cancelledOrder.status).toBe("CANCELLED");
    expect(isCancelledStage(cancelledOrder.stage)).toBe(true);
    // The courier dot freezes at the furthest stage the order actually reached.
    expect(getStageFraction(cancelledOrder)).toBe(0.25);
  });

  it("keeps a cancelled order with no history at the start of the route", () => {
    expect(getStageFraction({ stage: "cancelled", history: [] })).toBe(0);
  });

  it("surfaces the gateway's 409 instead of swallowing it", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse(409, { error: "too_late", message: "The kitchen has already accepted this order." })
    );

    const error = await cancelOrder("BRG-7Q2M4X", "tok_f4c3b2a1").catch((caught) => caught);

    expect(error).toBeInstanceOf(OrderApiError);
    expect(error.kind).toBe("rejected");
    expect(error.code).toBe("too_late");
    expect(describeOrderApiError(error)).toBe("The kitchen has already accepted this order.");

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("/api/orders/BRG-7Q2M4X/cancel");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: "tok_f4c3b2a1" });
  });
});

describe("placing an order", () => {
  it("sends the gateway's body shape and no prices at all", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(201, PLACED_PAYLOAD));

    await submitOrder(CART, META);

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body).toEqual({
      brand_slug: "bholli",
      fulfilment: "delivery",
      items: [{ menu_item_id: "small", qty: 2, note: "Small" }],
      customer: { name: "Afzal", phone: "+92 300 1234567" },
      address: { line1: "Flat 23E", area: "Gulberg", city: "Lahore", notes: "3rd floor · Ring the bell" }
    });
    // The gateway recomputes money from its own menu; a client-supplied price is
    // ignored by design, so we never send one.
    expect(init.body).not.toMatch(/price/i);
    expect(init.body).not.toMatch(/297\.5/);
  });

  it("uses the menu item id rather than the cart line id", () => {
    const request = buildOrderRequest(
      [{ id: "falsa-small", productId: "falsa", variationId: "", qty: 1 }],
      { brandSlug: "bholli" }
    );
    expect(request.items).toEqual([{ menu_item_id: "falsa", qty: 1 }]);
  });

  it("drops the address for a takeaway order", () => {
    const request = buildOrderRequest(CART, { ...META, fulfilment: "takeaway" });
    expect(request.fulfilment).toBe("takeaway");
    expect(request.address).toBeUndefined();
  });
});

describe("token persistence", () => {
  it("stores the server's code and token in the local order index", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(201, PLACED_PAYLOAD));

    const order = await submitOrder(CART, META);

    expect(order.code).toBe("BRG-7Q2M4X");
    expect(order.token).toBe("tok_f4c3b2a1");
    expect(order.stage).toBe("placed");
    expect(order.status).toBe("PLACED_BY_CUSTOMER");
    expect(order.placedAt).toBe(Date.parse("2026-10-12T09:15:00.000Z"));
    expect(order.etaMinutes).toBe(32);

    const stored = JSON.parse(window.localStorage.getItem(ORDERS_KEY));
    expect(stored).toHaveLength(1);
    // The token is the only credential that can read this order back out of the
    // gateway, so it has to survive alongside the code.
    expect(stored[0].code).toBe("BRG-7Q2M4X");
    expect(stored[0].token).toBe("tok_f4c3b2a1");
    expect(readOrders()[0].token).toBe("tok_f4c3b2a1");
    expect(isRealOrder(readOrders()[0])).toBe(true);
  });

  it("takes the money from the server, not from the cart", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(201, PLACED_PAYLOAD));

    const order = await submitOrder(CART, META);

    // The cart snapshot adds up to 595; the gateway says 1310. The gateway wins.
    expect(order.totals).toEqual({ subtotal: 1190, deliveryFee: 120, total: 1310 });
    expect(order.subtotal).toBe(1190);
  });

  it("keeps a local snapshot of the cart for offline display", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(201, PLACED_PAYLOAD));

    const order = await submitOrder(CART, META);

    expect(order.items).toEqual([
      { id: "falsa-small", name: "Falsa Juice", qty: 2, price: 297.5, variationName: "Small", image: "falsa.jpg" }
    ]);
  });

  it("refuses an acceptance that carries no token, because it could never be read back", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(201, { ...PLACED_PAYLOAD, order_token: undefined }));

    await expect(submitOrder(CART, META)).rejects.toBeInstanceOf(OrderApiError);
    expect(window.localStorage.getItem(ORDERS_KEY)).toBeNull();
  });

  it("marks orders left behind by the old simulated checkout as not real", () => {
    // No code and no token: this is what the pre-gateway flow wrote.
    expect(isRealOrder({ id: "order-1", code: "BRG-OLD1", token: "" })).toBe(false);
    expect(isRealOrder({ id: "order-1", items: [] })).toBe(false);
  });
});

describe("an unreachable gateway", () => {
  it("reports a failed connection as unreachable, not as a rejection", async () => {
    globalThis.fetch.mockImplementation(networkFailure);

    const error = await fetchOrder("BRG-7Q2M4X", "tok_f4c3b2a1").catch((caught) => caught);

    expect(error).toBeInstanceOf(OrderApiError);
    expect(error.kind).toBe("offline");
    expect(isUnreachable(error)).toBe(true);
    expect(isPermanentRejection(error)).toBe(false);
    expect(describeOrderApiError(error)).toBe("We can't reach bringit right now.");
  });

  it("treats an HTTP 200 carrying the app shell as unreachable", async () => {
    // This is the exact failure the dead /api/exports calls hit: 200 + HTML.
    globalThis.fetch.mockResolvedValue(appShellResponse());

    const error = await fetchOrder("BRG-7Q2M4X", "tok_f4c3b2a1").catch((caught) => caught);

    expect(error.kind).toBe("not_json");
    expect(isUnreachable(error)).toBe(true);
  });

  it("never stores an order the gateway did not accept", async () => {
    globalThis.fetch.mockImplementation(networkFailure);

    await expect(submitOrder(CART, META)).rejects.toMatchObject({ kind: "offline" });

    expect(window.localStorage.getItem(ORDERS_KEY)).toBeNull();
    expect(readOrders()).toEqual([]);
  });

  it("never stores an order the gateway answered with the app shell", async () => {
    globalThis.fetch.mockResolvedValue(appShellResponse());

    await expect(submitOrder(CART, META)).rejects.toMatchObject({ kind: "not_json" });
    expect(readOrders()).toEqual([]);
  });

  it("leaves the last known stage exactly where it was when a refresh fails", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(201, PLACED_PAYLOAD));
    const placed = await submitOrder(CART, META);

    const confirmed = mergeServerOrder(placed, { ...PLACED_PAYLOAD, stage: "confirmed", status: "RESTAURANT_CONFIRMED" });
    expect(confirmed.stage).toBe("confirmed");

    globalThis.fetch.mockImplementation(networkFailure);
    await expect(fetchOrder(confirmed.code, confirmed.token)).rejects.toMatchObject({ kind: "offline" });

    // A failed poll has no payload, so nothing moves. The UI shows "confirmed"
    // plus a retrying notice — it does not invent the next stage.
    expect(mergeServerOrder(confirmed, null)).toBe(confirmed);
    expect(mergeServerOrder(confirmed, undefined).stage).toBe("confirmed");
  });

  it("backs off on repeated failures and caps the wait", () => {
    expect(getRetryDelayMs(1)).toBe(10_000);
    expect(getRetryDelayMs(2)).toBe(20_000);
    expect(getRetryDelayMs(3)).toBe(30_000);
    expect(getRetryDelayMs(4)).toBe(60_000);
    expect(getRetryDelayMs(40)).toBe(60_000);
    // Defensive: a zero or junk attempt count still waits the base interval.
    expect(getRetryDelayMs(0)).toBe(10_000);
    expect(getRetryDelayMs(undefined)).toBe(10_000);
  });

  it("gives up on a rejection that will never fix itself", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(403, { error: "bad_token" }));

    const error = await fetchOrder("BRG-7Q2M4X", "wrong-token").catch((caught) => caught);

    expect(error.kind).toBe("rejected");
    expect(error.code).toBe("bad_token");
    expect(isUnreachable(error)).toBe(false);
    expect(isPermanentRejection(error)).toBe(true);
    expect(describeOrderApiError(error)).toBe("This order can't be opened on this device.");
  });

  it("keeps retrying a server-side failure", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(503, { error: "upstream_down", message: "Try again." }));

    const error = await fetchOrder("BRG-7Q2M4X", "tok_f4c3b2a1").catch((caught) => caught);

    expect(error.kind).toBe("rejected");
    expect(isPermanentRejection(error)).toBe(false);
  });

  it("passes an unavailable item straight through to the customer", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse(422, {
        error: "unavailable_item",
        message: "Falsa Juice just sold out.",
        menu_item_id: "small"
      })
    );

    const error = await submitOrder(CART, META).catch((caught) => caught);

    expect(error.code).toBe("unavailable_item");
    expect(error.menuItemId).toBe("small");
    expect(describeOrderApiError(error)).toBe("Falsa Juice just sold out.");
    expect(readOrders()).toEqual([]);
  });
});

describe("reading an order back", () => {
  it("asks for the order with its token in the query string", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(200, { ...PLACED_PAYLOAD, stage: "preparing" }));

    await fetchOrder("BRG-7Q2M4X", "tok/with+chars");

    expect(globalThis.fetch.mock.calls[0][0]).toBe("/api/orders/BRG-7Q2M4X?token=tok%2Fwith%2Bchars");
  });

  it("adopts the server's item list only when there is no local snapshot", () => {
    const serverOnly = mergeServerOrder(
      { id: "order-BRG-7Q2M4X", code: "BRG-7Q2M4X", token: "tok", items: [] },
      { ...PLACED_PAYLOAD, stage: "on_the_way" }
    );

    expect(serverOnly.stage).toBe("on_the_way");
    expect(serverOnly.items).toHaveLength(1);
    expect(serverOnly.items[0].name).toBe("Falsa Juice");
    // The token is never echoed by the gateway, so the merge must not lose it.
    expect(serverOnly.token).toBe("tok");
  });
});

describe("toTimestamp", () => {
  it("accepts ISO strings, epoch milliseconds, and never yields NaN", () => {
    expect(toTimestamp("2026-10-12T09:15:00.000Z")).toBe(Date.parse("2026-10-12T09:15:00.000Z"));
    expect(toTimestamp(1760000000000)).toBe(1760000000000);
    expect(toTimestamp("not a date", 42)).toBe(42);
    expect(toTimestamp(undefined)).toBe(0);
  });
});
