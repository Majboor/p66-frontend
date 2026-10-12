import { useEffect, useMemo, useRef, useState } from "react";
import "./OrderTracking.css";
import {
  OrderApiError,
  cancelOrder,
  describeOrderApiError,
  fetchOrder,
  getRetryDelayMs,
  isPermanentRejection,
  isUnreachable,
  placeOrder,
  toTimestamp
} from "./api/orders.js";

/*
 * Live order tracking + order history.
 *
 * Self-contained feature module: everything the tracking experience needs
 * (persistence helpers, the gateway's stage vocabulary, the polling loop, icons,
 * styles) lives here so the rest of the app only has to hand over a cart, clear
 * it, and route to this page.
 *
 * The server is the single source of truth for an order. This file never
 * advances a stage on its own — if the gateway cannot be reached it shows the
 * last stage the gateway actually reported and says so, because a progress bar
 * that keeps moving while the backend is unreachable is a lie the customer
 * cannot detect.
 */

const ORDERS_STORAGE_KEY = "bringit-orders-v1";

// How often we ask the gateway for a live order, and how long the history list
// keeps. Ten seconds is frequent enough that a kitchen status change feels
// immediate, and slow enough that an open tab costs the gateway almost nothing.
const POLL_INTERVAL_MS = 10_000;
const ORDER_HISTORY_LIMIT = 20;

// The gateway's customer-facing stages, in journey order. These keys are the
// contract: they are exactly what `GET /api/orders/:code` returns in `stage`.
export const ORDER_STAGES = [
  { key: "placed", title: "Order placed", note: "We've received your order." },
  { key: "confirmed", title: "Restaurant confirmed", note: "The kitchen accepted your order." },
  { key: "preparing", title: "Preparing your food", note: "Fresh off the kitchen line." },
  { key: "on_the_way", title: "On the way", note: "Your rider is heading over." },
  { key: "delivered", title: "Delivered", note: "Enjoy your meal!" }
];

// The sixth stage, which is not part of the journey: it ends it. The gateway
// maps CANCELLED / FAILED / REFUNDED / REFUND_REQUESTED onto this one key.
export const CANCELLED_STAGE = {
  key: "cancelled",
  title: "Order cancelled",
  note: "This order was cancelled — nothing is on its way."
};

// A customer can still ask for an order to be dropped while it is only placed or
// confirmed. After that the gateway answers 409 `too_late`, which we surface
// rather than hide.
const CANCELLABLE_STAGES = ["placed", "confirmed"];

const COURIERS = [
  { name: "Bilal R.", vehicle: "Motorbike", rating: "4.9" },
  { name: "Hamza K.", vehicle: "Scooter", rating: "4.8" },
  { name: "Usman T.", vehicle: "Motorbike", rating: "5.0" },
  { name: "Zeeshan A.", vehicle: "Bicycle", rating: "4.7" },
  { name: "Faizan M.", vehicle: "Motorbike", rating: "4.9" }
];

