import { useEffect, useState } from "react";
import "./Account.css";
import { ApiError, describeApiError } from "./api/client.js";
import { createCustomerProfile, login, register, verifyCode } from "./api/account.js";

/*
 * Accounts and delivery addresses.
 *
 * Self-contained feature module, same shape as OrderTracking.jsx: the session
 * store, the address book, the pure helpers over both, and the three bits of UI
 * that drive them all live here, so App.jsx only has to hold the current
 * session plus address book and pass them down.
 *
 * What this replaces: the header used to render the string "Afzal" and the
 * string "Flat 23E Lahore", and checkout used to pre-fill the same two values
 * plus "+92 300 0000000". None of them were state, nothing read them, and the
 * order that went out carried them. Now the header shows whoever is signed in
 * and whichever address they chose, and that address is what the order carries.
 */

export const SESSION_STORAGE_KEY = "bringit-session-v1";
export const ADDRESS_STORAGE_KEY = "bringit-addresses-v1";
// A device-local map of user id -> customer profile id. It exists because there
// is no route that looks a customer profile up by user id (see ensureProfileId).
export const PROFILE_STORAGE_KEY = "bringit-profiles-v1";

const readJsonItem = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJsonItem = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode / quota). Everything here still
    // works for the current page; it just will not survive a reload.
  }
};

// --- session ----------------------------------------------------------------

/*
 * The session is the login token plus the two ids an order needs: the user id
 * and the customer *profile* id (`cus_...`), which is the one carts and orders
 * key off. `expiresAt` comes from the server's own session row.
 */
export function isSessionExpired(session, now = Date.now()) {
  const expiresAt = Number(session?.expiresAt) || 0;
  return expiresAt > 0 && expiresAt <= now;
}

export function readSession(now = Date.now()) {
  const session = readJsonItem(SESSION_STORAGE_KEY, null);
  if (!session || typeof session !== "object" || !session.token || !session.userId) return null;
  // An expired session is not a session. Drop it rather than letting the header
  // claim somebody is signed in when the next call will 401.
  if (isSessionExpired(session, now)) {
    clearSession();
    return null;
  }
  return session;
}

export function writeSession(session) {
  writeJsonItem(SESSION_STORAGE_KEY, session);
  return session;
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // See writeJsonItem.
  }
}

// The name to greet somebody by. Falls back to the local part of their email so
// the header never renders an empty button.
export function getAccountName(session) {
  const displayName = String(session?.displayName || "").trim();
  if (displayName) return displayName;
  const email = String(session?.email || "").trim();
  return email ? email.split("@")[0] : "Account";
}

// --- address book -----------------------------------------------------------

const makeAddressId = () =>
  `adr_${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, "0")}`;

const normalizeAddress = (entry) => ({
  id: String(entry?.id || "") || makeAddressId(),
  label: String(entry?.label || "").trim(),
  line1: String(entry?.line1 || "").trim(),
  area: String(entry?.area || "").trim(),
  city: String(entry?.city || "").trim(),
  notes: String(entry?.notes || "").trim()
});

const EMPTY_ADDRESS_BOOK = { addresses: [], selectedId: "" };

export function readAddressBook() {
  const stored = readJsonItem(ADDRESS_STORAGE_KEY, null);
  const addresses = (Array.isArray(stored?.addresses) ? stored.addresses : [])
    // A row with no street line is not an address anyone can deliver to.
    .filter((entry) => entry && String(entry.line1 || "").trim())
    .map(normalizeAddress);
  const selectedId = addresses.some((entry) => entry.id === stored?.selectedId)
    ? stored.selectedId
    : addresses[0]?.id || "";
  return { addresses, selectedId };
}

export function writeAddressBook(book) {
  writeJsonItem(ADDRESS_STORAGE_KEY, book);
  return book;
}

// Upsert, and select whatever was just saved — somebody editing an address is
// telling us that is where they want their food.
export function upsertAddress(book, entry) {
  const next = normalizeAddress(entry);
  if (!next.line1) return book;
  const addresses = book.addresses.some((existing) => existing.id === next.id)
    ? book.addresses.map((existing) => (existing.id === next.id ? next : existing))
    : [...book.addresses, next];
  return { addresses, selectedId: next.id };
}

export function removeAddress(book, id) {
  const addresses = book.addresses.filter((entry) => entry.id !== id);
  const selectedId = book.selectedId === id ? addresses[0]?.id || "" : book.selectedId;
  return { addresses, selectedId };
}

