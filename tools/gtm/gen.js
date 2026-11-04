// Builds gtm_container_import.json + gtm_tracking_plan.xlsx from the rows_*.json tracking inventory.
// Usage (needs exceljs): npm i --no-save exceljs@4.4.0 && node tools/gtm/gen.js tools/gtm
// Edit the rows_*.json files when tags change in the theme, then re-run.
//
// Clicks only. Ecommerce events (page_view, view_item, add_to_cart, begin_checkout, purchase, ...) are already
// sent by the Shopify Google & YouTube app (GA4) and the Facebook & Instagram app (Meta) as web pixels, so this
// container must not send them again: no page_view, no PageView, no conversion tags.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const OUT = process.argv[2] || __dirname;
const GA4_ID = 'G-1EBB8T5HF1';
const META_ID = '605451321690258';
const ACCOUNT_ID = '6345737611';
const CONTAINER_ID = '247128781';
const PUBLIC_ID = 'GTM-ML4RJ2Z4';

// ---------- load rows ----------
const rowFiles = ['rows_lead.json', 'rows_header_footer.json', 'rows_home_collection.json', 'rows_cart.json'];
let rows = [];
let skipped = [];
for (const f of rowFiles) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) { console.warn('missing', f); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  rows.push(...j.rows);
  skipped.push(...(j.skipped || []));
}

// ---------- event config ----------
const CARD_FOLDER = 'Shopify - Product Card & Quick Add';
const CLICK_FOLDER = 'Shopify - Clicks';
const META_FOLDER = 'Meta';
const cardEvents = new Set(['select_item', 'quick_add_open', 'grid_color_select', 'grid_color_more_click', 'size_select',
  'size_guide_click', 'size_guide_close', 'quick_add_to_bag_click', 'quick_buy_now_click', 'quick_add_close', 'add_to_wishlist',
  'pdp_size_select', 'pdp_option_select', 'pdp_color_select', 'pdp_add_to_bag_click', 'pdp_buy_now_click']);
const ga4Rename = { newsletter_signup: 'sign_up', share_click: 'share' };

// Click triggers that are not plain [data-track="x"] selectors
const extraSelectors = {
  // On desktop a size click in the inline list adds to bag immediately
  quick_add_to_bag_click: ['[data-track="size_select"][data-track-source="quick_add_inline"]:not([data-track-available="false"])'],
};
const appTriggers = {
  add_to_wishlist: { selector: '.wishlist-hero-custom-button, .wishlist-hero-custom-button *', onlyAdd: true },
  wishlist_header_click: { selector: '.wishlist-hero-header-icon, .wishlist-hero-header-icon *' },
  pincode_check: { selector: '#checkPincode, #checkPincode *' },
  review_click: { selector: '.jdgm-preview-badge, .jdgm-preview-badge *, .jdgm-widget a, .jdgm-widget a *, .jdgm-widget button, .jdgm-widget button *, .jdgm-carousel a, .jdgm-carousel a *, .jdgm-carousel button, .jdgm-carousel button *' },
};

// data-track values in use (theme-tagged elements)
const trackValues = new Set();
for (const r of rows) {
  if (!r.data_track || r.data_track.startsWith('(')) continue;
  if (!/^(Added|Already existed)$/.test(r.status)) continue;
  if (appTriggers[r.data_track]) continue;
  trackValues.add(r.data_track);
}
// renamed at runtime inside the quick-add modal (assets/quick-add.js)
['quick_add_to_bag_click', 'quick_buy_now_click', 'size_select'].forEach((v) => trackValues.add(v));
const appValues = Object.keys(appTriggers).filter((k) => rows.some((r) => r.data_track === k) || k === 'review_click');

// ---------- container builders ----------
let nextId = 1;
const id = () => String(nextId++);
const base = { accountId: ACCOUNT_ID, containerId: CONTAINER_ID };
const T = (key, value) => ({ type: 'TEMPLATE', key, value });
const B = (key, value) => ({ type: 'BOOLEAN', key, value: String(value) });
const paramTable = (key, pairs, k1 = 'parameter', k2 = 'parameterValue') => ({
  type: 'LIST', key,
  list: pairs.map(([a, b]) => ({ type: 'MAP', map: [T(k1, a), T(k2, b)] })),
});

