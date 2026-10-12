/*
 * Order gateway client.
 *
 * The gateway is the security boundary in front of the restaurant backend: it
 * terminates CORS, holds the upstream credentials, recomputes money from its own
 * menu, and mints a per-order `order_token` that is the only thing proving a
 * customer owns an order. These three calls are the whole order surface the
 * browser is allowed to touch.
 *
 * Shared transport, error shapes and base URL live in ./client.js.
 */

import { requestJson } from "./client.js";

/*
 * POST /api/orders
 *
 * `request` is the gateway's body shape, not ours: snake_case, menu item ids
 * rather than cart line ids, and no prices — the gateway recomputes money from
 * the menu it fetched and ignores anything the client claims a thing costs.
 */
export function placeOrder(request, { token, signal } = {}) {
  return requestJson("/api/orders", { method: "POST", body: request, token, signal });
}

// GET /api/orders/:order_code?token=...
// The order token is the only credential a customer has; without it the gateway
// answers 403 and the order is unreadable, which is deliberate.
export function fetchOrder(orderCode, orderToken, { signal } = {}) {
  const path = `/api/orders/${encodeURIComponent(orderCode)}?token=${encodeURIComponent(orderToken)}`;
  return requestJson(path, { signal });
}

// POST /api/orders/:order_code/cancel
// Answers 409 `too_late` once the kitchen has accepted, which is a real answer
// and not an error to swallow.
export function cancelOrder(orderCode, orderToken, { signal } = {}) {
  return requestJson(`/api/orders/${encodeURIComponent(orderCode)}/cancel`, {
    method: "POST",
    body: { token: orderToken },
    signal
  });
}