export function selectAddress(book, id) {
  return book.addresses.some((entry) => entry.id === id) ? { ...book, selectedId: id } : book;
}

export function getSelectedAddress(book) {
  return book?.addresses?.find((entry) => entry.id === book.selectedId) || null;
}

// What the header chip reads. Short enough for the chip, specific enough to be
// worth showing — and honest when there is nothing set yet.
export function formatAddressChip(entry) {
  if (!entry) return "Set your location";
  const parts = [entry.line1, entry.area || entry.city].map((part) => String(part || "").trim()).filter(Boolean);
  return parts.join(", ") || entry.label || "Set your location";
}

// --- sign in / sign up ------------------------------------------------------

const requireFields = (fields) => {
  const missing = Object.entries(fields).find(([, value]) => !String(value || "").trim());
  if (missing) {
    throw new ApiError("Fill in every field to continue.", {
      kind: "rejected",
      status: 400,
      field: missing[0]
    });
  }
};

/*
 * The customer profile id (`cus_...`) is what an order is attached to, and the
 * backend has no route that looks one up by user id — only a create. So it is
 * remembered per device. A sign-in on a device that has never seen this account
 * therefore creates a second profile row for them, which is a real duplicate we
 * cannot avoid until a lookup route exists.
 */
async function ensureProfileId(user, { displayName, email, phone, token }) {
  const known = readJsonItem(PROFILE_STORAGE_KEY, {});
  if (known?.[user.id]) return known[user.id];

  try {
    const profile = await createCustomerProfile(
      { userId: user.id, displayName, email, phone },
      { token }
    );
    const profileId = String(profile?.id || "");
    if (profileId) writeJsonItem(PROFILE_STORAGE_KEY, { ...known, [user.id]: profileId });
    return profileId;
  } catch {
    // Sign-in has already succeeded at this point, so failing here must not
    // undo it. The order still goes through; it just is not linked to a profile.
    return "";
  }
}

function sessionFromLogin(payload, { displayName, email, phone, profileId }) {
  return {
    token: payload.session.token,
    expiresAt: Date.parse(payload.session.expires_at || "") || 0,
    userId: payload.user.id,
    profileId,
    displayName: String(payload.user.display_name || displayName || "").trim(),
    email: String(payload.user.email || email || "").trim(),
    phone: String(payload.user.phone || phone || "").trim()
  };
}

export async function signIn({ email, password }) {
  requireFields({ email, password });
  const payload = await login({ email, password });
  if (!payload?.session?.token || !payload?.user?.id) {
    throw new ApiError("bringit signed us in but sent no session.", { kind: "rejected", status: 502 });
  }

  const fallbackName = String(email).split("@")[0];
  const profileId = await ensureProfileId(payload.user, {
    displayName: payload.user.display_name || fallbackName,
    email,
    phone: payload.user.phone || "",
    token: payload.session.token
  });

  return writeSession(sessionFromLogin(payload, { displayName: fallbackName, email, phone: "", profileId }));
}

/*
 * Step one of signup. The account comes back PENDING_VERIFICATION and logging in
 * before verifying is a 403, so this only returns the id the verification step
 * needs — there is no session yet.
 */
export async function startSignUp({ displayName, email, phone, password }) {
  requireFields({ displayName, email, phone, password });
  const payload = await register({ displayName, email, phone, password });
  const userId = String(payload?.user?.id || "");
  if (!userId) {
    throw new ApiError("bringit created the account but sent no id.", { kind: "rejected", status: 502 });
  }
  return { userId, verificationRequired: payload?.verification_required !== false };
}

// Step two: prove the phone number, then log in for real and make the profile.
export async function completeSignUp({ userId, code, displayName, email, phone, password }) {
  requireFields({ code });
  await verifyCode({ userId, code });
  const payload = await login({ email, password });
  if (!payload?.session?.token || !payload?.user?.id) {
    throw new ApiError("bringit verified the account but sent no session.", { kind: "rejected", status: 502 });
  }

  const profileId = await ensureProfileId(payload.user, {
    displayName,
    email,
    phone,
    token: payload.session.token
  });

  return writeSession(sessionFromLogin(payload, { displayName, email, phone, profileId }));
}

export function signOut() {
  clearSession();
  return null;
}

// --- presentation -----------------------------------------------------------