const folders = {};
for (const name of [CLICK_FOLDER, CARD_FOLDER, META_FOLDER]) {
  folders[name] = { ...base, folderId: id(), name };
}

const variables = [];
const varNames = new Set();
function jsVar(name, fn, folder, notes = '') {
  variables.push({ ...base, variableId: id(), name, type: 'jsm', parameter: [T('javascript', fn.trim())], parentFolderId: folders[folder].folderId, notes });
  varNames.add(name);
}
function dlv(name, key, folder) {
  variables.push({ ...base, variableId: id(), name, type: 'v', parameter: [{ type: 'INTEGER', key: 'dataLayerVersion', value: '2' }, B('setDefaultValue', false), T('name', key)], parentFolderId: folders[folder].folderId });
  varNames.add(name);
}
function constVar(name, value, folder) {
  variables.push({ ...base, variableId: id(), name, type: 'c', parameter: [T('value', value)], parentFolderId: folders[folder].folderId });
  varNames.add(name);
}

// --- click variables (ES5: GTM custom JS) ---
const attrVar = (attr) => `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var t = el.closest('[data-track]');
  if (!t) return undefined;
  var v = t.getAttribute('${attr}');
  return v === null || v === '' ? undefined : v;
}`;
jsVar('cjs - track_event', attrVar('data-track'), CLICK_FOLDER);
jsVar('cjs - track_label', attrVar('data-track-label'), CLICK_FOLDER);
jsVar('cjs - track_available', attrVar('data-track-available'), CLICK_FOLDER);
jsVar('cjs - track_color', attrVar('data-track-color'), CLICK_FOLDER);
jsVar('cjs - track_source', attrVar('data-track-source'), CLICK_FOLDER);
jsVar('cjs - track_section', attrVar('data-track-section'), CLICK_FOLDER);
jsVar('cjs - track_position', attrVar('data-track-position'), CLICK_FOLDER);
jsVar('cjs - track_level', attrVar('data-track-level'), CLICK_FOLDER);
jsVar('cjs - track_filter', attrVar('data-track-filter'), CLICK_FOLDER);
jsVar('cjs - track_value', attrVar('data-track-value'), CLICK_FOLDER);
jsVar('cjs - track_coupon', attrVar('data-track-coupon'), CLICK_FOLDER);
jsVar('cjs - track_quantity', attrVar('data-track-quantity'), CLICK_FOLDER);
jsVar('cjs - track_variant_id', attrVar('data-track-variant-id'), CLICK_FOLDER);

jsVar('cjs - selected_size', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var scope = el.closest('quick-add-dialog, form, .product-information, [class*="sticky-add-to-cart"]');
  if (scope && scope.matches('[class*="sticky-add-to-cart"]')) scope = document.querySelector('.product-information');
  if (!scope) return undefined;
  var checked = scope.querySelector('input[type="radio"][data-track-size]:checked');
  return checked ? checked.getAttribute('data-track-size') : undefined;
}`, CARD_FOLDER, 'Size currently selected in the PDP / quick-add modal (for Add to Bag / Buy Now clicks)');

jsVar('cjs - track_size', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var t = el.closest('[data-track]');
  var v = t && t.getAttribute('data-track-size');
  return v || {{cjs - selected_size}} || undefined;
}`, CARD_FOLDER);

