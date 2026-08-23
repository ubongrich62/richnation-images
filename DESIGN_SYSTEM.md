# RichNation Mall — Design System

Premium marketplace visual language. Applies across the customer site
(`index.html`) and the operational portals (`admin.html`, `vendor.html`,
`staff.html`, `rider.html`, `investor.html`). All values are implemented as
CSS custom properties in each file's `:root` block so the system stays a
single source of truth per app.

Brand palette is **black, orange, white, grey** — orange is a controlled
accent, never a wash. Product areas stay white/light; black is reserved for
structural elements (header, footer, key dividers) that give the brand its
premium, trustworthy weight.

## 1. Color

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0B0B0C` | Structural black — header, footer, footer-adjacent bands |
| `--ink2` | `#1A1410` | Warm secondary dark — paired with `--ink` in a subtle gradient on large black surfaces so they read as a considered surface, not flat pure black |
| `--bg` | `#FFFFFF` | Page background |
| `--card` | `#FFFFFF` | Card / surface background |
| `--card2` | `#F4F4F3` | Secondary surface — inputs, hovers, skeleton loaders, chips |
| `--bdr` | `#E4E4E1` | Hairline border |
| `--or` | `#FF6A00` | Brand orange — primary CTA, active state, price, badges |
| `--or-dk` | `#E15E00` | Orange hover/pressed |
| `--gold` | `#B8720A` | Secondary accent — ratings, small highlights (used sparingly) |
| `--amber` | `#FFB05A` | Light warm accent for tinting on dark surfaces (rare use) |
| `--wh` | `#15151A` | Primary text (legacy name; holds the *primary text* role) |
| `--w2` | `#48484E` | Secondary text |
| `--mu` | `#83838A` | Muted / tertiary text, placeholders, timestamps, lightened from an earlier darker pass per explicit direction, kept just past WCAG AA on white |
| `--su` | `#15803D` | Success (in stock, confirmed, delivered) |
| `--re` | `#DC2626` | Error / destructive / out of stock |
| `--bl` | `#2054C7` | Informational (pre-order, tracking, links) |

**Usage rule:** orange never fills large surfaces. It marks the single
primary action per screen, prices, and the handful of state indicators
(badges, active tab, focus ring). Everything else resolves in black, white
or grey, with `--ink`/`--ink2` giving black surfaces a subtle warm gradient
rather than sitting perfectly flat. Gradients are avoided outside of that
and one restrained flash-sale accent.

**Text on dark cards:** a handful of components sit on `--ink`/`--ink2`
surfaces inside an otherwise light page (the checkout "Express" banner,
account Wallet/RichPoints cards). Those never use `--w2`/`--mu` for body
text, both tokens are tuned for light backgrounds and go low-contrast on
dark, use `rgba(255,255,255,.55–.72)` directly instead, same as the
portal dark-console text already does.

## 2. Typography

- **Display / weight** — `Plus Jakarta Sans` (700/800/900) for headings,
  prices, section titles. Confident, geometric, not a generic system font.
- **Body / UI** — `Inter` (400/500/600/700) for paragraph copy, labels,
  buttons, form fields.
- Loaded once via Google Fonts; both already existed in the codebase's
  inline styles, so keeping them means zero JS changes were needed to
  re-theme dynamically-rendered UI (modals, checkout, reviews, etc.).

| Style | Font | Weight | Size | Use |
|---|---|---|---|---|
| Display XL | Jakarta | 800 | 40–46px | Hero headline |
| Display L | Jakarta | 800 | 26–30px | Page titles (checkout, account) |
| Heading | Jakarta | 800 | 18–20px | Section titles |
| Subheading | Jakarta | 700 | 14–15px | Card titles, modal titles |
| Body | Inter | 400/500 | 13–14px | Paragraph copy |
| Small | Inter | 500/600 | 11–12px | Meta, labels, badges |
| Micro | Inter | 600/700 | 9–10px | Tags, counts |

Line height: 1.4–1.5 for UI text, 1.7–1.8 for longer descriptive copy.
Letter-spacing: none on body copy; +0.3–1px uppercase tracking on eyebrows,
tab labels and section kickers only.

## 3. Spacing scale

`4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72` (px)

Section vertical rhythm on the homepage uses 40–56px between major blocks
on desktop, 28–32px on mobile — enough separation that sections read as
distinct without needing boxed containers around every one of them.

