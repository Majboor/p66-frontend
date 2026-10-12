/*
 * Order gateway client.
 *
 * The gateway is the security boundary in front of the restaurant backend: it
 * terminates CORS, holds the upstream credentials, recomputes money from its own
 * menu, and mints a per-order `order_token` that is the only thing proving a
 * customer owns an order. This module is the whole surface the browser is
 * allowed to touch — six public routes, of which we use three.
 *
 * Nothing here is secret. The order token is minted by the server per order and
 * handed to the browser; there is no build-time key, and `VITE_ORDER_API` is a
 * host name, not a credential.
 */

// Same origin by default, so the paths below are literally the ones the gateway
// spec publishes (`/api/orders`). That is also what the dev server proxies
// (see vite.config.js `/api` -> VITE_API_TARGET), so a gateway running locally
// needs no extra configuration. Deployments that host the gateway on a separate
// host set VITE_ORDER_API to its origin at build time.
export const DEFAULT_ORDER_API = "";

// Trailing slashes would double up against the "/api/..." paths below.
const stripTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

export const getOrderApiBase = () => stripTrailingSlash(import.meta.env?.VITE_ORDER_API ?? DEFAULT_ORDER_API);

const orderApiUrl = (path) => `${getOrderApiBase()}${path}`;

/*
 * Every failure the UI can meet, with a `kind` it can branch on:
 *
 *   "offline"   - fetch never got an answer (DNS, TLS, CORS, no route). Retry.
 *   "not_json"  - we got 200 but not JSON. This is the SPA-fallback trap: a
 *                 static host that rewrites every unknown path to index.html
 *                 answers API probes with HTML and HTTP 200, which makes a dead
 *                 API look alive. Treated exactly like being offline, because
 *                 that is what it is.
 *   "rejected"  - the gateway answered with a 4xx/5xx it meant. `code` carries
 *                 the gateway's own error key ("bad_token", "too_late", ...).
 */
export class OrderApiError extends Error {
  constructor(message, { kind = "rejected", status = 0, code = "", field = "", menuItemId = "" } = {}) {
    super(message);
    this.name = "OrderApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.field = field;
    this.menuItemId = menuItemId;
  }
}

// "We could not reach the gateway" vs "the gateway said no". The difference is
// the whole point: only the first one justifies showing a stale stage and
// retrying, and neither one justifies inventing progress.
export const isUnreachable = (error) =>
  error instanceof OrderApiError && (error.kind === "offline" || error.kind === "not_json");

// A rejection that will never fix itself by asking again. A bad or missing token
// and a deleted order are permanent; a 5xx or a rate limit is not.
export const isPermanentRejection = (error) =>
  error instanceof OrderApiError && error.kind === "rejected" && error.status >= 400 && error.status < 500;

// Backoff for the tracking poll: start at the normal cadence, then ease off so a
// gateway that is down is not hammered by every open tab. Capped at a minute so
// recovery is still noticed without a reload.
const RETRY_DELAYS_MS = [10_000, 20_000, 30_000, 60_000];

export const getRetryDelayMs = (attempt) =>
  RETRY_DELAYS_MS[Math.min(Math.max(Number(attempt) || 1, 1), RETRY_DELAYS_MS.length) - 1];

// Copy worth showing a customer. The gateway's own `message` is preferred when
// it sent one, because it knows things we do not (which item ran out, which
// field was wrong).
export function describeOrderApiError(error) {
  if (isUnreachable(error)) return "We can't reach bringit right now.";
  if (error instanceof OrderApiError) {
    if (error.message) return error.message;
    if (error.code === "bad_token") return "This order can't be opened on this device.";
    if (error.code === "not_found") return "We can't find this order any more.";
    if (error.code === "too_late") return "The kitchen has already started — this order can't be cancelled.";
    return "bringit couldn't process that.";
  }
  return "Something went wrong.";
}

// Timestamps arrive as ISO strings; be tolerant of epoch milliseconds too, and
// never return NaN into React state.
export function toTimestamp(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/*
 * The one place a response becomes either data or an OrderApiError.
 *
 * The content-type check runs before `response.ok`, because an HTML 200 is the
 * failure mode this codebase has already been bitten by: the previous
 * /api/exports calls got index.html back with a 200, so `ok` was true, `.json()`
 * threw, and the catch block quietly swapped in fake data.
 */
async function readJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new OrderApiError("The order gateway is not answering.", {
      kind: "not_json",
      status: response.status
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new OrderApiError("The order gateway sent something we can't read.", {
      kind: "not_json",
      status: response.status
    });
  }

  if (!response.ok) {
    throw new OrderApiError(payload?.message || "", {
      kind: "rejected",
      status: response.status,
      code: payload?.error || "",
      field: payload?.field || "",
      menuItemId: payload?.menu_item_id || ""
    });
  }

  return payload;
}

async function requestJson(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(orderApiUrl(path), {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    // AbortError is our own unmount/navigation, not a gateway problem — let it
    // through untouched so callers can ignore it.
    if (error?.name === "AbortError") throw error;
    throw new OrderApiError("We can't reach bringit right now.", { kind: "offline" });
  }

  return readJsonResponse(response);
}

/*
 * POST /api/orders
 *
 * `request` is the gateway's body shape, not ours: snake_case, menu item ids
 * rather than cart line ids, and no prices — the gateway recomputes money from
 * the menu it fetched and ignores anything the client claims a thing costs.
 */
export function placeOrder(request, { signal } = {}) {
  return requestJson("/api/orders", { method: "POST", body: request, signal });
}

// GET /api/orders/:order_code?token=...
// The token is the only credential a customer has; without it the gateway
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