jsVar('cjs - product_ctx', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? undefined : n; };
  var str = function (v) { return v === null || v === '' ? undefined : v; };
  var line = el.closest('[data-track-product-id]');
  if (line) {
    return {
      id: str(line.getAttribute('data-track-product-id')),
      title: str(line.getAttribute('data-track-product-title')),
      price: num(line.getAttribute('data-track-price')),
      variant: str(line.getAttribute('data-track-variant-title')),
      list: str(line.getAttribute('data-track-list')),
      index: num(line.getAttribute('data-track-position'))
    };
  }
  var w = el.closest('[data-track-product]');
  if (!w && el.closest('[class*="sticky-add-to-cart"]')) w = document.querySelector('.product-information[data-track-product]');
  if (!w) return undefined;
  var idx = num(w.getAttribute('data-index'));
  if (!idx && w.classList.contains('custom-product-card')) {
    var scope = w.closest('.shopify-section') || document;
    var all = Array.prototype.slice.call(scope.querySelectorAll('.custom-product-card[data-track-product]'));
    idx = all.indexOf(w) + 1 || undefined;
  }
  return {
    id: str(w.getAttribute('data-product-id')),
    title: str(w.getAttribute('data-product-title')),
    price: num(w.getAttribute('data-product-price')),
    compare_price: num(w.getAttribute('data-product-compare-price')),
    type: str(w.getAttribute('data-product-type')),
    list: str(w.getAttribute('data-list-name')),
    index: idx
  };
}`, CARD_FOLDER, 'Product context: cart line attributes (data-track-product-*), else closest [data-track-product] wrapper (card, PDP, quick-add dialog). Sticky bar falls back to the PDP wrapper.');

const ctxField = (f) => `
function() {
  var p = {{cjs - product_ctx}};
  return p ? p.${f} : undefined;
}`;
jsVar('cjs - product_id', ctxField('id'), CARD_FOLDER);
jsVar('cjs - product_title', ctxField('title'), CARD_FOLDER);
jsVar('cjs - product_price', ctxField('price'), CARD_FOLDER);
jsVar('cjs - product_compare_price', ctxField('compare_price'), CARD_FOLDER);
jsVar('cjs - product_type', ctxField('type'), CARD_FOLDER);
jsVar('cjs - list_name', ctxField('list'), CARD_FOLDER);
jsVar('cjs - item_index', ctxField('index'), CARD_FOLDER);

jsVar('cjs - wishlist_action', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var b = el.closest('.wishlist-hero-custom-button');
  if (!b) return undefined;
  var active = b.querySelector('.wishlisthero-product-in-wishlist, [aria-pressed="true"]');
  return active ? 'remove' : 'add';
}`, CARD_FOLDER, 'State BEFORE the click: heart already active (Wishlist Hero class wishlisthero-product-in-wishlist) = remove, else add. Verify the class in GTM Preview.');

jsVar('cjs - size_selected', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var d = el.closest('quick-add-dialog');
  if (d) return !!d.querySelector('input[type="radio"]:checked');
  return false;
}`, CARD_FOLDER, 'For quick_add_close. Inline (desktop) list: always false, picking a size adds and closes.');

jsVar('cjs - click_items', `
function() {
  var p = {{cjs - product_ctx}};
  if (!p || !p.id) return undefined;
  var item = { item_id: p.id, item_name: p.title, price: p.price, quantity: 1 };
  if (p.index) item.index = p.index;
  if (p.list) item.item_list_name = p.list;
  if (p.type) item.item_category = p.type;
  var variant = {{cjs - track_color}} || {{cjs - track_size}} || p.variant;
  if (variant) item.item_variant = variant;
  return [item];
}`, CARD_FOLDER, 'GA4 items array for click-based ecommerce events (select_item, add_to_wishlist)');

constVar('const - GA4 Measurement ID', GA4_ID, CLICK_FOLDER);

jsVar('cjs - click_text', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var t = el.closest('[data-track], a, button') || el;
  var txt = (t.innerText || t.textContent || t.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
  return txt ? txt.slice(0, 100) : undefined;
}`, CLICK_FOLDER, 'Text of the tracked element. Replaces built-in Click Text, which errors on SVG icons (bag, heart, arrows).');
jsVar('cjs - click_url', `
function() {
  var el = {{Click Element}};
  if (!el || !el.closest) return undefined;
  var a = el.closest('a[href]');
  return a ? a.href : undefined;
}`, CLICK_FOLDER, 'href of the clicked link, also when an icon inside it was clicked');
constVar('const - Meta Pixel ID', META_ID, META_FOLDER);

