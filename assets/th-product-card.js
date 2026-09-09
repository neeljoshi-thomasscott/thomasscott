class ThProductCard extends HTMLElement {
  constructor() {
    super();

    this.quickAddButton = this.querySelector('[data-quick-add-trigger]');
    this.buyNowButton = this.querySelector('[data-buy-now-trigger]');
    this.inlineSelector = this.querySelector('[data-inline-selector]');
    this.variantInput = this.querySelector('[data-selected-variant-input]');
    this.hiddenSubmit = this.querySelector('[data-hidden-submit]');
    this.form = this.querySelector('form[data-type="add-to-cart-form"]');
    this.mobileModal = this.querySelector('[data-mobile-modal]');
    this.mobileClose = this.querySelector('[data-mobile-close]');
    this.defaultIcon = this.querySelector('[data-default-icon]');
    this.loadingIcon = this.querySelector('.btn-loader');
    this.productId = this.dataset.productId;
    this.productTitle = this.dataset.productTitle || '';
    this.abortController = null;
    this.isSubmitting = false;
    this.mobileAction = 'add_to_cart';
    this.isDesktop = () => window.matchMedia('(min-width: 990px)').matches;
    this.cartIcon = document.querySelector('cart-icon') || '';
  }

  connectedCallback() {
    this.initSlider();
    this.bindEvents();
  }

  bindEvents() {
    if (this.quickAddButton) {
      this.quickAddButton.addEventListener('click', () => {
        this.mobileAction = 'add_to_cart';
        this.handleQuickAddClick();
      });
    }

    if (this.buyNowButton) {
      this.buyNowButton.addEventListener('click', () => {
        this.mobileAction = 'buy_now';
        this.handleBuyNowClick();
      });
    }

    this.querySelectorAll('.inline-variant-selector .size-btn').forEach((button) => {
      button.addEventListener('click', () => this.handleVariantPick(button));
    });

    this.querySelectorAll('[data-mobile-variant]').forEach((button) => {
      button.addEventListener('click', () =>
        this.handleVariantPick(button, {
          fromMobile: true,
          action: button.dataset.action || this.mobileAction || 'add_to_cart',
        })
      );
    });

    if (this.mobileClose) {
      this.mobileClose.addEventListener('click', () => this.closeMobileModal());
    }

    if (this.mobileModal) {
      this.mobileModal.addEventListener('click', (event) => {
        if (event.target === this.mobileModal) this.closeMobileModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeInlineSelector();
        this.closeMobileModal();
      }
    });
  }

  initSlider() {
    const slider = this.querySelector('[data-product-slider]');
    if (!slider || typeof window.Swiper === 'undefined' || slider.dataset.swiperReady === 'true') return;

    slider.dataset.swiperReady = 'true';
    new window.Swiper(slider, {
      slidesPerView: 1,
      spaceBetween: 0,
      loop: false,
      grabCursor: true,
      pagination: false,
      navigation: false,
    });
  }

  handleQuickAddClick() {
    console.log('clicked')
    if (this.isSubmitting) return;

    if (this.isDesktop()) {
      this.toggleInlineSelector();
      return;
    }

    this.openMobileModal('add_to_cart');
  }

  handleBuyNowClick() {
    if (this.isSubmitting) return;

    if (this.isDesktop()) {
      this.toggleInlineSelector();
      return;
    }

    this.openMobileModal('buy_now');
  }

  toggleInlineSelector() {
    if (!this.inlineSelector) return;
    const willOpen = this.inlineSelector.hasAttribute('hidden');

    document.querySelectorAll('th-product-card [data-inline-selector]').forEach((selector) => {
      if (selector !== this.inlineSelector) selector.setAttribute('hidden', true);
    });

    if (willOpen) {
      this.inlineSelector.removeAttribute('hidden');
      this.quickAddButton?.setAttribute('aria-expanded', 'true');
    } else {
      this.closeInlineSelector();
    }
  }

  closeInlineSelector() {
    if (!this.inlineSelector) return;
    this.inlineSelector.setAttribute('hidden', true);
    this.quickAddButton?.setAttribute('aria-expanded', 'false');
  }

  openMobileModal(action = 'add_to_cart') {
    if (!this.mobileModal) return;

    this.mobileModal.setAttribute('data-action', action);
    this.mobileAction = action;

    this.querySelectorAll('[data-mobile-variant]').forEach((button) => {
      button.dataset.action = action;
    });

    if (typeof this.mobileModal.showModal === 'function') {
      this.mobileModal.showModal();
    } else {
      this.mobileModal.setAttribute('open', 'open');
    }
  }

  closeMobileModal() {
    if (!this.mobileModal) return;
    if (typeof this.mobileModal.close === 'function' && this.mobileModal.open) {
      this.mobileModal.close();
    } else {
      this.mobileModal.removeAttribute('open');
    }
  }

  async handleVariantPick(button, { fromMobile = false, action = 'add_to_cart' } = {}) {
    if (!button || button.disabled || this.isSubmitting) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    this.setSelectedVariant(variantId);
    this.setLoading(true, button);

    try {
      if (action === 'buy_now') {
        await this.submitBuyNow(variantId);
      } else {
        const usedNativeSubmit = await this.submitThroughNativeProductForm();

        if (!usedNativeSubmit) {
          await this.submitThroughAjax(variantId);
        }
      }

      this.closeInlineSelector();
      if (fromMobile) this.closeMobileModal();
    } catch (error) {
      console.error('Quick add failed:', error);
    } finally {
      this.setLoading(false, button);
    }
  }

  setSelectedVariant(variantId) {
    if (this.variantInput) {
      this.variantInput.value = variantId;
      this.variantInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async submitThroughNativeProductForm() {
    const productFormComponent = this.querySelector('product-form-component');
    if (!productFormComponent || !this.form || !this.hiddenSubmit) return false;

    try {
      this.hiddenSubmit.click();
      return true;
    } catch (error) {
      console.warn('Native Horizon product form submit failed, falling back to Ajax.', error);
      return false;
    }
  }

  async submitThroughAjax(variantId) {
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    const response = await fetch(`${window.Shopify.routes.root}cart/add.js?sections=cart-count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          id: Number(variantId),
          quantity: 1,
        }],
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.description || 'Unable to add item to cart.');
    }

    const addedItem = await response.json();
    
    const html = addedItem?.sections?.['cart-count'];

    if(html){
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body.textContent?.trim() || '0';
      const itemCount = parseInt(text, 10) || 0;
      
      
      this.syncCartUi(itemCount)
      
    
      
    }
    

    return { addedItem };
  }

  async submitBuyNow(variantId) {
    await this.submitThroughAjax(variantId);
    window.location.href = `${window.Shopify.routes.root}checkout`;
  }


  syncCartUi(itemCount, cart = null, payload = null) {
    document.dispatchEvent(
        new CustomEvent('cart:update', {
          bubbles: true,
          detail:{
            data: {
              itemCount: itemCount,
              source: 'th-product-card'
            }
          }
        })
      );
    // this.updateCartCountBubbles(itemCount || 0);
    // this.cartIcon?.renderCartBubble(itemCount);


    // document.dispatchEvent(new CustomEvent('cart:refresh', {
    //   bubbles: true,
    //   detail: { source: 'th-product-card', payload },
    // }));

    // document.dispatchEvent(new CustomEvent('cart:open', {
    //   bubbles: true,
    //   detail: { source: 'th-product-card', payload },
    // }));

    // window.dispatchEvent(new CustomEvent('cart:refresh', {
    //   detail: { source: 'th-product-card', payload },
    // }));

    // this.openCartDrawer();
  }

  updateCartCountBubbles(count) {
    const selectors = [
      '[data-cart-count]',
      '[data-cart-count-bubble]',
      '.cart-count-bubble',
      '.header__icon .count-bubble',
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.textContent = count;
        node.hidden = count < 1;
        node.classList.toggle('hidden', count < 1);
      });
    });
  }

  openCartDrawer(cart, payload) {
    const cartDrawer = document.querySelector('cart-drawer-component, cart-drawer, details-drawer details');

    if (!cartDrawer) return;

    if (typeof cartDrawer.open === 'function') {
      cartDrawer.open();
      return;
    }

    if (typeof cartDrawer.show === 'function') {
      cartDrawer.show();
      return;
    }

    if (typeof cartDrawer.showModal === 'function') {
      cartDrawer.showModal();
      return;
    }

    if ('open' in cartDrawer) {
      cartDrawer.open = true;
    }

    cartDrawer.setAttribute('open', 'open');
    cartDrawer.dispatchEvent(new CustomEvent('cart:open', {
      bubbles: true,
      detail: { cart, source: 'th-product-card', payload },
    }));
  }

  setLoading(state, button = null) {
    this.isSubmitting = state;
    this.toggleButtonLoading(state);

    if (button) {
      button.disabled = state;
      button.classList.toggle('loading', state);
    }

    this.quickAddButton?.toggleAttribute('disabled', state);
    this.buyNowButton?.toggleAttribute('disabled', state);
    this.classList.toggle('loading', state);
  }

  toggleButtonLoading(state) {
    // if(state) this.loadingIcon.classList.add('loading')
    // if(!state) this.loadingIcon.classList.remove('loading')
    // if (this.defaultIcon) this.defaultIcon.hidden = state;
    // if (this.loadingIcon) this.loadingIcon.hidden = !state;
  }
}

if (!customElements.get('th-product-card')) {
  customElements.define('th-product-card', ThProductCard);
}