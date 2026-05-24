import { useEffect, useState } from "react";

const img = (id, width = 900, height = 540) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&h=${height}&q=82`;

const EXPORT_SLUG = "askari-2-lahore-cantt";
const MENU_CATEGORY_TAB_LIMIT = 5;
const MENU_ITEMS_VISIBLE_LIMIT = 24;
const MENU_SEARCH_VISIBLE_LIMIT = 30;
const fallbackRestaurantImage = img("photo-1544145945-f90425340c7e");
const fallbackProductImage = img("photo-1622597467836-f3285f2131b8", 420, 320);
const PERSONALIZATION_ICON_COUNT = 60;
const homeRoute = "/";
const searchRoutePrefix = "/search/";
const restaurantRoutePrefix = "/restaurants/";
const cartRoute = "/cart";
const checkoutRoute = "/checkout";

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "bringit";

const getRestaurantSlug = (restaurant) => slugify(`${restaurant.name || restaurant.shortName}-${restaurant.vendorCode || restaurant.id}`);

const getStableIconIndex = (value) =>
  String(value || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % PERSONALIZATION_ICON_COUNT;

const getSpritePosition = (index) => {
  const safeIndex = Math.abs(Number(index) || 0) % PERSONALIZATION_ICON_COUNT;
  const x = (safeIndex % 10) * (100 / 9);
  const y = Math.floor(safeIndex / 10) * (100 / 5);

  return `${x}% ${y}%`;
};

const getRestaurantFromSlug = (slug, items) => {
  const cleanSlug = slugify(slug);
  return (items || []).find((restaurant) => getRestaurantSlug(restaurant) === cleanSlug) || null;
};

const getRouteState = (items = restaurants) => {
  const path = window.location.pathname.replace(/\/+$/, "") || homeRoute;

  if (path.startsWith(searchRoutePrefix)) {
    return { view: "results", query: decodeURIComponent(path.slice(searchRoutePrefix.length)).replace(/-/g, " ") || "bholi" };
  }

  if (path.startsWith(restaurantRoutePrefix)) {
    const restaurant = getRestaurantFromSlug(path.slice(restaurantRoutePrefix.length), items);
    return { view: "restaurant", restaurant: restaurant || items[0] };
  }

  if (path === cartRoute) return { view: "cart" };
  if (path === checkoutRoute) return { view: "delivery" };

  return { view: "home" };
};

const setMetaTag = (name, content, attribute = "name") => {
  if (!content) return;
  let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const setCanonical = (path) => {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", `${window.location.origin}${path}`);
};

const setJsonLd = (payload) => {
  let script = document.head.querySelector('script[data-bringit-schema="true"]');
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.bringitSchema = "true";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
};

const getSeo = (view, query, restaurant) => {
  if (view === "results") {
    const label = query || "restaurants";
    return {
      title: `${label} delivery in Lahore | bringit`,
      description: `Order ${label} from nearby Lahore restaurants with bringit fast delivery and local offers.`,
      path: `${searchRoutePrefix}${slugify(label)}`
    };
  }

  if (view === "restaurant" && restaurant) {
    return {
      title: `${restaurant.name} menu and delivery | bringit Lahore`,
      description: `Order from ${restaurant.name} on bringit. Browse menu items, deals, delivery time, ratings, and restaurant details.`,
      path: `${restaurantRoutePrefix}${getRestaurantSlug(restaurant)}`
    };
  }

  if (view === "cart") {
    return {
      title: "Your cart | bringit",
      description: "Review your bringit cart before checkout.",
      path: cartRoute
    };
  }

  if (view === "delivery") {
    return {
      title: "Checkout | bringit",
      description: "Confirm delivery details and place your bringit order.",
      path: checkoutRoute
    };
  }

  return {
    title: "bringit | Fast food delivery across Pakistan",
    description: "Order food, groceries, and local deals with bringit. Fast delivery across Lahore and Pakistan.",
    path: homeRoute
  };
};

const restaurants = [
  {
    id: "bholli",
    name: "Bholli Juice & Dry Fruit - Liberty",
    shortName: "Bholli Juice & Dry Fruit - Li...",
    categories: ["Beverages", "Healthy Food"],
    image: img("photo-1622597467836-f3285f2131b8"),
    rating: "4.7",
    reviews: "1000+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver",
    tag: "15% off",
    minOrder: "Rs. 249"
  },
  {
    id: "iceland",
    name: "Iceland & Juice Corner - Gulberg",
    shortName: "Iceland & Juice Corner - G...",
    categories: ["Healthy Food", "Beverages"],
    image: img("photo-1544145945-f90425340c7e"),
    rating: "4.7",
    reviews: "1000+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver",
    tag: "15% off",
    ad: true
  },
  {
    id: "greeno",
    name: "Greeno - Shami Road",
    shortName: "Greeno - Shami Roac",
    categories: ["Healthy Food"],
    image: img("photo-1577805947697-89e18249d767"),
    rating: "4.9",
    reviews: "500+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver"
  },
  {
    id: "hardees",
    name: "Hardee's - Gulberg",
    shortName: "Hardee's - Gulber...",
    categories: ["Fast Food"],
    image: img("photo-1568901346375-23c9450c58cd"),
    rating: "4.8",
    reviews: "1000+",
    time: "From 10 min",
    price: "$$$",
    fee: "From Rs.134 with Saver",
    tag: "Rs.371 off Rs.371",
    ad: true
  },
  {
    id: "mcdonalds",
    name: "McDonald's - 1-K Gulberg",
    shortName: "McDonald's - 1-K ...",
    categories: ["Fast Food", "In-Store Price"],
    image: img("photo-1550547660-d9450f859349"),
    rating: "4.8",
    reviews: "5000+",
    time: "From 15 min",
    price: "$$$",
    fee: "Rs.75"
  },
  {
    id: "kfc",
    name: "KFC - Cavalry",
    shortName: "KFC - Cavalry",
    categories: ["Fast Food", "In-Store Price"],
    image: img("photo-1626645738196-c2a7c87a8f58"),
    rating: "4.3",
    reviews: "35000+",
    time: "From 25 min",
    price: "$$",
    fee: "Rs.70"
  },
  {
    id: "baskin",
    name: "Baskin Robbins - Gulberg",
    shortName: "Baskin Robbins ...",
    categories: ["Fast Food", "In-Store Price"],
    image: img("photo-1563805042-7684c019e1cb"),
    rating: "4.9",
    reviews: "100+",
    time: "From 10 min",
    price: "$$$",
    fee: "From Rs.134 with Saver",
    tag: "Up to Rs.448 off"
  },
  {
    id: "ice-land",
    name: "Ice Land - Ghalib Market",
    shortName: "Ice Land - Ghalib Market",
    categories: ["Healthy Food"],
    image: img("photo-1547592180-85f173990554"),
    rating: "4.8",
    reviews: "500+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver",
    tag: "15% off",
    ad: true
  },
  {
    id: "fresh-juice",
    name: "ICE LAND Fresh Juices & Desserts",
    shortName: "ICE LAND Fresh Juices & D...",
    categories: ["Healthy Food", "In-Store Price"],
    image: img("photo-1603569283847-aa295f0d016a"),
    rating: "4.8",
    reviews: "5000+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver",
    tag: "15% off"
  },
  {
    id: "ice-main",
    name: "Ice Land - Main Market Gulberg",
    shortName: "Ice Land - Main Market Gulb...",
    categories: ["Healthy Food"],
    image: img("photo-1567206563064-6f60f40a2b57"),
    rating: "4.9",
    reviews: "100+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.154 with Saver",
    ad: true
  },
  {
    id: "clifton",
    name: "Clifton Grill",
    shortName: "Clifton Grill",
    categories: ["Sandwiches"],
    image: img("photo-1528735602780-2552fd46c7af"),
    rating: "4.8",
    reviews: "5000+",
    time: "From 15 min",
    price: "$",
    fee: "From Rs.134 with Saver",
    tag: "Up to 10% off"
  },
  {
    id: "ishaq",
    name: "Ishaq Pulao - Gulberg",
    shortName: "Ishaq Pulao - Gulberg",
    categories: ["Pakistani"],
    image: img("photo-1589302168068-964664d93dc0"),
    rating: "4.9",
    reviews: "1000+",
    time: "From 10 min",
    price: "$$",
    fee: "From Rs.114 with Saver"
  },
  {
    id: "kruncheese",
    name: "Kruncheese - Gulberg",
    shortName: "Kruncheese- Gulberg",
    categories: ["Fast Food", "In-Store Price"],
    image: img("photo-1562967914-608f82629710"),
    rating: "4.8",
    reviews: "3000+",
    time: "From 20 min",
    price: "$$",
    fee: "From Rs.154 with Saver"
  },
  {
    id: "johnny",
    name: "Johnny & Jugnu - Gulberg",
    shortName: "Johnny & Jugnu - Gulberg",
    categories: ["Fast Food"],
    image: img("photo-1565299507177-b0ac66763828"),
    rating: "4.9",
    reviews: "20000+",
    time: "From 30 min",
    price: "$$",
    fee: "From Rs.124 with Saver"
  },
  {
    id: "daily",
    name: "Daily Deli Co. - Gulberg",
    shortName: "Daily Deli Co. - Gulberg",
    categories: ["Fast Food"],
    image: img("photo-1550317138-10000687a72b"),
    rating: "4.9",
    reviews: "100+",
    time: "From 15 min",
    price: "$$$",
    fee: "From Rs.134 with Saver"
  }
];

const cuisines = [
  ["Pasta", img("photo-1621996346565-e3dbc646d9a9", 300, 240)],
  ["Cakes & Bakery", img("photo-1488477181946-6428a0291777", 300, 240)],
  ["Sandwiches", img("photo-1528735602780-2552fd46c7af", 300, 240)],
  ["Tea & Coffee", img("photo-1495474472287-4d71bcdd2085", 300, 240)],
  ["Fast Food", img("photo-1626645738196-c2a7c87a8f58", 300, 240)],
  ["Pizza", img("photo-1513104890138-7c749659a591", 300, 240)],
  ["Biryani", img("photo-1589302168068-964664d93dc0", 300, 240)],
  ["Burgers", img("photo-1568901346375-23c9450c58cd", 300, 240)]
];

const brands = [
  ["KFC", "25 min", "#d71920"],
  ["Domino's Pizza", "45 min", "#f0f1f3"],
  ["Broadway", "20 min", "#2b7747"],
  ["California Pizza", "25 min", "#f3f3f3"]
];

const shops = [
  ["Sultani Medical Store", "15 min", "#6a2de2"],
  ["Zoom 24 Needs - MM Alam Road", "10 min", "#f1f1f1"],
  ["Shell (PK)", "10 min", "#f8cf36"],
  ["Servaid Franchise", "15 min", "#f4f4f4"]
];

const menuSections = [
  {
    title: "Popular",
    subtitle: "Most ordered right now.",
    items: [
      {
        id: "falsa",
        name: "Falsa Juice",
        price: 297.5,
        oldPrice: 350,
        serves: "Serves 1",
        image: img("photo-1623065422902-30a2d299bbe4", 420, 320),
        discount: "15% off"
      },
      {
        id: "mango",
        name: "Mango Shake",
        price: 340,
        oldPrice: 400,
        serves: "Serves 1",
        image: img("photo-1622597467836-f3285f2131b8", 420, 320),
        discount: "15% off"
      },
      {
        id: "strawberry",
        name: "Strawberry Shake",
        price: 467.5,
        oldPrice: 550,
        serves: "Serves 1",
        image: img("photo-1577805947697-89e18249d767", 420, 320),
        discount: "15% off"
      },
      {
        id: "banana",
        name: "Banana Shake",
        price: 297.5,
        oldPrice: 350,
        serves: "Serves 1",
        image: img("photo-1570696516188-ade861b84a49", 420, 320),
        discount: "15% off"
      },
      {
        id: "cream-chaat",
        name: "Cream Chaat",
        price: 255,
        oldPrice: 300,
        serves: "Serves 1",
        image: img("photo-1540189549336-e6e99c3679fe", 420, 320),
        discount: "15% off"
      },
      {
        id: "date-khoya",
        name: "Date Khoya Shake",
        price: 382.5,
        oldPrice: 450,
        serves: "Serves 1",
        image: img("photo-1572490122747-3968b75cc699", 420, 320),
        discount: "15% off"
      }
    ]
  },
  {
    title: "Ramadan Deals",
    subtitle: "Sweet bundles for one.",
    items: [
      {
        id: "deal-1",
        name: "Fruit Cream Bowl",
        price: 425,
        oldPrice: 500,
        serves: "Serves 1",
        image: img("photo-1519996529931-28324d5a630e", 420, 320),
        discount: "15% off"
      },
      {
        id: "deal-2",
        name: "Fresh Juice Combo",
        price: 680,
        oldPrice: 800,
        serves: "Serves 2",
        image: img("photo-1603569283847-aa295f0d016a", 420, 320),
        discount: "15% off"
      }
    ]
  }
];

const EMPTY_MENU_SECTIONS = [];

const formatPrice = (value) => {
  const amount = Number(value) || 0;

  return `Rs. ${amount.toLocaleString("en-PK", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
};

function getDefaultVariationId(item) {
  return item?.variations?.[0]?.variationId || "";
}

function getSelectedVariation(item, variationId) {
  const variations = item?.variations || [];
  return variations.find((variation) => variation.variationId === variationId) || variations[0] || null;
}

function getVariationPricing(item, variation) {
  if (!variation) {
    return {
      price: Number(item?.price || 0),
      oldPrice: Number(item?.oldPrice || item?.price || 0)
    };
  }

  const oldPrice = Number(variation.price || item?.oldPrice || item?.price || 0);
  const price = item?.discount && oldPrice ? Math.round(oldPrice * 0.85 * 100) / 100 : oldPrice;

  return { price, oldPrice };
}

function getVariationLabel(item, variation, index = 0) {
  if (!variation) {
    return "";
  }

  if (variation.name && variation.name !== item?.name) {
    return variation.name;
  }

  return `Option ${index + 1}`;
}

const textMatch = (value, term) => String(value || "").toLowerCase().includes(term);

function getSearchText(restaurant) {
  return [
    restaurant.searchText,
    restaurant.name,
    restaurant.shortName,
    ...(restaurant.categories || []),
    ...(restaurant.menuCategories || []).map((category) => category.name)
  ].filter(Boolean).join(" ").toLowerCase();
}

function getBholiSearchScore(restaurant, term) {
  const name = String(restaurant.name || "").toLowerCase();
  const cuisineText = (restaurant.categories || []).join(" ").toLowerCase();
  const menuText = (restaurant.menuCategories || []).map((category) => category.name).join(" ").toLowerCase();
  const searchableText = getSearchText(restaurant);
  let score = searchableText.includes(term) ? 420 : 0;

  if (name.includes("bholli") || name.includes("bholi")) score += 900;
  if (name.includes("juice")) score += 260;
  if (name.includes("fresh")) score += 130;
  if (name.includes("dry fruit")) score += 120;
  if (name.includes("ice land") || name.includes("iceland")) score += 160;
  if (name.includes("greeno")) score += 130;

  if (cuisineText.includes("healthy")) score += 180;
  if (cuisineText.includes("beverage")) score += 160;
  if (cuisineText.includes("shakes")) score += 105;
  if (cuisineText.includes("ice cream")) score += 55;

  if (menuText.includes("juice")) score += 150;
  if (menuText.includes("shake")) score += 90;
  if (menuText.includes("smoothie")) score += 80;
  if (menuText.includes("beverage")) score += 60;
  if (menuText.includes("salad")) score += 45;

  const broadFastFoodMatch = /(burger|fast food|pizza|shawarma|wraps|rolls|chicken|biryani|pulao|karahi)/.test(cuisineText);
  if (broadFastFoodMatch && score < 280) {
    score -= 170;
  }

  score += Math.min(getRatingValue(restaurant) * 3, 15);
  score += Math.min((restaurant.reviewCount || 0) / 700, 12);
  score += Math.max(0, 8 - getDeliveryMinutes(restaurant) / 10);

  return score;
}

function getSearchResults(query, items) {
  const term = String(query || "").trim().toLowerCase();

  if (!term) {
    return items;
  }

  if (term.includes("bhol")) {
    return items
      .map((restaurant, index) => ({
        restaurant,
        index,
        score: getBholiSearchScore(restaurant, term)
      }))
      .filter(({ restaurant, score }) => getSearchText(restaurant).includes(term) || score > 40)
      .sort((left, right) => {
        const leftExact = textMatch(left.restaurant.name, "bholli") ? 1 : 0;
        const rightExact = textMatch(right.restaurant.name, "bholli") ? 1 : 0;

        return rightExact - leftExact ||
          right.score - left.score ||
          (right.restaurant.reviewCount || 0) - (left.restaurant.reviewCount || 0) ||
          left.index - right.index;
      })
      .map(({ restaurant }) => restaurant);
  }

  const exactMatches = items.filter((restaurant) => getSearchText(restaurant).includes(term));
  return exactMatches.length ? exactMatches : items;
}

function getResultsCountLabel(query, results) {
  const term = String(query || "").trim().toLowerCase();
  const count = term.includes("bhol") ? 128 : results.length;
  return `${count} Restaurants found`;
}

const DEFAULT_FILTERS = {
  sort: "Relevance",
  rating4: false,
  superRestaurant: false,
  offers: [],
  cuisines: [],
  cuisineSearch: ""
};

const defaultCuisineFilterOptions = ["American", "BBQ", "Beverages", "Biryani", "Broast", "Burgers"];
const offerFilterOptions = ["Free delivery", "Accepts vouchers", "Deals"];
const excludedCuisineFilters = new Set([
  "deals",
  "exclusive discounted deals",
  "in-store price",
  "popular",
  "ramadan deals"
]);

function getCuisineFilterOptions(items, limit = 8) {
  const counts = new Map();

  for (const restaurant of items || []) {
    const restaurantCuisines = [...new Set([...(restaurant.categories || []), ...(restaurant.cuisines || [])])];
    const menuCategories = restaurant.menuCategories || [];

    for (const cuisine of restaurantCuisines) {
      const label = String(cuisine || "").trim();
      const key = label.toLowerCase();

      if (!label || excludedCuisineFilters.has(key)) continue;
      counts.set(label, (counts.get(label) || 0) + 3);
    }

    for (const category of menuCategories) {
      const label = String(category.name || category || "").trim();
      const key = label.toLowerCase();

      if (!label || excludedCuisineFilters.has(key)) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }

  const options = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label]) => label);

  return options.length ? options : defaultCuisineFilterOptions;
}

