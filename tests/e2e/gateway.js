/*
 * A stand-in for the order gateway.
 *
 * The e2e suite must never need a live backend, so every /api/orders route is
 * answered here with the exact payload shapes the gateway contract publishes.
 * The returned control object is mutable from the test: flipping `stage` or
 * `offline` is how a test drives a kitchen status change or a dead gateway.
 */

export const ORDER_CODE = "BRG-E2E001";
export const ORDER_TOKEN = "tok_e2e_abc123";
export const PLACED_AT = "2026-10-12T09:15:00.000Z";
export const ORDERS_STORAGE_KEY = "bringit-orders-v1";

const ORDER_ITEMS = [{ name: "Falsa Juice", qty: 1, unit_price: 297.5, line_total: 297.5 }];
const ORDER_TOTALS = { subtotal: 297.5, delivery_fee: 0, total: 297.5 };

const asJson = (body, status = 200) => ({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body)
});

/*
 * Unsplash is the app's only cross-origin dependency. Blocking it keeps the card
 * grid from reflowing while a photo streams in, which is what makes clicks on a
 * freshly rendered card time out on Playwright's stability check.
 */
export async function blockRemoteImages(page) {
  await page.route("https://images.unsplash.com/**", (route) => route.abort());
}

export async function mockOrderGateway(page, options = {}) {
  const state = {
    stage: options.stage || "placed",
    status: options.status || "PLACED_BY_CUSTOMER",
    offline: Boolean(options.offline),
    cancelTooLate: Boolean(options.cancelTooLate),
    history: options.history || [{ stage: "placed", at: PLACED_AT }],
    placements: 0,
    reads: 0
  };

  await page.route(/\/api\/orders/, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    // A gateway we cannot reach: no response at all, which is what the client
    // has to turn into "can't reach bringit, retrying".
    if (state.offline) {
      await route.abort("connectionfailed");
      return;
    }

    if (request.method() === "POST" && pathname.endsWith("/cancel")) {
      if (state.cancelTooLate) {
        await route.fulfill(
          asJson({ error: "too_late", message: "The kitchen has already started this order." }, 409)
        );
        return;
      }
      state.stage = "cancelled";
      state.status = "CANCELLED";
      await route.fulfill(asJson({ order_code: ORDER_CODE, status: "CANCELLED", stage: "cancelled" }));
      return;
    }

    if (request.method() === "POST") {
      state.placements += 1;
      await route.fulfill(
        asJson(
          {
            order_code: ORDER_CODE,
            order_token: ORDER_TOKEN,
            status: state.status,
            stage: state.stage,
            placed_at: PLACED_AT,
            eta_minutes: 28,
            totals: ORDER_TOTALS,
            items: ORDER_ITEMS
          },
          201
        )
      );
      return;
    }

    state.reads += 1;
    await route.fulfill(
      asJson({
        order_code: ORDER_CODE,
        status: state.status,
        stage: state.stage,
        placed_at: PLACED_AT,
        updated_at: new Date().toISOString(),
        eta_minutes: 28,
        items: ORDER_ITEMS,
        totals: ORDER_TOTALS,
        customer_name: "Afzal",
        fulfilment: "delivery",
        history: state.history
      })
    );
  });

  return state;
}

// Drops a real (server-accepted) order into the local index before the app
// boots, so a test can land straight on /order without walking checkout.
export async function seedStoredOrder(page, overrides = {}) {
  const order = {
    id: `order-${ORDER_CODE}`,
    code: ORDER_CODE,
    token: ORDER_TOKEN,
    status: "PLACED_BY_CUSTOMER",
    stage: "placed",
    placedAt: Date.parse(PLACED_AT),
    updatedAt: Date.parse(PLACED_AT),
    etaMinutes: 28,
    fulfilment: "delivery",
    restaurantName: "Bholli Juice & Dry Fruit - Liberty",
    address: "Flat 23E, Gulberg, Lahore",
    customerName: "Afzal",
    paymentLabel: "Cash on delivery",
    courier: { name: "Bilal R.", vehicle: "Motorbike", rating: "4.9" },
    items: [{ id: "falsa", name: "Falsa Juice", qty: 1, price: 297.5, variationName: "", image: "" }],
    totals: { subtotal: 297.5, deliveryFee: 0, total: 297.5 },
    subtotal: 297.5,
    history: [{ stage: "placed", at: Date.parse(PLACED_AT) }],
    ...overrides
  };

  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [ORDERS_STORAGE_KEY, JSON.stringify([order])]
  );

  return order;
}

