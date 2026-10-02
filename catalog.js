/* Ciel catalog: products load live from Shopify (Storefront API).
   Shopify conventions:
   - tag "ciel-studio" = our own design, "curated" = the edit. Only these appear on the site.
   - tag "featured" = shown in the home page collection.
   - shop page order = the "Shop" collection (manual sort) in Shopify admin.
   - tag "line:Made in Ghana" = the small line under the card.
   - description: first paragraph is the intro; each <h4> starts a notes section. */
(function () {
  var SHOP = 'https://6n0zf6-2z.myshopify.com/api/2025-07/graphql.json';
  var TOKEN = '9e6e50b006ca52f39041196f55c47b0d';
  var CUSTOM_PAGES = { 'onde-clock': 'product.html' };

  var FIELDS = 'handle title tags availableForSale descriptionHtml ' +
    'priceRange { minVariantPrice { amount } } ' +
    'featuredImage { url altText } ' +
    'images(first: 10) { nodes { url altText } } ' +
    'variants(first: 1) { nodes { id availableForSale } }';

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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(a) {
    var n = Number(a);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function sized(url, w) { return url + (url.indexOf('?') > -1 ? '&' : '?') + 'width=' + w; }
  function has(p, tag) { return p.tags.indexOf(tag) > -1; }
  function line(p) {
    if (!p.availableForSale) return 'Sold out';
    for (var i = 0; i < p.tags.length; i++) if (p.tags[i].indexOf('line:') === 0) return p.tags[i].slice(5);
    return '';
  }
  function href(p) { return CUSTOM_PAGES[p.handle] || 'item.html?h=' + encodeURIComponent(p.handle); }

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Images fade in once decoded instead of drawing in over the placeholder */
  function fadeImages(root) {
    root.querySelectorAll('img.fade:not(.loaded)').forEach(function (img) {
      function done() { img.classList.add('loaded'); }
      if (img.complete && img.naturalWidth) done();
      else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
    });
  }

  function card(p, lazy, i) {
    var img = p.featuredImage
      ? '<img class="fade" src="' + esc(sized(p.featuredImage.url, 900)) + '" alt="' + esc(p.featuredImage.altText || p.title) + '"' + (lazy ? ' loading="lazy"' : '') + '>'
      : '<span class="slot">Image to come</span>';
    var sub = line(p);
    return '<a class="card enter" style="--i:' + Math.min(i || 0, 8) + '" href="' + esc(href(p)) + '">' +
      '<div class="img">' + img + '</div>' +
      '<div class="row"><span class="name">' + esc(p.title) + '</span><span class="price">' + money(p.priceRange.minVariantPrice.amount) + '</span></div>' +
      (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') +
      '</a>';
  }

  function skeleton(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div class="card is_loading" aria-hidden="true"><div class="img"></div><div class="row"><span class="name">&nbsp;</span></div></div>';
    return s;
  }

  /* Grids: <div data-catalog="shop|featured"> */
  document.querySelectorAll('[data-catalog]').forEach(function (grid) {
    var featured = grid.dataset.catalog === 'featured';
    grid.innerHTML = skeleton(featured ? 4 : 6);
    grid.setAttribute('aria-busy', 'true');
    var q = featured ? 'tag:featured' : 'tag:ciel-studio OR tag:curated';
    var byTag = 'products(first: 50, sortKey: CREATED_AT, query: $q) { nodes { ' + FIELDS + ' } }';
    /* Shop order comes from the "Shop" collection's manual sort in Shopify admin */
    var query = featured
      ? 'query($q: String!) { ' + byTag + ' }'
      : 'query($q: String!) { collection(handle: "shop") { products(first: 50, sortKey: COLLECTION_DEFAULT) { nodes { ' + FIELDS + ' } } } ' + byTag + ' }';
    gql(query, { q: q })
      .then(function (d) {
        var nodes = d.collection && d.collection.products.nodes.length ? d.collection.products.nodes : d.products.nodes;
        var list = nodes.filter(function (p) { return has(p, 'ciel-studio') || has(p, 'curated'); });
        if (featured) list = list.slice(0, 4);
        grid.innerHTML = list.length ? list.map(function (p, i) { return card(p, i > 2, i); }).join('') : '<p class="grid_note">New pieces are on their way.</p>';
        fadeImages(grid);
      })
      .catch(function () {
        grid.innerHTML = '<p class="grid_note">The collection could not be loaded. Please refresh the page.</p>';
      })
      .then(function () { grid.removeAttribute('aria-busy'); });
  });

  /* Product page: item.html?h=handle */
  var item = document.getElementById('item');
  if (!item) return;
  var handle = new URLSearchParams(location.search).get('h');

  function notFound() {
    item.innerHTML = '<div class="item_missing"><h1 class="title">Not found</h1><p>This piece is no longer available.</p><a class="pill main" href="shop.html">Back to the shop</a></div>';
    item.classList.remove('product');
  }
  if (!handle) { notFound(); return; }

  gql('query($h: String!) { product(handle: $h) { ' + FIELDS + ' } }', { h: handle }).then(function (d) {
    var p = d.product;
    if (!p) { notFound(); return; }
    document.title = 'Ciel ' + p.title;
    var studio = has(p, 'ciel-studio');

    /* Split description into intro + notes */
    var tmp = document.createElement('div');
    tmp.innerHTML = p.descriptionHtml || '';
    var intro = '', notes = [], cur = null;
    Array.prototype.forEach.call(tmp.children, function (el) {
      if (/^H[1-6]$/.test(el.tagName)) { cur = { h: el.textContent, body: '' }; notes.push(cur); }
      else if (cur) cur.body += el.innerHTML;
      else intro += (intro ? '<br>' : '') + el.innerHTML;
    });

    notes = notes.filter(function (n) { return n.h.trim().toLowerCase() !== 'shipping'; });
    notes.push({ h: 'Shipping', body: studio
      ? 'Built to order in our studio, so allow longer than our usual 2 to 4 weeks. We will confirm an estimated ship date when you order.'
      : 'Ships in 2 to 4 weeks.' });

    var imgs = p.images.nodes;
    var gallery = imgs.length
      ? '<div class="main tall"><img id="mainImg" class="fade" src="' + esc(sized(imgs[0].url, 1400)) + '" alt="' + esc(imgs[0].altText || p.title) + '"></div>' +
        (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (im, i) {
          return '<button type="button" aria-pressed="' + (i === 0) + '" data-src="' + esc(sized(im.url, 1400)) + '" data-alt="' + esc(im.altText || p.title) + '" aria-label="View image ' + (i + 1) + '"><img src="' + esc(sized(im.url, 200)) + '" alt=""></button>';
        }).join('') + '</div>' : '')
      : '<div class="main tall placeholder"><span class="slot">Image to come</span></div>';

    /* Preorder mode: every piece takes preorders, no payment (see preorder.js) */
    var action = '<button type="button" class="pill solid" data-preorder="' + esc(p.handle) + '" data-title="' + esc(p.title) + '">Preorder</button>' +
      '<p class="preorder_ship">Pre-ordered products will ship in 1&ndash;2 weeks once launched. Batches are limited, reserve now.</p>';

    item.innerHTML =
      '<section class="gallery" aria-label="Product images">' + gallery + '</section>' +
      '<section class="info enter">' +
        '<a class="eyebrow" href="shop.html">' + (studio ? 'Shop' : 'Shop / Curated') + '</a>' +
        '<h1 class="title">' + esc(p.title) + '</h1>' +
        '<div class="price_big">' + money(p.priceRange.minVariantPrice.amount) + '</div>' +
        (intro ? '<p class="desc">' + intro + '</p>' : '') +
        '<div class="actions">' + action + '<p class="note" id="note" aria-live="polite"></p></div>' +
        (notes.length ? '<div class="notes">' + notes.map(function (n) { return '<details' + (n.h.trim().toLowerCase() === 'details' ? ' open' : '') + '><summary>' + esc(n.h) + '</summary><p>' + n.body + '</p></details>'; }).join('') + '</div>' : '') +
      '</section>';
    item.removeAttribute('aria-busy');

    fadeImages(item);

    /* Thumbnail swap: soften the old image, swap once the new one is decoded, then sharpen */
    var main = document.getElementById('mainImg');
    var thumbs = item.querySelectorAll('.thumbs button');
    var swapId = 0;
    thumbs.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-pressed') === 'true') return;
        thumbs.forEach(function (t) { t.setAttribute('aria-pressed', t === b ? 'true' : 'false'); });
        var id = ++swapId;
        main.classList.add('swapping');
        var ready = new Promise(function (r) {
          var next = new Image();
          next.onload = next.onerror = r;
          next.src = b.dataset.src;
          setTimeout(r, 800); /* never wait longer than this */
        });
        Promise.all([ready, new Promise(function (r) { setTimeout(r, 120); })]).then(function () {
          if (id !== swapId) return;
          main.src = b.dataset.src; main.alt = b.dataset.alt;
          main.classList.remove('swapping');
        });
      });
    });
  }).catch(function () {
    item.innerHTML = '<div class="item_missing"><p>This piece could not be loaded. Please refresh the page.</p></div>';
  });
})();
