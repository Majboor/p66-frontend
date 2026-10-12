import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, describeApiError } from "../../src/api/client.js";
import { WORKSPACE_ID } from "../../src/api/account.js";
import {
  ADDRESS_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  completeSignUp,
  formatAddressChip,
  getAccountName,
  getSelectedAddress,
  isSessionExpired,
  readAddressBook,
  readSession,
  removeAddress,
  selectAddress,
  signIn,
  signOut,
  startSignUp,
  upsertAddress,
  writeAddressBook,
  writeSession
} from "../../src/Account.jsx";

// A localStorage good enough for the session and the address book: the real one
// is a browser API and these tests deliberately run without a DOM.
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

const appShellResponse = () => ({
  ok: true,
  status: 200,
  headers: { get: () => "text/html; charset=utf-8" },
  json: async () => {
    throw new SyntaxError("Unexpected token '<'");
  }
});

const USER = {
  id: "usr_ba5028a96d304527",
  status: "ACTIVE",
  default_role: "CUSTOMER",
  email: "afzal@example.com"
};

const SESSION = {
  id: "ses_8ce6469634b54be2",
  token: "tok_17fedb2c85bf458e",
  status: "ACTIVE",
  user_id: USER.id,
  expires_at: "2099-10-12T10:32:46.744713Z",
  workspace_id: WORKSPACE_ID
};

const PROFILE = {
  id: "cus_f2d4f47c458e42e6",
  user_id: USER.id,
  display_name: "Afzal",
  addresses: [],
  default_address_id: ""
};

const REGISTERED = {
  user: { ...USER, status: "PENDING_VERIFICATION", display_name: "Afzal" },
  verification: { id: "vcd_0bfabf9ed65f458a", code: "883469", status: "PENDING" },
  verification_required: true
};

const bodyOf = (call) => JSON.parse(call[1].body);
const pathsCalled = () => globalThis.fetch.mock.calls.map((call) => call[0]);

beforeEach(() => {
  globalThis.window = { localStorage: memoryStorage() };
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
});

describe("the address book", () => {
  const home = { id: "adr_home", label: "Home", line1: "12-C Main Boulevard", area: "Gulberg III", city: "Lahore" };
  const work = { id: "adr_work", label: "Work", line1: "4 Shami Road", area: "Cantt", city: "Lahore" };

  it("starts empty, with nothing selected", () => {
    expect(readAddressBook()).toEqual({ addresses: [], selectedId: "" });
    expect(getSelectedAddress(readAddressBook())).toBeNull();
  });

  it("adds an address and selects it", () => {
    const book = upsertAddress({ addresses: [], selectedId: "" }, home);
    expect(book.addresses).toHaveLength(1);
    expect(book.selectedId).toBe("adr_home");
    expect(getSelectedAddress(book)).toMatchObject({ line1: "12-C Main Boulevard" });
  });

  it("updates in place rather than duplicating, and selects what was edited", () => {
    let book = upsertAddress({ addresses: [], selectedId: "" }, home);
    book = upsertAddress(book, work);
    expect(book.selectedId).toBe("adr_work");

    book = upsertAddress(book, { ...home, line1: "12-C Main Boulevard, 2nd floor" });
    expect(book.addresses).toHaveLength(2);
    expect(book.selectedId).toBe("adr_home");
    expect(getSelectedAddress(book).line1).toBe("12-C Main Boulevard, 2nd floor");
  });

  it("refuses an address with no street line", () => {
    const book = upsertAddress({ addresses: [], selectedId: "" }, { label: "Nowhere", city: "Lahore" });
    expect(book.addresses).toEqual([]);
  });

  it("mints an id when one is not supplied", () => {
    const book = upsertAddress({ addresses: [], selectedId: "" }, { line1: "9 Liberty Market", city: "Lahore" });
    expect(book.addresses[0].id).toMatch(/^adr_/);
    expect(book.selectedId).toBe(book.addresses[0].id);
  });

  it("re-selects something real when the selected address is removed", () => {
    let book = upsertAddress(upsertAddress({ addresses: [], selectedId: "" }, home), work);
    book = removeAddress(book, "adr_work");
    expect(book.addresses).toHaveLength(1);
    expect(book.selectedId).toBe("adr_home");

    book = removeAddress(book, "adr_home");
    expect(book).toEqual({ addresses: [], selectedId: "" });
  });

  it("ignores a selection that does not exist", () => {
    const book = upsertAddress({ addresses: [], selectedId: "" }, home);
    expect(selectAddress(book, "adr_nope")).toBe(book);
    expect(selectAddress(book, "adr_home").selectedId).toBe("adr_home");
  });

  it("survives a reload, and drops rows that are not addresses", () => {
    writeAddressBook({ addresses: [home, { id: "adr_junk", city: "Lahore" }, work], selectedId: "adr_work" });

    const book = readAddressBook();
    expect(book.addresses.map((entry) => entry.id)).toEqual(["adr_home", "adr_work"]);
    expect(book.selectedId).toBe("adr_work");
  });

  it("falls back to the first address when the stored selection is gone", () => {
    writeAddressBook({ addresses: [home], selectedId: "adr_deleted" });
    expect(readAddressBook().selectedId).toBe("adr_home");
  });

  it("survives a corrupted store", () => {
    window.localStorage.setItem(ADDRESS_STORAGE_KEY, "{not json");
    expect(readAddressBook()).toEqual({ addresses: [], selectedId: "" });
  });

  it("reads the header chip from the address, and says so when there is none", () => {
    expect(formatAddressChip(home)).toBe("12-C Main Boulevard, Gulberg III");
    expect(formatAddressChip({ line1: "4 Shami Road", city: "Lahore" })).toBe("4 Shami Road, Lahore");
    // This is what replaced the hardcoded "Flat 23E Lahore".
    expect(formatAddressChip(null)).toBe("Set your location");
  });
});

