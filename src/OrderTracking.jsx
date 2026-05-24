import { useEffect, useMemo, useState } from "react";
import "./OrderTracking.css";

/*
 * Live order tracking + order history.
 *
 * Self-contained feature module: everything the tracking experience needs
 * (persistence helpers, timeline math, icons, styles) lives here so the rest
 * of the app only has to build an order, clear the cart, and route to it.
 */

const ORDERS_STORAGE_KEY = "bringit-orders-v1";

// Compressed demo timeline so the full journey plays out in ~90s while the
// on-screen countdown still reads like a plausible delivery ETA.
export const DEMO_TOTAL_MS = 90_000;

export const ORDER_STAGES = [
  { key: "placed", title: "Order placed", note: "We've received your order.", start: 0 },
  { key: "confirmed", title: "Restaurant confirmed", note: "The kitchen accepted your order.", start: 0.12 },
  { key: "preparing", title: "Preparing your food", note: "Fresh off the kitchen line.", start: 0.3 },
  { key: "on_the_way", title: "On the way", note: "Your rider is heading over.", start: 0.62 },
  { key: "delivered", title: "Delivered", note: "Enjoy your meal!", start: 1 }
];

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

function makeOrderCode() {
  const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  const salt = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `BRG-${stamp}${salt}`;
}

// Builds an immutable snapshot of the cart at checkout time.
export function createOrder(cart, meta = {}) {
  const items = (cart || []).map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty,
    price: item.price,
    variationName: item.variationName || "",
    image: item.image || ""
  }));
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  const id = `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const restaurantName = meta.restaurantName || cart?.[0]?.restaurantName || "bringit restaurant";

  return {
    id,
    code: makeOrderCode(),
    placedAt: Date.now(),
    totalMs: DEMO_TOTAL_MS,
    etaMinutes: Number(meta.etaMinutes) || 25,
    restaurantName,
    address: meta.address || "Flat 23E Lahore",
    customerName: meta.customerName || "Afzal",
    paymentLabel: meta.paymentLabel || "Cash on delivery",
    courier: COURIERS[hashString(id) % COURIERS.length],
    items,
    subtotal
  };
}

// Persists a new order at the head of the history list and returns the list.
export function saveOrder(order) {
  const next = [order, ...readOrders().filter((existing) => existing.id !== order.id)].slice(0, 20);
  writeOrders(next);
  return next;
}

// Derives live progress from elapsed wall-clock time so it keeps advancing
// correctly across reloads (the order carries its own placedAt timestamp).
export function getOrderProgress(order, now = Date.now()) {
  const total = Number(order?.totalMs) || DEMO_TOTAL_MS;
  const elapsed = Math.max(0, now - (Number(order?.placedAt) || now));
  const fraction = Math.min(1, elapsed / total);
  const remainingMs = Math.max(0, total - elapsed);

  let stageIndex = 0;
  for (let i = 0; i < ORDER_STAGES.length; i += 1) {
    if (fraction >= ORDER_STAGES[i].start) stageIndex = i;
  }
  if (fraction >= 1) stageIndex = ORDER_STAGES.length - 1;

  return { fraction, remainingMs, stageIndex, delivered: fraction >= 1 };
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
    )
  };
  return icons[name] || null;
}

function TrackerMap({ progress }) {
  const courier = bezierPoint(progress.fraction);
  return (
    <div className="ot-map" role="img" aria-label="Delivery route map">
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
          style={{ strokeDashoffset: `${(1 - progress.fraction) * 360}` }}
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
          className={`ot-courier-dot ${progress.delivered ? "arrived" : ""}`}
          transform={`translate(${courier.x} ${courier.y})`}
        >
          <circle r="13" />
          <g transform="translate(-9 -9)">
            <OtIcon name="bike" size={18} />
          </g>
        </g>
      </svg>
    </div>
  );
}

function StageList({ stageIndex, order }) {
  return (
    <ol className="ot-steps">
      {ORDER_STAGES.map((stage, index) => {
        const state = index < stageIndex ? "done" : index === stageIndex ? "active" : "todo";
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
    </ol>
  );
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

  // Refresh the store when the routed order changes (e.g. a fresh checkout).
  useEffect(() => {
    setOrders(readOrders());
  }, [orderId]);

  const activeOrder = useMemo(() => {
    if (!orders.length) return null;
    return orders.find((order) => order.id === orderId) || orders[0];
  }, [orders, orderId]);

  const progress = useMemo(
    () => (activeOrder ? getOrderProgress(activeOrder, now) : null),
    [activeOrder, now]
  );

  // Tick once a second while the active order is still en route.
  useEffect(() => {
    if (!activeOrder || progress?.delivered) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeOrder, progress?.delivered]);

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

  const total = activeOrder.subtotal;
  const pastOrders = orders.filter((order) => order.id !== activeOrder.id).slice(0, 4);

  return (
    <main className="shell ot-page">
      <div className="ot-grid">
        <section className="ot-primary-col">
          <div className={`ot-status-card ${progress.delivered ? "delivered" : ""}`}>
            <div className="ot-status-head">
              <span className="ot-status-eyebrow">
                {progress.delivered ? "Delivered" : "Arriving in"}
              </span>
              <strong className="ot-countdown">
                {progress.delivered ? "Enjoy!" : formatCountdown(progress.remainingMs)}
              </strong>
              <p className="ot-order-code">
                Order {activeOrder.code} · {activeOrder.restaurantName}
              </p>
            </div>
            <TrackerMap progress={progress} />
            <StageList stageIndex={progress.stageIndex} order={activeOrder} />
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

          {progress.delivered && <RatingRow />}
        </section>

        <aside className="ot-summary-col">
          <div className="ot-summary-card">
            <h2>Order summary</h2>
            <div className="ot-address">
              <OtIcon name="pin" size={18} />
              <span>
                {activeOrder.address}
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
              <strong>{formatPrice(total)}</strong>
            </div>
            <div className="ot-summary-line muted">
              <span>Delivery fee</span>
              <strong>Free</strong>
            </div>
            <div className="ot-summary-total">
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
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
                        {order.code} · {order.items.reduce((sum, item) => sum + item.qty, 0)} item
                        {order.items.reduce((sum, item) => sum + item.qty, 0) === 1 ? "" : "s"}
                      </small>
                    </span>
                    <span className="ot-history-total">{formatPrice(order.subtotal)}</span>
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
