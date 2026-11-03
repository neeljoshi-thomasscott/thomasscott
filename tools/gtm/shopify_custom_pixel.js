// Shopify admin > Settings > Customer events > Add custom pixel > paste this.
// Runs in Shopify's pixel sandbox (also on checkout), loads the same GTM container there
// and pushes Shopify's standard events into its dataLayer with the event data under "shopify".
// GTM tags for view_item / add_to_cart / begin_checkout / purchase etc. fire ONLY from these.

window.dataLayer = window.dataLayer || [];

// Lets the container know it is running in the sandbox: no page_view / PageView from here,
// and GA4 gets the real page URL instead of the sandbox URL.
window.dataLayer.push({
  ts_pixel: true,
  page_location: init.context.document.location.href,
});

(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var f = d.getElementsByTagName(s)[0],
    j = d.createElement(s),
    dl = l != 'dataLayer' ? '&l=' + l : '';
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
  f.parentNode.insertBefore(j, f);
})(window, document, 'script', 'dataLayer', 'GTM-ML4RJ2Z4');

const EVENTS = [
  'product_viewed',
  'product_added_to_cart',
  'cart_viewed',
  'checkout_started',
  'payment_info_submitted',
  'checkout_completed',
  'search_submitted',
];

EVENTS.forEach(function (name) {
  analytics.subscribe(name, function (event) {
    // Clear the previous payload: dataLayer merges objects, so stale keys would leak between events
    window.dataLayer.push({ shopify: null });
    window.dataLayer.push({
      event: name,
      event_id: event.id,
      page_location: event.context.document.location.href,
      shopify: event.data,
    });
  });
});