// --- accounts and addresses -------------------------------------------------

export const SESSION_STORAGE_KEY = "bringit-session-v1";
export const ADDRESS_STORAGE_KEY = "bringit-addresses-v1";

export const USER_ID = "usr_ba5028a96d304527";
export const PROFILE_ID = "cus_f2d4f47c458e42e6";
export const SESSION_TOKEN = "tok_17fedb2c85bf458e";
export const VERIFICATION_CODE = "883469";

/*
 * Stands in for the auth and customer-profile routes, with the real captured
 * shapes: register leaves the account PENDING_VERIFICATION and returns a code,
 * login before verifying is a 403, and the profile id is the `cus_...` one that
 * carts and orders key off.
 */
export async function mockAccountApi(page, options = {}) {
  const state = {
    offline: Boolean(options.offline),
    verified: options.verified !== false,
    password: options.password || "Doc#2026",
    logins: 0,
    profiles: 0
  };

  await page.route(/\/api\/v1\/auth\//, async (route) => {
    if (state.offline) {
      await route.abort("connectionfailed");
      return;
    }
    const { pathname } = new URL(route.request().url());
    const body = route.request().postDataJSON() || {};

    if (pathname.endsWith("/register")) {
      state.verified = false;
      await route.fulfill(
        asJson(
          {
            user: { id: USER_ID, email: body.email, display_name: body.display_name, status: "PENDING_VERIFICATION" },
            verification: { id: "vcd_0bfabf9ed65f458a", code: VERIFICATION_CODE, status: "PENDING" },
            verification_required: true
          },
          201
        )
      );
      return;
    }

    if (pathname.endsWith("/verify-code")) {
      if (body.code !== VERIFICATION_CODE) {
        await route.fulfill(asJson({ error: "invalid_code" }, 400));
        return;
      }
      state.verified = true;
      await route.fulfill(asJson({ verification_status: "VERIFIED", user: { id: USER_ID, status: "ACTIVE" } }));
      return;
    }

    if (pathname.endsWith("/login")) {
      if (!state.verified) {
        await route.fulfill(asJson({ error: "account_not_active", status: "PENDING_VERIFICATION" }, 403));
        return;
      }
      if (body.password !== state.password) {
        await route.fulfill(asJson({ error: "invalid_credentials" }, 401));
        return;
      }
      state.logins += 1;
      await route.fulfill(
        asJson({
          session: {
            id: "ses_8ce6469634b54be2",
            token: SESSION_TOKEN,
            status: "ACTIVE",
            user_id: USER_ID,
            expires_at: "2099-10-12T10:32:46.744713Z"
          },
          user: { id: USER_ID, email: body.email, status: "ACTIVE", default_role: "CUSTOMER" }
        })
      );
      return;
    }

    await route.fulfill(asJson({ error: "not_found" }, 404));
  });

  await page.route(/\/api\/customers\/profiles/, async (route) => {
    if (state.offline) {
      await route.abort("connectionfailed");
      return;
    }
    state.profiles += 1;
    const body = route.request().postDataJSON() || {};
    await route.fulfill(
      asJson({ id: PROFILE_ID, user_id: USER_ID, display_name: body.display_name, addresses: [] }, 201)
    );
  });

  return state;
}

// Signs somebody in before the app boots, for specs that are about something
// other than the sign-in flow itself.
export async function seedSession(page, overrides = {}) {
  const session = {
    token: SESSION_TOKEN,
    expiresAt: Date.parse("2099-10-12T10:32:46.744713Z"),
    userId: USER_ID,
    profileId: PROFILE_ID,
    displayName: "Afzal",
    email: "afzal@example.com",
    phone: "+923009998888",
    ...overrides
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [SESSION_STORAGE_KEY, JSON.stringify(session)]
  );
  return session;
}

// Picks a delivery address before the app boots. Checkout needs one, because the
// hardcoded "Flat 23E Lahore" that used to stand in for it is gone.
export async function seedAddress(page, overrides = {}) {
  const address = {
    id: "adr_home",
    label: "Home",
    line1: "12-C Main Boulevard",
    area: "Gulberg III",
    city: "Lahore",
    notes: "Ring the bell",
    ...overrides
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [ADDRESS_STORAGE_KEY, JSON.stringify({ addresses: [address], selectedId: address.id })]
  );
  return address;
}