describe("the session", () => {
  it("is nothing until somebody signs in", () => {
    expect(readSession()).toBeNull();
  });

  it("refuses a stored blob that is not a session", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ displayName: "Afzal" }));
    expect(readSession()).toBeNull();
    window.localStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(readSession()).toBeNull();
  });

  it("treats an expired session as no session, and throws it away", () => {
    const expired = { token: "tok_old", userId: USER.id, expiresAt: Date.parse("2020-01-01T00:00:00Z") };
    expect(isSessionExpired(expired)).toBe(true);
    writeSession(expired);

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("keeps a session with no expiry, since the server did not give one", () => {
    writeSession({ token: "tok_x", userId: USER.id, expiresAt: 0 });
    expect(isSessionExpired({ expiresAt: 0 })).toBe(false);
    expect(readSession().token).toBe("tok_x");
  });

  it("names the account from the display name, then the email", () => {
    expect(getAccountName({ displayName: "Afzal", email: "afzal@example.com" })).toBe("Afzal");
    expect(getAccountName({ displayName: "  ", email: "afzal@example.com" })).toBe("afzal");
    expect(getAccountName(null)).toBe("Account");
  });

  it("signs out by forgetting the session", () => {
    writeSession({ token: "tok_x", userId: USER.id });
    expect(signOut()).toBeNull();
    expect(readSession()).toBeNull();
  });
});

describe("signing in", () => {
  it("logs in, makes a customer profile, and stores both ids", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(201, PROFILE));

    const session = await signIn({ email: "afzal@example.com", password: "Doc#2026" });

    expect(pathsCalled()).toEqual(["/api/v1/auth/login", "/api/customers/profiles"]);
    expect(bodyOf(globalThis.fetch.mock.calls[0])).toEqual({
      email: "afzal@example.com",
      password: "Doc#2026",
      workspace_id: WORKSPACE_ID
    });

    expect(session.token).toBe(SESSION.token);
    expect(session.userId).toBe(USER.id);
    // The id that carts and orders key off is the cus_ profile, not the usr_ id.
    expect(session.profileId).toBe(PROFILE.id);
    expect(readSession().profileId).toBe(PROFILE.id);
  });

  it("never sends a role header of its own", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(201, PROFILE));

    await signIn({ email: "afzal@example.com", password: "Doc#2026" });

    // Upstream builds the actor purely from X-User-Id / X-User-Role /
    // X-Workspace-Id and trusts them blindly, so a browser that could set them
    // could claim any role. The gateway injects them; this client must not.
    globalThis.fetch.mock.calls.forEach(([, init]) => {
      const sent = Object.keys(init.headers).map((name) => name.toLowerCase());
      expect(sent).not.toContain("x-user-id");
      expect(sent).not.toContain("x-user-role");
      expect(sent).not.toContain("x-workspace-id");
    });
  });

  it("reuses a profile it already knows instead of creating a second one", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(201, PROFILE));
    await signIn({ email: "afzal@example.com", password: "Doc#2026" });

    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }));

    const session = await signIn({ email: "afzal@example.com", password: "Doc#2026" });

    expect(pathsCalled()).toEqual(["/api/v1/auth/login"]);
    expect(session.profileId).toBe(PROFILE.id);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY))).toEqual({ [USER.id]: PROFILE.id });
  });

  it("still signs in when the profile call fails, because the login did not", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "display_name_required" }));

    const session = await signIn({ email: "afzal@example.com", password: "Doc#2026" });

    expect(session.token).toBe(SESSION.token);
    expect(session.profileId).toBe("");
  });

  it("asks for both fields before calling anything", async () => {
    await expect(signIn({ email: "", password: "Doc#2026" })).rejects.toBeInstanceOf(ApiError);
    await expect(signIn({ email: "afzal@example.com", password: " " })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("explains a rejected password and stores no session", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(401, { error: "invalid_credentials" }));

    const error = await signIn({ email: "afzal@example.com", password: "wrong" }).catch((caught) => caught);

    expect(error.kind).toBe("rejected");
    expect(describeApiError(error)).toBe("That email and password don't match.");
    expect(readSession()).toBeNull();
  });

  it("explains an account that has not been verified yet", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse(403, { error: "account_not_active", status: "PENDING_VERIFICATION" })
    );

    const error = await signIn({ email: "afzal@example.com", password: "Doc#2026" }).catch((caught) => caught);

    expect(error.code).toBe("account_not_active");
    expect(describeApiError(error)).toMatch(/needs verifying/i);
  });

  it("stores no session when the gateway is unreachable", async () => {
    globalThis.fetch.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(signIn({ email: "afzal@example.com", password: "Doc#2026" })).rejects.toMatchObject({
      kind: "offline"
    });
    expect(readSession()).toBeNull();
  });

  it("stores no session when an HTTP 200 carries the app shell", async () => {
    globalThis.fetch.mockResolvedValue(appShellResponse());

    await expect(signIn({ email: "afzal@example.com", password: "Doc#2026" })).rejects.toMatchObject({
      kind: "not_json"
    });
    expect(readSession()).toBeNull();
  });
});

