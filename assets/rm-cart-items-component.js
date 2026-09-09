import { CartUpdateEvent, CartErrorEvent } from '@theme/events';

class CartItemControls extends HTMLElement {
  constructor() {
    super();
    this.line = this.dataset.line;
    this.sourceId = 'cart-item-controls';
  }

  connectedCallback() {
    this.variantSelect = this.querySelector('[data-variant-select]');
    this.qtySelect = this.querySelector('[data-qty-select]');

    this.variantSelect?.addEventListener('change', this.onVariantChange.bind(this));
    this.qtySelect?.addEventListener('change', this.onQtyChange.bind(this));
  }
  showInlineError(message) {
    // Find the parent row using your specific class name
    const parentRow = this.closest('.cart-items__table-row');
    if (!parentRow) return;

    const errorContainer = parentRow.querySelector('.cart-items__error');
    const errorText = parentRow.querySelector('.cart-item__error-text');

    if (!errorContainer || !errorText) return;

    // Show error and set text
    errorText.textContent = message;
    errorContainer.classList.remove('hidden');

    // Manage timer to hide after 5 seconds
    if (this.errorTimeout) clearTimeout(this.errorTimeout);

    this.errorTimeout = setTimeout(() => {
      errorContainer.classList.add('hidden');
      errorText.textContent = '';
    }, 5000);
  }
  async onQtyChange(e) {
    const quantity = parseInt(e.target.value);
    const previousValue = this.qtySelect.querySelector('option[selected]')?.value || "1";
    this.setLoading(true);
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: this.line,
          quantity
        })
      });

      const cart = await res.json();
      // console.log( cart );
      if (!res.ok || cart.status === 422 ) {
        Extracts: "Only 1 item was added to your cart due to availability."
        const errorMessage = cart.description || cart.message || 'Quantity update failed';
        if (this.qtySelect) {
          this.qtySelect.value = previousValue;
        }
        // This passes it to your inline HTML elements and drops the 'hidden' class.
        this.showInlineError(errorMessage);
        throw new Error(errorMessage);
      }
      document.dispatchEvent(
        new CartUpdateEvent(cart, this.sourceId, {
          source: 'qty-dropdown',
          itemCount: cart.item_count
        })
      );

    } catch (error ) {
      console.log('Qty update failed test', error);
      document.dispatchEvent(
        new CartErrorEvent(this.sourceId, error.message, error)
      );
      // if (this.qtySelect) {
      //   this.qtySelect.value = previousValue;
      // }
      // // This passes it to your inline HTML elements and drops the 'hidden' class.
      // this.showInlineError(error.message);
    }

    this.setLoading(false);
  }

  async onVariantChange(e) {
    const newVariantId = e.target.value;
    const quantity = parseInt(this.qtySelect.value);

    this.setLoading(true);

    try {
      // Remove old
      await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: this.line,
          quantity: 0
        })
      });

      // Add new
      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newVariantId,
          quantity
        })
      });

      const cart = await fetch('/cart.js').then(r => r.json());

      document.dispatchEvent(
        new CartUpdateEvent(cart, this.sourceId, {
          source: 'variant-dropdown',
          variantId: newVariantId,
          itemCount: cart.item_count
        })
      );

    } catch (error) {
      document.dispatchEvent(
        new CartErrorEvent(this.sourceId, 'Variant update failed', error)
      );
    }

    this.setLoading(false);
  }

  setLoading(state) {
    this.classList.toggle('is-loading', state);
    if (this.variantSelect) this.variantSelect.disabled = state;
    if (this.qtySelect) this.qtySelect.disabled = state;
  }
}

customElements.define('cart-item-controls', CartItemControls);