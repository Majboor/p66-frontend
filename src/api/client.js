/*
 * Shared HTTP client for everything the browser asks a server for.
 *
 * All of it goes through one gateway. The restaurant backend itself sends no
 * CORS headers at all and binds to loopback, so the browser cannot talk to it
 * directly; the gateway is the only thing with a route to it, and it is also
 * what holds the upstream role headers. So the browser never sends an
 * X-User-Id / X-User-Role / X-Workspace-Id of its own — it sends a body, and the
 * gateway decides who the caller is. That is deliberate: those headers are
 * self-asserted upstream, and a client that could set them could claim any role.
 *
 * Nothing here is a secret. VITE_ORDER_API is a host name, and the only
 * credentials in play are minted per order (order_token) or per session
 * (session token) by the server and handed to this browser.
 */

// Same origin by default, so the paths used by the callers are literally the
// ones the gateway publishes. That is also what the dev server proxies
// (vite.config.js `/api` -> VITE_API_TARGET), so a gateway running locally needs
// no extra configuration. Deployments that host the gateway on a separate host
// set VITE_ORDER_API to its origin at build time.
export const DEFAULT_API_BASE = "";

// Trailing slashes would double up against the "/api/..." paths callers pass.
const stripTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

export const getApiBase = () => stripTrailingSlash(import.meta.env?.VITE_ORDER_API ?? DEFAULT_API_BASE);

/*
 * Every failure the UI can meet, with a `kind` it can branch on:
 *
 *   "offline"   - fetch never got an answer (DNS, TLS, CORS, no route). Retry.
 *   "not_json"  - we got 200 but not JSON. This is the SPA-fallback trap: a
 *                 static host that rewrites every unknown path to index.html
 *                 answers API probes with HTML and HTTP 200, which makes a dead
 *                 API look alive. Treated exactly like being offline, because
 *                 that is what it is.
 *   "rejected"  - the server answered with a 4xx/5xx it meant. `code` carries
 *                 the server's own error key ("bad_token", "too_late",
 *                 "account_not_active", ...).
 */
export class ApiError extends Error {
  constructor(message, { kind = "rejected", status = 0, code = "", field = "", menuItemId = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.field = field;
    this.menuItemId = menuItemId;
  }
}

// "We could not reach the server" vs "the server said no". The difference is
// the whole point: only the first one justifies showing stale data and
// retrying, and neither one justifies inventing a result.
export const isUnreachable = (error) =>
  error instanceof ApiError && (error.kind === "offline" || error.kind === "not_json");

// A rejection that will never fix itself by asking again. A bad or missing
// token and a deleted record are permanent; a 5xx or a rate limit is not.
export const isPermanentRejection = (error) =>
  error instanceof ApiError && error.kind === "rejected" && error.status >= 400 && error.status < 500;

// Backoff for anything that polls: start at the normal cadence, then ease off so
// a server that is down is not hammered by every open tab. Capped at a minute so
// recovery is still noticed without a reload.
const RETRY_DELAYS_MS = [10_000, 20_000, 30_000, 60_000];

export const getRetryDelayMs = (attempt) =>
  RETRY_DELAYS_MS[Math.min(Math.max(Number(attempt) || 1, 1), RETRY_DELAYS_MS.length) - 1];

// The server's own error keys, in words a customer can act on. Anything we have
// no copy for is humanised from its key rather than hidden, because a visible
// "account_not_active" beats a silent failure.
const ERROR_COPY = {
  bad_token: "This order can't be opened on this device.",
  not_found: "We can't find that any more.",
  too_late: "The kitchen has already started — this order can't be cancelled.",
  account_not_active: "This account still needs verifying. Check the code we sent you.",
  invalid_credentials: "That email and password don't match.",
  email_exists: "There's already an account with that email.",
  display_name_required: "Tell us the name to put on the order.",
  email_or_phone_required: "We need an email or a phone number.",
  invalid_code: "That code isn't right. Check it and try again.",
  code_expired: "That code has expired. Ask for a new one."
};

const humaniseErrorCode = (code) => {
  const words = String(code || "").replace(/[_-]+/g, " ").trim();
  if (!words) return "";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
};

// Copy worth showing a customer. The server's own `message` is preferred when it
// sent one, because it knows things we do not (which item ran out, which field
// was wrong).
export function describeApiError(error) {
  if (isUnreachable(error)) return "We can't reach bringit right now.";
  if (error instanceof ApiError) {
    if (error.message) return error.message;
    if (ERROR_COPY[error.code]) return ERROR_COPY[error.code];
    return humaniseErrorCode(error.code) || "bringit couldn't process that.";
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
 * The one place a response becomes either data or an ApiError.
 *
 * The content-type check runs before `response.ok`, because an HTML 200 is the
 * failure mode this codebase has already been bitten by: the previous
 * /api/exports calls got index.html back with a 200, so `ok` was true, `.json()`
 * threw, and the catch block quietly swapped in fake data.
 */
async function readJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new ApiError("bringit is not answering right now.", {
      kind: "not_json",
      status: response.status
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("bringit sent something we can't read.", {
      kind: "not_json",
      status: response.status
    });
  }

  if (!response.ok) {
    throw new ApiError(payload?.message || "", {
      kind: "rejected",
      status: response.status,
      code: payload?.error || "",
      field: payload?.field || "",
      menuItemId: payload?.menu_item_id || ""
    });
  }

  return payload;
}

export async function requestJson(path, { method = "GET", body, token, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  // The session token is only read upstream by /api/v1/auth/me, but sending it
  // where we have one keeps the gateway able to tie a call to a session.
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method,
      signal,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    // AbortError is our own unmount/navigation, not a server problem — let it
    // through untouched so callers can ignore it.
    if (error?.name === "AbortError") throw error;
    throw new ApiError("We can't reach bringit right now.", { kind: "offline" });
  }

  return readJsonResponse(response);
}
