/* =========================================
   Swiper slider initializer
   Converts a flat "container > .item" list into the
   .swiper > .swiper-wrapper > .swiper-slide structure
   Swiper requires, then instantiates it. Reuses the
   existing "slick-dots" / "slick-dot" / "slick-active"
   class names so the existing CSS keeps working unchanged.
========================= */
function initSwiperSlider(selector, options) {
    document.querySelectorAll(selector).forEach(function (el) {
        if (el.dataset.swiperInit === '1') return;

        var items = Array.prototype.slice.call(el.children);
        if (items.length <= 1) return;

        el.dataset.swiperInit = '1';

        var wrapper = document.createElement('div');
        wrapper.className = 'swiper-wrapper';

        items.forEach(function (item) {
            item.classList.add('swiper-slide');
            wrapper.appendChild(item);
        });

        el.appendChild(wrapper);
        el.classList.add('swiper');

        var config = Object.assign({}, options);

        if (config.dots) {
            var dots = document.createElement('div');
            dots.className = 'slick-dots';
            el.appendChild(dots);
            config.pagination = {
                el: dots,
                clickable: true,
                bulletClass: 'slick-dot',
                bulletActiveClass: 'slick-active',
            };
        }
        delete config.dots;

        new Swiper(el, config);
    });
}

document.addEventListener('DOMContentLoaded', function () {

    /* =========================
       Home Banner Slider
    ========================= */
    initSwiperSlider('.home-banner', {
        slidesPerView: 1,
        rewind: true,
        autoplay: { delay: 4000, disableOnInteraction: false },
        speed: 800,
        dots: true,
    });

    /* =========================
       Customer Slider
    ========================= */
    initSwiperSlider('.customer-slider', {
        slidesPerView: 1,
        rewind: true,
        autoplay: { delay: 2000, disableOnInteraction: false },
        dots: true,
        breakpoints: {
            768: { slidesPerView: 2 },
            1200: { slidesPerView: 3 },
        },
    });

    /* =========================
       Secret Slider
    ========================= */
    initSwiperSlider('.secret-slider', {
        slidesPerView: 1,
        rewind: true,
        autoplay: { delay: 800, disableOnInteraction: false },
        breakpoints: {
            768: { slidesPerView: 2 },
            1200: { slidesPerView: 3 },
        },
    });

    /* =========================
       Fashion Slider
    ========================= */
    initSwiperSlider('.fashion-slider', {
        slidesPerView: 1,
        rewind: true,
        autoplay: { delay: 800, disableOnInteraction: false },
        breakpoints: {
            768: { slidesPerView: 2 },
            1200: { slidesPerView: 3 },
        },
    });

    /* =========================
       Blog Slider
    ========================= */
    initSwiperSlider('.blog-slider', {
        slidesPerView: 1,
        rewind: true,
        centeredSlides: true,
        autoplay: { delay: 3000, disableOnInteraction: false },
    });

    /* =========================
       Mobile Sliders
    ========================= */
    if (window.matchMedia("(max-width: 767px)").matches) {

        initSwiperSlider('.categroy-list', {
            slidesPerView: 2.1,
            rewind: true,
        });

        initSwiperSlider('.contact-info-list', {
            slidesPerView: 1,
            loop: false,
            centeredSlides: true,
        });
    }

    /* =========================
       Desktop Bestseller Slider
    ========================= */
    if (window.matchMedia("(min-width: 768px)").matches) {

        initSwiperSlider('.bestseller-slider', {
            slidesPerView: 1,
            rewind: true,
            dots: true,
            breakpoints: {
                768: { slidesPerView: 2 },
                1200: { slidesPerView: 4 },
            },
        });
    }

    /* =========================
       Grid column toggle / quick add header state
       (previously jQuery)
    ========================= */
    document.querySelectorAll('.column-options__option').forEach(function (option) {
        option.addEventListener('click', function () {
            document.querySelectorAll('.column-options__option').forEach(function (el) {
                el.classList.remove('grid-active');
            });
            option.classList.add('grid-active');
        });
    });

    document.querySelectorAll('.quick-add-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var header = document.querySelector('.header');
            if (header) header.classList.add('scrolled');
        });
    });

    /* =========================
       Mobile Navigation
    ========================= */
    if (window.matchMedia("(max-width: 991px)").matches) {

        const navIcon = document.querySelector('.nav-icon');
        const closeBtn = document.querySelector('.header-close-btn');

        const headerMenu = document.querySelector('.header-menu');
        const headerMenu2 = document.querySelector('.header-menu2');

        if (navIcon && closeBtn) {

            navIcon.addEventListener('click', () => {
                headerMenu?.classList.toggle('active');
                headerMenu2?.classList.toggle('active');
            });

            closeBtn.addEventListener('click', () => {
                headerMenu?.classList.remove('active');
                headerMenu2?.classList.remove('active');
            });
        }
    }
});


