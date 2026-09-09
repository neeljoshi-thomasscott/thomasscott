import { Component } from '@theme/component';

class ProductRecommendations extends Component {
  /**
   * Observe section before loading recommendations
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#loadRecommendations();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  /**
   * Observe attribute changes
   */
  #mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.target !== this || mutation.type !== 'attributes') continue;

      if (mutation.attributeName === 'data-error') continue;

      if (
        mutation.attributeName === 'class' &&
        this.classList.contains('hidden')
      )
        continue;

      if (
        mutation.attributeName === 'data-recommendations-performed' &&
        this.dataset.recommendationsPerformed === 'true'
      )
        continue;

      this.#loadRecommendations();
      break;
    }
  });

  /**
   * Cache recommendations
   */
  #cachedRecommendations = {};

  /**
   * Active fetch controller
   */
  #activeFetch = null;

  connectedCallback() {
    super.connectedCallback();
    
    this.#intersectionObserver.observe(this);
    this.#mutationObserver.observe(this, { attributes: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#intersectionObserver.disconnect();
    this.#mutationObserver.disconnect();
  }

  /**
   * Initialize Swiper
   */
  loadSlider() {
  // requestAnimationFrame(() => {
  //   const slider = this.querySelector('.custom-product-swiper');

  //   if (!slider) return;

  //   if (slider.swiper) {
  //     slider.swiper.destroy(true, true);
  //   }

  //   new Swiper(slider, {
  //     slidesPerView: 1,
  //     spaceBetween: 12,
  //     speed: 600,
  //     observer: true,
  //     observeParents: true,

  //     navigation: {
  //       nextEl: slider.querySelector('.swiper-button-next'),
  //       prevEl: slider.querySelector('.swiper-button-prev')
  //     },

  //     breakpoints: {
  //       220: { slidesPerView: 1, spaceBetween: 12 },
  //       768: { slidesPerView: 3, spaceBetween: 20 },
  //       1024: { slidesPerView: 4, spaceBetween: 24 }
  //     },

  //     on: {
  //       init: function () {
  //         slider.classList.remove('swiper-loading');
  //         slider.classList.add('swiper-ready');
  //       }
  //     }
  //   });
  // });
  const swiper = new Swiper('.custom-product-swiper', {
    slidesPerView: 2,
    spaceBetween: 12,
    observer: true,
    observeParents: true,
    breakpoints: {
        768: {
            slidesPerView: 2,
            spaceBetween: 20,
        },
        1024: {
            slidesPerView: 4,
            spaceBetween: 24,
        },
    },
    keyboard: {
        enabled: true,
     }
});
}
  /**
   * Load recommendations
   */
  #loadRecommendations() {
    const {
      productId,
      recommendationsPerformed,
      sectionId,
      intent
    } = this.dataset;

    const id = this.id;

    if (!productId || !id) {
      throw new Error('Product ID and section ID required');
    }

    // already loaded
    if (recommendationsPerformed === 'true') return;

    this.#fetchCachedRecommendations(productId, sectionId, intent)
      .then((result) => {
        if (!result.success) {
          if (!Shopify.designMode) {
            this.#handleError(
              new Error(`Server returned ${result.status}`)
            );
          }
          return;
        }

        const html = document.createElement('div');
        html.innerHTML = result.data || '';

        const recommendations = html.querySelector(
          `product-recommendations[id="${id}"]`
        );

        if (
          recommendations?.innerHTML &&
          recommendations.innerHTML.trim().length
        ) {
          this.dataset.recommendationsPerformed = 'true';
          this.innerHTML = recommendations.innerHTML;
          // jQuery('.frequently-slider').slick({
          //   slidesToShow: 2.3,
          //   slidesToScroll: 1,
          //   arrows: false,
          //   infinite: true,
          //   dots: false,
          //   responsive: [
          //     {
          //       breakpoint: 1199,
          //       settings: {
          //         slidesToShow: 2,
          //         slidesToScroll: 1
          //       }
          //     },
          //     {
          //       breakpoint: 767,
          //       settings: {
          //         arrows: false,
          //         dots: false,
          //         slidesToShow: 2.2,
          //         slidesToScroll: 1
          //       }
          //     }
          //   ]
          // });
          // init slider after DOM update
          setTimeout(() => {
            this.loadSlider();
          }, 100);
        } else {
          this.#handleError(
            new Error('No recommendations available')
          );
        }
      })
      .catch((error) => {
        this.#handleError(error);
      });
  }

  /**
   * Fetch recommendations
   */
  async #fetchCachedRecommendations(productId, sectionId, intent) {
    const url = `${this.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    const cached = this.#cachedRecommendations[url];

    if (cached) {
      return {
        success: true,
        data: cached
      };
    }

    this.#activeFetch?.abort();
    this.#activeFetch = new AbortController();

    try {
      const response = await fetch(url, {
        signal: this.#activeFetch.signal
      });

      if (!response.ok) {
        return {
          success: false,
          status: response.status
        };
      }

      const text = await response.text();

      this.#cachedRecommendations[url] = text;

      return {
        success: true,
        data: text
      };
    } finally {
      this.#activeFetch = null;
    }
  }

  /**
   * Handle errors
   */
  #handleError(error) {
    console.error(
      'Product recommendations error:',
      error.message
    );

    this.classList.add('hidden');
    this.dataset.error = 'Error loading recommendations';
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define(
    'product-recommendations',
    ProductRecommendations
  );
}