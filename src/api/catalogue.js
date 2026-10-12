/*
 * The restaurant catalogue, from the gateway.
 *
 * Until now the storefront shipped its restaurants as a hard-coded array in the
 * bundle, so nothing a customer saw was real: the names, the ratings and the
 * prices were all decoration, and a redeploy was the only way to change them.
 * These two calls replace that with the live catalogue — around 750 Lahore
 * restaurants and their actual menus.
 *
 * Two shapes meet here and neither is going to change for the other. The
 * gateway speaks snake_case and talks about `restaurant_id`; the storefront's
 * components expect the shape the bundled seed had, down to `fee` being a
 * sentence rather than a number. Translating in this one module keeps the
 * gateway's vocabulary out of every component, and means the seed can still be
 * used as a fallback without anything downstream knowing which it got.
 *
 * `vendorCode` carries the restaurant id, because the storefront already keys
 * its asynchronous menu loading off that field existing — see `menuIsPending`
 * in App.jsx. Reusing it means the loading and failure states that were already
 * written keep working rather than needing a second mechanism beside them.
 */

import { requestJson } from "./client.js";

/** What the storefront prints under a restaurant card when it has no deal. */
const DEFAULT_FEE = "Delivery from Rs. 99";

const asMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

/**
 * One catalogue row, in the shape the cards already expect.
 *
 * Everything optional is omitted rather than faked. The seed carried things
 * like "15% off" and "1000+ reviews" because it was illustrative; inventing
 * those for a real restaurant would be putting a claim on their listing that
 * nobody made.
 */
function toRestaurant(row) {
  const rating = Number(row.rating);
  const minimum = asMoney(row.minimum_order);
  const fee = asMoney(row.delivery_fee);
  return {
    id: row.restaurant_id,
    // The storefront's async menu load keys off this field.
    vendorCode: row.restaurant_id,
    brandSlug: row.brand_slug || "",
    name: row.name,
    shortName: row.name.length > 30 ? `${row.name.slice(0, 28)}…` : row.name,
    categories: row.cuisine ? [row.cuisine] : [],
    image: row.image || "",
    rating: Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "",
    reviews: "",
    time: "From 30 min",
    price: "",
    fee: fee > 0 ? `Delivery from Rs. ${fee}` : DEFAULT_FEE,
    minOrder: minimum > 0 ? `Rs. ${minimum}` : ""
  };
}

/**
 * The catalogue.
 *
 * `limit` is capped by the gateway, so asking for more than it allows gets what
 * it allows rather than an error.
 */
export async function fetchRestaurants({ query = "", limit = 200, signal } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", String(limit));
  const rows = await requestJson(`/api/restaurants?${params}`, { signal });
  return Array.isArray(rows) ? rows.filter((row) => row && row.restaurant_id).map(toRestaurant) : [];
}

/**
 * One restaurant's menu, as the sections the menu page renders.
 *
 * The gateway returns categories of items with real prices. `oldPrice` and
 * `discount` are deliberately absent: a struck-through price is a claim that
 * something was reduced, and nothing here knows that.
 */
export async function fetchRestaurantMenu(restaurantId, { signal } = {}) {
  const menu = await requestJson(`/api/restaurants/${encodeURIComponent(restaurantId)}/menu`, { signal });
  const categories = Array.isArray(menu?.categories) ? menu.categories : [];
  return categories
    .map((category) => ({
      title: category.name,
      subtitle: "",
      items: (category.items || [])
        .filter((item) => item && item.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: asMoney(item.price),
          description: item.description || "",
          image: item.image?.url || "",
          serves: "",
          // An item the kitchen has turned off is shown and refused, not hidden:
          // a dish vanishing between visits reads as the menu being wrong.
          soldOut: item.available === false
        }))
    }))
    .filter((section) => section.items.length > 0);
}