function AcIcon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };
  const icons = {
    pin: (
      <svg {...common}>
        <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
    user: (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
    check: (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    close: (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    plus: (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    trash: (
      <svg {...common}>
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </svg>
    ),
    exit: (
      <svg {...common}>
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        <path d="M10 8l-4 4 4 4M6 12h9" />
      </svg>
    )
  };
  return icons[name] || null;
}

// Escape closes any of these panels, matching the search overlay.
function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

export function LocationChip({ address, onClick }) {
  const isSet = Boolean(address);
  return (
    <button
      className={`location-chip ${isSet ? "" : "unset"}`}
      type="button"
      onClick={onClick}
      aria-label={isSet ? `Delivery address: ${formatAddressChip(address)}. Change it` : "Set your delivery address"}
    >
      <AcIcon name="pin" size={22} />
      <span>{formatAddressChip(address)}</span>
    </button>
  );
}

export function AccountButton({ session, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));

  if (!session) {
    return (
      <button className="account-button" type="button" onClick={onSignIn}>
        <AcIcon name="user" size={22} />
        Sign in
      </button>
    );
  }

  return (
    <div className="account-menu-wrap">
      <button
        className="account-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <AcIcon name="user" size={22} />
        {getAccountName(session)}
      </button>
      {open && (
        <>
          <div className="account-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="account-menu" role="menu">
            <p className="account-menu-head">
              <strong>{getAccountName(session)}</strong>
              <small>{session.email || session.phone}</small>
            </p>
            <button
              className="account-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <AcIcon name="exit" size={18} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const EMPTY_AUTH_FORM = { displayName: "", email: "", phone: "", password: "", code: "" };

/*
 * Sign in / create account.
 *
 * The signup tab has two steps because the backend has two: the account exists
 * after register but cannot log in until the code it sent is verified. The step
 * is tracked by `pendingUserId`, which only exists between the two calls.
 */
export function AuthModal({ open, onClose, onSignedIn }) {
  const [tab, setTab] = useState("signin");
  const [form, setForm] = useState(EMPTY_AUTH_FORM);
  const [pendingUserId, setPendingUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_AUTH_FORM);
      setPendingUserId("");
      setError("");
      setTab("signin");
    }
  }, [open]);

  if (!open) return null;

  const setField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const run = async (work) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitSignIn = () =>
    run(async () => {
      const session = await signIn({ email: form.email, password: form.password });
      onSignedIn(session);
      onClose();
    });

  const submitRegister = () =>
    run(async () => {
      const { userId, verificationRequired } = await startSignUp(form);
      if (!verificationRequired) {
        const session = await signIn({ email: form.email, password: form.password });
        onSignedIn(session);
        onClose();
        return;
      }
      setPendingUserId(userId);
    });

  const submitVerify = () =>
    run(async () => {
      const session = await completeSignUp({ ...form, userId: pendingUserId });
      onSignedIn(session);
      onClose();
    });

  const title = tab === "signin" ? "Welcome back" : pendingUserId ? "Check your phone" : "Create your account";

  return (
    <div className="auth-overlay">
      <div className="auth-backdrop" onClick={onClose} />
      <div className="auth-panel" role="dialog" aria-modal="true" aria-label={title}>
        <button className="auth-close" type="button" aria-label="Close" onClick={onClose}>
          <AcIcon name="close" />
        </button>
        <h2>{title}</h2>

        {!pendingUserId && (
          <div className="auth-tabs" role="tablist">
            <button
              className={tab === "signin" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={tab === "signin"}
              onClick={() => setTab("signin")}
            >
              Sign in
            </button>
            <button
              className={tab === "signup" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={tab === "signup"}
              onClick={() => setTab("signup")}
            >
              Create account
            </button>
          </div>
        )}

        {pendingUserId ? (
          <>
            <p className="auth-note">
              We sent a code to {form.phone}. Enter it to finish setting up your account.
            </p>
            <label>
              Verification code
              <input
                autoFocus
                inputMode="numeric"
                placeholder="6-digit code"
                value={form.code}
                onChange={setField("code")}
              />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="button" disabled={busy} onClick={submitVerify}>
              {busy ? "Checking…" : "Verify and sign in"}
            </button>
          </>
        ) : tab === "signin" ? (
          <>
            <label>
              Email
              <input autoFocus type="email" placeholder="you@example.com" value={form.email} onChange={setField("email")} />
            </label>
            <label>
              Password
              <input type="password" placeholder="Your password" value={form.password} onChange={setField("password")} />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="button" disabled={busy} onClick={submitSignIn}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </>
        ) : (
          <>
            <label>
              Name
              <input autoFocus placeholder="Your name" value={form.displayName} onChange={setField("displayName")} />
            </label>
            <label>
              Email
              <input type="email" placeholder="you@example.com" value={form.email} onChange={setField("email")} />
            </label>
            <label>
              Phone number
              <input type="tel" placeholder="+92 300 0000000" value={form.phone} onChange={setField("phone")} />
            </label>
            <label>
              Password
              <input type="password" placeholder="Pick a password" value={form.password} onChange={setField("password")} />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="button" disabled={busy} onClick={submitRegister}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const EMPTY_ADDRESS_FORM = { id: "", label: "", line1: "", area: "", city: "Lahore", notes: "" };

/*
 * Delivery addresses: keep a few, pick one, edit or remove them.
 *
 * These live on the device. The customer profile upstream does carry
 * `addresses[]` and `default_address_id`, but there is no documented route that
 * writes either, so there is nothing to sync them to yet. The address that
 * matters most does reach the server: it goes out on the order itself.
 */
export function LocationModal({ open, book, onClose, onChange }) {
  const [form, setForm] = useState(EMPTY_ADDRESS_FORM);
  const [adding, setAdding] = useState(false);

  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_ADDRESS_FORM);
      setAdding(false);
    }
  }, [open]);

  if (!open) return null;

  const setField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const editing = adding || Boolean(form.id);
  const canSave = Boolean(form.line1.trim() && form.city.trim());

  const save = () => {
    onChange(upsertAddress(book, form));
    setForm(EMPTY_ADDRESS_FORM);
    setAdding(false);
  };

  return (
    <div className="auth-overlay">
      <div className="auth-backdrop" onClick={onClose} />
      <div className="auth-panel location-panel" role="dialog" aria-modal="true" aria-label="Delivery address">
        <button className="auth-close" type="button" aria-label="Close" onClick={onClose}>
          <AcIcon name="close" />
        </button>
        <h2>Where are we delivering?</h2>

        {book.addresses.length > 0 && (
          <ul className="address-list">
            {book.addresses.map((entry) => (
              <li className={entry.id === book.selectedId ? "selected" : ""} key={entry.id}>
                <button
                  className="address-pick"
                  type="button"
                  aria-pressed={entry.id === book.selectedId}
                  onClick={() => {
                    onChange(selectAddress(book, entry.id));
                    onClose();
                  }}
                >
                  <span className="address-tick">
                    {entry.id === book.selectedId ? <AcIcon name="check" size={16} /> : <i />}
                  </span>
                  <span className="address-body">
                    <strong>{entry.label || formatAddressChip(entry)}</strong>
                    <small>
                      {[entry.line1, entry.area, entry.city].filter(Boolean).join(", ")}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                    </small>
                  </span>
                </button>
                <span className="address-actions">
                  <button
                    type="button"
                    aria-label={`Edit ${entry.label || entry.line1}`}
                    onClick={() => {
                      setForm({ ...EMPTY_ADDRESS_FORM, ...entry });
                      setAdding(false);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.label || entry.line1}`}
                    onClick={() => onChange(removeAddress(book, entry.id))}
                  >
                    <AcIcon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <div className="address-form">
            <label>
              Street address
              <input autoFocus placeholder="House or flat, street" value={form.line1} onChange={setField("line1")} />
            </label>
            <div className="address-pair">
              <label>
                Area
                <input placeholder="Gulberg, Model Town, …" value={form.area} onChange={setField("area")} />
              </label>
              <label>
                City
                <input value={form.city} onChange={setField("city")} />
              </label>
            </div>
            <div className="address-pair">
              <label>
                Label
                <input placeholder="Home, Work" value={form.label} onChange={setField("label")} />
              </label>
              <label>
                Delivery note
                <input placeholder="Ring the bell" value={form.notes} onChange={setField("notes")} />
              </label>
            </div>
            <div className="address-form-actions">
              <button className="auth-submit" type="button" disabled={!canSave} onClick={save}>
                {form.id ? "Save address" : "Use this address"}
              </button>
              <button
                className="address-cancel"
                type="button"
                onClick={() => {
                  setForm(EMPTY_ADDRESS_FORM);
                  setAdding(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="address-add" type="button" onClick={() => setAdding(true)}>
            <AcIcon name="plus" size={18} />
            Add an address
          </button>
        )}
      </div>
    </div>
  );
}

export { EMPTY_ADDRESS_BOOK };