// ---------- triggers ----------
const triggers = [];
const triggerByName = {};
function addTrigger(t, folder) {
  const trig = { ...base, triggerId: id(), ...t, parentFolderId: folders[folder].folderId };
  triggers.push(trig);
  triggerByName[trig.name] = trig;
  return trig;
}
const cssFilter = (selector) => ({ type: 'CSS_SELECTOR', parameter: [T('arg0', '{{Click Element}}'), T('arg1', selector)] });
const eqFilter = (a, b) => ({ type: 'EQUALS', parameter: [T('arg0', a), T('arg1', b)] });

const folderFor = (ev) => (cardEvents.has(ev) ? CARD_FOLDER : CLICK_FOLDER);
const clickTriggers = {};
// <form> and <select> tags are handled by Form Submission / change-listener triggers below, so clicks skip them
for (const v of [...trackValues].sort()) {
  const sels = [`[data-track="${v}"]:not(form):not(select)`, ...(extraSelectors[v] || [])];
  const selector = sels.map((s) => `${s}, ${s} *`).join(', ');
  clickTriggers[v] = addTrigger({ name: `Click - ${v}`, type: 'CLICK', filter: [cssFilter(selector)] }, folderFor(v));
}
for (const v of appValues) {
  const a = appTriggers[v];
  const filter = [cssFilter(a.selector)];
  if (a.onlyAdd) filter.push(eqFilter('{{cjs - wishlist_action}}', 'add'));
  clickTriggers[v] = addTrigger({ name: `Click - ${v} (app)${a.onlyAdd ? ' - add only' : ''}`, type: 'CLICK', filter }, folderFor(v));
}

// Search forms submitted with Enter (no button click)
const formSearch = addTrigger({
  name: 'Form - search_submit',
  type: 'FORM_SUBMISSION',
  filter: [{ type: 'CSS_SELECTOR', parameter: [T('arg0', '{{Form Element}}'), T('arg1', 'form[data-track="search_submit"], form.predictive-search-form, form[action$="/search"]')] }],
  waitForTags: B('waitForTags', false),
  checkValidation: B('checkValidation', true),
  waitForTagsTimeout: { type: 'TEMPLATE', key: 'waitForTagsTimeout', value: '2000' },
}, CLICK_FOLDER);

// <select data-track="..."> (sort, cart qty): a click fires when the dropdown opens, so listen for change instead
const domReady = addTrigger({ name: 'DOM Ready - All Pages', type: 'DOM_READY' }, CLICK_FOLDER);
const selectChange = {};
for (const v of ['sort_change', 'cart_qty_change']) {
  selectChange[v] = addTrigger({
    name: `CE - select_change - ${v}`,
    type: 'CUSTOM_EVENT',
    customEventFilter: [eqFilter('{{_event}}', 'select_change')],
    filter: [eqFilter('{{dlv - track_event}}', v)],
  }, CLICK_FOLDER);
}
['track_event', 'track_value', 'track_label', 'track_section', 'product_id', 'product_title', 'variant_id'].forEach((k) => dlv(`dlv - ${k}`, k, CLICK_FOLDER));

const INIT_ALL_PAGES = '2147479573';

// ---------- tags ----------
const tags = [];
function addTag(t, folder) {
  const tag = { ...base, tagId: id(), tagFiringOption: 'ONCE_PER_EVENT', ...t, parentFolderId: folders[folder].folderId };
  tags.push(tag);
  return tag;
}

addTag({
  name: 'GA4 - Google tag',
  type: 'googtag',
  parameter: [
    T('tagId', '{{const - GA4 Measurement ID}}'),
    // The Google & YouTube app already sends page_view
    paramTable('configSettingsTable', [['send_page_view', 'false']]),
  ],
  firingTriggerId: [INIT_ALL_PAGES],
}, CLICK_FOLDER);