const formatPrice = (value) => {
  const amount = Number(value) || 0;
  return `Rs. ${amount.toLocaleString("en-PK", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
};

const hashString = (value) =>
  String(value || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const formatClockTime = (timestamp) => {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// --- stage vocabulary -------------------------------------------------------

/*
 * Anything we do not recognise is parked at `placed`. That direction matters: an
 * unknown stage added upstream should hold an order at the start of the journey,
 * never silently promote it to delivered.
 */
export function normalizeStage(stage) {
  const key = String(stage || "").toLowerCase();
  if (key === CANCELLED_STAGE.key) return CANCELLED_STAGE.key;
  return ORDER_STAGES.some((entry) => entry.key === key) ? key : ORDER_STAGES[0].key;
}

export const isCancelledStage = (stage) => normalizeStage(stage) === CANCELLED_STAGE.key;

// Delivered and cancelled are terminal: nothing further will happen, so polling
// stops there.
export const isFinalStage = (stage) => {
  const key = normalizeStage(stage);
  return key === "delivered" || key === CANCELLED_STAGE.key;
};

// Position in the five-stage journey, or -1 for cancelled (which is off it).
export function getStageIndex(stage) {
  const key = normalizeStage(stage);
  if (key === CANCELLED_STAGE.key) return -1;
  return ORDER_STAGES.findIndex((entry) => entry.key === key);
}

/*
 * Where to draw the courier on the map. This used to be elapsed wall-clock time
 * against a 90-second budget; it is now the stage the server reported, so the
 * dot is a position rather than an animation.
 */
export function getStageFraction(order) {
  let index = getStageIndex(order?.stage);
  if (index < 0) {
    // A cancelled order still has a last known position — wherever it got to
    // before it stopped.
    const reached = (order?.history || []).map((entry) => getStageIndex(entry?.stage)).filter((value) => value >= 0);
    index = reached.length ? Math.max(...reached) : 0;
  }
  return index / (ORDER_STAGES.length - 1);
}

// An order is only real if the gateway accepted it and gave us back a code and
// a token. Orders left in storage by the old simulated checkout have neither,
// so they are labelled as the demo records they are instead of being replayed
// as if a kitchen were working on them.
export const isRealOrder = (order) => Boolean(order?.code && order?.token);

// --- persistence ------------------------------------------------------------

export function readOrders() {
  try {
    const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop malformed rows so a corrupted store can never crash the tracker.
    return parsed.filter((order) => order && order.id && Array.isArray(order.items));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  try {
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Storage may be unavailable (private mode / quota) — history just won't persist.
  }
}

/*
 * Persists a new order at the head of the history list and returns the list.
 *
 * `bringit-orders-v1` stays the customer's local index of their own orders. It
 * now carries the `order_token` next to each code, and that is load-bearing:
 * the token is the only credential that can read the order back out of the
 * gateway, so losing this entry loses the order for good.
 */
export function saveOrder(order) {
  const next = [order, ...readOrders().filter((existing) => existing.id !== order.id)].slice(0, ORDER_HISTORY_LIMIT);
  writeOrders(next);
  return next;
}

// --- building an order ------------------------------------------------------

// An immutable snapshot of the cart at checkout time. The gateway's own item
// list has no images or chosen-option labels, so this snapshot is what keeps the
// summary readable with no network at all.
function snapshotCartItems(cart) {
  return (cart || []).map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty,
    price: item.price,
    variationName: item.variationName || "",
    image: item.image || ""
  }));
}

// Money is the gateway's call, not ours: it prices from the menu it fetched and
// ignores anything the client claims an item costs. The cart snapshot is only a
// fallback for rendering a record whose totals never arrived.
function readTotals(totals, items) {
  const snapshotSubtotal = (items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
  const subtotal = Number(totals?.subtotal);
  const deliveryFee = Number(totals?.delivery_fee);
  const total = Number(totals?.total);
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : snapshotSubtotal;
  const safeDeliveryFee = Number.isFinite(deliveryFee) ? deliveryFee : 0;

  return {
    subtotal: safeSubtotal,
    deliveryFee: safeDeliveryFee,
    total: Number.isFinite(total) ? total : safeSubtotal + safeDeliveryFee
  };
}

function readStageHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((entry) => entry && entry.stage)
    .map((entry) => ({ stage: normalizeStage(entry.stage), at: toTimestamp(entry.at) }));
}

/*
 * Translates a cart plus the checkout form into the gateway's request body.
 *
 * Two mappings are worth noting. First, `menu_item_id` is the menu's id, not our
 * cart line id — a chosen option makes our line id `${itemId}-${variationId}`,
 * which the gateway would not recognise. Second, no prices are sent at all; the
 * gateway recomputes them and a client-supplied price is ignored by design.
 */
export function buildOrderRequest(cart, meta = {}) {
  const items = (cart || [])
    .filter((item) => item && (item.variationId || item.productId || item.id) && Number(item.qty) > 0)
    .map((item) => {
      const entry = {
        menu_item_id: item.variationId || item.productId || item.id,
        qty: Number(item.qty)
      };
      if (item.variationName) entry.note = item.variationName;
      return entry;
    });

  const fulfilment = meta.fulfilment === "takeaway" ? "takeaway" : "delivery";
  const request = {
    brand_slug: meta.brandSlug || "",
    fulfilment,
    items,
    customer: {
      name: String(meta.customerName || "").trim(),
      phone: String(meta.customerPhone || "").trim()
    }
  };

  if (fulfilment === "delivery") {
    const addressNotes = [meta.addressUnit, meta.addressNote].map((part) => String(part || "").trim()).filter(Boolean);
    request.address = {
      line1: String(meta.addressLine1 || "").trim(),
      area: String(meta.addressArea || "").trim(),
      city: String(meta.addressCity || "").trim()
    };
    if (addressNotes.length) request.address.notes = addressNotes.join(" · ");
  }

  if (meta.note) request.note = String(meta.note).trim();

  return request;
}

// Turns the gateway's 201 into the local record the tracker and history render
// from. Every field the server owns comes from the server.
export function createOrderRecord(payload, cart, meta = {}) {
  const items = snapshotCartItems(cart);
  const totals = readTotals(payload?.totals, items);
  // The order code is unique and server-minted, so it makes a stable local id —
  // no more client-side `BRG-` minting, and re-reading the same order can never
  // duplicate a history row.
  const id = `order-${payload.order_code}`;
  const placedAt = toTimestamp(payload?.placed_at, Date.now());

  return {
    id,
    code: payload.order_code,
    token: payload.order_token,
    status: payload?.status || "",
    stage: normalizeStage(payload?.stage),
    placedAt,
    updatedAt: placedAt,
    etaMinutes: Number(payload?.eta_minutes) || Number(meta.etaMinutes) || 25,
    fulfilment: payload?.fulfilment || meta.fulfilment || "delivery",
    restaurantName: meta.restaurantName || cart?.[0]?.restaurantName || "bringit restaurant",
    address: meta.addressLabel || meta.addressLine1 || "",
    customerName: meta.customerName || "",
    paymentLabel: meta.paymentLabel || "Cash on delivery",
    courier: COURIERS[hashString(id) % COURIERS.length],
    items,
    totals,
    // Kept for the history list, which has always read `subtotal`.
    subtotal: totals.subtotal,
    history: readStageHistory(payload?.history)
  };
}

/*
 * Checkout, for real.
 *
 * Posts the cart to the gateway and only writes an order to local history once
 * the gateway has accepted it and handed back a code and a token. If the post
 * fails, nothing is stored and the caller stays on checkout with the cart
 * intact: an order the server never accepted must never be shown as placed.
 */
export async function submitOrder(cart, meta = {}, { signal } = {}) {
  if (!cart?.length) {
    throw new OrderApiError("Your cart is empty.", { kind: "rejected", status: 400, code: "invalid_order" });
  }

  const payload = await placeOrder(buildOrderRequest(cart, meta), { signal });

  if (!payload?.order_code || !payload?.order_token) {
    // Without a token there is no way to ever read this order back, which is
    // indistinguishable from not having placed it. Refuse rather than persist an
    // order the customer could never open.
    throw new OrderApiError("bringit took the order but sent no tracking token.", {
      kind: "rejected",
      status: 502,
      code: "invalid_order"
    });
  }

  const order = createOrderRecord(payload, cart, meta);
  saveOrder(order);
  return order;
}

/*
 * Folds a `GET /api/orders/:code` payload into a stored record.
 *
 * The server owns stage, status, timing and money. The local record keeps the
 * cart snapshot and — critically — the token, which the gateway never echoes
 * back. The server's own item list is only adopted when we have no snapshot of
 * our own, e.g. an order opened from a device that did not place it.
 */
export function mergeServerOrder(order, payload) {
  if (!payload) return order;
  const items = order?.items?.length
    ? order.items
    : (payload.items || []).map((item, index) => ({
        id: `${payload.order_code}-${index}`,
        name: item?.name || "Item",
        qty: Number(item?.qty) || 1,
        price: Number(item?.unit_price) || 0,
        variationName: "",
        image: ""
      }));
  const totals = readTotals(payload.totals, items);

  return {
    ...order,
    items,
    totals,
    subtotal: totals.subtotal,
    status: payload.status || order?.status || "",
    stage: normalizeStage(payload.stage),
    placedAt: toTimestamp(payload.placed_at, order?.placedAt || 0),
    updatedAt: toTimestamp(payload.updated_at, Date.now()),
    etaMinutes: Number(payload.eta_minutes) || order?.etaMinutes || 25,
    fulfilment: payload.fulfilment || order?.fulfilment || "delivery",
    customerName: payload.customer_name || order?.customerName || "",
    history: readStageHistory(payload.history).length ? readStageHistory(payload.history) : order?.history || []
  };
}

// --- live sync --------------------------------------------------------------

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/*
 * Polls the gateway for one order and reports, honestly, how that is going.
 *
 * Rules, all of them deliberate:
 *   - poll every POLL_INTERVAL_MS while the order is still moving;
 *   - stop dead at `delivered` or `cancelled`, because nothing more will change;
 *   - stop entirely while the tab is hidden (a hidden tab shows nobody anything,
 *     and mobile browsers throttle its timers into uselessness anyway), then
 *     refresh immediately on the way back;
 *   - back off on failure instead of hammering a gateway that is down, and give
 *     up on a permanent rejection (a bad token will not start working);
 *   - never, under any failure, move the stage. The caller renders the last
 *     stage the server actually sent plus the state returned here.
 */
export function useOrderSync(order, onServerOrder) {
  const code = order?.code;
  const token = order?.token;
  const stage = order?.stage;
  const finished = isFinalStage(stage);
  const trackable = Boolean(code && token);

  const [sync, setSync] = useState({ phase: "idle", attempts: 0, lastOkAt: 0, retryInMs: 0, message: "" });
  const handlerRef = useRef(onServerOrder);
  handlerRef.current = onServerOrder;

  useEffect(() => {
    if (!trackable) {
      setSync({ phase: "untracked", attempts: 0, lastOkAt: 0, retryInMs: 0, message: "" });
      return undefined;
    }
    if (finished) {
      setSync((current) => ({ ...current, phase: "settled", attempts: 0, retryInMs: 0, message: "" }));
      return undefined;
    }

    let active = true;
    let inFlight = false;
    let timer = 0;
    let attempt = 0;
    const controller = new AbortController();

    const clearTimer = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    };

    const poll = async () => {
      clearTimer();
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      setSync((current) => ({ ...current, phase: current.lastOkAt ? "refreshing" : "connecting" }));

      try {
        const payload = await fetchOrder(code, token, { signal: controller.signal });
        if (!active) return;
        attempt = 0;
        handlerRef.current?.(payload);
        setSync({ phase: "live", attempts: 0, lastOkAt: Date.now(), retryInMs: 0, message: "" });
        // Keep going only while the server says there is more to come. The
        // effect also re-runs on the stage change and stops the loop there.
        if (!isFinalStage(payload?.stage)) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (!active || error?.name === "AbortError") return;
        attempt += 1;
        const retryInMs = getRetryDelayMs(attempt);
        const permanent = isPermanentRejection(error);
        setSync((current) => ({
          phase: isUnreachable(error) ? "unreachable" : "rejected",
          attempts: attempt,
          lastOkAt: current.lastOkAt,
          retryInMs: permanent ? 0 : retryInMs,
          message: describeOrderApiError(error)
        }));
        if (!permanent) timer = window.setTimeout(poll, retryInMs);
      } finally {
        inFlight = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearTimer();
      else poll();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    poll();

    return () => {
      active = false;
      clearTimer();
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [code, token, trackable, finished]);

  return sync;
}

// --- presentation -----------------------------------------------------------

function bezierPoint(t) {
  // Quadratic bezier along the map route: restaurant (30,150) -> home (290,118).
  const p0 = { x: 30, y: 150 };
  const p1 = { x: 165, y: 12 };
  const p2 = { x: 290, y: 118 };
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

function OtIcon({ name, size = 20 }) {
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
    check: (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    cross: (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    phone: (
      <svg {...common}>
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
      </svg>
    ),
    chat: (
      <svg {...common}>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
    ),
    star: (
      <svg {...common} fill="#ff8a00" stroke="#e45a1a">
        <path d="m12 2.8 2.6 5.4 6 .8-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.4 9l6-.8L12 2.8Z" />
      </svg>
    ),
    bag: (
      <svg {...common}>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    ),
    bike: (
      <svg {...common}>
        <circle cx="6" cy="17" r="3" />
        <circle cx="18" cy="17" r="3" />
        <path d="M6 17 10 7h3l2 4h3" />
        <path d="M13 7h3" />
      </svg>
    ),
    pin: (
      <svg {...common}>
        <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
    cloud: (
      <svg {...common}>
        <path d="M17 18H7a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1A3.5 3.5 0 0 1 17 18Z" />
        <path d="M3 3l18 18" />
      </svg>
    )
  };
  return icons[name] || null;
}

function TrackerMap({ fraction, delivered, cancelled }) {
  const courier = bezierPoint(fraction);
  return (
    <div className={`ot-map ${cancelled ? "cancelled" : ""}`} role="img" aria-label="Delivery route map">
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="ot-route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff4d2d" />
            <stop offset="100%" stopColor="#ff8a00" />
          </linearGradient>
        </defs>
        <path className="ot-route-bg" d="M30 150 Q165 12 290 118" />
        <path
          className="ot-route-fill"
          d="M30 150 Q165 12 290 118"
          style={{ strokeDashoffset: `${(1 - fraction) * 360}` }}
        />
        <g className="ot-pin ot-pin-start">
          <circle cx="30" cy="150" r="9" />
          <text x="30" y="154" textAnchor="middle">R</text>
        </g>
        <g className="ot-pin ot-pin-end">
          <circle cx="290" cy="118" r="9" />
          <text x="290" y="122" textAnchor="middle">H</text>
        </g>
        <g
          className={`ot-courier-dot ${delivered ? "arrived" : ""} ${cancelled ? "stopped" : ""}`}
          transform={`translate(${courier.x} ${courier.y})`}
        >
          <circle r="13" />
          <g transform="translate(-9 -9)">
            <OtIcon name={cancelled ? "cross" : "bike"} size={18} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/*
 * The timeline. A cancelled order keeps the stages it actually reached and then
 * ends on a cancelled row, instead of falling through to "placed" and implying
 * a kitchen is still working.
 */
function StageList({ stageIndex, cancelled, order }) {
  // A cancelled order shows only the stages it actually reached — the ones after
  // it will never happen, so listing them as "todo" would be a promise.
  const reached = (order.history || []).map((entry) => getStageIndex(entry?.stage)).filter((value) => value >= 0);
  const lastReached = cancelled ? Math.max(0, ...reached) : stageIndex;
  const visibleStages = cancelled ? ORDER_STAGES.slice(0, lastReached + 1) : ORDER_STAGES;

  return (
    <ol className="ot-steps">
      {visibleStages.map((stage, index) => {
        const state = cancelled || index < stageIndex ? "done" : index === stageIndex ? "active" : "todo";
        const note = stage.note
          .replace("The kitchen", order.restaurantName)
          .replace("Your rider", order.courier?.name || "Your rider");
        return (
          <li className={`ot-step ${state}`} key={stage.key}>
            <span className="ot-step-marker">
              {state === "done" ? <OtIcon name="check" size={16} /> : <i />}
            </span>
            <span className="ot-step-body">
              <strong>{stage.title}</strong>
              <small>{index === 1 ? `${order.restaurantName} accepted your order.` : note}</small>
            </span>
          </li>
        );
      })}
      {cancelled && (
        <li className="ot-step cancelled" key={CANCELLED_STAGE.key}>
          <span className="ot-step-marker">
            <OtIcon name="cross" size={16} />
          </span>
          <span className="ot-step-body">
            <strong>{CANCELLED_STAGE.title}</strong>
            <small>{CANCELLED_STAGE.note}</small>
          </span>
        </li>
      )}
    </ol>
  );
}

/*
 * The honesty banner.
 *
 * Three things a customer deserves to be told and previously never was: this
 * order is a leftover demo and no kitchen ever saw it; we cannot reach bringit
 * so what you are looking at is the last thing we were told and when; or the
 * gateway refused this order outright.
 */
function SyncNotice({ sync, order }) {
  if (!isRealOrder(order)) {
    return (
      <p className="ot-notice demo" role="status">
        <OtIcon name="cloud" size={16} />
        <span>
          <strong>Demo order.</strong> This one was never sent to bringit — it was placed before live ordering
          existed, so there is no kitchen working on it.
        </span>
      </p>
    );
  }

  if (sync.phase === "unreachable") {
    const since = formatClockTime(sync.lastOkAt || order.updatedAt || order.placedAt);
    return (
      <p className="ot-notice warn" role="status">
        <OtIcon name="cloud" size={16} />
        <span>
          <strong>Can't reach bringit right now, retrying.</strong> Showing the last update we have
          {since ? ` (${since})` : ""} — the kitchen may have moved on since.
        </span>
      </p>
    );
  }

  if (sync.phase === "rejected") {
    return (
      <p className="ot-notice warn" role="status">
        <OtIcon name="cloud" size={16} />
        <span>
          <strong>{sync.message}</strong>
          {sync.retryInMs ? " Trying again shortly." : ""}
        </span>
      </p>
    );
  }

  return null;
}

function RatingRow() {
  const [rating, setRating] = useState(0);
  return (
    <div className="ot-rating">
      <span>How was it?</span>
      <div className="ot-stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            className={value <= rating ? "on" : ""}
            type="button"
            key={value}
            aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
            aria-pressed={value <= rating}
            onClick={() => setRating(value)}
          >
            <OtIcon name="star" size={26} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OrderTrackingPage({ orderId, onHome, onReorder }) {
  const [orders, setOrders] = useState(readOrders);
  const [now, setNow] = useState(Date.now());
  const [cancelState, setCancelState] = useState({ pending: false, message: "" });

  // Refresh the store when the routed order changes (e.g. a fresh checkout).
  useEffect(() => {
    setOrders(readOrders());
    setCancelState({ pending: false, message: "" });
  }, [orderId]);

  // Whatever the server told us is written straight back to the local index, so
  // the next visit — online or not — starts from something true.
  useEffect(() => {
    if (orders.length) writeOrders(orders);
  }, [orders]);

  const activeOrder = useMemo(() => {
    if (!orders.length) return null;
    return orders.find((order) => order.id === orderId) || orders[0];
  }, [orders, orderId]);

  const activeId = activeOrder?.id;
  const applyServerOrder = (payload) => {
    if (!activeId) return;
    setOrders((current) => current.map((entry) => (entry.id === activeId ? mergeServerOrder(entry, payload) : entry)));
  };

  const sync = useOrderSync(activeOrder, applyServerOrder);

  const stage = normalizeStage(activeOrder?.stage);
  const cancelled = isCancelledStage(stage);
  const delivered = stage === "delivered";
  const settled = isFinalStage(stage);

  // The countdown is now an ETA clock (placed_at + the gateway's eta_minutes),
  // not a progress model. It counts down; it does not move the timeline.
  const etaRemainingMs = activeOrder
    ? Math.max(0, (activeOrder.placedAt || 0) + (Number(activeOrder.etaMinutes) || 25) * 60_000 - now)
    : 0;

  // Tick the ETA clock while the order is still open. Nothing about the stage
  // depends on this timer any more.
  useEffect(() => {
    if (!activeOrder || settled) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeOrder, settled]);

  if (!activeOrder) {
    return (
      <main className="shell ot-page">
        <div className="ot-empty">
          <div className="ot-empty-badge">
            <OtIcon name="bag" size={30} />
          </div>
          <h1>No active orders</h1>
          <p>When you place an order, live tracking shows up right here.</p>
          <button className="ot-primary" type="button" onClick={onHome}>
            Browse restaurants
          </button>
        </div>
      </main>
    );
  }

  const totals = activeOrder.totals || readTotals(null, activeOrder.items);
  const pastOrders = orders.filter((order) => order.id !== activeOrder.id).slice(0, 4);
  const stageIndex = Math.max(0, getStageIndex(stage));
  const canCancel = isRealOrder(activeOrder) && CANCELLABLE_STAGES.includes(stage) && !cancelState.pending;

  const requestCancellation = async () => {
    setCancelState({ pending: true, message: "" });
    try {
      const payload = await cancelOrder(activeOrder.code, activeOrder.token);
      setOrders((current) =>
        current.map((entry) => (entry.id === activeOrder.id ? mergeServerOrder(entry, payload) : entry))
      );
      setCancelState({ pending: false, message: "" });
    } catch (error) {
      // A 409 `too_late` is a real answer, not a glitch — show what it said.
      setCancelState({ pending: false, message: describeOrderApiError(error) });
    }
  };

  const statusEyebrow = cancelled ? "Cancelled" : delivered ? "Delivered" : "Arriving in";
  const statusValue = cancelled
    ? "—"
    : delivered
      ? "Enjoy!"
      : etaRemainingMs > 0
        ? formatCountdown(etaRemainingMs)
        : "Any minute";

  return (
    <main className="shell ot-page">
      <div className="ot-grid">
        <section className="ot-primary-col">
          <div className={`ot-status-card ${delivered ? "delivered" : ""} ${cancelled ? "cancelled" : ""}`}>
            <div className="ot-status-head">
              <span className="ot-status-eyebrow">{statusEyebrow}</span>
              <strong className="ot-countdown">{statusValue}</strong>
              <p className="ot-order-code">
                Order {activeOrder.code || "(demo)"} · {activeOrder.restaurantName}
                {isRealOrder(activeOrder) && (
                  <span className={`ot-live-pill ${sync.phase === "unreachable" || sync.phase === "rejected" ? "stale" : ""}`}>
                    {sync.phase === "unreachable" || sync.phase === "rejected"
                      ? "Last known"
                      : settled
                        ? "Confirmed"
                        : "Live"}
                  </span>
                )}
              </p>
            </div>
            <SyncNotice sync={sync} order={activeOrder} />
            <TrackerMap fraction={getStageFraction({ ...activeOrder, stage })} delivered={delivered} cancelled={cancelled} />
            <StageList stageIndex={stageIndex} cancelled={cancelled} order={activeOrder} />
            {(canCancel || cancelState.pending || cancelState.message) && (
              <div className="ot-cancel-row">
                {canCancel && (
                  <button className="ot-cancel" type="button" onClick={requestCancellation}>
                    Cancel order
                  </button>
                )}
                {cancelState.pending && <small>Asking the kitchen…</small>}
                {cancelState.message && <small className="ot-cancel-error">{cancelState.message}</small>}
              </div>
            )}
          </div>

          <div className="ot-courier-card">
            <span className="ot-courier-avatar" aria-hidden="true">
              {(activeOrder.courier?.name || "?").charAt(0)}
            </span>
            <div className="ot-courier-info">
              <strong>{activeOrder.courier?.name}</strong>
              <small>
                {activeOrder.courier?.vehicle} ·{" "}
                <span className="ot-courier-rating">
                  <OtIcon name="star" size={14} /> {activeOrder.courier?.rating}
                </span>
              </small>
            </div>
            <div className="ot-courier-actions">
              <button type="button" aria-label="Call rider">
                <OtIcon name="phone" size={18} />
              </button>
              <button type="button" aria-label="Chat with rider">
                <OtIcon name="chat" size={18} />
              </button>
            </div>
          </div>

          {delivered && <RatingRow />}
        </section>

        <aside className="ot-summary-col">
          <div className="ot-summary-card">
            <h2>Order summary</h2>
            <div className="ot-address">
              <OtIcon name="pin" size={18} />
              <span>
                {activeOrder.address || "Delivery address on file"}
                <small>{activeOrder.paymentLabel}</small>
              </span>
            </div>
            <ul className="ot-items">
              {activeOrder.items.map((item) => (
                <li key={item.id}>
                  <span className="ot-item-qty">{item.qty}×</span>
                  <span className="ot-item-name">
                    {item.name}
                    {item.variationName && <small>{item.variationName}</small>}
                  </span>
                  <span className="ot-item-price">{formatPrice(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="ot-summary-line">
              <span>Subtotal</span>
              <strong>{formatPrice(totals.subtotal)}</strong>
            </div>
            <div className="ot-summary-line muted">
              <span>Delivery fee</span>
              <strong>{totals.deliveryFee > 0 ? formatPrice(totals.deliveryFee) : "Free"}</strong>
            </div>
            <div className="ot-summary-total">
              <span>Total</span>
              <strong>{formatPrice(totals.total)}</strong>
            </div>
            <button className="ot-primary" type="button" onClick={onReorder || onHome}>
              Order more
            </button>
          </div>

          {pastOrders.length > 0 && (
            <div className="ot-history-card">
              <h2>Recent orders</h2>
              <ul>
                {pastOrders.map((order) => (
                  <li key={order.id}>
                    <span className="ot-history-badge" aria-hidden="true">
                      <OtIcon name="bag" size={16} />
                    </span>
                    <span className="ot-history-body">
                      <strong>{order.restaurantName}</strong>
                      <small>
                        {order.code || "Demo order"} · {order.items.reduce((sum, item) => sum + item.qty, 0)} item
                        {order.items.reduce((sum, item) => sum + item.qty, 0) === 1 ? "" : "s"}
                        {!isRealOrder(order) && <em className="ot-history-demo">demo</em>}
                      </small>
                    </span>
                    <span className="ot-history-total">{formatPrice(order.totals?.total ?? order.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
