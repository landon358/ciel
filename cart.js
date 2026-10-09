/* Ciel bag: a Shopify Storefront cart that persists across pages (cart id in localStorage).
   Adds a "Bag (n)" link to the header nav and a slide-in drawer on every page.
   Product pages call window.CielCart.add(variantId) from shop.js. Checkout = the cart's Shopify checkoutUrl. */
(function () {
  var API = 'https://6n0zf6-2z.myshopify.com/api/2025-07/graphql.json';
  var TOKEN = '9e6e50b006ca52f39041196f55c47b0d';
  var KEY = 'ciel_cart';
  var CART = 'id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } } ' +
    'lines(first: 50) { nodes { id quantity cost { totalAmount { amount } } ' +
    'merchandise { ... on ProductVariant { id availableForSale price { amount } image { url altText } product { title handle featuredImage { url altText } } } } } }';

  function gql(query, variables) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data;
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(a) {
    var n = Number(a);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function store(id) { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch (e) {} }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  var cart = null, busy = false, lastFocus = null;

  /* ---------- UI ---------- */
  var nav = document.querySelector('.header .nav');
  var tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tab bag_tab';
  tab.setAttribute('aria-haspopup', 'dialog');
  tab.setAttribute('aria-controls', 'bag');
  tab.innerHTML = 'Bag <span class="bag_count" data-bag-count>0</span>';
  if (nav) nav.appendChild(tab);

  var root = document.createElement('div');
  root.className = 'bag_root';
  root.innerHTML =
    '<div class="bag_scrim" data-bag-close></div>' +
    '<aside class="bag" id="bag" role="dialog" aria-modal="true" aria-labelledby="bag_title" tabindex="-1">' +
      '<div class="bag_head"><h2 id="bag_title">Bag</h2><button type="button" class="bag_close" data-bag-close aria-label="Close bag">&times;</button></div>' +
      '<div class="bag_body" data-bag-lines></div>' +
      '<p class="bag_msg" data-bag-msg role="status" aria-live="polite"></p>' +
      '<div class="bag_foot" data-bag-foot hidden>' +
        '<div class="bag_total"><span>Subtotal</span><span data-bag-subtotal></span></div>' +
        '<p class="bag_fine">Shipping and taxes are calculated at checkout.</p>' +
        '<a class="bag_checkout" data-bag-checkout href="#">Checkout <span aria-hidden="true">&rarr;</span></a>' +
      '</div>' +
    '</aside>';
  root.hidden = true;
  document.body.appendChild(root);

  var drawer = root.querySelector('.bag'), linesEl = root.querySelector('[data-bag-lines]');
  var foot = root.querySelector('[data-bag-foot]'), msg = root.querySelector('[data-bag-msg]');

  function open() {
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('bag_open');
    requestAnimationFrame(function () { root.classList.add('is_open'); drawer.focus(); });
  }
  function close() {
    root.classList.remove('is_open');
    document.documentElement.classList.remove('bag_open');
    setTimeout(function () { if (!root.classList.contains('is_open')) root.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  tab.addEventListener('click', open);
  root.addEventListener('click', function (e) { if (e.target.closest('[data-bag-close]')) close(); });
  document.addEventListener('keydown', function (e) {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {   // keep focus inside the drawer
      var f = drawer.querySelectorAll('button:not([disabled]), a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function render() {
    var n = cart ? cart.totalQuantity : 0;
    tab.querySelector('[data-bag-count]').textContent = n;
    tab.setAttribute('aria-label', 'Bag, ' + n + (n === 1 ? ' item' : ' items'));
    var lines = cart ? cart.lines.nodes.filter(function (l) { return l.merchandise && l.merchandise.product; }) : [];
    if (!lines.length) {
      linesEl.innerHTML = '<div class="bag_empty"><p>Your bag is empty.</p><a href="/products">See the products <span aria-hidden="true">&rarr;</span></a></div>';
      foot.hidden = true;
      return;
    }
    linesEl.innerHTML = '<ul class="bag_lines">' + lines.map(function (l) {
      var m = l.merchandise, p = m.product, img = m.image || p.featuredImage;
      return '<li class="bag_line" data-line="' + esc(l.id) + '">' +
        '<a class="bag_thumb" href="/products/' + esc(p.handle) + '">' + (img ? '<img src="' + esc(img.url + (img.url.indexOf('?') > -1 ? '&' : '?') + 'width=200') + '" alt="">' : '') + '</a>' +
        '<div class="bag_info"><a class="bag_name" href="/products/' + esc(p.handle) + '">' + esc(p.title) + '</a>' +
          '<span class="bag_unit">' + money(m.price.amount) + '</span>' +
          '<div class="bag_qty"><button type="button" data-qty="-1" aria-label="Decrease quantity of ' + esc(p.title) + '">&minus;</button>' +
          '<span aria-label="Quantity">' + l.quantity + '</span>' +
          '<button type="button" data-qty="1" aria-label="Increase quantity of ' + esc(p.title) + '">+</button>' +
          '<button type="button" class="bag_remove" data-remove aria-label="Remove ' + esc(p.title) + ' from bag">Remove</button></div></div>' +
        '<span class="bag_line_total">' + money(l.cost.totalAmount.amount) + '</span></li>';
    }).join('') + '</ul>';
    root.querySelector('[data-bag-subtotal]').textContent = money(cart.cost.subtotalAmount.amount);
    root.querySelector('[data-bag-checkout]').href = window.cielCheckoutUrl ? window.cielCheckoutUrl(cart.checkoutUrl) : cart.checkoutUrl;
    foot.hidden = false;
  }

  function setBusy(b) {
    busy = b;
    drawer.classList.toggle('is_busy', b);
    drawer.querySelectorAll('.bag_qty button').forEach(function (x) { x.disabled = b; });
  }
  function fail(e) {
    msg.textContent = 'Something went wrong updating your bag. Please try again.';
    if (window.console) console.warn('Bag:', e && e.message);
  }

  /* ---------- Cart operations ---------- */
  function load() {
    var id = stored();
    if (!id) { render(); return Promise.resolve(null); }
    return gql('query($id: ID!) { cart(id: $id) { ' + CART + ' } }', { id: id })
      .then(function (d) {
        cart = d.cart;
        if (!cart) store(null);          // expired or already checked out
        render();
        return cart;
      })
      .catch(function (e) { render(); fail(e); });
  }
  function apply(c, errs) {
    if (errs && errs.length) throw new Error(errs[0].message);
    cart = c; store(c && c.id); msg.textContent = ''; render(); return c;
  }
  function add(variantId, qty) {
    qty = qty || 1;
    var lines = [{ merchandiseId: variantId, quantity: qty }];
    var run = function () {
      if (cart && cart.id) {
        return gql('mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ' + CART + ' } userErrors { message } } }', { id: cart.id, lines: lines })
          .then(function (d) {
            if (!d.cartLinesAdd.cart) { cart = null; store(null); return run(); }   // cart vanished: start a new one
            return apply(d.cartLinesAdd.cart, d.cartLinesAdd.userErrors);
          });
      }
      return gql('mutation($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { ' + CART + ' } userErrors { message } } }', { lines: lines })
        .then(function (d) { return apply(d.cartCreate.cart, d.cartCreate.userErrors); });
    };
    setBusy(true);
    return ready.then(run).then(function (c) { setBusy(false); open(); return c; }, function (e) { setBusy(false); fail(e); open(); throw e; });
  }
  function update(lineId, quantity) {
    if (busy || !cart) return;
    setBusy(true);
    var q = quantity > 0
      ? gql('mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ' + CART + ' } userErrors { message } } }', { id: cart.id, lines: [{ id: lineId, quantity: quantity }] })
        .then(function (d) { return apply(d.cartLinesUpdate.cart, d.cartLinesUpdate.userErrors); })
      : gql('mutation($id: ID!, $ids: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $ids) { cart { ' + CART + ' } userErrors { message } } }', { id: cart.id, ids: [lineId] })
        .then(function (d) { return apply(d.cartLinesRemove.cart, d.cartLinesRemove.userErrors); });
    q.then(function () { setBusy(false); }, function (e) { setBusy(false); fail(e); });
  }
  linesEl.addEventListener('click', function (e) {
    var li = e.target.closest('[data-line]');
    if (!li || !cart) return;
    var line = cart.lines.nodes.filter(function (l) { return l.id === li.dataset.line; })[0];
    if (!line) return;
    var step = e.target.closest('[data-qty]');
    if (step) update(line.id, line.quantity + Number(step.dataset.qty));
    if (e.target.closest('[data-remove]')) update(line.id, 0);
  });

  /* Coming back from checkout (back button / bfcache): refresh so a completed order clears the bag */
  window.addEventListener('pageshow', function (e) { if (e.persisted) load(); });

  var ready = load();
  window.CielCart = { add: add, open: open, reload: load };
})();