const clickParams = [
  ['event_label', '{{cjs - track_label}}'],
  ['track_section', '{{cjs - track_section}}'],
  ['source', '{{cjs - track_source}}'],
  ['size', '{{cjs - track_size}}'],
  ['available', '{{cjs - track_available}}'],
  ['color', '{{cjs - track_color}}'],
  ['position', '{{cjs - track_position}}'],
  ['product_id', '{{cjs - product_id}}'],
  ['product_title', '{{cjs - product_title}}'],
  ['product_price', '{{cjs - product_price}}'],
  ['list_name', '{{cjs - list_name}}'],
  ['item_index', '{{cjs - item_index}}'],
  ['link_text', '{{cjs - click_text}}'],
  ['link_url', '{{cjs - click_url}}'],
];
const extraClickParams = {
  quick_add_close: [['size_selected', '{{cjs - size_selected}}']],
  menu_click: [['menu_level', '{{cjs - track_level}}']],
  filter_apply: [['filter_name', '{{cjs - track_filter}}'], ['filter_value', '{{cjs - track_value}}']],
  coupon_apply: [['coupon', '{{cjs - track_coupon}}']],
  coupon_remove: [['coupon', '{{cjs - track_coupon}}']],
  cart_qty_change: [['quantity', '{{cjs - track_quantity}}'], ['variant_id', '{{cjs - track_variant_id}}']],
  cart_remove: [['variant_id', '{{cjs - track_variant_id}}']],
};
const ga4Event = (name, eventName, params, triggerIds, folder, extra = {}) => addTag({
  name,
  type: 'gaawe',
  parameter: [
    B('sendEcommerceData', false),
    T('eventName', eventName),
    T('measurementIdOverride', '{{const - GA4 Measurement ID}}'),
    paramTable('eventSettingsTable', params),
  ],
  firingTriggerId: triggerIds,
  ...extra,
}, folder);

for (const v of Object.keys(clickTriggers).sort()) {
  const evName = ga4Rename[v] || v;
  let params;
  if (v === 'select_item') {
    params = [['items', '{{cjs - click_items}}'], ['item_list_name', '{{cjs - list_name}}'], ['event_label', '{{cjs - track_label}}']];
  } else if (v === 'add_to_wishlist') {
    params = [['items', '{{cjs - click_items}}'], ['currency', 'INR'], ['value', '{{cjs - product_price}}']];
  } else if (v === 'share_click') {
    params = [['method', 'share_button'], ['content_type', 'product'], ['item_id', '{{cjs - product_id}}'], ['event_label', '{{cjs - track_label}}']];
  } else if (v === 'newsletter_signup') {
    params = [['method', 'newsletter'], ['event_label', '{{cjs - track_label}}'], ['track_section', '{{cjs - track_section}}']];
  } else {
    params = [...clickParams, ...(extraClickParams[v] || [])];
  }
  ga4Event(`GA4 - ${evName}${evName !== v ? ` (${v})` : ''}`, evName, params, [clickTriggers[v].triggerId], folderFor(v));
}

ga4Event('GA4 - search_submit (form)', 'search_submit', [['event_label', 'form_submit'], ['search_term', '{{cjs - form_search_term}}']], [formSearch.triggerId], CLICK_FOLDER);
jsVar('cjs - form_search_term', `
function() {
  var f = {{Form Element}};
  var q = f && f.querySelector && f.querySelector('input[name="q"]');
  return q ? q.value : undefined;
}`, CLICK_FOLDER);

addTag({
  name: 'Listener - select change',
  type: 'html',
  parameter: [T('html', `<script>
(function () {
  if (window.__tsSelectListener) return;
  window.__tsSelectListener = true;
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches('select[data-track]')) return;
    var opt = el.options[el.selectedIndex];
    var line = el.closest('[data-track-product-id]');
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'select_change',
      track_event: el.getAttribute('data-track'),
      track_value: el.value,
      track_label: (opt && (opt.getAttribute('data-track-label') || opt.text)) || el.getAttribute('data-track-label') || undefined,
      track_section: el.getAttribute('data-track-section') || undefined,
      product_id: line ? line.getAttribute('data-track-product-id') : undefined,
      product_title: line ? line.getAttribute('data-track-product-title') : undefined,
      variant_id: line ? line.getAttribute('data-track-variant-id') : undefined
    });
  }, true);
})();
</script>`), B('supportDocumentWrite', false)],
  firingTriggerId: [domReady.triggerId],
}, CLICK_FOLDER);
for (const [v, trig] of Object.entries(selectChange)) {
  ga4Event(`GA4 - ${v} (select)`, v, [
    ['event_label', '{{dlv - track_label}}'], ['value_selected', '{{dlv - track_value}}'], ['track_section', '{{dlv - track_section}}'],
    ['product_id', '{{dlv - product_id}}'], ['product_title', '{{dlv - product_title}}'], ['variant_id', '{{dlv - variant_id}}'],
  ], [trig.triggerId], v === 'cart_qty_change' ? CLICK_FOLDER : CLICK_FOLDER);
}

