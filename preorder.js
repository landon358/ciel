/* Ciel preorders: no payment. Each signup is saved in Shopify as a marketing-subscribed
   customer tagged "preorder" and "preorder-<product handle>". */
(function () {
  var STORE = 'https://6n0zf6-2z.myshopify.com';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function mount(btn) {
    if (btn.dataset.ready) return;
    btn.dataset.ready = '1';
    var handle = btn.dataset.preorder;
    var title = btn.dataset.title || 'this piece';

    var form = document.createElement('form');
    form.className = 'preorder_form';
    form.method = 'POST';
    form.action = STORE + '/contact#preorder';
    form.hidden = true;
    form.target = 'preorder_sink';
    form.innerHTML =
      '<input type="hidden" name="form_type" value="customer">' +
      '<input type="hidden" name="utf8" value="✓">' +
      '<input type="hidden" name="contact[tags]" value="newsletter,preorder,preorder-' + esc(handle) + '">' +
      '<label class="preorder_label" for="preorder_email">Email</label>' +
      '<div class="preorder_row">' +
        '<input id="preorder_email" type="email" name="contact[email]" required autocomplete="email" placeholder="you@example.com">' +
        '<button type="submit" class="pill solid">Reserve</button>' +
      '</div>' +
      '<p class="preorder_fine">No payment now. We will email you when it is ready to order.</p>';
    btn.insertAdjacentElement('afterend', form);

    btn.addEventListener('click', function () {
      btn.hidden = true;
      form.hidden = false;
      form.querySelector('input[type=email]').focus();
    });

    /* Submit into a hidden frame so the visitor stays on this page */
    var sink = document.querySelector('iframe[name=preorder_sink]');
    if (!sink) {
      sink = document.createElement('iframe');
      sink.name = 'preorder_sink';
      sink.title = 'Preorder';
      sink.hidden = true;
      document.body.appendChild(sink);
    }
    var submit = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function () {
      submit.disabled = true;
      submit.textContent = 'Reserving';
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        form.hidden = true;
        var note = document.getElementById('note');
        if (note) note.textContent = 'Thank you. You are on the preorder list for the ' + title + '. We will email you when it is ready to order.';
      }
      sink.addEventListener('load', finish, { once: true });
      setTimeout(finish, 6000);
    });
  }

  function scan() { document.querySelectorAll('[data-preorder]').forEach(mount); }
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