/* =========================================
   DOM Loaded
========================================= */
document.addEventListener('DOMContentLoaded', function () {

    /* =========================
       Header Scroll Effect
    ========================= */
    const header = document.querySelector('.header');

    window.addEventListener('scroll', () => {

        if (window.scrollY > 50) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }

    }, { passive: true });
    const filterBottom = document.querySelector('.sticky-filters');
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;

        if (currentScrollY < lastScrollY) {
            // Scrolling Up
            filterBottom?.classList.add('filterscrolled');
        } else if (currentScrollY > lastScrollY) {
            // Scrolling Down
            filterBottom?.classList.remove('filterscrolled');
        }

        lastScrollY = currentScrollY;
    }, { passive: true });

    /* =========================
       FAQ Accordion
    ========================= */
    const faqCards = document.querySelectorAll('.faq-card');

    faqCards.forEach(card => {

        card.addEventListener('click', () => {

            faqCards.forEach(item => {
                if (item !== card) {
                    item.classList.remove('active');
                }
            });

            card.classList.toggle('active');
        });
    });

    /* =========================
       Reveal Text Animation
    ========================= */
    const text = document.querySelector(".reveal-text");

    if (text) {

        const words = text.innerText.trim().split(" ");

        text.innerHTML = words
            .map(word => `<span>${word}</span>`)
            .join(" ");

        const spans = document.querySelectorAll(".reveal-text span");

        window.addEventListener("scroll", () => {

            const section = document.querySelector(".premium-bottom");

            if (!section) return;

            const rect = section.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            const start = windowHeight;
            const end = -rect.height * 0.2;

            let progress = (start - rect.top) / (start - end);

            progress = Math.max(0, Math.min(progress, 1));

            const wordsToShow = Math.ceil(progress * spans.length);

            spans.forEach((span, index) => {

                if (index < wordsToShow) {
                    span.classList.add("active");
                } else {
                    span.classList.remove("active");
                }
            });

            if (progress > 0.98) {
                spans.forEach(span => span.classList.add("active"));
            }
        });
    }

    /* =========================
       Shop Look Tabs
    ========================= */
    const points = document.querySelectorAll(".shop-look-point");
    const cards = document.querySelectorAll(".shop-look-card");

    points.forEach((point, index) => {

        point.addEventListener("click", () => {

            points.forEach(p => p.classList.remove("active"));
            cards.forEach(c => c.classList.remove("active"));

            point.classList.add("active");

            if (cards[index]) {
                cards[index].classList.add("active");
            }
        });
    });

    /* =========================
       Mobile Shop Look Scroll
    ========================= */
    if (window.innerWidth <= 768) {

        const slider = document.querySelector('.shop-look-list');

        points.forEach((point, index) => {

            point.addEventListener('click', () => {

                points.forEach(p => p.classList.remove('active'));

                point.classList.add('active');

                if (slider && cards[index]) {

                    slider.scrollTo({
                        left: cards[index].offsetLeft,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    /* =========================
       Product Variant Toggle
    ========================= */
    document.addEventListener("click", function (e) {

        const btn = e.target.closest(".product-card .add-to-cart-button");

        if (!btn) return;

        const currentCard = btn.closest(".product-card");

        if (!currentCard) return;

        document
            .querySelectorAll(".product-card .variant-buttons.active")
            .forEach(el => {
                el.classList.remove("active");
            });

        const variantBox = currentCard.querySelector(".variant-buttons");

        if (variantBox) {
            variantBox.classList.add("active");
        }
    });

    /* =========================
       Sticky Checkout Button
    ========================= */
    const stickyBtn = document.querySelector('#accelerated-checkout');
    const realBtn = document.querySelector('.shopify-payment-button__button');

    if (stickyBtn && realBtn) {

        stickyBtn.addEventListener('click', function (e) {

            e.preventDefault();
            realBtn.click();
        });
    }


});

document.addEventListener("click", function (e) {

  // OPEN MODAL
  const openBtn = e.target.closest("[data-open-size]");

  if (openBtn) {
    const productId = openBtn.dataset.productId;
    const modal = document.getElementById(`sizeChartModal-${productId}`);

    if (modal) {
      modal.showModal();
      modal.style.display = "block";
      document.body.classList.add("popup-overlay");
    }
  }

  // CLOSE BUTTON
  const closeBtn = e.target.closest(".close-size");

  if (closeBtn) {
    const modal = closeBtn.closest(".size-modal");

    if (modal) {
      modal.style.display = "none";
      modal.close();
      document.body.classList.remove("popup-overlay");
    }
  }

  // OUTSIDE CLICK
  document.querySelectorAll(".size-modal").forEach((modal) => {
    if (e.target === modal) {
      modal.style.display = "none";
      modal.close();
      document.body.classList.remove("popup-overlay");
    }
  });

});