// ---------- Meta ----------
const metaBase = addTag({
  name: 'Meta - Base code (no PageView)',
  type: 'html',
  parameter: [T('html', `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
if (!window.__tsMetaInit) {
  fbq('init', {{const - Meta Pixel ID}});
  window.__tsMetaInit = true;
  // No PageView: the Facebook & Instagram app already sends it
}
</script>`), B('supportDocumentWrite', false)],
  firingTriggerId: [INIT_ALL_PAGES],
}, META_FOLDER);

const metaTag = (name, js, triggerIds) => addTag({
  name,
  type: 'html',
  parameter: [T('html', `<script>\n${js}\n</script>`), B('supportDocumentWrite', false)],
  firingTriggerId: triggerIds,
  setupTag: [{ tagName: metaBase.name, stopOnSetupFailure: true }],
}, META_FOLDER);

if (clickTriggers.add_to_wishlist) {
  metaTag('Meta - AddToWishlist', `fbq('track', 'AddToWishlist', {
  content_ids: [{{cjs - product_id}}],
  content_name: {{cjs - product_title}},
  content_type: 'product',
  value: {{cjs - product_price}},
  currency: 'INR'
});`, [clickTriggers.add_to_wishlist.triggerId]);
}
if (clickTriggers.newsletter_signup) {
  metaTag('Meta - Lead (newsletter)', `fbq('track', 'Lead', { content_name: 'newsletter' });`, [clickTriggers.newsletter_signup.triggerId]);
}
const contactTriggers = ['whatsapp_click', 'contact_click'].filter((v) => clickTriggers[v]).map((v) => clickTriggers[v].triggerId);
if (contactTriggers.length) {
  metaTag('Meta - Contact', `fbq('track', 'Contact', { content_name: {{cjs - track_event}} });`, contactTriggers);
}

// ---------- built-in variables ----------
const builtIns = [
  ['CLICK_ELEMENT', 'Click Element'], ['CLICK_CLASSES', 'Click Classes'], ['CLICK_ID', 'Click ID'],
  ['CLICK_URL', 'Click URL'], ['PAGE_PATH', 'Page Path'], ['PAGE_URL', 'Page URL'], ['PAGE_HOSTNAME', 'Page Hostname'], ['REFERRER', 'Referrer'], ['EVENT', 'Event'], ['FORM_ELEMENT', 'Form Element'],
].map(([type, name]) => ({ ...base, type, name }));

const container = {
  exportFormatVersion: 2,
  exportTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
  containerVersion: {
    path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
    ...base,
    containerVersionId: '0',
    container: {
      path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
      ...base,
      name: 'thomasscott.in',
      publicId: PUBLIC_ID,
      usageContext: ['WEB'],
    },
    tag: tags,
    trigger: triggers,
    variable: variables,
    folder: Object.values(folders),
    builtInVariable: builtIns,
  },
};

