import { useEffect, useState } from "react";
import "./HeroVariants.css";

// --- A/B variant toggle -----------------------------------------------------
// The landing hero ships in two flavours. Variant A is the original promo
// banner; variant B is an editorial split-layout with working CTAs. Which one
// renders is decided purely by the URL query string (?variant=b), so the same
// build can serve either experience with zero rebuild — handy for a real A/B
// split at the edge/CDN or for sharing a specific look via a link.
export function readHeroVariant(search = window.location.search) {
  try {
    const value = new URLSearchParams(search).get("variant");
    return value && value.toLowerCase() === "b" ? "b" : "a";
  } catch {
    return "a";
  }
}

// Reads the active variant and keeps it in sync if the URL changes (back/
// forward navigation or an in-app history push), without pulling in a router.
export function useHeroVariant() {
  const [variant, setVariant] = useState(() => readHeroVariant());

  useEffect(() => {
    const sync = () => setVariant(readHeroVariant());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  return variant;
}

// Variant B: a distinct headline, a two-column layout, and CTAs that actually
// route the shopper somewhere (they drive the same search flow the rest of the
// home page uses), plus a trust-signal card in place of variant A's cloche.
export function HeroVariantB({ onSearch, PersonalizationIcon, Icon }) {
  const quickPicks = ["Biryani", "Burgers", "Pizza", "Karahi", "Desserts"];

  return (
    <section className="hero-b" data-variant="b">
      <div className="hero-b-inner">
        <div className="hero-b-copy">
          {PersonalizationIcon ? (
            <PersonalizationIcon index={4} className="hero-b-mark" />
          ) : null}
          <span className="hero-b-eyebrow">Delivering across Pakistan</span>
          <h1>
            Dinner, <em>handled.</em>
          </h1>
          <p>
            Skip the guesswork. Hand-picked kitchens, honest prices, and
            white-glove delivery to your door in under 40 minutes.
          </p>
          <div className="hero-b-cta">
            <button
              type="button"
              className="hero-b-primary"
              onClick={() => onSearch && onSearch("")}
            >
              {Icon ? <Icon name="search" size={20} /> : null}
              Start an order
            </button>
            <button
              type="button"
              className="hero-b-secondary"
              onClick={() => onSearch && onSearch("Deals")}
            >
              See today&rsquo;s deals
            </button>
          </div>
          <div className="hero-b-picks">
            <span className="hero-b-picks-label">Popular right now</span>
            {quickPicks.map((item) => (
              <button
                type="button"
                key={item}
                className="hero-b-chip"
                onClick={() => onSearch && onSearch(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <aside className="hero-b-card" aria-label="Why shoppers choose us">
          <div className="hero-b-card-badge">
            {Icon ? <Icon name="star" size={18} /> : null}
            <strong>4.9</strong>
            <span>from 12k+ orders</span>
          </div>
          <ul className="hero-b-stats">
            <li>
              <strong>38 min</strong>
              <span>avg. delivery</span>
            </li>
            <li>
              <strong>1,200+</strong>
              <span>local kitchens</span>
            </li>
            <li>
              <strong>Free</strong>
              <span>delivery on Rs. 1,500+</span>
            </li>
          </ul>
          <p className="hero-b-note">No app required. Order right here.</p>
        </aside>
      </div>
    </section>
  );
}
