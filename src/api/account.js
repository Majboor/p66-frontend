/*
 * Accounts: register, verify, log in, and the customer profile.
 *
 * These four paths and their bodies are the backend's real, captured contract
 * (ORDER_API.md §1.2–1.4) — `/api/v1/auth/...`, note the version prefix, and
 * `/api/customers/profiles`. Two things about them are load-bearing:
 *
 *   1. Signup is a three-step dance, not one call. Register returns a
 *      PENDING_VERIFICATION user plus a verification code; logging in before
 *      verifying is a 403 `account_not_active`. So: register -> verify-code ->
 *      login.
 *   2. The id that carts and orders key off is the customer *profile* id
 *      (`cus_...`), not the user id (`usr_...`). A signed-in customer without a
 *      profile has nothing an order can be attached to, so sign-in creates one
 *      when we do not already hold it.
 *
 * These paths are not among the six routes the order gateway publishes, so the
 * gateway has to proxy them. It must also inject the upstream role headers the
 * backend reads (X-User-Id / X-User-Role / X-Workspace-Id) — this client never
 * sends them, because upstream trusts them blindly and a browser that could set
 * them could claim any role.
 */

import { requestJson } from "./client.js";

// The backend partitions everything by workspace and falls back to this value
// when the header is missing, so it is the one the bodies below must carry.
export const WORKSPACE_ID = "wsp_gulberg_mvp";

const CUSTOMER_ROLE = "CUSTOMER";

/*
 * POST /api/v1/auth/register -> 201 {user, verification, verification_required}
 *
 * `verification.code` comes back in the response body. We do not read it: the
 * customer types in the code they were sent. Trusting the echoed one would mean
 * a signup that never proves the phone number belongs to them.
 */
export function register({ email, password, phone, displayName }, { signal } = {}) {
  return requestJson("/api/v1/auth/register", {
    method: "POST",
    signal,
    body: {
      email: String(email || "").trim(),
      password: String(password || ""),
      phone: String(phone || "").trim(),
      display_name: String(displayName || "").trim(),
      default_role: CUSTOMER_ROLE,
      workspace_id: WORKSPACE_ID
    }
  });
}

// POST /api/v1/auth/verify-code -> 200 {verification_status, user}
export function verifyCode({ userId, code }, { signal } = {}) {
  return requestJson("/api/v1/auth/verify-code", {
    method: "POST",
    signal,
    body: {
      user_id: userId,
      code: String(code || "").trim(),
      purpose: "ACCOUNT_VERIFICATION",
      workspace_id: WORKSPACE_ID
    }
  });
}

// POST /api/v1/auth/login -> 200 {session:{token, expires_at, ...}, user:{id, ...}}
export function login({ email, password }, { signal } = {}) {
  return requestJson("/api/v1/auth/login", {
    method: "POST",
    signal,
    body: {
      email: String(email || "").trim(),
      password: String(password || ""),
      workspace_id: WORKSPACE_ID
    }
  });
}

/*
 * POST /api/customers/profiles -> 201 {id:"cus_...", addresses:[], ...}
 *
 * Requires `display_name` and at least one of email / phone. There is no
 * documented route that looks a profile up by user_id, so the id is kept in the
 * local session once we have it; see the note in Account.jsx.
 */
export function createCustomerProfile({ userId, displayName, email, phone }, { token, signal } = {}) {
  return requestJson("/api/customers/profiles", {
    method: "POST",
    signal,
    token,
    body: {
      workspace_id: WORKSPACE_ID,
      user_id: userId,
      display_name: String(displayName || "").trim(),
      email: String(email || "").trim(),
      phone: String(phone || "").trim()
    }
  });
}

// GET /api/v1/auth/me -> the signed-in user. This is the only upstream route
// that actually verifies the bearer token, which makes it the only way to tell
// whether a stored session is still good.
export function fetchMe(token, { signal } = {}) {
  return requestJson("/api/v1/auth/me", { token, signal });
}
