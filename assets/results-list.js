import { mediaQueryLarge, requestIdleCallback, startViewTransition } from '@theme/utilities';
import PaginatedList from '@theme/paginated-list';

/**
 * A custom element that renders a pagniated results list
 */
export default class ResultsList extends PaginatedList {
  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#handleMediaQueryChange);
    this.setAttribute('initialized', '');
  }

  disconnectedCallback() {
    mediaQueryLarge.removeEventListener('change', this.#handleMediaQueryChange);
  }

  /**
   * Updates the layout.
   *
   * @param {Event} event
   */
  updateLayout({ target }) {
    if (!(target instanceof HTMLInputElement)) return;

    this.#animateLayoutChange(target.value);
  }

  /**
   * Sets the layout.
   *
   * @param {string} value
   */
  #animateLayoutChange = async (value) => {
    const { grid } = this.refs;

    if (!grid) return;

    await startViewTransition(() => this.#setLayout(value), ['product-grid']);

    requestIdleCallback(() => {
      const viewport = mediaQueryLarge.matches ? 'desktop' : 'mobile';
      sessionStorage.setItem(`product-grid-view-${viewport}`, value);
    });
  };

  /**
   * Animates the layout change.
   *
   * @param {string} value
   */
  #setLayout(value) {
    const { grid } = this.refs;
    if (!grid) return;
    grid.setAttribute('product-grid-view', value);
  }

  /**
   * Handles the media query change event.
   *
   * @param {MediaQueryListEvent} event
   */
  #handleMediaQueryChange = (event) => {
    const targetElement = event.matches
      ? this.querySelector('[data-grid-layout="desktop-default-option"]')
      : this.querySelector('[data-grid-layout="mobile-option"]');

    if (!(targetElement instanceof HTMLInputElement)) return;

    targetElement.checked = true;
    this.#setLayout('default');
  };
}

if (!customElements.get('results-list')) {
  customElements.define('results-list', ResultsList);
}


// ===============================
// AFTER RENDER HOOK 🔥
// ===============================
// renderedCallback(html) {
//   super.renderedCallback?.(html);

//   this.updateProductCount(html);
// }

// // ===============================
// // UPDATE COUNT FUNCTION
// // ===============================
// updateProductCount(html) {
//   const parser = new DOMParser();
//   const parsedHTML = parser.parseFromString(html, 'text/html');

//   const newCount = parsedHTML.querySelector(
//     `#ProductCount-${this.dataset.sectionId}`
//   );

//   const currentCount = document.querySelector(
//     `#ProductCount-${this.dataset.sectionId}`
//   );

//   if (newCount && currentCount) {
//     currentCount.innerHTML = newCount.innerHTML;
//   }
// }