describe("signing up", () => {
  const FORM = {
    displayName: "Afzal",
    email: "afzal@example.com",
    phone: "+923009998888",
    password: "Doc#2026"
  };

  it("registers and then waits for the code, without a session yet", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(201, REGISTERED));

    const { userId, verificationRequired } = await startSignUp(FORM);

    expect(pathsCalled()).toEqual(["/api/v1/auth/register"]);
    expect(bodyOf(globalThis.fetch.mock.calls[0])).toEqual({
      email: FORM.email,
      password: FORM.password,
      phone: FORM.phone,
      display_name: FORM.displayName,
      default_role: "CUSTOMER",
      workspace_id: WORKSPACE_ID
    });
    expect(userId).toBe(USER.id);
    expect(verificationRequired).toBe(true);
    // Register leaves the account PENDING_VERIFICATION, so there is nothing to
    // sign anybody in with yet.
    expect(readSession()).toBeNull();
  });

  it("verifies with the code the customer typed, not the one the server echoed", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { verification_status: "VERIFIED", user: USER }))
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(201, PROFILE));

    const session = await completeSignUp({ ...FORM, userId: USER.id, code: "123456" });

    expect(pathsCalled()).toEqual([
      "/api/v1/auth/verify-code",
      "/api/v1/auth/login",
      "/api/customers/profiles"
    ]);
    const verifyBody = bodyOf(globalThis.fetch.mock.calls[0]);
    expect(verifyBody).toEqual({
      user_id: USER.id,
      code: "123456",
      purpose: "ACCOUNT_VERIFICATION",
      workspace_id: WORKSPACE_ID
    });
    // Register returns the verification code in its own response body. Using it
    // would mean a signup that never proves the phone belongs to them.
    expect(verifyBody.code).not.toBe(REGISTERED.verification.code);

    expect(session.displayName).toBe("Afzal");
    expect(session.phone).toBe(FORM.phone);
    expect(session.profileId).toBe(PROFILE.id);
    expect(readSession().token).toBe(SESSION.token);
  });

  it("sends the profile the fields the backend requires", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(200, { verification_status: "VERIFIED", user: USER }))
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(jsonResponse(201, PROFILE));

    await completeSignUp({ ...FORM, userId: USER.id, code: "123456" });

    expect(bodyOf(globalThis.fetch.mock.calls[2])).toEqual({
      workspace_id: WORKSPACE_ID,
      user_id: USER.id,
      display_name: FORM.displayName,
      email: FORM.email,
      phone: FORM.phone
    });
  });

  it("refuses to register with a field missing, before calling anything", async () => {
    await expect(startSignUp({ ...FORM, phone: "" })).rejects.toBeInstanceOf(ApiError);
    await expect(startSignUp({ ...FORM, displayName: "   " })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses to verify with no code, and reports a wrong one", async () => {
    await expect(completeSignUp({ ...FORM, userId: USER.id, code: "" })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    globalThis.fetch.mockResolvedValue(jsonResponse(400, { error: "invalid_code" }));
    const error = await completeSignUp({ ...FORM, userId: USER.id, code: "000000" }).catch((caught) => caught);

    expect(describeApiError(error)).toBe("That code isn't right. Check it and try again.");
    expect(readSession()).toBeNull();
  });

  it("humanises an error key it has no copy for rather than hiding it", () => {
    const error = new ApiError("", { kind: "rejected", status: 400, code: "workspace_forbidden" });
    expect(describeApiError(error)).toBe("Workspace forbidden.");
  });
});
