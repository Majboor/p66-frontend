// Minimal restaurant fixtures shaped like the app's seed data, used to drive the
// pure search/filter helpers under test.
export const bholliJuice = {
  id: "bholli",
  name: "Bholli Juice & Dry Fruit - Liberty",
  shortName: "Bholli Juice",
  categories: ["Beverages", "Healthy Food"],
  menuCategories: [{ name: "Juice" }, { name: "Shakes" }],
  rating: "4.7",
  reviews: "1000+",
  reviewCount: 1400,
  time: "From 10 min",
  fee: "From Rs.154 with Saver",
  tag: "15% off"
};

export const kfc = {
  id: "kfc",
  name: "KFC - Cavalry",
  shortName: "KFC",
  categories: ["Fast Food", "Burgers", "Chicken"],
  menuCategories: [{ name: "Burgers" }, { name: "Fried Chicken" }],
  rating: "4.2",
  reviews: "5000+",
  reviewCount: 5000,
  time: "From 30 min",
  deliveryMinutes: 30,
  fee: "Rs. 99",
  deliveryFee: 0
};

export const mcdonalds = {
  id: "mcdonalds",
  name: "McDonald's - 1-K",
  shortName: "McDonald's",
  categories: ["Fast Food", "Burgers"],
  menuCategories: [{ name: "Burgers" }],
  rating: "3.8",
  reviews: "8000+",
  reviewCount: 8000,
  time: "From 20 min",
  deliveryMinutes: 20,
  fee: "Rs. 149",
  distanceKm: 2.4
};

export const greeno = {
  id: "greeno",
  name: "Greeno - Shami Road",
  shortName: "Greeno",
  categories: ["Healthy Food", "Beverages", "Shakes"],
  menuCategories: [{ name: "Smoothie" }, { name: "Salad" }],
  rating: "4.9",
  reviews: "300+",
  reviewCount: 300,
  time: "From 15 min",
  deliveryMinutes: 15,
  isSuperRestaurant: true,
  fee: "Free delivery"
};

export const restaurants = [kfc, mcdonalds, bholliJuice, greeno];

export const juiceItem = {
  id: "falsa",
  name: "Falsa Juice",
  price: 297.5,
  oldPrice: 350,
  discount: "15% off",
  variations: [
    { variationId: "small", name: "Small", price: 297.5 },
    { variationId: "large", name: "Large", price: 467.5 }
  ]
};

export const noVariationItem = {
  id: "banana",
  name: "Banana Shake",
  price: 297.5,
  oldPrice: 350
};
