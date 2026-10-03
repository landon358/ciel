/* Ciel bag: Shopify Storefront API cart with hosted checkout */
(function () {
  var SHOP = 'https://6n0zf6-2z.myshopify.com/api/2025-07/graphql.json';
  var TOKEN = '9e6e50b006ca52f39041196f55c47b0d';
  var KEY = 'ciel_cart_id';

  var CART_FIELDS = 'id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } } ' +
    'lines(first: 50) { nodes { id quantity merchandise { ... on ProductVariant { id product { title } image { url altText } price { amount } } } } }';

  function gql(query, variables) {
    return fetch(SHOP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data;
    });
  }

  function getId() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setId(id) { try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch (e) {} }

  function money(a) {
    var n = Number(a);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  var cart = null;

  function fetchCart() {
    var id = getId();
    if (!id) return Promise.resolve(null);
    return gql('query($id: ID!) { cart(id: $id) { ' + CART_FIELDS + ' } }', { id: id }).then(function (d) {
      if (!d.cart) setId(null);
      return d.cart;
    });
  }

  function addLine(variantId) {
    var id = getId();
    var lines = [{ merchandiseId: variantId, quantity: 1 }];
    var p = id
      ? gql('mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ' + CART_FIELDS + ' } userErrors { message } warnings { code } } }', { id: id, lines: lines })
          .then(function (d) { return d.cartLinesAdd; })
      : gql('mutation($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { ' + CART_FIELDS + ' } userErrors { message } warnings { code } } }', { lines: lines })
          .then(function (d) { return d.cartCreate; });
    return p.then(function (res) {
      if (res.userErrors && res.userErrors.length) throw new Error(res.userErrors[0].message);
      if (!res.cart) { setId(null); throw new Error('Cart unavailable'); }
      setId(res.cart.id);
      var added = res.cart.lines.nodes.some(function (l) { return l.merchandise.id === variantId && l.quantity > 0; });
      if (!added) { var err = new Error('unavailable'); err.cart = res.cart; throw err; }
      return res.cart;
    });
  }

  function updateLine(lineId, quantity) {
    return gql('mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ' + CART_FIELDS + ' } userErrors { message } } }',
      { id: getId(), lines: [{ id: lineId, quantity: quantity }] })
      .then(function (d) { return d.cartLinesUpdate.cart; });
  }

  /* Drawer */
  var drawer = document.createElement('div');
  drawer.className = 'bag_drawer';
  drawer.hidden = true;
  drawer.innerHTML =
    '<div class="bag_scrim" data-close></div>' +
    '<aside class="bag_panel" role="dialog" aria-modal="true" aria-labelledby="bag_title">' +
      '<div class="bag_head"><h2 id="bag_title">Your bag</h2><button type="button" class="bag_close" data-close aria-label="Close bag">Close</button></div>' +
      '<div class="bag_lines"></div>' +
      '<div class="bag_foot">' +
        '<div class="bag_total"><span>Subtotal</span><span class="bag_sub"></span></div>' +
        '<p class="bag_fine">Shipping and taxes are calculated at checkout.</p>' +
        '<a class="pill solid bag_checkout" href="#">Checkout</a>' +
      '</div>' +
    '</aside>';
  document.body.appendChild(drawer);
  var linesEl = drawer.querySelector('.bag_lines');
  var footEl = drawer.querySelector('.bag_foot');
  var lastFocus = null;

  function render() {
    var count = cart ? cart.totalQuantity : 0;
    document.querySelectorAll('.bag').forEach(function (b) {
      var c = b.querySelector('.bag_count');
      if (!c) { c = document.createElement('span'); c.className = 'bag_count'; b.appendChild(c); }
      var prev = Number(c.textContent) || 0;
      c.textContent = count || '';
      if (prev && count && prev !== count && c.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        c.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }
      c.hidden = !count;
      b.setAttribute('aria-label', count ? 'Shopping bag, ' + count + (count === 1 ? ' item' : ' items') : 'Shopping bag');
    });
    var lines = cart ? cart.lines.nodes.filter(function (l) { return l.quantity > 0; }) : [];
    if (!lines.length) {
      linesEl.innerHTML = '<p class="bag_empty">Your bag is empty.</p><a class="bag_browse" href="/shop">Browse the shop</a>';
      footEl.hidden = true;
      return;
    }
    footEl.hidden = false;
    linesEl.innerHTML = lines.map(function (l) {
      var m = l.merchandise;
      var img = m.image ? '<img src="' + m.image.url + (m.image.url.indexOf('?') > -1 ? '&' : '?') + 'width=160" alt="">' : '<span></span>';
      return '<div class="bag_line">' + img +
        '<div class="bag_info"><span class="bag_name">' + m.product.title + '</span>' +
        '<span class="bag_price">' + money(m.price.amount) + '</span>' +
        '<div class="bag_qty">' +
          '<button type="button" data-line="' + l.id + '" data-q="' + (l.quantity - 1) + '" aria-label="Decrease quantity">&minus;</button>' +
          '<span aria-live="polite">' + l.quantity + '</span>' +
          '<button type="button" data-line="' + l.id + '" data-q="' + (l.quantity + 1) + '" aria-label="Increase quantity">+</button>' +
          '<button type="button" class="bag_remove" data-line="' + l.id + '" data-q="0">Remove</button>' +
        '</div></div></div>';
    }).join('');
    drawer.querySelector('.bag_sub').textContent = money(cart.cost.subtotalAmount.amount);
    drawer.querySelector('.bag_checkout').href = cart.checkoutUrl;
  }

  var panel = drawer.querySelector('.bag_panel');
  var hideTimer = null;
  function hideIfClosed() {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (!drawer.classList.contains('open')) drawer.hidden = true;
  }
  panel.addEventListener('transitionend', function (e) {
    if (e.target === panel && e.propertyName === 'transform') hideIfClosed();
  });

  function open() {
    clearTimeout(hideTimer);
    hideTimer = null;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('open'); });
    document.documentElement.classList.add('bag_lock');
    drawer.querySelector('.bag_close').focus();
  }
  function close() {
    drawer.classList.remove('open');
    document.documentElement.classList.remove('bag_lock');
    /* Hidden on transitionend; the timer is a fallback (e.g. reduced motion, no transition) */
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideIfClosed, 400);
    if (lastFocus) lastFocus.focus();
  }

  drawer.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { close(); return; }
    var b = e.target.closest('[data-line]');
    if (!b) return;
    b.disabled = true;
    updateLine(b.dataset.line, Number(b.dataset.q)).then(function (c) { cart = c; render(); })
      .catch(function () { b.disabled = false; });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) close(); });

  document.querySelectorAll('.bag').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); render(); open(); });
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-variant]');
    if (!btn || btn.disabled) return;
    var note = document.getElementById('note');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Adding';
    addLine(btn.dataset.variant).then(function (c) {
      cart = c; render();
      if (note) note.textContent = 'Added to bag.';
      open();
    }).catch(function (err) {
      if (err.cart) { cart = err.cart; render(); }
      if (note) note.textContent = err.message === 'unavailable'
        ? 'Sorry, this piece can\u2019t be ordered online just yet. Please check back soon.'
        : 'Something went wrong. Please try again.';
    }).then(function () { btn.disabled = false; btn.textContent = label; });
  });

  fetchCart().then(function (c) { cart = c; render(); }).catch(function () { render(); });
})();
