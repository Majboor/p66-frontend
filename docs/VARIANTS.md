# Landing hero A/B variants

The home page hero ships in two interchangeable flavours. Which one renders is
decided entirely by a URL query string, so a single production build can serve
either experience — no rebuild, no feature flag service — which makes it easy to
run a real A/B split at the CDN/edge or to share a specific look via a link.

## How to switch

| URL                                | Variant | What you get                                                              |
| ---------------------------------- | ------- | ------------------------------------------------------------------------- |
| `/`  (or any URL without the flag) | **A**   | The original orange promo banner — big **"50% OFF"** headline, cuisine pills, decorative cloche. |
| `/?variant=b`                      | **B**   | An editorial split layout — **"Dinner, handled."** headline, subcopy, two working CTAs, quick-pick chips, and a trust-signal stat card. |

The flag is read live: it re-syncs on browser back/forward (`popstate`) and hash
changes, so navigating between the two never needs a hard reload.

## What differs between the variants

Variant B is a genuinely distinct landing, not a restyle of the same markup:

- **Headline & voice** — "Dinner, handled." with an editorial eyebrow, versus
  variant A's discount-led "50% OFF".
- **Layout** — a two-column grid (copy + trust card) on a light cream/gradient
  canvas, versus variant A's single full-bleed orange banner.
- **CTA** — two explicit, working calls to action ("Start an order",
  "See today's deals") plus quick-pick chips. Every button drives the same
  in-app search/results flow the rest of the home page uses (`runSearch`), so
  they actually navigate — e.g. the **Pizza** chip routes to `/search/pizza`.

## Where it lives

- `src/HeroVariants.jsx` — the `useHeroVariant()` hook (reads `?variant=`), the
  `readHeroVariant()` helper, and the `HeroVariantB` component.
- `src/HeroVariants.css` — all variant-B styles, namespaced under `.hero-b` so
  variant A is untouched.
- `src/App.jsx` — `HomePage` picks the variant: `heroVariant === "b"` renders
  `<HeroVariantB />`, otherwise the original `<Hero />`. That is the only edit to
  the shared app file (plus one import line).

## Verifying locally

```bash
npm install && npm run build
npm run preview        # serves dist/ on http://localhost:4173
```

Then open `http://localhost:4173/` (variant A) and
`http://localhost:4173/?variant=b` (variant B). Both were verified end-to-end
with a headless-Chromium pass: variant A shows only `.hero`, variant B shows only
`.hero-b`, the CTAs navigate, and the console is error-free.