## 4. Radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 6px | Inputs, chips, small buttons |
| `--r-md` | 10px | Cards, product cards, buttons |
| `--r-lg` | 14px | Modals, drawers, large panels |
| `--r-pill` | 999px | True pills only — status badges, icon buttons |

No oversized "bubble" radii (20px+) on structural blocks — that reads as a
generic template. Sharper 6–14px corners feel closer to an established
retailer.

## 5. Shadows

Natural, low-opacity, black-only — never colored glows.

- `--sh-sm`: `0 1px 2px rgba(15,15,20,.06)` — resting cards, header
- `--sh-md`: `0 8px 24px rgba(15,15,20,.10)` — hover lift, dropdowns
- `--sh-lg`: `0 24px 64px rgba(15,15,20,.16)` — modals, drawers

## 6. Buttons

- **Primary** — solid `--or` fill, white text, `--r-md`, weight 800.
  Hover: `--or-dk` fill (no opacity fade, no glow). One primary action
  visible per view.
- **Secondary** — white fill, `1.5px solid --ink` (or `--bdr` for lower
  emphasis), text `--wh`. Used for "Buy Now", "Cancel", nav toggles —
  deliberately *not* orange-on-orange with the primary button.
- **Tertiary / link** — no fill or border, `--or` text, used for "View
  all", inline links.
- **Icon buttons** — 36–44px tap target, transparent, `--wh`/`--or` icon.

## 7. Forms

White fields, `1px solid --bdr`, `--r-sm`, 10–13px padding, `--wh` text,
`--mu` placeholder. Focus: border becomes `--or` plus a 3px soft orange
ring (`box-shadow: 0 0 0 3px rgba(255,106,0,.15)`) — no color-shifted
backgrounds on focus.

## 8. Product cards

White surface, `1px solid --bdr`, `--r-md`. Image area sits on `--card2`
(light grey) until the photo loads. Hover: `translateY(-2px)` + `--sh-md`,
border shifts to a neutral dark tone (`--wh` at low opacity) — **not**
orange — so hover states don't compete with the badges/price that already
carry orange. Badges (sale/new/best/free) are small solid or outlined
chips, `--r-sm`, never larger than the price they sit near.

## 9. Navigation

- **Header** is `--ink` (black) — this is where the logo lives, since the
  official mark is white-on-transparent and needs a dark ground. Search,
  icons and auth actions live in this bar.
- **Category strip** sits directly under the header on `--bg` (white),
  black text tabs with a 2px orange underline on the active/hover tab —
  this is the shift from "structural black" to "light product area."
- **Footer** returns to `--ink` to bookend the page and re-anchor the
  brand.

## 10. Breakpoints

`480px` (small phone) · `768px` (tablet / large phone) · `1024px` (small
desktop) · `1280px` (desktop — content reaches its max width here).
Content is centered with a `1360px` max-width container on large screens
so the page doesn't stretch edge-to-edge on wide monitors — this alone is
one of the biggest levers for a "serious international e-commerce company"
feel versus the mobile-app-stretched-wide look.

## 11. Portal variants

The customer site (`index.html`) is majority white/light — it's a storefront,
so product photography and buying decisions need a bright, trustworthy
canvas. The five operational portals are internal tools, not storefronts,
so they don't inherit that constraint uniformly. Each keeps the same
tokens, type system, radius/shadow scale and orange-as-accent rule, but the
`--bg`/`--card` role flips per portal based on how it's used:

| Portal | Base | Why |
|---|---|---|
| `admin.html` | Dark console | Dense operational data, fast scanning, differentiates from the storefront |
| `staff.html` | Dark console | Fast task triage, same operational family as admin |
| `rider.html` | Dark console | Mobile, often outdoors — dark reads better on phone screens and saves battery |
| `vendor.html` | Dark chrome + light content | Structural nav stays black; tables/stat tiles/orders go white for legible sales data — a hybrid, like the storefront's black header over a white page |
| `investor.html` | Light "boardroom" | Financial reporting reads as more credible on a clean white surface — the most restrained use of orange of any surface in the product |

Wherever the official logo appears in a dark-based portal, keep it on a
dark ground (its wordmark is white-outlined and disappears on light
backgrounds) — same rule as the storefront header.

## 12. Motion

Fast and restrained: 150–200ms ease transitions on hover/press states
only (lift, border/color change, drawer slide). No entrance animations on
scroll, no parallax, no auto-playing decorative motion. The one exception
kept from the existing product is the flash-sale countdown and toast
slide-in, both functional rather than decorative.