function getRatingValue(restaurant) {
  return Number.parseFloat(restaurant.rating) || 0;
}

function getDeliveryMinutes(restaurant) {
  if (Number.isFinite(restaurant.deliveryMinutes)) {
    return restaurant.deliveryMinutes;
  }

  const match = String(restaurant.time || "").match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function getRestaurantCuisineText(restaurant) {
  return [
    ...(restaurant.categories || []),
    ...(restaurant.cuisines || []),
    ...(restaurant.menuCategories || []).map((category) => category.name)
  ].filter(Boolean).join(" ").toLowerCase();
}

function restaurantMatchesOffer(restaurant, offer, index) {
  if (offer === "Free delivery") {
    return restaurant.deliveryFee === 0 || String(restaurant.fee || "").toLowerCase().includes("free");
  }

  if (offer === "Deals") {
    return Boolean(restaurant.tag) || (restaurant.offers || []).some((item) => item.code === "DEAL");
  }

  return Boolean(restaurant.acceptsVouchers ?? restaurant.commercial?.isVoucherEnabled) || index % 4 === 0;
}

function applyRestaurantFilters(items, filters = DEFAULT_FILTERS) {
  const activeFilters = { ...DEFAULT_FILTERS, ...filters };
  const cuisineTerms = activeFilters.cuisines.map((item) => item.toLowerCase());

  const filtered = items
    .map((restaurant, index) => ({ restaurant, index }))
    .filter(({ restaurant, index }) => {
      if (activeFilters.rating4 && getRatingValue(restaurant) < 4) {
        return false;
      }

      if (activeFilters.superRestaurant && !restaurant.isSuperRestaurant && getRatingValue(restaurant) < 4.8) {
        return false;
      }

      if (
        cuisineTerms.length &&
        !cuisineTerms.some((term) => getRestaurantCuisineText(restaurant).includes(term))
      ) {
        return false;
      }

      return activeFilters.offers.every((offer) => restaurantMatchesOffer(restaurant, offer, index));
    });

  filtered.sort((left, right) => {
    if (activeFilters.sort === "Fastest delivery") {
      return getDeliveryMinutes(left.restaurant) - getDeliveryMinutes(right.restaurant);
    }

    if (activeFilters.sort === "Distance") {
      return (left.restaurant.distanceKm ?? getDeliveryMinutes(left.restaurant)) -
        (right.restaurant.distanceKm ?? getDeliveryMinutes(right.restaurant));
    }

    if (activeFilters.sort === "Top rated") {
      return getRatingValue(right.restaurant) - getRatingValue(left.restaurant) ||
        (right.restaurant.reviewCount || 0) - (left.restaurant.reviewCount || 0);
    }

    return left.index - right.index;
  });

  return filtered.map(({ restaurant }) => restaurant);
}

function getMenuTabs(restaurant) {
  if (restaurant.menuCategories?.length) {
    return restaurant.menuCategories
      .slice(0, MENU_CATEGORY_TAB_LIMIT)
      .map((category) => `${category.name} (${category.itemCount || 0})`);
  }

  return ["Popular (6)", "Ramadan Deals (1)", "Savories (5)", "Shakes (10)", "Juice (14)"];
}

function Icon({ name, size = 24 }) {
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
    search: (
      <svg {...common}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    user: (
      <svg {...common}>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    heart: (
      <svg {...common}>
        <path d="M19.5 12.8 12 20l-7.5-7.2A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.8Z" />
      </svg>
    ),
    cart: (
      <svg {...common}>
        <path d="M6 6h15l-2 8H8L6 3H3" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </svg>
    ),
    location: (
      <svg {...common}>
        <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
    globe: (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15 15 0 0 1 0 20" />
        <path d="M12 2a15 15 0 0 0 0 20" />
      </svg>
    ),
    delivery: (
      <svg {...common}>
        <path d="M4 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        <path d="M16 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        <path d="M8 17h8" />
        <path d="M3 7h7l2 6h4l2-4h3" />
        <path d="M6 7V4h3" />
      </svg>
    ),
    pickup: (
      <svg {...common}>
        <path d="M13 4a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" />
        <path d="M8 22 9.5 12 6 10l-2 4" />
        <path d="m11 12 4 2 2-3" />
        <path d="m10 17 5 5" />
      </svg>
    ),
    shop: (
      <svg {...common}>
        <path d="M4 10h16" />
        <path d="M5 10V5h14v5" />
        <path d="M6 10v10h12V10" />
        <path d="M9 20v-6h6v6" />
        <path d="m4 10 1-5h14l1 5" />
      </svg>
    ),
    star: (
      <svg {...common} fill="#ff8a00" stroke="#e45a1a">
        <path d="m12 2.8 2.6 5.4 6 .8-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.4 9l6-.8L12 2.8Z" />
      </svg>
    ),
    clock: (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    receipt: (
      <svg {...common}>
        <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    ),
    sparkle: (
      <svg {...common}>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path d="m19 16 .7 2.1L22 19l-2.3.9L19 22l-.7-2.1L16 19l2.3-.9L19 16Z" />
      </svg>
    ),
    refresh: (
      <svg {...common}>
        <path d="M20 6v5h-5" />
        <path d="M4 18v-5h5" />
        <path d="M18.2 9A7 7 0 0 0 6.6 6.4L4 9" />
        <path d="M5.8 15a7 7 0 0 0 11.6 2.6L20 15" />
      </svg>
    ),
    gift: (
      <svg {...common}>
        <path d="M20 12v8H4v-8" />
        <path d="M2 8h20v4H2z" />
        <path d="M12 8v12" />
        <path d="M12 8H8.5A2.5 2.5 0 1 1 12 5.5V8Z" />
        <path d="M12 8h3.5A2.5 2.5 0 1 0 12 5.5V8Z" />
      </svg>
    ),
    chevron: (
      <svg {...common}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    ),
    chevronDown: (
      <svg {...common}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    ),
    close: (
      <svg {...common}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    ),
    plus: (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    ),
    minus: (
      <svg {...common}>
        <path d="M5 12h14" />
      </svg>
    ),
    info: (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    )
  };

  return icons[name] || null;
}

function BringitLogo({ onClick }) {
  return (
    <button className="brand" type="button" onClick={onClick} aria-label="Go to bringit home">
      <img className="brand-icon" src="/brand/logo_icon.png" alt="" />
      <span className="brand-word">
        bring<span>it</span>
      </span>
    </button>
  );
}

function PersonalizationIcon({ index = 0, className = "", style = {} }) {
  return (
    <span
      className={`personalization-icon ${className}`}
      style={{ ...style, backgroundPosition: getSpritePosition(index) }}
      aria-hidden="true"
    />
  );
}

function BrandPersonalization() {
  const hints = Array.from({ length: PERSONALIZATION_ICON_COUNT }, (_, index) => index);

  return (
    <div className="brand-personalization" aria-hidden="true">
      {hints.map((index) => (
        <PersonalizationIcon
          className={`micro-hint hint-${index % 12}`}
          index={index}
          style={{
            "--i": index,
            left: `${(index * 17) % 94}%`,
            top: `${(index * 23) % 84}%`
          }}
          key={index}
        />
      ))}
    </div>
  );
}

function OrderCelebration({ active }) {
  const pieces = Array.from({ length: 54 }, (_, index) => index);

  if (!active) return null;

  return (
    <div className="order-celebration" aria-hidden="true">
      {pieces.map((piece) => (
        <span style={{ "--i": piece }} key={piece} />
      ))}
    </div>
  );
}

function FakeQr() {
  const blocks = Array.from({ length: 121 }, (_, index) => {
    const row = Math.floor(index / 11);
    const col = index % 11;
    const finder =
      (row < 4 && col < 4) ||
      (row < 4 && col > 6) ||
      (row > 6 && col < 4);
    const on = finder || ((row * 7 + col * 5 + row * col) % 4 !== 0);
    return <i key={index} className={on ? "on" : ""} />;
  });
  return (
    <div className="fake-qr" aria-hidden="true">
      {blocks}
      <img className="qr-logo" src="/brand/logo_icon.png" alt="" />
    </div>
  );
}

function Header({ cartCount, onSearchOpen, onHome, onCart, query, view, onClearSearch }) {
  const searchValue = view === "results" ? query : "";

  return (
    <header className="site-header">
      <div className="top-line shell">
        <BringitLogo onClick={onHome} />
        <button className="location-chip" type="button">
          <Icon name="location" />
          <span>Flat 23E Lahore</span>
        </button>
        <nav className="user-nav" aria-label="User">
          <button type="button">
            <Icon name="user" />
            Afzal
            <span className="chev"><Icon name="chevronDown" size={22} /></span>
          </button>
          <button type="button">
            <Icon name="globe" />
            EN
            <span className="chev"><Icon name="chevronDown" size={22} /></span>
          </button>
          <button type="button" aria-label="Favourites">
            <Icon name="heart" />
          </button>
          <button className="cart-button" type="button" onClick={onCart} aria-label="Cart">
            <Icon name="cart" />
            {cartCount > 0 && <span>{cartCount}</span>}
          </button>
        </nav>
      </div>
      <div className="nav-line">
        <div className="shell nav-shell">
          <div className="mode-tabs">
            <button className="active" type="button" onClick={onHome}>
              <Icon name="delivery" />
              Delivery
            </button>
            <button type="button">
              <Icon name="pickup" />
              Pick-up
            </button>
            <button type="button">
              <Icon name="shop" />
              Shops
            </button>
          </div>
          <LocationTip />
          <div className={`header-search ${view === "results" ? "compact-search" : ""}`}>
            <button className="header-search-main" type="button" onClick={onSearchOpen}>
              <Icon name="search" size={26} />
              <span>{searchValue || "Search for restaurants, cuisines, and dishes"}</span>
            </button>
            {view === "results" && (
              <button
                className="search-x"
                type="button"
                aria-label="Clear search"
                onClick={(event) => {
                  event.stopPropagation();
                  onClearSearch();
                }}
              >
                <Icon name="close" size={24} />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileBottomNav({ view, cartCount, onHome, onSearchOpen, onDeals, onCart }) {
  const items = [
    {
      id: "home",
      label: "Home",
      icon: "delivery",
      active: view === "home" || view === "restaurant",
      onClick: onHome
    },
    {
      id: "search",
      label: "Search",
      icon: "search",
      active: view === "results",
      onClick: onSearchOpen
    },
    {
      id: "deals",
      label: "Deals",
      icon: "sparkle",
      active: false,
      onClick: onDeals
    },
    {
      id: "cart",
      label: "Cart",
      icon: "cart",
      active: view === "cart" || view === "delivery",
      onClick: onCart
    }
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {items.map((item) => (
        <button
          className={item.active ? "active" : ""}
          type="button"
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          onClick={item.onClick}
          key={item.id}
        >
          <span className="mobile-nav-icon">
            <Icon name={item.icon} size={22} />
            {item.id === "cart" && cartCount > 0 && <b>{cartCount}</b>}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function LocationTip() {
  return (
    <div className="location-tip">
      You're viewing a generic location. Updating it helps us find restaurants or shops near you.
    </div>
  );
}

function AppDownloadCard({ onClose }) {
  return (
    <aside className="download-card">
      <button
        className="floating-close"
        type="button"
        aria-label="Close"
        onPointerDown={onClose}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <FakeQr />
      <h3>Unlock more app-only deals. Download now.</h3>
      <div className="store-row">
        <button type="button"><span>●</span> App Store</button>
        <button type="button"><span>▷</span> Play Store</button>
      </div>
    </aside>
  );
}

function FilterPanel({
  expanded = true,
  value = DEFAULT_FILTERS,
  onChange = () => {},
  cuisineOptions = defaultCuisineFilterOptions
}) {
  const filters = { ...DEFAULT_FILTERS, ...value };
  const visibleCuisineOptions = cuisineOptions.filter((item) =>
    item.toLowerCase().includes(filters.cuisineSearch.toLowerCase())
  );
  const updateFilters = (patch) => onChange({ ...filters, ...patch });
  const toggleListValue = (key, item) => {
    const current = filters[key] || [];
    updateFilters({
      [key]: current.includes(item) ? current.filter((value) => value !== item) : [...current, item]
    });
  };

  return (
    <aside className="filter-panel">
      <h2>Filters</h2>
      <section>
        <h3>Sort by</h3>
        {["Relevance", "Fastest delivery", "Distance", "Top rated"].map((item) => (
          <label className="filter-option" key={item}>
            <input
              type="radio"
              name="sort"
              checked={filters.sort === item}
              onChange={() => updateFilters({ sort: item })}
            />
            <span>{item}</span>
          </label>
        ))}
      </section>
      <section>
        <h3>Quick filters</h3>
        <div className="chips">
          <button
            className={filters.rating4 ? "active" : ""}
            type="button"
            aria-pressed={filters.rating4}
            onClick={() => updateFilters({ rating4: !filters.rating4 })}
          >
            Ratings 4+
          </button>
          <button
            className={filters.superRestaurant ? "active" : ""}
            type="button"
            aria-pressed={filters.superRestaurant}
            onClick={() => updateFilters({ superRestaurant: !filters.superRestaurant })}
          >
            <Icon name="sparkle" size={17} /> Super restaurant
          </button>
        </div>
      </section>
      {expanded && (
        <>
          <section>
            <h3>Offers</h3>
            {offerFilterOptions.map((item) => (
              <label className="check-option" key={item}>
                <input
                  type="checkbox"
                  checked={filters.offers.includes(item)}
                  onChange={() => toggleListValue("offers", item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </section>
          <section>
            <h3>Cuisines</h3>
            <div className="cuisine-search">
              <Icon name="search" size={18} />
              <input
                aria-label="Search for cuisines"
                value={filters.cuisineSearch}
                onChange={(event) => updateFilters({ cuisineSearch: event.target.value })}
                placeholder="Search for cuisines"
              />
            </div>
            {visibleCuisineOptions.map((item) => (
              <label className="check-option" key={item}>
                <input
                  type="checkbox"
                  checked={filters.cuisines.includes(item)}
                  onChange={() => toggleListValue("cuisines", item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </section>
        </>
      )}
    </aside>
  );
}

function Hero() {
  return (
    <section className="hero">
      <BrandPersonalization />
      <div className="hero-copy">
        <PersonalizationIcon index={0} className="hero-mark" />
        <h1>50% OFF</h1>
        <p>
          Fast food delivery across Pakistan <Icon name="info" size={25} />
        </p>
        <div className="hero-pills">
          <button type="button" aria-label="Refresh suggestions"><Icon name="refresh" size={19} /></button>
          {["Biryani", "Burgers", "Pizza", "Deals", "Grocery"].map((item) => (
            <button type="button" key={item}><Icon name="sparkle" size={16} /> {item}</button>
          ))}
        </div>
      </div>
      <div className="cloche" aria-hidden="true" />
    </section>
  );
}

function PromoStrip({ restaurantItems, onRestaurant }) {
  return (
    <section className="promo-strip">
      <div>
        <span className="gift" aria-hidden="true"><PersonalizationIcon index={16} /></span>
        <h2>Get 25% off</h2>
        <p>Max. discount Rs. 315, Min. order Rs. 420</p>
      </div>
      <div className="timer">44:51</div>
      <div className="mini-row">
        {restaurantItems.slice(3, 7).map((restaurant) => (
          <RestaurantMini key={restaurant.id} restaurant={restaurant} onClick={() => onRestaurant(restaurant)} />
        ))}
      </div>
    </section>
  );
}

function RestaurantMini({ restaurant, onClick }) {
  return (
    <button className="mini-card" type="button" onClick={onClick}>
      <PersonalizationIcon index={getStableIconIndex(restaurant.id)} className="mini-card-signal" />
      <img src={restaurant.image || fallbackRestaurantImage} alt="" />
      <h3>{restaurant.shortName}</h3>
      <p>
        <Icon name="star" size={16} />
        {restaurant.rating} ({restaurant.reviews})
      </p>
      <small>{restaurant.time} · {restaurant.price} · {restaurant.categories[0]}</small>
    </button>
  );
}

function DealRail({ onSearch }) {
  const cards = [
    ["Pepsi deals", "Meals with chilled drinks", "photo-1622483767028-3f66f32aef97", "pepsi deals"],
    ["Up to 30% off", "Fresh picks near you", "photo-1568901346375-23c9450c58cd", "deals"],
    ["App-only deal", "+ free delivery", "photo-1513104890138-7c749659a591", "free delivery"],
    ["Rs.700", "burger deal", "photo-1550547660-d9450f859349", "burger"],
    ["Rs.750", "chicken bucket", "photo-1626645738196-c2a7c87a8f58", "chicken"]
  ];

  return (
    <section className="deal-rail section-block">
      <h2>Your daily deals</h2>
      <div className="deal-row">
        {cards.map(([title, sub, image, searchTerm]) => (
          <button
            className={title === "Pepsi deals" ? "deal-card pepsi-deal" : "deal-card"}
            type="button"
            onClick={() => onSearch(searchTerm)}
            key={title}
          >
            <div>
              <PersonalizationIcon index={getStableIconIndex(searchTerm)} className="deal-signal" />
              <strong>{title}</strong>
              <span>{sub}</span>
              <small>T&Cs apply.</small>
            </div>
            <img src={img(image, 420, 260)} alt="" />
          </button>
        ))}
        <ArrowButton />
      </div>
    </section>
  );
}

function CuisineRail({ onSearch }) {
  return (
    <section className="section-block cuisine-block">
      <h2>Cuisines</h2>
      <div className="cuisine-row">
        {cuisines.map(([name, image]) => (
          <button className="cuisine-item" type="button" onClick={() => onSearch(name)} key={name}>
            <img src={image} alt="" />
            <span>{name}</span>
          </button>
        ))}
        <ArrowButton />
      </div>
    </section>
  );
}

function RestaurantRow({ title, items, onRestaurant }) {
  return (
    <section className="section-block">
      <h2>{title}</h2>
      <div className="restaurant-row">
        {items.map((restaurant) => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} onClick={() => onRestaurant(restaurant)} />
        ))}
        <ArrowButton />
      </div>
    </section>
  );
}

function LogoRow({ title, items }) {
  return (
    <section className="section-block">
      <h2>{title}</h2>
      <div className="logo-row">
        {items.map(([name, time, color]) => (
          <article className="logo-tile" key={name}>
            <div style={{ background: color }}>
              <span>{name.split(" ")[0]}</span>
            </div>
            <p>{name}</p>
            <small>{time}</small>
          </article>
        ))}
        <ArrowButton />
      </div>
    </section>
  );
}

function RestaurantCard({ restaurant, onClick }) {
  return (
    <article
      className="restaurant-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${restaurant.name}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="card-image">
        <PersonalizationIcon index={getStableIconIndex(restaurant.name)} className="card-signal" />
        <img src={restaurant.image || fallbackRestaurantImage} alt="" />
        <span className="save-restaurant" aria-hidden="true">
          <Icon name="heart" size={20} />
        </span>
        {restaurant.ad && <span className="ad-badge">Ad</span>}
      </div>
      <div className="card-title">
        <h3>{restaurant.shortName}</h3>
        <span>
          <Icon name="star" size={16} />
          {restaurant.rating} <small>({restaurant.reviews})</small>
        </span>
      </div>
      <p>{restaurant.time} · {restaurant.price} · {restaurant.categories.join(" · ")}</p>
      <p className="fee"><Icon name="delivery" size={16} /> <span>{restaurant.fee}</span></p>
      {restaurant.tag && <strong className="pink-tag">{restaurant.tag}</strong>}
    </article>
  );
}

function ArrowButton() {
  return (
    <button className="arrow-button" type="button" aria-label="Next">
      <Icon name="chevron" size={34} />
    </button>
  );
}

function HomePage({ restaurantItems, onRestaurant, onSearch }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showDownloadCard, setShowDownloadCard] = useState(true);
  const visibleRestaurants = applyRestaurantFilters(restaurantItems, filters);
  const cuisineOptions = getCuisineFilterOptions(restaurantItems);

  return (
    <>
      <Hero />
      <div className="shell page-grid">
        <div className="left-column">
          {showDownloadCard && <AppDownloadCard onClose={() => setShowDownloadCard(false)} />}
          <FilterPanel expanded value={filters} onChange={setFilters} cuisineOptions={cuisineOptions} />
        </div>
        <main className="content-column">
          <PromoStrip restaurantItems={visibleRestaurants} onRestaurant={onRestaurant} />
          <CuisineRail onSearch={onSearch} />
          <DealRail onSearch={onSearch} />
          <RestaurantRow title="Order again" items={visibleRestaurants.slice(3, 7)} onRestaurant={onRestaurant} />
          <LogoRow title="Top shops" items={shops} />
          <LogoRow title="Top brands" items={brands} />
          <section className="section-block">
            <h2>All restaurants</h2>
            <div className="restaurant-grid">
              {visibleRestaurants.slice(0, 12).map((restaurant) => (
                <RestaurantCard key={restaurant.id} restaurant={restaurant} onClick={() => onRestaurant(restaurant)} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

function SearchOverlay({ open, onClose, onSearch }) {
  const [term, setTerm] = useState("");
  const [recentSearches, setRecentSearches] = useState(["doublesho", "bholi", "wedrink", "we", "drink"]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (value = term) => {
    const next = value.trim() || "bholi";
    setTerm(next);
    onSearch(next);
  };

  return (
    <div className="search-overlay">
      <div className="search-backdrop" onClick={onClose} />
      <div className="search-panel">
        <div className="search-input-large">
          <Icon name="search" size={30} />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Search for restaurants, cuisines, and dishes"
          />
          {term && (
            <button type="button" onClick={() => setTerm("")}>
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="search-body">
          <div className="search-tabs">
            {["All", "Delivery", "Pick-up", "Shops"].map((tab, index) => (
              <button className={index === 0 ? "active" : ""} type="button" key={tab}>
                {tab}
              </button>
            ))}
          </div>
          <h3>Recent searches</h3>
          {recentSearches.map((item) => (
            <div className="recent-row" key={item}>
              <button className="recent-select" type="button" onClick={() => submit(item)}>
                <Icon name="search" />
                <span>{item}</span>
              </button>
              <button
                className="recent-remove"
                type="button"
                aria-label={`Remove ${item} from recent searches`}
                onClick={() =>
                  setRecentSearches((current) => current.filter((recentItem) => recentItem !== item))
                }
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          ))}
          <h3>Popular searches</h3>
          <div className="popular-searches">
            {["kfc", "pizza", "burger", "pizza hut", "mcdonalds", "dominos", "burger king", "fast food", "johnny and jugnu", "crumble"].map((item) => (
              <button type="button" onClick={() => submit(item)} key={item}>{item}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultsPage({ query, restaurantItems, onRestaurant }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const searchResults = getSearchResults(query, restaurantItems);
  const results = applyRestaurantFilters(searchResults, filters);
  const cuisineOptions = getCuisineFilterOptions(searchResults);

  return (
    <div className="shell page-grid results-layout">
      <div className="left-column">
        <FilterPanel expanded value={filters} onChange={setFilters} cuisineOptions={cuisineOptions} />
      </div>
      <main className="content-column">
        <h1 className="result-title">{getResultsCountLabel(query, results)}</h1>
        <div className="restaurant-grid result-grid">
          {results.slice(0, 18).map((restaurant, index) => (
            <RestaurantCard key={`${restaurant.id}-${index}`} restaurant={restaurant} onClick={() => onRestaurant(restaurant)} />
          ))}
        </div>
      </main>
    </div>
  );
}

function DealCards({ onSearch }) {
  return (
    <section className="available-deals">
      <h2>Available deals</h2>
      <div>
        <button className="deal-box dark" type="button" onClick={() => onSearch("app only deals")}>
          <PersonalizationIcon index={54} className="deal-box-signal" />
          <strong><Icon name="sparkle" size={18} /> App-only deals</strong>
          <span>Download the app to unlock more discounts</span>
        </button>
        <button className="deal-box light" type="button" onClick={() => onSearch("free delivery")}>
          <PersonalizationIcon index={19} className="deal-box-signal" />
          <strong><b>PRO</b> Free delivery</strong>
          <span>and special savings for bringit pro members</span>
        </button>
        <button className="deal-box soft" type="button" onClick={() => onSearch("15% off")}>
          <PersonalizationIcon index={15} className="deal-box-signal" />
          <strong><Icon name="sparkle" size={18} /> 15% off</strong>
          <span>Valid for all items. Auto applied.</span>
        </button>
      </div>
    </section>
  );
}

function RestaurantPage({ restaurant, cart, onItemClick, onBackHome, onCheckout, onQtyChange, onSearch }) {
  const hasMenuSections = Array.isArray(restaurant.menuSections);
  const activeMenuSections = hasMenuSections
    ? restaurant.menuSections
    : restaurant.vendorCode ? EMPTY_MENU_SECTIONS : menuSections;
  const menuIsPending = Boolean(restaurant.vendorCode && !hasMenuSections && !restaurant.menuLoadFailed);
  const [activeMenuCategory, setActiveMenuCategory] = useState(activeMenuSections[0]?.title || "");
  const [menuQuery, setMenuQuery] = useState("");
  const menuTabs = activeMenuSections.slice(0, MENU_CATEGORY_TAB_LIMIT).map((section) => {
    const category = restaurant.menuCategories?.find((item) => item.name === section.title);
    return {
      title: section.title,
      label: `${section.title} (${category?.itemCount || section.items.length})`
    };
  });
  const normalizedMenuQuery = menuQuery.trim().toLowerCase();
  const scopedMenuSections = normalizedMenuQuery
    ? activeMenuSections
    : activeMenuSections.filter((section) => section.title === activeMenuCategory);
  let remainingSearchItems = MENU_SEARCH_VISIBLE_LIMIT;
  const visibleMenuSections = scopedMenuSections
    .map((section) => {
      const sectionItems = section.items || [];
      const matchingItems = normalizedMenuQuery
        ? sectionItems.filter((item) =>
            [item.name, item.description, item.category, item.masterCategory, item.serves]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalizedMenuQuery)
          )
        : sectionItems;
      const itemLimit = normalizedMenuQuery
        ? Math.max(0, remainingSearchItems)
        : MENU_ITEMS_VISIBLE_LIMIT;
      const visibleItems = matchingItems.slice(0, itemLimit);

      if (normalizedMenuQuery) {
        remainingSearchItems -= visibleItems.length;
      }

      return {
        ...section,
        visibleItemCount: matchingItems.length,
        items: visibleItems
      };
    })
    .filter((section) => section.items.length);

  useEffect(() => {
    setActiveMenuCategory(activeMenuSections[0]?.title || "");
    setMenuQuery("");
  }, [restaurant.id, restaurant.vendorCode]);

  useEffect(() => {
    if (!activeMenuSections.some((section) => section.title === activeMenuCategory)) {
      setActiveMenuCategory(activeMenuSections[0]?.title || "");
    }
  }, [activeMenuCategory, activeMenuSections]);

  return (
    <main className="restaurant-page">
      <section className="restaurant-hero shell">
        <div className="breadcrumbs">
          <button type="button" onClick={onBackHome}>Lahore</button>
          <span>›</span>
          <button type="button" onClick={onBackHome}>Restaurant List</button>
          <span>›</span>
          <strong>{restaurant.name}</strong>
        </div>
        <div className="restaurant-head">
          <img src={restaurant.image || fallbackRestaurantImage} alt="" />
          <div>
            <p>{restaurant.categories.join(" · ")}</p>
            <h1>{restaurant.name}</h1>
            <div className="meta-line">
              <strong><Icon name="delivery" size={18} /> Free delivery</strong>
              <span><s>Rs. 0</s></span>
              <span>·</span>
              <span><Icon name="clock" size={18} /> {restaurant.time}</span>
              <span>·</span>
              <span><Icon name="receipt" size={18} /> Min. order {restaurant.minOrder || "Rs. 249"}</span>
            </div>
            <div className="restaurant-actions">
              <span><Icon name="star" size={17} /> {restaurant.rating}/5 ({restaurant.reviews})</span>
              <button type="button">See reviews</button>
              <button type="button"><Icon name="info" size={18} /> More info</button>
            </div>
          </div>
          <button className="group-order" type="button">
            <Icon name="user" />
            Start group order
          </button>
        </div>
      </section>
      <DealCards onSearch={onSearch} />
      <nav className="menu-nav">
        <div className="shell">
          <label className="menu-search">
            <Icon name="search" size={19} />
            <input
              value={menuQuery}
              onChange={(event) => setMenuQuery(event.target.value)}
              placeholder="Search in menu"
            />
          </label>
          {menuTabs.map((item) => (
            <button
              className={item.title === activeMenuCategory && !normalizedMenuQuery ? "active" : ""}
              type="button"
              key={item.title}
              onClick={() => {
                setActiveMenuCategory(item.title);
                setMenuQuery("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="shell menu-layout">
        <section className="menu-list">
          {visibleMenuSections.map((section, sectionIndex) => (
            <div className="menu-section" key={section.title}>
              <h2>{section.title}</h2>
              <p>
                {section.subtitle}
                {section.visibleItemCount > section.items.length &&
                  ` · Showing ${section.items.length}`}
              </p>
              <div className="product-grid">
                {section.items.map((item) => (
                  <ProductCard key={item.id} item={item} onClick={() => onItemClick(item)} />
                ))}
              </div>
            </div>
          ))}
          {!visibleMenuSections.length && (
            <div className={`menu-empty ${menuIsPending ? "loading" : ""}`}>
              <h2>
                {menuIsPending
                  ? "Loading menu..."
                  : normalizedMenuQuery ? "No matching menu items" : "No menu items available right now"}
              </h2>
              <p>
                {menuIsPending
                  ? "This usually takes a moment."
                  : restaurant.menuLoadFailed ? "Try another restaurant." : "Try another restaurant or clear the menu search."}
              </p>
            </div>
          )}
        </section>
        <CartPanel cart={cart} onCheckout={onCheckout} onQtyChange={onQtyChange} />
      </div>
    </main>
  );
}

function ProductCard({ item, onClick }) {
  return (
    <article
      className="product-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.name}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div>
        <h3>{item.name}</h3>
        <p>
          <strong>{formatPrice(item.price)}</strong>
          {item.oldPrice > item.price && <s>{formatPrice(item.oldPrice)}</s>}
        </p>
        <span>{item.serves}</span>
      </div>
      <div className="product-image">
        <img src={item.image || fallbackProductImage} alt="" />
        <span className="product-add" aria-hidden="true">
          <Icon name="plus" />
        </span>
      </div>
    </article>
  );
}

function CartPanel({ cart, onCheckout, onQtyChange }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <aside className={`cart-panel ${cart.length ? "has-items" : "is-empty"}`}>
      <div className="delivery-toggle">
        <button className="active" type="button">Delivery</button>
        <button type="button">Pick-up</button>
      </div>
      {cart.length === 0 ? (
        <div className="empty-cart">
          <div className="basket-panda" aria-hidden="true" />
          <h3>Hungry?</h3>
          <p>You haven't added anything to your cart!</p>
        </div>
      ) : (
        <div className="cart-content">
          {cart.map((item) => (
            <div className="cart-line" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                {item.variationName && <small>{item.variationName}</small>}
                <span>{item.qty} x {formatPrice(item.price)}</span>
              </div>
              <div className="qty-small">
                <button type="button" onClick={() => onQtyChange(item.id, -1)}><Icon name="minus" size={16} /></button>
                <b>{item.qty}</b>
                <button type="button" onClick={() => onQtyChange(item.id, 1)}><Icon name="plus" size={16} /></button>
              </div>
            </div>
          ))}
          <div className="summary-line">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <div className="summary-line muted">
            <span>Delivery fee</span>
            <strong>Free</strong>
          </div>
          <div className="summary-total">
            <span>Total <small>(incl. fees and tax)</small></span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <button className="primary-button" type="button" onClick={onCheckout}>Review order</button>
        </div>
      )}
      <div className="cart-footer" id="summary">
        <strong>Total <small>(incl. fees and tax)</small></strong>
        <span>{formatPrice(subtotal)}</span>
        <a href="#summary">See summary</a>
      </div>
    </aside>
  );
}

function ItemModal({ item, qty, variationId, onVariationChange, onQty, onClose, onAdd }) {
  if (!item) return null;

  const variations = item.variations || [];
  const selectedVariation = getSelectedVariation(item, variationId);
  const pricing = getVariationPricing(item, selectedVariation);
  const selectedImage = selectedVariation?.imageUrl || item.image || fallbackProductImage;

  return (
    <div className="modal-layer">
      <div className="modal-shade" onClick={onClose} />
      <article className="item-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          <Icon name="close" size={32} />
        </button>
        <img className="modal-image" src={selectedImage} alt="" />
        <div className="modal-copy">
          <h2>{item.name}</h2>
          <p className="modal-price">
            <strong>{formatPrice(pricing.price)}</strong>
            {pricing.oldPrice > pricing.price && <s>{formatPrice(pricing.oldPrice)}</s>}
            {item.discount && <span>{item.discount}</span>}
          </p>
          <p>{item.serves}</p>
          {variations.length > 1 && (
            <section className="variation-options">
              <h3>Choose your option</h3>
              {variations.map((variation, index) => {
                const optionPricing = getVariationPricing(item, variation);
                return (
                  <label className="variation-option" key={variation.variationId}>
                    <input
                      type="radio"
                      name="item-variation"
                      checked={selectedVariation?.variationId === variation.variationId}
                      onChange={() => onVariationChange(variation.variationId)}
                    />
                    <span>{getVariationLabel(item, variation, index)}</span>
                    <strong>{formatPrice(optionPricing.price)}</strong>
                  </label>
                );
              })}
            </section>
          )}
          <hr />
          <h3>Special instructions</h3>
          <p>Special requests are subject to the restaurant's approval. Tell us here!</p>
          <textarea placeholder="e.g. No mayo" />
        </div>
        <footer className="modal-footer">
          <div className="quantity-stepper">
            <button type="button" onClick={() => onQty(-1)}><Icon name="minus" /></button>
            <span>{qty}</span>
            <button type="button" onClick={() => onQty(1)}><Icon name="plus" /></button>
          </div>
          <button className="primary-button" type="button" onClick={onAdd}>Add to cart</button>
        </footer>
      </article>
    </div>
  );
}

function CartPage({ cart, restaurant, onBack, onCheckout, onQtyChange }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const restaurantName = cart[0]?.restaurantName || restaurant?.name || "Bholli Juice & Dry Fruit";

  return (
    <main className="shell order-page">
      <section className="order-main">
        <button className="back-link" type="button" onClick={onBack}>‹ Continue shopping</button>
        <h1>Your cart</h1>
        {cart.length === 0 ? (
          <div className="empty-large">
            <div className="basket-panda" />
            <h2>Your cart is waiting</h2>
            <p>Add an item from {restaurantName} to start checkout.</p>
          </div>
        ) : (
          <div className="cart-list-card">
            {cart.map((item) => (
              <div className="cart-product-row" key={item.id}>
                <img src={item.image || fallbackProductImage} alt="" />
                <div>
                  <h3>{item.name}</h3>
                  {item.variationName && <small>{item.variationName}</small>}
                  <small>{item.restaurantName || restaurantName}</small>
                  <span>{formatPrice(item.price)}</span>
                </div>
                <div className="qty-small">
                  <button type="button" onClick={() => onQtyChange(item.id, -1)}><Icon name="minus" size={16} /></button>
                  <b>{item.qty}</b>
                  <button type="button" onClick={() => onQtyChange(item.id, 1)}><Icon name="plus" size={16} /></button>
                </div>
                <strong>{formatPrice(item.price * item.qty)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <aside className="checkout-summary">
        <h2>Order summary</h2>
        <div className="delivery-toggle">
          <button className="active" type="button">Delivery</button>
          <button type="button">Pick-up</button>
        </div>
        <div className="summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
        <div className="summary-line"><span>Delivery fee</span><strong>Free</strong></div>
        <div className="summary-line"><span>Service fee</span><strong>Rs. 0</strong></div>
        <div className="summary-total"><span>Total</span><strong>{formatPrice(subtotal)}</strong></div>
        <button className="primary-button" disabled={!cart.length} type="button" onClick={onCheckout}>Proceed to checkout</button>
      </aside>
    </main>
  );
}

function DeliveryPage({ cart, restaurant, onBack, onPlaceOrder }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const restaurantName = cart[0]?.restaurantName || restaurant?.name || "Bholli Juice & Dry Fruit";

  return (
    <main className="shell delivery-page">
      <section className="delivery-form">
        <button className="back-link" type="button" onClick={onBack}>‹ Back to cart</button>
        <h1>Delivery details</h1>
        <div className="form-card">
          <h2>Delivery address</h2>
          <label>
            Street address
            <input defaultValue="Flat 23E Lahore" />
          </label>
          <label>
            Floor / unit
            <input placeholder="Apartment, suite, floor" />
          </label>
          <label>
            Delivery note
            <textarea placeholder="Meet at the reception, ring bell, etc." />
          </label>
        </div>
        <div className="form-card">
          <h2>Contact</h2>
          <div className="two-fields">
            <label>
              Name
              <input defaultValue="Afzal" />
            </label>
            <label>
              Phone number
              <input defaultValue="+92 300 0000000" />
            </label>
          </div>
        </div>
        <div className="form-card">
          <h2>Payment</h2>
          <label className="radio-card">
            <input type="radio" name="pay" defaultChecked />
            Cash on delivery
          </label>
          <label className="radio-card">
            <input type="radio" name="pay" />
            Card ending in 4242
          </label>
        </div>
      </section>
      <aside className="checkout-summary sticky-summary">
        <h2>{restaurantName}</h2>
        {cart.map((item) => (
          <div className="mini-summary" key={item.id}>
            <span>{item.qty} x {item.name}{item.variationName ? ` (${item.variationName})` : ""}</span>
            <strong>{formatPrice(item.price * item.qty)}</strong>
          </div>
        ))}
        <div className="summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
        <div className="summary-line"><span>Delivery fee</span><strong>Free</strong></div>
        <div className="summary-total"><span>Total</span><strong>{formatPrice(subtotal)}</strong></div>
        <button className="primary-button" type="button" onClick={onPlaceOrder}>Place order</button>
      </aside>
    </main>
  );
}

export default function App() {
  const initialRoute = getRouteState();
  const [view, setView] = useState(initialRoute.view);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(initialRoute.query || "bholi");
  const [restaurantItems, setRestaurantItems] = useState(restaurants);
  const [restaurantDetails, setRestaurantDetails] = useState({});
  const [selectedRestaurant, setSelectedRestaurant] = useState(initialRoute.restaurant || restaurants[0]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [modalQty, setModalQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [celebratingOrder, setCelebratingOrder] = useState(false);

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/exports/${EXPORT_SLUG}/demo`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Seed export unavailable");
        }
        return response.json();
      })
      .then((payload) => {
        if (!payload.restaurants?.length) return;

        setRestaurantItems(payload.restaurants);
        setSelectedRestaurant((current) => {
          const routedRestaurant = getRouteState(payload.restaurants).restaurant;
          if (routedRestaurant) {
            return routedRestaurant;
          }

          if (current.vendorCode) {
            return current;
          }

          return payload.restaurants.find((restaurant) => restaurant.vendorCode === payload.defaultVendorCode) || payload.restaurants[0];
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.info("Using built-in demo seed fallback.");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const route = getRouteState(restaurantItems);
      setView(route.view);
      if (route.query) setQuery(route.query);
      if (route.restaurant) setSelectedRestaurant({ ...route.restaurant, menuLoadFailed: false });
      setSearchOpen(false);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [restaurantItems]);

  useEffect(() => {
    const vendorCode = selectedRestaurant?.vendorCode;

    if (!vendorCode || Array.isArray(selectedRestaurant.menuSections) || selectedRestaurant.menuLoadFailed) {
      return undefined;
    }

    if (restaurantDetails[vendorCode]) {
      setSelectedRestaurant((current) =>
        current.vendorCode === vendorCode
          ? { ...current, ...restaurantDetails[vendorCode], menuLoadFailed: false }
          : current
      );
      return undefined;
    }

    const controller = new AbortController();

    fetch(`/api/exports/${EXPORT_SLUG}/restaurants/${vendorCode}/demo`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Restaurant export unavailable");
        }
        return response.json();
      })
      .then((payload) => {
        if (!payload.restaurant) return;

        setRestaurantDetails((current) => ({
          ...current,
          [vendorCode]: payload.restaurant
        }));
        setSelectedRestaurant((current) =>
          current.vendorCode === vendorCode ? { ...current, ...payload.restaurant, menuLoadFailed: false } : current
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.info("Menu export unavailable for selected restaurant.");
          setSelectedRestaurant((current) =>
            current.vendorCode === vendorCode ? { ...current, menuLoadFailed: true } : current
          );
        }
      });

    return () => controller.abort();
  }, [
    selectedRestaurant?.vendorCode,
    selectedRestaurant?.menuSections?.length,
    selectedRestaurant?.menuLoadFailed,
    restaurantDetails
  ]);

  useEffect(() => {
    const seo = getSeo(view, query, selectedRestaurant);
    document.title = seo.title;
    setMetaTag("description", seo.description);
    setMetaTag("og:title", seo.title, "property");
    setMetaTag("og:description", seo.description, "property");
    setMetaTag("og:type", view === "restaurant" ? "restaurant" : "website", "property");
    setMetaTag("og:image", `${window.location.origin}/brand/logovariations.png`, "property");
    setMetaTag("twitter:card", "summary_large_image");
    setCanonical(seo.path);
    setJsonLd({
      "@context": "https://schema.org",
      "@type": view === "restaurant" ? "Restaurant" : "WebSite",
      name: view === "restaurant" ? selectedRestaurant.name : "bringit",
      url: `${window.location.origin}${seo.path}`,
      image: `${window.location.origin}/brand/logovariations.png`,
      description: seo.description,
      potentialAction: {
        "@type": "SearchAction",
        target: `${window.location.origin}${searchRoutePrefix}{search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    });
  }, [query, selectedRestaurant, view]);

  const goTop = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));

  const pushRoute = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };

  const openRestaurant = (restaurant) => {
    const detailedRestaurant = restaurant.vendorCode && restaurantDetails[restaurant.vendorCode]
      ? { ...restaurant, ...restaurantDetails[restaurant.vendorCode], menuLoadFailed: false }
      : { ...restaurant, menuLoadFailed: false };

    setSelectedRestaurant(detailedRestaurant);
    setView("restaurant");
    pushRoute(`${restaurantRoutePrefix}${getRestaurantSlug(restaurant)}`);
    goTop();
  };

  const navigate = (nextView, options = {}) => {
    setView(nextView);
    const nextPath = options.path || getSeo(nextView, query, selectedRestaurant).path;
    pushRoute(nextPath);
    goTop();
  };

  const runSearch = (term) => {
    const nextTerm = term.trim() || "bholi";
    setQuery(nextTerm);
    setSearchOpen(false);
    setView("results");
    pushRoute(`${searchRoutePrefix}${slugify(nextTerm)}`);
    goTop();
  };

  const addToCart = () => {
    if (!selectedItem) return;

    const selectedVariation = getSelectedVariation(selectedItem, selectedVariationId);
    const pricing = getVariationPricing(selectedItem, selectedVariation);
    const variationIndex = selectedVariation
      ? (selectedItem.variations || []).findIndex((variation) => variation.variationId === selectedVariation.variationId)
      : -1;
    const cartItemId = selectedVariation?.variationId
      ? `${selectedItem.id}-${selectedVariation.variationId}`
      : selectedItem.id;

    const cartItem = {
      ...selectedItem,
      id: cartItemId,
      productId: selectedItem.productId,
      variationId: selectedVariation?.variationId || "",
      variationName: (selectedItem.variations || []).length > 1
        ? getVariationLabel(selectedItem, selectedVariation, Math.max(variationIndex, 0))
        : "",
      price: pricing.price,
      oldPrice: pricing.oldPrice,
      image: selectedVariation?.imageUrl || selectedItem.image || fallbackProductImage,
      restaurantId: selectedRestaurant.vendorCode || selectedRestaurant.id,
      restaurantName: selectedRestaurant.name
    };

    setCart((current) => {
      const exists = current.find((entry) => entry.id === cartItem.id);
      if (exists) {
        return current.map((entry) =>
          entry.id === cartItem.id ? { ...entry, qty: entry.qty + modalQty } : entry
        );
      }
      return [...current, { ...cartItem, qty: modalQty }];
    });
    setSelectedItem(null);
    setSelectedVariationId("");
    setModalQty(1);
  };

  const changeCartQty = (id, delta) => {
    setCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const openItem = (item) => {
    setSelectedItem(item);
    setSelectedVariationId(getDefaultVariationId(item));
    setModalQty(1);
  };

  const goHome = () => {
    setView("home");
    pushRoute(homeRoute);
    goTop();
  };

  const goCart = () => {
    setView("cart");
    pushRoute(cartRoute);
    goTop();
  };

  return (
    <div className={`app view-${view}`}>
      <Header
        cartCount={cartCount}
        query={query}
        view={view}
        onSearchOpen={() => setSearchOpen(true)}
        onHome={goHome}
        onCart={goCart}
        onClearSearch={() => {
          setQuery("");
          navigate("home");
        }}
      />

      {view === "home" && <HomePage restaurantItems={restaurantItems} onRestaurant={openRestaurant} onSearch={runSearch} />}
      {view === "results" && (
        <ResultsPage query={query} restaurantItems={restaurantItems} onRestaurant={openRestaurant} />
      )}
      {view === "restaurant" && (
        <RestaurantPage
          restaurant={selectedRestaurant}
          cart={cart}
          onItemClick={openItem}
          onBackHome={() => navigate("home")}
          onCheckout={() => navigate("cart")}
          onQtyChange={changeCartQty}
          onSearch={runSearch}
        />
      )}
      {view === "cart" && (
        <CartPage
          cart={cart}
          restaurant={selectedRestaurant}
          onBack={() => navigate("restaurant")}
          onCheckout={() => navigate("delivery", { path: checkoutRoute })}
          onQtyChange={changeCartQty}
        />
      )}
      {view === "delivery" && (
        <DeliveryPage
          cart={cart}
          restaurant={selectedRestaurant}
          onBack={() => navigate("cart")}
          onPlaceOrder={() => {
            setCelebratingOrder(true);
            window.setTimeout(() => setCelebratingOrder(false), 1400);
          }}
        />
      )}

      <MobileBottomNav
        view={view}
        cartCount={cartCount}
        onHome={goHome}
        onSearchOpen={() => setSearchOpen(true)}
        onDeals={() => runSearch("deals")}
        onCart={goCart}
      />
      <OrderCelebration active={celebratingOrder} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSearch={runSearch} />
      <ItemModal
        item={selectedItem}
        qty={modalQty}
        variationId={selectedVariationId}
        onVariationChange={setSelectedVariationId}
        onQty={(delta) => setModalQty((current) => Math.max(1, current + delta))}
        onClose={() => {
          setSelectedItem(null);
          setSelectedVariationId("");
        }}
        onAdd={addToCart}
      />
    </div>
  );
}