// ---------- validation ----------
const problems = [];
const trigIds = new Set([...triggers.map((t) => t.triggerId), INIT_ALL_PAGES]);
const builtInNames = new Set([...builtIns.map((b) => b.name), '_event']);
const tagNames = new Set(tags.map((t) => t.name));
for (const t of tags) {
  for (const f of t.firingTriggerId) if (!trigIds.has(f)) problems.push(`tag ${t.name}: missing trigger ${f}`);
  for (const s of t.setupTag || []) if (!tagNames.has(s.tagName)) problems.push(`tag ${t.name}: missing setup tag ${s.tagName}`);
}
const json = JSON.stringify(container, null, 2);
for (const m of json.matchAll(/\{\{([^}]+)\}\}/g)) {
  const n = m[1];
  if (!varNames.has(n) && !builtInNames.has(n)) problems.push(`unknown variable {{${n}}}`);
}
JSON.parse(json);
if (problems.length) { console.error([...new Set(problems)].join('\n')); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'gtm_container_import.json'), json);
console.log(`container: ${tags.length} tags, ${triggers.length} triggers, ${variables.length} variables`);

// ---------- Excel ----------
(async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = (name, columns, data, highlight) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c, key: c }));
    data.forEach((d) => {
      const r = ws.addRow(d);
      if (highlight && highlight(d)) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      r.alignment = { vertical: 'top', wrapText: false };
    });
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    ws.columns.forEach((col) => {
      let max = col.header.length;
      col.eachCell({ includeEmpty: false }, (cell) => { max = Math.max(max, String(cell.value ?? '').length); });
      col.width = Math.min(Math.max(max + 2, 8), 70);
    });
    return ws;
  };

  const pr = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...rows].sort((a, b) => (pr[a.priority] ?? 3) - (pr[b.priority] ?? 3) || String(a.page).localeCompare(String(b.page)));
  const triggerFor = (r) => {
    const v = r.data_track;
    const sel = String(r.selector || '');
    if (selectChange[v] && /select/.test(sel)) return selectChange[v].name;
    if (v === 'search_submit' && /form|Form/.test(`${r.trigger_type} ${r.element}`)) return formSearch.name;
    if (clickTriggers[v]) return clickTriggers[v].name;
    return '';
  };
  sheet('Tracking Plan',
    ['ID', 'Page/Template', 'Section', 'Element (button text)', 'File path', 'Line no.', 'Selector / data-track value', 'Event name', 'Trigger type', 'GTM trigger', 'Parameters captured', 'GA4 event', 'Meta event', 'Priority (High/Med/Low)', 'Status', 'Notes'],
    sorted.map((r, i) => ({
      'ID': i + 1,
      'Page/Template': r.page,
      'Section': r.section,
      'Element (button text)': r.element,
      'File path': r.file,
      'Line no.': r.line,
      'Selector / data-track value': r.selector || (r.data_track ? `[data-track="${r.data_track}"]` : ''),
      'Event name': r.data_track,
      'Trigger type': r.trigger_type,
      'GTM trigger': triggerFor(r),
      'Parameters captured': r.params,
      'GA4 event': r.ga4_event,
      'Meta event': r.meta_event,
      'Priority (High/Med/Low)': r.priority,
      'Status': r.status,
      'Notes': r.notes,
    })),
    (d) => d['Priority (High/Med/Low)'] === 'High');

  const describeFilter = (t) => {
    const parts = [];
    if (t.type === 'CUSTOM_EVENT') parts.push(`Event equals ${t.customEventFilter[0].parameter[1].value}`);
    if (t.type === 'DOM_READY') parts.push('All pages');
    for (const f of t.filter || []) {
      parts.push(f.type === 'CSS_SELECTOR'
        ? `${f.parameter[0].value} matches CSS selector: ${f.parameter[1].value}`
        : `${f.parameter[0].value} equals ${f.parameter[1].value}`);
    }
    return parts.join(' AND ');
  };
  const triggerTypeName = { CLICK: 'Click - All Elements', CUSTOM_EVENT: 'Custom Event', FORM_SUBMISSION: 'Form Submission', DOM_READY: 'DOM Ready' };
  const folderName = (fid) => Object.values(folders).find((f) => f.folderId === fid)?.name || '';
  sheet('Triggers', ['Trigger name', 'Type', 'Condition', 'Folder'],
    triggers.map((t) => ({ 'Trigger name': t.name, 'Type': triggerTypeName[t.type], 'Condition': describeFilter(t), 'Folder': folderName(t.parentFolderId) })));

  const trigName = (tid) => (tid === INIT_ALL_PAGES ? 'Initialization - All Pages' : triggers.find((t) => t.triggerId === tid)?.name);
  sheet('Tags', ['Tag name', 'Type', 'Event name', 'Trigger', 'Parameters', 'Folder'],
    tags.map((t) => {
      const p = Object.fromEntries(t.parameter.map((x) => [x.key, x]));
      const table = p.eventSettingsTable || p.configSettingsTable;
      return {
        'Tag name': t.name,
        'Type': { googtag: 'Google tag', gaawe: 'GA4 Event', html: 'Custom HTML' }[t.type],
        'Event name': p.eventName?.value || (t.type === 'html' ? (t.name.match(/Meta - (\w+)/) || [])[1] : 'config'),
        'Trigger': t.firingTriggerId.map(trigName).join(', '),
        'Parameters': table ? table.list.map((m) => `${m.map[0].value}=${m.map[1].value}`).join('; ') : (t.setupTag ? `setup tag: ${t.setupTag[0].tagName}` : ''),
        'Folder': folderName(t.parentFolderId),
      };
    }));

  sheet('Variables', ['Variable name', 'Type', 'Value / Path'], [
    ...builtIns.map((b) => ({ 'Variable name': b.name, 'Type': 'Built-in', 'Value / Path': b.type })),
    ...variables.map((v) => ({
      'Variable name': v.name,
      'Type': { jsm: 'Custom JavaScript', v: 'Data Layer Variable', c: 'Constant' }[v.type],
      'Value / Path': v.type === 'jsm' ? (v.notes || v.parameter[0].value.replace(/\s+/g, ' ').slice(0, 160)) : v.parameter.find((x) => x.key === 'name' || x.key === 'value').value,
    })),
  ]);

  sheet('Skipped', ['Element', 'File', 'Reason'], skipped.map((s) => ({ 'Element': s.element, 'File': s.file, 'Reason': s.reason })));

  const checklist = [
    ['Open GTM Preview on the theme preview URL, collection page, mobile width and desktop width', 'Container loaded'],
    ['Click a colour swatch on a product card', 'grid_color_select (color, position, product_id)'],
    ['Click the wishlist heart on a card (not yet wishlisted)', 'add_to_wishlist (GA4) + Meta AddToWishlist; clicking again (remove) fires nothing'],
    ['Click the bag icon on a card', 'quick_add_open'],
    ['Desktop: click an in-stock size in the inline list', 'size_select (source=quick_add_inline) AND quick_add_to_bag_click'],
    ['Mobile: click a size in the quick-add modal', 'size_select (source=quick_add, available true/false)'],
    ['Mobile: click Size Guide in the modal', 'size_guide_click (source=quick_add)'],
    ['Mobile: click ADD TO BAG in the modal', 'quick_add_to_bag_click'],
    ['Mobile: open the modal again, click BUY NOW', 'quick_buy_now_click'],
    ['Open the modal and close it with X', 'quick_add_close (size_selected true/false)'],
    ['Product page: pick size, Size Guide, Add to Bag, Buy Now', 'pdp_size_select, size_guide_click (source=product_page), pdp_add_to_bag_click, pdp_buy_now_click'],
    ['Open cart drawer, change qty, remove, apply coupon, Checkout', 'cart_qty_change, cart_remove, coupon_apply, cart_checkout_click'],
    ['Confirm no double counting', 'GTM fires NO page_view, PageView, add_to_cart, begin_checkout or purchase (the Google and Facebook apps send those)'],
    ['Check GA4 DebugView', 'Click events arrive once with the parameters above; page_view once per page (from the Google app)'],
  ];
  sheet('Test Checklist', ['Step', 'Action', 'Expected event(s)', 'Pass/Fail'],
    checklist.map(([a, e], i) => ({ 'Step': i + 1, 'Action': a, 'Expected event(s)': e, 'Pass/Fail': '' })));

  await wb.xlsx.writeFile(path.join(OUT, 'gtm_tracking_plan.xlsx'));
  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log('rows', rows.length, JSON.stringify(counts), 'skipped', skipped.length);
})();
