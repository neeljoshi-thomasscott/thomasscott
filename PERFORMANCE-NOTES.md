# Performance Audit Notes — Thomas Scott Shopify Theme

Audit-only pass over `layout/theme.liquid`, `snippets/`, `sections/`, and `assets/`. No code was changed. Ordered roughly by expected impact.

## 1. Duplicate/overlapping carousel libraries (biggest win)
- `theme.liquid` loads **jQuery 3.6** + **slick-carousel** (CSS+JS) globally on every page, but jQuery/slick is only actually used in 2 files (`sections/th_product_popup.liquid` and the mobile "recommendation-grid" slick init inline in `theme.liquid`).
- **Swiper** is also loaded globally and is used in 13 files (`custom-product-gallery`, `new_shop_look`, `product-recommendations`, `th_season_slider`, product card sliders, etc.).
- Net effect: two full slider libraries (~90KB jQuery + slick JS/CSS + swiper JS/CSS) shipped on every single page load, most of it unused on any given page.
- **Suggestion:** replace the one jQuery/slick usage (mobile recommendation grid) with Swiper or a small vanilla implementation, then drop jQuery + slick entirely. Also load swiper's CSS/JS only on templates/sections that actually render a swiper slider instead of unconditionally in `<head>`.

## 2. CSS payload is large and duplicated
- Total CSS in `assets/` ≈ 316KB across 11 files. `base.css` (124KB) and `style.css` (144KB) are both loaded on **every** page via `snippets/stylesheets.liquid` + `theme.liquid`, plus `custom.css`, `th-product-card.css`, and conditionally `pdp.css`/`plp.css`.
- `theme.liquid` also embeds a large **inline `<style>` block** (lines ~102–325) containing highly repetitive, collection-specific selectors (e.g. `.collection-70-80-off-sale-jeans .product-card .price-discount`, `.collection-70-80-off-sale-shorts ...`, etc. — a dozen near-identical rules). This inline CSS is parsed on every single page view regardless of which collection (if any) is being viewed.
- **Suggestion:** move the inline `<style>` block into a real stylesheet (cacheable, not re-downloaded/re-parsed per request), and collapse the repetitive `.collection-<slug> .product-card .price-discount { display:inline-block !important; color:#e45c5c !important; }` rules into a single attribute/class-based rule instead of one block per collection handle. Audit `base.css` vs `style.css` for overlapping/overridden rules — the near-equal sizes suggest one is largely superseding the other.

## 3. `size-chart-popup` rendered once per product on every collection page
- `layout/theme.liquid` (lines 420–426):
  ```
  {% if template contains 'collection' %}
    {% for product in collection.products %}
      {% render 'size-chart-popup', product: product %}
    {% endfor %}
  {% endif %}
  ```
- `snippets/size-chart-popup.liquid` is **1400 lines** (markup + inline `<style>` + inline `<script>` for the modal). This gets rendered for **every product on the collection page** (up to Shopify's default 50 products per `collection.products` call), even though only one modal can ever be open at a time.
- This is likely the single largest source of unnecessary HTML weight/parse time on collection pages — potentially tens of thousands of extra lines of duplicated markup per page.
- **Suggestion:** render the size-chart markup/styles/script **once** (shared, not per-product), and have it dynamically populate content (e.g. via a `data-product-id` lookup or a fetch on open) rather than stamping out a full 1400-line copy per product card.

## 4. Third-party/embedded scripts loaded unconditionally on every page
- `gokwik` snippet (1159 lines of Liquid) is rendered first thing in `<head>` on every page — worth confirming it's needed outside cart/checkout-adjacent pages.
- GTM, Hotjar are both wired up early in `<head>` (before the page's own stylesheets). They're async/self-injecting so not strictly render-blocking, but they compete for early bandwidth/main-thread with the theme's own critical CSS.
- **Suggestion:** consider deferring Hotjar/GTM injection slightly (e.g. after `window.load` or via `requestIdleCallback`) if analytics latency isn't business-critical, and confirm Gokwik truly needs to run site-wide vs. only on product/cart/checkout templates.

## 5. Fonts
- Google Fonts (`Manrope`) is loaded via a normal render-blocking `<link rel="stylesheet">` (with `preconnect` in place, which helps, but the CSS itself still blocks). A `fonts.liquid` snippet exists but is commented out/unused, and `menu-font-styles.liquid`/`submenu-font-styles.liquid` exist too.
- The full variable range `wght@200..800` is requested — if only 2–3 weights are actually used in designs, this pulls a larger font file than necessary.
- **Suggestion:** self-host the specific Manrope weights actually used (`font-display: swap`) instead of the Google Fonts CDN, or at minimum trim the requested weight range. Decide whether `fonts.liquid` is dead code and remove it if so.

## 6. Images
- Only **35 of 57** `<img>` tags across the theme use `loading="lazy"`.
- **38 `<img>` tags** have no explicit `width`/`height` (or `style` aspect-ratio), which is a CLS (layout shift) risk on slow connections.
- `assets/blog-dummy.png` is **657KB**, unoptimized, and referenced from `sections/main-blog.liquid` — likely a placeholder image that's much larger than it needs to be (should be compressed/converted to WebP or replaced with a lightweight SVG/CSS placeholder).
- **Suggestion:** audit all `<img>` usages for lazy-loading + explicit dimensions, and compress `blog-dummy.png` (or generate it at the actual displayed size via `image_url`).

## 7. JS module count
- 77 JS files (~640KB total) live in `assets/`. `snippets/scripts.liquid` loads ~30+ of them as `type="module" fetchpriority="low"` unconditionally on every template (e.g. `comparison-slider.js`, `volume-pricing.js`, `gift-card-recipient-form.js`-style product-only features loading even on non-product pages).
- This is architected reasonably well already (ES modules + `fetchpriority="low"` + `modulepreload` hints are good modern practice, and most of this is non-blocking), but many of these scripts are only relevant to product/cart pages.
- Also noticed **`fly-to-cart.js`** is loaded twice — once unconditionally (~line 146 of `scripts.liquid`) and again inside the `{% if template == 'product' %}` block (~line 252). Harmless (browser dedupes identical module URLs) but worth cleaning up as dead duplication.
- **Suggestion:** gate more of these behind template checks (`{% if template == 'product' %}` etc.) the way `sticky-add-to-cart.js`/`recently-viewed-products` already are, rather than loading the full module graph on every page type.

## 8. Dead/duplicate section files
- `sections/shop_the_look_old.liquid`, `sections/th_shop_look11.liquid`, `sections/th_shop_the_look_new.liquid` all appear to be superseded variants of the same "shop the look" feature still present in the theme. If unused in any template/JSON, they add to theme size/Shopify admin clutter (not a runtime perf hit unless actually rendered) and to the swiper-usage surface counted above.
- **Suggestion:** confirm with template JSON which of these are actually live and delete the rest.

---

### Suggested priority order
1. Remove jQuery + slick, consolidate on Swiper (or vanilla) — cuts a real render-blocking dependency site-wide.
2. Fix the per-product `size-chart-popup` render loop on collection pages — likely the biggest single HTML-weight win.
3. Move the large inline `<style>` block in `theme.liquid` into an external, cacheable stylesheet and de-duplicate the collection-specific rules.
4. Image cleanup (lazy-loading, dimensions, compress `blog-dummy.png`).
5. Font loading + dead snippet/section cleanup.
