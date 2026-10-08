/* Ciel x Shopify. Products load live from the Storefront API, same store and conventions as before:
   - tag "ciel-studio" is required for a product to appear on the site
   - products page order = the "Shop" collection's manual sort in Shopify admin
   - only ACTIVE products published to the Ciel Headless channel are returned (drafts never show)
   - description: first paragraph = intro; each <h4> starts a section (Details, Dimensions, Shipping)
   "I'm interested" signups are saved in Shopify as marketing-subscribed customers tagged
   "interested", "preorder" and "preorder-<handle>" (count them with customers query tag:preorder-<handle>). */
(function () {
  var STORE = 'https://6n0zf6-2z.myshopify.com';
  var API = STORE + '/api/2025-07/graphql.json';
  var TOKEN = '9e6e50b006ca52f39041196f55c47b0d';

  /* Our own art-directed images win over the Shopify product image */
  var IMAGES = { 'onde-clock': '/assets/products/onde_stage.jpg?v=4' };

  var FIELDS = 'handle title productType tags descriptionHtml ' +
    'priceRange { minVariantPrice { amount } } featuredImage { url altText } ' +
    'variants(first: 1) { nodes { id availableForSale } }';
  var CARD_MEDIA = 'media(first: 10) { nodes { mediaContentType ... on Video { sources { url mimeType height } } } }';

  /* Product cards in motion. Clocks: the photo with its points of light removed, and the points
     redrawn orbiting their dials (positions measured from the photos, as a percentage of the square image).
     Everything else: the product's first Shopify video (the 360 spin), looping silently. */
  var R = function (n) { return Math.round(n * 1000) / 1000; };
  var MOTION = {
    'onde-clock': { img: '/assets/products/onde_motion.jpg?v=1', inset: true, periods: [60, 20, 7],
      dots: [{"cx": 25.779500430663223, "cy": 26.804478897502154, "r": 6.804478897502153, "dot": 0.6201550387596899, "start": 90}, {"cx": 71.80017226528854, "cy": 35.2885443583118, "r": 6.804478897502153, "dot": 0.6201550387596899, "start": 90}, {"cx": 36.90783807062877, "cy": 66.2532299741602, "r": 6.804478897502153, "dot": 0.6201550387596899, "start": 90}] },
    'halo-clock': { img: '/assets/products/halo_motion.jpg?v=1', inset: false, periods: [48, 14],
      dots: [{"cx": 50.048828125, "cy": 49.3408203125, "r": 34.37446733398438, "dot": 0.673828125, "start": 29.0}, {"cx": 50.048828125, "cy": 49.3408203125, "r": 39.60444013671875, "dot": 0.546875, "start": 145.3}] }
  };

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
  /* Price still being set in Shopify (0) reads as "Pricing soon" instead of $0 */
  function price(p) { var a = Number(p.priceRange.minVariantPrice.amount); return a > 0 ? money(a) : 'Pricing soon'; }
  function has(p, tag) { return p.tags.indexOf(tag) > -1; }
  function maker() { return 'Ciel Studio'; }

  /* Description -> { intro, sections: { details, dimensions, shipping, ... } } */
  function split(p) {
    var tmp = document.createElement('div');
    tmp.innerHTML = p.descriptionHtml || '';
    var intro = '', sections = {}, cur = null;
    Array.prototype.forEach.call(tmp.children, function (el) {
      if (/^H[1-6]$/.test(el.tagName)) { cur = el.textContent.trim().toLowerCase(); sections[cur] = ''; }
      else if (cur) sections[cur] += (sections[cur] ? ' ' : '') + el.innerHTML;
      else intro += (intro ? ' ' : '') + el.innerHTML;
    });
    return { intro: intro, sections: sections };
  }
  function flat(html) { return String(html).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim(); }

  /* ---------- Products grid: <div data-catalog="shop"> ---------- */
  function firstVideo(p) {
    var v = ((p.media && p.media.nodes) || []).filter(function (m) { return m.mediaContentType === 'VIDEO'; })[0];
    if (!v) return null;
    return (v.sources || []).filter(function (x) { return x.mimeType === 'video/mp4'; })
      .sort(function (a, b) { return Math.abs(a.height - 720) - Math.abs(b.height - 720); })[0] || null;
  }
  function visual(p) {
    var m = MOTION[p.handle], alt = esc(p.title);
    if (m) {
      return '<div class="frame' + (m.inset ? '' : ' full') + '"><div class="motion">' +
        '<img src="' + m.img + '" alt="' + alt + '">' +
        m.dots.map(function (d, i) {
          return '<span class="orbit" style="left:' + R(d.cx) + '%;top:' + R(d.cy) + '%;width:' + R(d.r * 2) + '%;--a0:' + d.start + 'deg;--t:' + m.periods[i] + 's">' +
            '<i style="width:' + R(d.dot / d.r * 100) + '%"></i></span>';
        }).join('') + '</div></div>';
    }
    var poster = IMAGES[p.handle] || (p.featuredImage && p.featuredImage.url + '&width=900');
    var vid = firstVideo(p);
    if (vid) return '<div class="frame full"><video src="' + esc(vid.url) + '"' + (poster ? ' poster="' + esc(poster) + '"' : '') + ' muted loop playsinline autoplay preload="metadata" aria-label="' + alt + '"></video></div>';
    return '<div class="frame' + (IMAGES[p.handle] ? '' : ' full') + '">' + (poster ? '<img src="' + esc(poster) + '" alt="' + alt + '">' : '') + '</div>';
  }
  function card(p) {
    return '<a class="card" data-handle="' + esc(p.handle) + '" href="/products/' + encodeURIComponent(p.handle) + '">' + visual(p) +
      '<div class="meta"><h2>' + esc(p.title) + '</h2><span class="price">' + price(p) + '</span></div>' +
      (p.productType ? '<p class="type">' + esc(p.productType) + '</p>' : '') + '</a>';
  }
  document.querySelectorAll('[data-catalog="shop"]').forEach(function (grid) {
    var q = 'query($q: String!) { collection(handle: "shop") { products(first: 50, sortKey: COLLECTION_DEFAULT) { nodes { ' + FIELDS + ' ' + CARD_MEDIA + ' } } } ' +
      'products(first: 50, sortKey: CREATED_AT, query: $q) { nodes { ' + FIELDS + ' ' + CARD_MEDIA + ' } } }';
    grid.setAttribute('aria-busy', 'true');
    gql(q, { q: 'tag:ciel-studio' })
      .then(function (d) {
        var nodes = d.collection && d.collection.products.nodes.length ? d.collection.products.nodes : d.products.nodes;
        var list = nodes.filter(function (p) { return has(p, 'ciel-studio'); });
        if (list.length) grid.innerHTML = list.map(card).join('');
        var gio = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) e.target.play().catch(function () {}); else e.target.pause(); });
        });
        grid.querySelectorAll('video').forEach(function (v) { gio.observe(v); });
      })
      .catch(function () { /* keep the static fallback card that ships in the HTML */ })
      .then(function () { grid.removeAttribute('aria-busy'); });
  });

  /* ---------- Product page copy: <main data-live-handle="..."> with [data-live] slots ---------- */
  var live = document.querySelector('[data-live-handle]');
  if (live) {
    gql('query($h: String!) { product(handle: $h) { ' + FIELDS + ' } }', { h: live.dataset.liveHandle })
      .then(function (d) {
        var p = d.product;
        if (!p) return;
        var parts = split(p), s = parts.sections;
        var put = function (key, html) {
          var el = live.querySelector('[data-live="' + key + '"]');
          if (el && html) el.innerHTML = html;
        };
        armBuy(p);
        put('title', esc(p.title));
        put('price', price(p));
        put('intro', flat(parts.intro));
        put('details', flat(s.details || ''));
        put('dimensions', flat(s.dimensions || '').replace(/^Approx\.\s*/i, ''));
        put('shipping', flat(s.shipping || ''));
      })
      .catch(function () { /* the page ships with the same copy, so it still reads correctly */ });
  }

  /* ---------- Product page template: <main data-product-page>, handle taken from /products/<handle> ---------- */
  var page = document.querySelector('[data-product-page]');
  if (page) {
    var handle = decodeURIComponent((location.pathname.match(/\/products\/([^\/?#]+)/) || [])[1] || '');
    var MEDIA = 'media(first: 20) { nodes { mediaContentType alt previewImage { url } ' +
      '... on MediaImage { image { url altText width height } } ... on Video { sources { url mimeType height } } } }';
    var form = page.querySelector('form[data-interest]');
    if (form) form.dataset.interest = handle;
    gql('query($h: String!) { product(handle: $h) { ' + FIELDS + ' ' + MEDIA + ' } }', { h: handle })
      .then(function (d) { renderPage(d.product); })
      .catch(function () { renderPage(null); });
  }
  function renderPage(p) {
    var q = function (k) { return page.querySelector('[data-live="' + k + '"]'); };
    if (!p) {
      q('title').textContent = 'Not found';
      q('price').textContent = '';
      q('desc').innerHTML = '<p>This piece is no longer listed. <a class="inline" href="/products">See all products</a>.</p>';
      var f = page.querySelector('form[data-interest]'); if (f) f.hidden = true; var bx = page.querySelector('[data-buy]'); if (bx) bx.hidden = true;
      return;
    }
    var parts = split(p), s = parts.sections, intro = flat(parts.intro);
    armBuy(p);
    q('title').textContent = p.title;
    q('price').textContent = price(p);
    q('desc').innerHTML = '<p>' + esc(intro) + '</p>' + (s.details ? '<p>' + esc(flat(s.details)) + '</p>' : '');
    var keys = Object.keys(s).filter(function (k) { return k !== 'details'; });
    q('folds').innerHTML = keys.map(function (k, i) {
      return '<details class="fold" name="pdp"' + (i === 0 ? ' open' : '') + '><summary>' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</summary><p>' + s[k] + '</p></details>';
    }).join('');
    var folds = q('folds').querySelectorAll('.fold');
    folds.forEach(function (f) { f.addEventListener('toggle', function () { if (f.open) folds.forEach(function (o) { if (o !== f) o.open = false; }); }); });

    /* Media row: first image large, everything else square; videos loop silently */
    var rail = document.getElementById('rail');
    var media = (p.media && p.media.nodes) || [];
    rail.innerHTML = media.map(function (m, i) {
      var alt = esc(m.alt || p.title);
      if (m.mediaContentType === 'VIDEO') {
        var mp4 = (m.sources || []).filter(function (x) { return x.mimeType === 'video/mp4'; })
          .sort(function (a, b) { return Math.abs(a.height - 720) - Math.abs(b.height - 720); })[0];
        if (!mp4) return '';
        return '<figure><video src="' + esc(mp4.url) + '"' + (m.previewImage ? ' poster="' + esc(m.previewImage.url + '&width=900') + '"' : '') +
          ' muted loop playsinline autoplay preload="metadata" aria-label="' + alt + '"></video></figure>';
      }
      if (!m.image) return '';
      return i === 0
        ? '<figure class="stage"><img src="' + esc(m.image.url + '&width=1600') + '" alt="' + alt + '"></figure>'
        : '<figure><img src="' + esc(m.image.url + '&width=900') + '" alt="' + alt + '" loading="lazy"></figure>';
    }).join('');
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) e.target.play().catch(function () {}); else e.target.pause(); });
    });
    rail.querySelectorAll('video').forEach(function (v) { vio.observe(v); });

    /* Title, description, share tags and Product schema for this piece */
    var url = 'https://cieldesign.shop/products/' + p.handle;
    var desc = (intro + ' ' + flat(s.details || '')).trim().slice(0, 158);
    var img = p.featuredImage ? p.featuredImage.url : 'https://cieldesign.shop/assets/og-image.jpg';
    document.title = p.title + ' | Ciel';
    var setMeta = function (attr, key, val) {
      var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', p.title + ' | Ciel'); setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url); setMeta('property', 'og:image', img); setMeta('property', 'og:type', 'product');
    setMeta('name', 'twitter:title', p.title + ' | Ciel'); setMeta('name', 'twitter:description', desc); setMeta('name', 'twitter:image', img);
    var canon = document.head.querySelector('link[rel="canonical"]'); if (canon) canon.href = url;
    var amount = Number(p.priceRange.minVariantPrice.amount);
    var ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.title, url: url, description: desc, category: p.productType,
      image: media.filter(function (m) { return m.image; }).slice(0, 6).map(function (m) { return m.image.url; }),
      brand: { '@type': 'Brand', name: 'Ciel' } };
    if (amount > 0) ld.offers = { '@type': 'Offer', url: url, priceCurrency: 'USD', price: amount.toFixed(2), availability: 'https://schema.org/MadeToOrder' };
    var sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.textContent = JSON.stringify(ld); document.head.appendChild(sc);
  }

  /* ---------- Buy box: <div data-buy> on product pages.
     "Add to bag" adds to the shared bag (cart.js); "Buy now" opens a one-item Shopify checkout. ---------- */
  function armBuy(p) {
    var box = document.querySelector('[data-buy]');
    if (!box || !p) return;
    var add = box.querySelector('[data-add]'), now = box.querySelector('[data-buy-now]');
    var addLabel = add.querySelector('[data-add-label]'), nowLabel = now.querySelector('[data-buy-label]');
    var note = box.querySelector('[data-buy-note]'), noteText = note ? note.textContent : '';
    var v = p.variants && p.variants.nodes[0];
    if (!v || !v.availableForSale || !(Number(p.priceRange.minVariantPrice.amount) > 0)) {
      add.disabled = now.disabled = true; addLabel.textContent = 'Unavailable';
      return;
    }
    add.disabled = now.disabled = false;
    add.onclick = function () {
      if (!window.CielCart) return;
      add.disabled = true; addLabel.textContent = 'Adding';
      if (note) note.textContent = noteText;
      window.CielCart.add(v.id, 1)
        .then(function () { addLabel.textContent = 'Added'; setTimeout(function () { addLabel.textContent = 'Add to bag'; add.disabled = false; }, 1200); })
        .catch(function () { add.disabled = false; addLabel.textContent = 'Add to bag'; if (note) note.textContent = 'Could not add to your bag. Please try again.'; });
    };
    now.onclick = function () {
      now.disabled = true; nowLabel.textContent = 'Opening checkout';
      gql('mutation($l: [CartLineInput!]!) { cartCreate(input: { lines: $l }) { cart { checkoutUrl } userErrors { message } } }',
        { l: [{ merchandiseId: v.id, quantity: 1 }] })
        .then(function (d) {
          var c = d.cartCreate;
          if (c.cart && c.cart.checkoutUrl) { location.href = c.cart.checkoutUrl; return; }
          throw new Error((c.userErrors[0] || {}).message || 'cart');
        })
        .catch(function () {
          now.disabled = false; nowLabel.textContent = 'Buy now';
          if (note) note.textContent = 'Checkout could not open. Please try again, or contact us.';
        });
    };
    /* Back from checkout via the back button: the page comes from bfcache with "Opening checkout" frozen on it */
    window.addEventListener('pageshow', function (e) { if (e.persisted) { now.disabled = false; nowLabel.textContent = 'Buy now'; } });
  }

  /* ---------- "I'm interested": <form data-interest="handle"> ---------- */
  document.querySelectorAll('form[data-interest]').forEach(function (form) {
    var handle = form.dataset.interest;
    var note = form.querySelector('[data-interest-note]');
    var sink = document.createElement('iframe');
    sink.name = 'interest_sink';
    sink.title = 'Sign up';
    sink.hidden = true;
    document.body.appendChild(sink);

    form.method = 'POST';
    form.action = STORE + '/contact#interest';
    form.target = 'interest_sink';
    form.insertAdjacentHTML('afterbegin',
      '<input type="hidden" name="form_type" value="customer">' +
      '<input type="hidden" name="utf8" value="✓">' +
      '<input type="hidden" name="contact[tags]" value="newsletter,interested,preorder,preorder-' + esc(handle) + '">');

    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        form.querySelector('input[type=email]').value = '';
        btn.disabled = false;
        if (note) note.textContent = 'Thank you. We will be in touch before the first batch.';
      }
      sink.addEventListener('load', finish, { once: true });
      setTimeout(finish, 6000);
    });
  });
})();
