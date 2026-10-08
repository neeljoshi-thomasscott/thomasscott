import { morphSection } from '@theme/section-renderer';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';

/**
 * Thomas Scott cart drawer — markup in sections/ts-cart-drawer.liquid.
 *
 * - Opens from any link to /cart, the header cart trigger and `.js-open-cart`.
 * - Opens on load after a direct visit to /cart was redirected back (see layout/theme.liquid).
 * - Opens after any add to cart made elsewhere on the page (fetch/XHR to /cart/add).
 * - Every cart change re-renders the section and morphs only the `data-hydration-key` nodes.
 * - Rotates the announcement banners while open; confetti when a tiered reward is reached.
 * - Login goes through KwikPass (`handleKpAndShopifyLogin`); checkout through the GoKwik SDK.
 */

const CART_MUTATION = /\/cart\/(add|change|update|clear)(?:\.js|\.json)?(?:[?#]|$)/;
const RECS_SECTION = 'ts-cart-recs';
const REOPEN_KEY = 'tsCartReopen';
const OPEN_ON_LOAD_KEY = 'tsCartOpenOnLoad'; // set by the /cart redirect in layout/theme.liquid
const ROOT = window.Shopify?.routes?.root || '/';

class TsCartDrawer extends HTMLElement {
  /** @type {HTMLDialogElement} */
  #dialog;
  #scrollY = 0;
  #ownsScrollLock = false;
  #stale = false;
  #summaryOpen = false;
  #recsKey = null;
  #externalTimer = 0;
  #externalAdd = false;
  #toastTimer = 0;
  #kpPopupOpen = false;
  #loggedIn = false;
  #bannerTimer = 0;
  #bannerIndex = 0;
  #tiersAchieved = -1;
  #pendingConfetti = false;

  connectedCallback() {
    this.#dialog = this.querySelector('[data-ts-cd-dialog]');

    this.addEventListener('click', this.#onClick);
    this.addEventListener('change', this.#onChange);
    this.addEventListener('submit', this.#onSubmit);
    this.addEventListener('input', this.#onInput);
    this.addEventListener('wheel', this.#onWheel, { passive: false });
    this.addEventListener('scroll', this.#onRecsScroll, true);
    this.#dialog.addEventListener('cancel', this.#onCancel);

    document.addEventListener('click', this.#onDocumentClick, true);
    document.addEventListener(ThemeEvents.cartUpdate, this.#onThemeCartUpdate);
    document.addEventListener('ts-cart-drawer:open', this.#openFromEvent);
    document.addEventListener('shopify:section:select', this.#onEditorSelect);
    document.addEventListener('shopify:section:deselect', this.#onEditorDeselect);
    document.addEventListener('shopify:block:select', this.#onEditorBlockSelect);
    window.addEventListener('pageshow', this.#onPageShow);
    window.addEventListener('user-loggedin', this.#onLoggedIn);
    window.addEventListener('kpPopup', this.#onKpPopup);

    window.tsCartDrawer = this;
    watchCartRequests();
    this.#checkTiers();
    this.#reopenAfterLogin();
    this.#openAfterCartRedirect();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.#onDocumentClick, true);
    document.removeEventListener(ThemeEvents.cartUpdate, this.#onThemeCartUpdate);
    document.removeEventListener('ts-cart-drawer:open', this.#openFromEvent);
    document.removeEventListener('shopify:section:select', this.#onEditorSelect);
    document.removeEventListener('shopify:section:deselect', this.#onEditorDeselect);
    document.removeEventListener('shopify:block:select', this.#onEditorBlockSelect);
    window.removeEventListener('pageshow', this.#onPageShow);
    window.removeEventListener('user-loggedin', this.#onLoggedIn);
    window.removeEventListener('kpPopup', this.#onKpPopup);
    if (window.tsCartDrawer === this) window.tsCartDrawer = null;
    this.#stopBanners();
    this.#unlockScroll();
  }

  get sectionId() {
    return this.dataset.sectionId || 'ts-cart-drawer';
  }

  get isOpen() {
    return this.#dialog?.open === true;
  }

  /* ── Open / close ─────────────────────────────────────────────────────── */

  open() {
    if (this.isOpen) return;

    // Another dialog (e.g. quick add) may already hold the scroll lock; leave it to that dialog then.
    this.#ownsScrollLock = document.body.style.position !== 'fixed';
    if (this.#ownsScrollLock) {
      this.#scrollY = window.scrollY;
      document.body.style.width = '100%';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${this.#scrollY}px`;
    }

    this.#dialog.classList.remove('is-closing');
    this.#dialog.showModal();
    this.#syncUiState();
    this.#startBanners();
    if (this.#pendingConfetti) {
      this.#pendingConfetti = false;
      setTimeout(() => burstConfetti(this.#dialog.querySelector('.ts-cd__panel')), 300);
    }

    if (this.#stale) this.refresh();
    this.#loadRecs();
  }

  async close() {
    if (!this.isOpen) return;

    this.#dialog.classList.add('is-closing');
    await new Promise((resolve) => {
      const done = () => resolve(undefined);
      this.#dialog.addEventListener('animationend', done, { once: true });
      setTimeout(done, 320);
    });
    this.#dialog.classList.remove('is-closing');
    this.#dialog.close();
    this.#stopBanners();
    this.#unlockScroll();
    this.#setOffersOpen(false);
    this.#setAccountOpen(false);
  }

  #unlockScroll() {
    if (!this.#ownsScrollLock) return;
    this.#ownsScrollLock = false;
    document.body.style.width = '';
    document.body.style.position = '';
    document.body.style.top = '';
    window.scrollTo({ top: this.#scrollY, behavior: 'instant' });
  }

  #onCancel = (event) => {
    event.preventDefault();
    const panel = this.#offersPanel;
    if (panel && !panel.hidden) return this.#setOffersOpen(false);
    this.close();
  };

  #openFromEvent = () => this.open();

  #onEditorSelect = (event) => {
    if (event.detail?.sectionId === this.sectionId) this.open();
  };

  #onEditorDeselect = (event) => {
    if (event.detail?.sectionId === this.sectionId) this.close();
  };

  /** Theme editor: selecting a banner or reward block opens the drawer on it. */
  #onEditorBlockSelect = (event) => {
    const block = event.target instanceof Element ? event.target : null;
    if (!block || !this.contains(block)) return;
    this.open();
    const banners = [...this.querySelectorAll('[data-ts-cd-banner]')];
    const index = banners.indexOf(/** @type {HTMLElement} */ (block));
    if (index === -1) return;
    this.#stopBanners();
    this.#showBanner(index);
  };

  /**
   * Mouse wheels only scroll vertically; over the suggested products row, turn each wheel
   * notch into a one-card step sideways. At either end the wheel scrolls the drawer as usual.
   * Trackpad (horizontal) gestures are left to the browser.
   */
  #wheelLockedUntil = 0;
  #onWheel = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const track = /** @type {HTMLElement | null} */ (target?.closest('[data-ts-cd-recs-track]'));
    if (!track || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

    const direction = Math.sign(event.deltaY);
    const max = track.scrollWidth - track.clientWidth;
    if (max <= 0) return;
    if ((direction < 0 && track.scrollLeft <= 1) || (direction > 0 && track.scrollLeft >= max - 1)) return;

    event.preventDefault();
    if (event.timeStamp < this.#wheelLockedUntil) return;
    this.#wheelLockedUntil = event.timeStamp + 350;
    this.#scrollRecs(direction);
  };

  /**
   * Moves the suggested products row by one card.
   * @param {number} direction -1 for back, 1 for forward
   */
  #scrollRecs(direction) {
    const track = this.querySelector('[data-ts-cd-recs-track]');
    if (!track) return;
    const card = track.firstElementChild;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    track.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  #onRecsScroll = (event) => {
    if (event.target instanceof Element && event.target.matches('[data-ts-cd-recs-track]')) this.#syncRecsNav();
  };

  /** Disables (and hides) an arrow when the row cannot scroll further that way. */
  #syncRecsNav() {
    const track = this.querySelector('[data-ts-cd-recs-track]');
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const prev = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-ts-cd-action="recs-prev"]'));
    const next = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-ts-cd-action="recs-next"]'));
    if (prev) prev.disabled = track.scrollLeft <= 1;
    if (next) next.disabled = track.scrollLeft >= max - 1;
  }

  #onPageShow = (event) => {
    if (event.persisted) this.#stale = true;
  };

  /** Turns cart links and cart icons anywhere on the page into drawer triggers. */
  #onDocumentClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest('a[href], [data-testid="cart-drawer-trigger"], .js-open-cart');
    if (!trigger || this.contains(trigger)) return;

    if (!trigger.matches('[data-testid="cart-drawer-trigger"], .js-open-cart')) {
      const url = new URL(trigger.getAttribute('href') || '', window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!/^(\/[a-z]{2}(-[a-z]{2})?)?\/cart\/?$/i.test(url.pathname)) return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.open();
  };

  /* ── Rendering ────────────────────────────────────────────────────────── */

  /** Re-renders the drawer from the server. */
  async refresh() {
    this.#stale = false;
    try {
      const response = await fetch(`${ROOT}?section_id=${this.sectionId}`, { __tsCartDrawer: true });
      this.#render(await response.text());
    } catch (error) {
      console.error('[ts-cart-drawer] refresh failed', error);
      this.#stale = true;
    }
  }

  /** @param {string | undefined} html */
  #render(html) {
    if (!html) return this.refresh();
    // morphSection is async in name only: the morph runs synchronously, errors arrive as a rejection.
    morphSection(this.sectionId, html, 'hydration').catch((error) => {
      console.error('[ts-cart-drawer] render failed', error);
    });
    this.#syncUiState();
    this.#checkTiers();
    if (this.isOpen) this.#loadRecs();
  }

  /* ── Announcement banners ─────────────────────────────────────────────── */

  #startBanners() {
    const root = /** @type {HTMLElement | null} */ (this.querySelector('[data-ts-cd-banners][data-interval]'));
    if (!root || this.#bannerTimer) return;
    const interval = Math.max(Number(root.dataset.interval) || 4000, 1000);
    this.#bannerTimer = window.setInterval(() => this.#showBanner(this.#bannerIndex + 1), interval);
  }

  #stopBanners() {
    clearInterval(this.#bannerTimer);
    this.#bannerTimer = 0;
  }

  /** @param {number} index */
  #showBanner(index) {
    const banners = this.querySelectorAll('[data-ts-cd-banner]');
    const nextIndex = index % banners.length;
    const current = banners[this.#bannerIndex];
    const next = banners[nextIndex];
    if (!next || next === current) return;
    this.#bannerIndex = nextIndex;

    // Park the incoming banner on the right without animating, so it always slides in from there.
    next.style.transition = 'none';
    next.classList.remove('is-leaving', 'is-active');
    void next.offsetWidth;
    next.style.transition = '';

    banners.forEach((banner) => {
      banner.classList.remove('is-leaving');
      banner.toggleAttribute('aria-hidden', banner !== next);
    });
    current?.classList.replace('is-active', 'is-leaving');
    next.classList.add('is-active');
  }

  /* ── Tiered rewards ───────────────────────────────────────────────────── */

  /** Celebrates when a cart change reaches a new reward milestone (not on page load). */
  #checkTiers() {
    const tiers = /** @type {HTMLElement | null} */ (this.querySelector('[data-hydration-key="ts-cd-tiers"]'));
    const achieved = parseInt(tiers?.dataset.tiersAchieved || '0', 10);
    const previous = this.#tiersAchieved;
    this.#tiersAchieved = achieved;
    if (previous < 0 || achieved <= previous || tiers?.dataset.confetti !== 'true') return;

    if (this.isOpen) burstConfetti(this.#dialog.querySelector('.ts-cd__panel'));
    else this.#pendingConfetti = true;
  }

  /** Re-applies client-side state that a morph resets back to the server markup. */
  #syncUiState() {
    const summary = this.querySelector('[data-ts-cd-summary]');
    if (summary) summary.hidden = !this.#summaryOpen;
    this.querySelector('[data-ts-cd-action="toggle-summary"]')?.setAttribute('aria-expanded', String(this.#summaryOpen));
    this.toggleAttribute('summary-open', this.#summaryOpen);

    for (const input of this.querySelectorAll('[data-ts-cd-coupon-form] input')) {
      this.#syncApplyButton(/** @type {HTMLInputElement} */ (input));
    }
  }

  get #content() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-hydration-key="ts-cd-content"]'));
  }

  get #offersPanel() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-ts-cd-offers]'));
  }

  get itemCount() {
    return parseInt(this.#content?.dataset.itemCount || '0', 10);
  }

  /* ── Cart API ─────────────────────────────────────────────────────────── */

  /**
   * POSTs to the AJAX cart API, asking for this section in the same response.
   * @param {string} endpoint - e.g. 'change.js'
   * @param {object} body
   * @param {{ render?: boolean }} [options]
   */
  async #cartRequest(endpoint, body, { render = true } = {}) {
    const response = await fetch(`${ROOT}cart/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(render ? { ...body, sections: this.sectionId, sections_url: window.location.pathname } : body),
      __tsCartDrawer: true,
    });
    const data = await response.json();

    if (!response.ok || data.status) {
      throw new Error(data.description || data.message || 'Something went wrong. Please try again.');
    }

    if (render) {
      this.#render(data.sections?.[this.sectionId]);
      this.dispatchEvent(
        new CartUpdateEvent(data, 'ts-cart-drawer', {
          source: 'ts-cart-drawer',
          itemCount: this.itemCount,
          sections: data.sections,
        })
      );
    }
    return data;
  }

  /**
   * Runs a cart action with the row/button in a busy state and errors shown as a toast.
   * @param {Element | null} busyElement
   * @param {() => Promise<unknown>} action
   */
  async #run(busyElement, action) {
    busyElement?.classList.add('is-busy');
    this.classList.add('is-updating');
    try {
      await action();
    } catch (error) {
      this.#toast(error instanceof Error ? error.message : String(error));
      this.refresh();
    } finally {
      busyElement?.classList.remove('is-busy');
      this.classList.remove('is-updating');
    }
  }

  /* ── Event delegation ─────────────────────────────────────────────────── */

  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);

    // Click on the ::backdrop lands on the dialog element itself.
    if (target === this.#dialog) return this.close();

    if (!target.closest('.ts-cd__account-row')) this.#setAccountOpen(false);

    const button = /** @type {HTMLElement | null} */ (target.closest('[data-ts-cd-action]'));
    if (!button || button.hasAttribute('disabled')) return;

    const row = /** @type {HTMLElement | null} */ (button.closest('[data-ts-cd-line]'));

    switch (button.dataset.tsCdAction) {
      case 'close':
        return this.close();
      case 'increase':
      case 'decrease': {
        if (!row) return;
        const step = button.dataset.tsCdAction === 'increase' ? 1 : -1;
        const quantity = Math.max(0, parseInt(row.dataset.quantity || '1', 10) + step);
        return this.#run(row, () => this.#cartRequest('change.js', { id: row.dataset.key, quantity }));
      }
      case 'remove':
        if (!row) return;
        row.classList.add('is-removing');
        return this.#run(row, () => this.#cartRequest('change.js', { id: row.dataset.key, quantity: 0 }));
      case 'toggle-summary':
        this.#summaryOpen = !this.#summaryOpen;
        return this.#syncUiState();
      case 'recs-prev':
        return this.#scrollRecs(-1);
      case 'recs-next':
        return this.#scrollRecs(1);
      case 'open-offers':
        return this.#setOffersOpen(true);
      case 'close-offers':
        return this.#setOffersOpen(false);
      case 'apply-offer':
        return this.#applyCode(button.dataset.code || '', button);
      case 'remove-code':
        return this.#removeCode(button.dataset.code || '', button);
      case 'toggle-account':
        return this.#setAccountOpen(button.getAttribute('aria-expanded') !== 'true');
      case 'login':
        return this.#login();
      case 'logout':
        return this.#logout();
      case 'checkout':
        return this.#checkout(button);
      case 'rec-pick':
        return this.#toggleSizePicker(button.closest('.ts-cd-rec'), true);
      case 'rec-pick-close':
        return this.#toggleSizePicker(button.closest('.ts-cd-rec'), false);
      case 'rec-add':
        return this.#addRecommendation(button);
    }
  };

  #onChange = (event) => {
    const select = /** @type {HTMLElement} */ (event.target);
    if (!(select instanceof HTMLSelectElement) || !select.matches('[data-ts-cd-variant]')) return;

    const row = /** @type {HTMLElement | null} */ (select.closest('[data-ts-cd-line]'));
    if (!row) return;

    const previous = row.dataset.variantId;
    this.#run(row, async () => {
      try {
        await this.#swapVariant(row, select.value);
      } catch (error) {
        select.value = previous || '';
        throw error;
      }
    });
  };

  #onSubmit = (event) => {
    const form = /** @type {HTMLElement} */ (event.target);
    if (!form.matches('[data-ts-cd-coupon-form]')) return;
    event.preventDefault();

    const input = form.querySelector('input[name="discount"]');
    if (input instanceof HTMLInputElement) {
      this.#applyCode(input.value, form.querySelector('button[type="submit"]'));
    }
  };

  #onInput = (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.closest('[data-ts-cd-coupon-form]')) {
      this.#syncApplyButton(input);
      this.#setCouponError(input.form, '');
    }
  };

  /* ── Line items ───────────────────────────────────────────────────────── */

  /**
   * Shopify has no "change variant" endpoint: add the new size first (so a failure keeps
   * the old line), then remove the old line.
   * @param {HTMLElement} row
   * @param {string} variantId
   */
  async #swapVariant(row, variantId) {
    let properties = {};
    try {
      properties = JSON.parse(row.dataset.properties || '{}') || {};
    } catch {}
    // Liquid serialises an empty property set as [], which the cart API won't take as properties.
    if (Array.isArray(properties)) properties = {};

    await this.#cartRequest(
      'add.js',
      { items: [{ id: Number(variantId), quantity: parseInt(row.dataset.quantity || '1', 10), properties }] },
      { render: false }
    );
    await this.#cartRequest('change.js', { id: row.dataset.key, quantity: 0 });
  }

  /* ── Coupons ──────────────────────────────────────────────────────────── */

  #appliedCodes() {
    return Array.from(this.querySelectorAll('[data-ts-cd-action="remove-code"]'), (el) =>
      /** @type {HTMLElement} */ (el).dataset.code || ''
    ).filter(Boolean);
  }

  /**
   * @param {string} rawCode
   * @param {Element | null} button
   */
  async #applyCode(rawCode, button) {
    const code = rawCode.trim();
    const form = button?.closest('form') || this.querySelector('[data-ts-cd-coupon-form]');
    if (!code) return;

    const existing = this.#appliedCodes();
    if (existing.some((applied) => applied.toLowerCase() === code.toLowerCase())) {
      return this.#setCouponError(form, `${code.toUpperCase()} is already applied.`);
    }

    await this.#run(button, async () => {
      const data = await this.#cartRequest('update.js', { discount: [...existing, code].join(',') }, { render: false });
      const result = data.discount_codes?.find(
        (/** @type {{code: string, applicable: boolean}} */ entry) => entry.code.toLowerCase() === code.toLowerCase()
      );

      if (!result?.applicable) {
        // Shopify keeps inapplicable codes on the cart; drop it again so it doesn't linger.
        await this.#cartRequest('update.js', { discount: existing.join(',') });
        this.#setCouponError(form, `${code.toUpperCase()} is not valid for the items in your cart.`);
        return;
      }

      await this.refresh();
      this.dispatchEvent(
        new CartUpdateEvent(data, 'ts-cart-drawer', { source: 'ts-cart-drawer', itemCount: this.itemCount })
      );
      for (const input of this.querySelectorAll('[data-ts-cd-coupon-form] input')) {
        /** @type {HTMLInputElement} */ (input).value = '';
        this.#syncApplyButton(/** @type {HTMLInputElement} */ (input));
      }
      this.#setOffersOpen(false);
      this.#toast(`${code.toUpperCase()} applied`, 'success');
    });
  }

  /**
   * @param {string} code
   * @param {Element} button
   */
  #removeCode(code, button) {
    const remaining = this.#appliedCodes().filter((applied) => applied !== code);
    return this.#run(button.closest('li'), () => this.#cartRequest('update.js', { discount: remaining.join(',') }));
  }

  /** @param {HTMLInputElement} input */
  #syncApplyButton(input) {
    const button = input.form?.querySelector('button[type="submit"]');
    if (button instanceof HTMLButtonElement) button.disabled = input.value.trim() === '';
  }

  /**
   * @param {HTMLFormElement | Element | null | undefined} form
   * @param {string} message
   */
  #setCouponError(form, message) {
    const error = /** @type {HTMLElement | null | undefined} */ (form?.querySelector('[data-ts-cd-coupon-error]'));
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  /** @param {boolean} open */
  #setOffersOpen(open) {
    const panel = this.#offersPanel;
    if (!panel) return;
    panel.hidden = !open;
    if (open) panel.querySelector('input')?.focus({ preventScroll: true });
  }

  /* ── Account ──────────────────────────────────────────────────────────── */

  /** @param {boolean} open */
  #setAccountOpen(open) {
    const toggle = this.querySelector('[data-ts-cd-action="toggle-account"]');
    const menu = /** @type {HTMLElement | null} */ (this.querySelector('[data-ts-cd-account-menu]'));
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  }

  async #login() {
    const login = /** @type {any} */ (window).handleKpAndShopifyLogin;
    if (typeof login !== 'function') {
      window.location.href = this.dataset.loginUrl || '/account/login';
      return;
    }

    // The KwikPass popup lives below our modal dialog, so step aside and come back afterwards.
    sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ path: window.location.pathname, at: Date.now() }));
    await this.close();
    login();
  }

  #logout() {
    const logoutUrl = this.dataset.logoutUrl || '/account/logout';
    const logout = /** @type {any} */ (window).handleLogout;
    if (typeof logout === 'function') logout(logoutUrl);
    else window.location.href = logoutUrl;
  }

  #onLoggedIn = () => {
    this.#loggedIn = true;
    // The Shopify customer session can land a moment after KwikPass reports success.
    this.refresh();
    setTimeout(() => this.refresh(), 2000);
    if (this.#consumeReopen()) setTimeout(() => this.open(), 400);
  };

  #onKpPopup = (event) => {
    const visible = Boolean(/** @type {CustomEvent} */ (event).detail?.status);
    if (visible) {
      this.#kpPopupOpen = true;
      return;
    }
    if (!this.#kpPopupOpen) return;
    this.#kpPopupOpen = false;

    // Popup dismissed without logging in: return to the cart, like the GoKwik drawer does.
    setTimeout(() => {
      if (!this.#loggedIn && this.#consumeReopen()) this.open();
    }, 300);
  };

  /** Reopens the drawer on the page the shopper logged in from (KwikPass may reload it). */
  #reopenAfterLogin() {
    const reopen = this.#consumeReopen();
    if (reopen && this.itemCount > 0) requestAnimationFrame(() => this.open());
  }

  /** /cart has no page of its own; the shopper was sent back here to see the drawer. */
  #openAfterCartRedirect() {
    try {
      const at = Number(sessionStorage.getItem(OPEN_ON_LOAD_KEY));
      if (!at) return;
      sessionStorage.removeItem(OPEN_ON_LOAD_KEY);
      if (Date.now() - at < 30 * 1000) requestAnimationFrame(() => this.open());
    } catch {}
  }

  #consumeReopen() {
    const raw = sessionStorage.getItem(REOPEN_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(REOPEN_KEY);
    try {
      const { path, at } = JSON.parse(raw);
      return path === window.location.pathname && Date.now() - at < 10 * 60 * 1000;
    } catch {
      return false;
    }
  }

  /* ── Checkout ─────────────────────────────────────────────────────────── */

  /** @param {HTMLElement} button */
  async #checkout(button) {
    const terms = this.querySelector('[data-ts-cd-terms]');
    if (terms instanceof HTMLInputElement && !terms.checked) {
      this.#toast('Please accept the Terms & Conditions to continue.');
      return;
    }

    button.classList.add('is-busy');
    try {
      const sdk = (await useGoKwik()) ? await waitForGoKwikSdk() : null;
      if (sdk) {
        await this.close();
        sdk.initCheckout(/** @type {any} */ (window).merchantInfo);
      } else {
        window.location.href = `${ROOT}checkout`;
      }
    } finally {
      button.classList.remove('is-busy');
    }
  }

  /* ── Suggested products ───────────────────────────────────────────────── */

  async #loadRecs() {
    const box = /** @type {HTMLElement | null} */ (this.querySelector('[data-ts-cd-recs]'));
    const track = this.querySelector('[data-ts-cd-recs-track]');
    if (!box || !track) return;

    const content = this.#content;
    const productId = content?.dataset.firstProductId;
    const key = content?.dataset.productIds || '';

    if (!productId) {
      box.hidden = true;
      this.#recsKey = key;
      return;
    }
    if (key === this.#recsKey) return;
    this.#recsKey = key;

    const limit = parseInt(this.dataset.recsLimit || '8', 10);
    try {
      let cards = await fetchRecCards(
        `${ROOT}recommendations/products?section_id=${RECS_SECTION}&product_id=${productId}&limit=${limit + 4}&intent=related`
      );
      if (!cards.length && this.dataset.recsFallback) {
        cards = await fetchRecCards(`${ROOT}collections/${this.dataset.recsFallback}?section_id=${RECS_SECTION}`);
      }
      if (key !== this.#recsKey) return;

      track.replaceChildren(...cards.slice(0, limit));
      box.hidden = cards.length === 0;
      track.scrollLeft = 0;
      requestAnimationFrame(() => this.#syncRecsNav());
    } catch (error) {
      console.error('[ts-cart-drawer] recommendations failed', error);
      this.#recsKey = null;
    }
  }

  /**
   * @param {Element | null} card
   * @param {boolean} open
   */
  #toggleSizePicker(card, open) {
    const picker = /** @type {HTMLElement | null | undefined} */ (card?.querySelector('.ts-cd-rec__sizes'));
    if (!picker) return;
    picker.hidden = !open;
    card?.querySelector('[data-ts-cd-action="rec-pick"]')?.setAttribute('aria-expanded', String(open));
  }

  /** @param {HTMLElement} button */
  #addRecommendation(button) {
    const card = button.closest('.ts-cd-rec');
    return this.#run(card, async () => {
      await this.#cartRequest('add.js', { items: [{ id: Number(button.dataset.variantId), quantity: 1 }] });
      this.#toast('Added to cart', 'success');
    });
  }

  /* ── Changes made outside the drawer ──────────────────────────────────── */

  /** @param {string} kind - add | change | update | clear */
  onExternalCartChange(kind) {
    this.#stale = true;
    if (kind === 'add') this.#externalAdd = true;

    clearTimeout(this.#externalTimer);
    this.#externalTimer = window.setTimeout(() => {
      const opened = this.#externalAdd && this.dataset.openOnAdd === 'true' && !this.isOpen;
      this.#externalAdd = false;
      if (opened) this.open();
      else if (this.isOpen) this.refresh();
    }, 150);
  }

  #onThemeCartUpdate = (event) => {
    if (/** @type {CartUpdateEvent} */ (event).detail?.sourceId === 'ts-cart-drawer') return;
    this.#stale = true;
    if (this.isOpen) this.refresh();
  };

  /* ── Toast ────────────────────────────────────────────────────────────── */

  /**
   * @param {string} message
   * @param {'error' | 'success'} [tone]
   */
  #toast(message, tone = 'error') {
    const toast = /** @type {HTMLElement | null} */ (this.querySelector('[data-ts-cd-toast]'));
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** @param {string} url */
async function fetchRecCards(url) {
  const response = await fetch(url, { __tsCartDrawer: true });
  if (!response.ok) return [];
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  return Array.from(doc.querySelectorAll('.ts-cd-rec'));
}

/** GoKwik checkout unless it is switched off, or the international-flow gate says the shopper is abroad. */
async function useGoKwik() {
  const w = /** @type {any} */ (window);
  if (!w.merchantInfo || w.gkBtnConfig?.checkoutEnabled === false) return false;
  if (!w.gokwikIntlFlow) return true;
  try {
    const data = await fetch('/browsing_context_suggestions.json').then((r) => r.json());
    return data?.detected_values?.country_name === 'India';
  } catch {
    return true;
  }
}

/** Resolves with the GoKwik SDK, or null if it hasn't loaded within 3 s. */
function waitForGoKwikSdk() {
  const w = /** @type {any} */ (window);
  const current = () => w.gokwikSdk || w.__gkSdkCache || null;
  if (current()) return Promise.resolve(current());

  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('gokwikLoaded', done);
      clearTimeout(timer);
      resolve(current());
    };
    const timer = setTimeout(done, 3000);
    window.addEventListener('gokwikLoaded', done);
  });
}

/**
 * Short confetti burst drawn on a canvas over the drawer panel.
 * @param {Element | null} container
 */
function burstConfetti(container) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ts-cd__confetti';
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();

  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#111827'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 60,
    y: height * 0.3,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 11 - 3,
    size: Math.random() * 6 + 4,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  const frame = (/** @type {number} */ now) => {
    const t = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1400) / 600);
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < 2000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * Notices cart changes made by other scripts (product form, quick add, product cards,
 * auto bundle, apps) so the drawer can open after an add and stay in sync.
 * Requests made by the drawer itself pass `__tsCartDrawer: true` in their init and are ignored.
 */
function watchCartRequests() {
  const w = /** @type {any} */ (window);
  if (w.__tsCartRequestsWatched) return;
  w.__tsCartRequestsWatched = true;

  /** @param {string} url @param {string} method */
  const notify = (url, method) => {
    const match = CART_MUTATION.exec(url);
    if (match && method.toUpperCase() === 'POST') w.tsCartDrawer?.onExternalCartChange(match[1]);
  };

  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const request = nativeFetch.apply(this, /** @type {any} */ (arguments));
    if (!(/** @type {any} */ (init)?.__tsCartDrawer)) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      request.then((response) => response.ok && notify(url, method)).catch(() => {});
    }
    return request;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener('load', () => this.status < 400 && notify(String(url), String(method)), { once: true });
    return nativeOpen.apply(this, /** @type {any} */ (arguments));
  };
}

if (!customElements.get('ts-cart-drawer')) {
  customElements.define('ts-cart-drawer', TsCartDrawer);
}
