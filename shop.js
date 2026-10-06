/* Ciel x Shopify. Products load live from the Storefront API, same store and conventions as before:
   - tag "ciel-studio" (own design) or "curated" is required for a product to appear on the site
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
    'priceRange { minVariantPrice { amount } } featuredImage { url altText }';

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
  function has(p, tag) { return p.tags.indexOf(tag) > -1; }
  function maker(p) { return has(p, 'ciel-studio') ? 'Ciel Studio' : 'Curated'; }

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
  function card(p) {
    var img = IMAGES[p.handle] || (p.featuredImage && p.featuredImage.url + '&width=900');
    return '<a class="card" href="/products/' + encodeURIComponent(p.handle) + '">' +
      '<div class="frame">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(IMAGES[p.handle] ? p.title : (p.featuredImage && p.featuredImage.altText || p.title)) + '">' : '') + '</div>' +
      '<div class="meta"><h2>' + esc(p.title) + '</h2><span class="price">' + money(p.priceRange.minVariantPrice.amount) + '</span></div>' +
      '<p class="type">' + esc((p.productType ? p.productType + ', ' : '') + maker(p)) + '</p></a>';
  }
  document.querySelectorAll('[data-catalog="shop"]').forEach(function (grid) {
    var q = 'query($q: String!) { collection(handle: "shop") { products(first: 50, sortKey: COLLECTION_DEFAULT) { nodes { ' + FIELDS + ' } } } ' +
      'products(first: 50, sortKey: CREATED_AT, query: $q) { nodes { ' + FIELDS + ' } } }';
    grid.setAttribute('aria-busy', 'true');
    gql(q, { q: 'tag:ciel-studio OR tag:curated' })
      .then(function (d) {
        var nodes = d.collection && d.collection.products.nodes.length ? d.collection.products.nodes : d.products.nodes;
        var list = nodes.filter(function (p) { return has(p, 'ciel-studio') || has(p, 'curated'); });
        if (list.length) grid.innerHTML = list.map(card).join('');
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
        put('title', esc(p.title));
        put('price', money(p.priceRange.minVariantPrice.amount));
        put('intro', flat(parts.intro));
        put('details', flat(s.details || ''));
        put('dimensions', flat(s.dimensions || '').replace(/^Approx\.\s*/i, ''));
        put('shipping', flat(s.shipping || ''));
      })
      .catch(function () { /* the page ships with the same copy, so it still reads correctly */ });
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
