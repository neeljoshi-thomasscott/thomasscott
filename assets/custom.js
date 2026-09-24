$(document).ready(function ($) {

    /* =========================
       Home Banner Slider
    ========================= */
    $('.home-banner').slick({
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
        infinite: true,
        dots: true,
        autoplay: true,
        autoplaySpeed: 4000,
        speed: 800,
        pauseOnHover: false,
        pauseOnFocus: false,
    });

    /* =========================
       Watch Buy Slider
    ========================= */
    // $('.watch-buy-slider').slick({
    //     slidesToShow: 4,
    //     slidesToScroll: 1,
    //     arrows: false,
    //     infinite: false,
    //     responsive: [
    //         {
    //             breakpoint: 1199,
    //             settings: {
    //                 slidesToShow: 2,
    //                 slidesToScroll: 1
    //             }
    //         },
    //         {
    //             breakpoint: 767,
    //             settings: {
    //                 arrows: false,
    //                 dots: false,
    //                 slidesToShow: 1,
    //                 slidesToScroll: 1
    //             }
    //         }
    //     ]
    // });

    /* =========================
       Deal Slider
    ========================= */
    $('.deal-slider').slick({
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false,
        infinite: false,
        responsive: [
            {
                breakpoint: 1199,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 767,
                settings: {
                    arrows: false,
                    dots: true,
                    slidesToShow: 1,
                    slidesToScroll: 1
                }
            }
        ]
    });

    /* =========================
       Customer Slider
    ========================= */
    $('.customer-slider').slick({
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false,
        infinite: true,
        dots: true,
        autoplay: true,
        autoplaySpeed: 2000,
        responsive: [
            {
                breakpoint: 1199,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 767,
                settings: {
                    arrows: false,
                    dots: false,
                    slidesToShow: 1,
                    slidesToScroll: 1
                }
            }
        ]
    });

    /* =========================
       Shop New Slider
    ========================= */
    $('.shop-new-slider').slick({
        slidesToShow: 4,
        slidesToScroll: 1,
        arrows: false,
        infinite: false,
        dots: true,
        responsive: [
            {
                breakpoint: 1199,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 767,
                settings: {
                    arrows: false,
                    dots: false,
                    slidesToShow: 2.1,
                    slidesToScroll: 1
                }
            }
        ]
    });

   /* =========================
   Secret Slider
========================= */
    $('.secret-slider').slick({
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false,
        infinite: true,
        dots: false,
        autoplay: true,
        autoplaySpeed: 800,

        responsive: [
            {
                breakpoint: 1199,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 767,
                settings: {
                    arrows: false,
                    dots: false,
                    slidesToShow: 1,
                    slidesToScroll: 1
                }
            }
        ]
    });

    /* =========================
    Fashion Slider
    ========================= */
    $('.fashion-slider').slick({
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false,
        infinite: true,
        dots: false,
        autoplay: true,
        autoplaySpeed: 800,

        responsive: [
            {
                breakpoint: 1199,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 1
                }
            },
            {
                breakpoint: 767,
                settings: {
                    arrows: false,
                    dots: false,
                    slidesToShow: 1,
                    slidesToScroll: 1
                }
            }
        ]
    });

    /* =========================
       Blog Slider
    ========================= */
    $('.blog-slider').slick({
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
        infinite: true,
        dots: false,
        centerMode: true,
        autoplay:true,
    });
    $('.column-options__option').on('click', function() {
        $('.column-options__option').removeClass('grid-active');
        $(this).addClass('grid-active');
    
    });
    $('.quick-add-btn').on('click', function() {
        $('.header').addClass('scrolled');
    });

    /* =========================
       Mobile Sliders
    ========================= */
    if (window.matchMedia("(max-width: 767px)").matches) {

        $('.categroy-list').slick({
            slidesToShow: 2.1,
            slidesToScroll: 1,
            arrows: false,
            dots: false,
            infinite: true,
        });

        $('.contact-info-list').slick({
            slidesToShow: 1,
            slidesToScroll: 1,
            arrows: false,
            dots: false,
            infinite: false,
            centerMode: true,
        });
    }

    /* =========================
       Desktop Bestseller Slider
    ========================= */
    if (window.matchMedia("(min-width: 768px)").matches) {

        $('.bestseller-slider').slick({
            slidesToShow: 4,
            slidesToScroll: 1,
            arrows: false,
            infinite: true,
            dots: true,
            responsive: [
                {
                    breakpoint: 1199,
                    settings: {
                        slidesToShow: 2,
                        slidesToScroll: 1
                    }
                },
                {
                    breakpoint: 767,
                    settings: {
                        arrows: false,
                        dots: false,
                        slidesToShow: 1,
                        slidesToScroll: 1
                    }
                }
            ]
        });
    }

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
       Footer Accordion
    ========================= */
    // const footerTabs = document.querySelectorAll('.footer-col');

    // footerTabs.forEach(tab => {

    //     const footerHeader = tab.querySelector('.footer-toggle');

    //     if (!footerHeader) return;

    //     footerHeader.addEventListener('click', () => {

    //         footerTabs.forEach(item => {

    //             if (item !== tab) {
    //                 item.classList.remove('active');
    //             }
    //         });

    //         tab.classList.toggle('active');
    //     });
    // });

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



