/* Shared layout: injects partials (header, footer, ...) and wires header state. */
/* Shared helpers: sign-in check used by Add to Cart, Cart and Checkout. */
window.ShopLane = {
  isSignedIn: function () {
    try { return !!(JSON.parse(localStorage.getItem('shoplane_current_user') || 'null') && localStorage.getItem('shoplane_auth_token')); } catch (e) { return false; }
  },
  /* Sends a guest to Create Account / Sign In and brings them back to this page afterwards. */
  requireLogin: function () {
    if (this.isSignedIn()) return true;
    var back = location.pathname.split('/').pop() + location.search;
    location.href = 'auth.html?mode=create&reason=shop&returnTo=' + encodeURIComponent(back);
    return false;
  }
};
(function () {
  document.querySelectorAll('[data-include]').forEach(function (slot) {
    var r = new XMLHttpRequest();
    r.open('GET', 'partials/' + slot.dataset.include + '.html', false); // sync so page scripts find the header
    r.send(null);
    if (r.status === 200 || r.status === 0) slot.outerHTML = r.responseText;
  });

  var badge = document.getElementById('badge');
  if (badge) {
    var c = 0;
    try { c = Number((document.cookie.split(',').find(function (x) { return x.indexOf('counter=') === 0; }) || 'counter=0').split('=')[1]) || 0; } catch (e) {}
    badge.textContent = c;
  }
  var drawer = document.getElementById('collection');
  if (drawer) {
    var du = null;
    try { du = JSON.parse(localStorage.getItem('shoplane_current_user') || 'null'); } catch (e) {}
    if (du) {
      drawer.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = true; });
      drawer.querySelectorAll('[data-member]').forEach(function (el) { el.hidden = false; });
      var g = document.getElementById('drawerGreet'), gs = document.getElementById('drawerSub');
      if (g && du.name) g.textContent = 'Hi, ' + String(du.name).split(' ')[0] + '!';
      if (gs) gs.textContent = 'Good to see you again. Happy shopping!';
    }
    /* keep the drawer's wishlist / cart counts in sync with the header badges */
    [['wishlistBadge', 'dWish'], ['badge', 'dCart']].forEach(function (p) {
      var src = document.getElementById(p[0]), dst = document.getElementById(p[1]);
      if (!src || !dst) return;
      var sync = function () { dst.textContent = src.textContent || '0'; };
      sync(); new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    });
  }
  document.querySelectorAll('#collection .navItem.hasSub > a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var item = a.parentElement, willOpen = !item.classList.contains('open');
      document.querySelectorAll('#collection .navItem.hasSub').forEach(function (o) { o.classList.remove('open'); o.firstElementChild.setAttribute('aria-expanded', 'false'); });
      if (willOpen) { item.classList.add('open'); a.setAttribute('aria-expanded', 'true'); }
    });
  });
  var acct = document.getElementById('acct');
  if (acct) {
    var u = null;
    try { u = JSON.parse(localStorage.getItem('shoplane_current_user') || 'null'); } catch (e) {}
    if (u) { // signed in: show My Account instead of the guest links
      acct.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = true; });
      acct.querySelectorAll('[data-member]').forEach(function (el) { el.hidden = false; });
      var lbl = document.getElementById('acctLabel');
      if (lbl && u.name) lbl.textContent = String(u.name).split(' ')[0];
    }
    var btn = document.getElementById('acctBtn');
    var setOpen = function (open) { acct.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!acct.classList.contains('open')); });
    document.addEventListener('click', function (e) { if (!acct.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
  }

  /* mobile drawer, scroll shadow, header search */
  var mBtn = document.getElementById('menuBtn'), nav = document.getElementById('collection'), scrim = document.getElementById('navScrim');
  if (mBtn && nav) {
    var toggleNav = function (open) { nav.classList.toggle('open', open); if (scrim) scrim.classList.toggle('open', open); mBtn.setAttribute('aria-expanded', open); document.body.style.overflow = open ? 'hidden' : ''; };
    mBtn.addEventListener('click', function () { toggleNav(!nav.classList.contains('open')); });
    if (scrim) scrim.addEventListener('click', function () { toggleNav(false); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) toggleNav(false); });
    var dClose = document.getElementById('drawerClose'); if (dClose) dClose.addEventListener('click', function () { toggleNav(false); mBtn.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleNav(false); });
  }
  var hdr = document.querySelector('.siteHeader');
  if (hdr) { var onScroll = function () { hdr.classList.toggle('scrolled', window.scrollY > 8); }; window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  var sForm = document.getElementById('search'), sInput = document.getElementById('input');
  if (sForm && sInput) {
    var qNow = new URLSearchParams(location.search).get('q'); if (qNow) sInput.value = qNow;
    sForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = sInput.value.trim(); if (!q) return;
      var kids = /kid|boy|girl|dress|short/i.test(q);
      location.href = (kids ? 'kids-fashion.html' : 'fashion-gallery.html') + '?q=' + encodeURIComponent(q);
    });
  }
  document.querySelectorAll('#collection .navItem > a, .homeLink').forEach(function (a) {
    if (location.pathname.split('/').pop() === a.getAttribute('href')) a.classList.add('current');
  });

  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
})();

/* Star ratings on product cards (home, Men, Kids, wishlist): reads /api/reviews/summary once and decorates any card */
(function () {
  var map = null;
  function idOf(card) { var a = card.querySelector('a[href*="contentDetails.html?"]'); return a ? a.getAttribute('href').split('?')[1] : null; }
  function decorate(card) {
    if (card.__rated) return; var id = idOf(card); if (!id) return; card.__rated = 1;
    var r = map[id]; if (!r || !r.count) return;
    var d = document.createElement('div'); d.className = 'cardRating';
    var st = document.createElement('span'); st.className = 'stars'; st.textContent = '\u2605'.repeat(Math.round(r.avg)) + '\u2606'.repeat(5 - Math.round(r.avg));
    var b = document.createElement('b'); b.textContent = r.avg.toFixed(1);
    var c = document.createElement('small'); c.textContent = '(' + r.count + ')';
    d.append(st, b, c);
    var t = card.querySelector('h4') || card.querySelector('h3'); if (t && t.parentNode) t.parentNode.insertBefore(d, t.nextSibling);
  }
  function run() { document.querySelectorAll('.productBox,.catCard').forEach(decorate); }
  fetch('/api/reviews/summary').then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
    map = m || {}; run(); new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  }).catch(function () {});
})();


/* WhatsApp "Chat with us" button (all pages) + shared helpers for invoice download and WhatsApp order messages.
   To change the store WhatsApp number, edit SHOPLANE_WA_NUMBER (country code + number, digits only). */
var SHOPLANE_WA_NUMBER = '919372644129';
window.SHOPLANE_WA_NUMBER = SHOPLANE_WA_NUMBER;
window.waLink = function (number, text) { return 'https://wa.me/' + String(number || SHOPLANE_WA_NUMBER).replace(/\D/g, '') + '?text=' + encodeURIComponent(text || ''); };
window.waPhone = function (p) { var d = String(p || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; else if (d.length === 11 && d[0] === '0') d = '91' + d.slice(1); return d; };
window.downloadInvoice = async function (orderId, adminKey) {
  try {
    var h = adminKey ? { 'x-admin-key': adminKey } : { Authorization: 'Bearer ' + localStorage.getItem('shoplane_auth_token') };
    var r = await fetch((adminKey ? '/api/admin/orders/' : '/api/orders/') + encodeURIComponent(orderId) + '/invoice', { headers: h });
    if (!r.ok) throw new Error((await r.json().catch(function () { return {}; })).message || 'Could not create invoice');
    var url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = 'Invoice-' + orderId + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  } catch (e) { alert(e.message || 'Could not download invoice'); }
};
(function () {
  if (/admin\.html$/.test(location.pathname)) return;
  function add() {
    if (document.getElementById('waFloat')) return;
    var a = document.createElement('a');
    a.id = 'waFloat'; a.className = 'waFloat'; a.target = '_blank'; a.rel = 'noopener';
    a.href = window.waLink(SHOPLANE_WA_NUMBER, 'Hi BRANDON, I need help.');
    a.setAttribute('aria-label', 'Chat with us on WhatsApp');
    a.innerHTML = '<svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 0 0 16 29c7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.7c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1 1.1-3.9-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.100 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.300.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.3z"/></svg><span>Chat with us</span>';
    document.body.appendChild(a);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();


/* Order notifications: Web Push (works even when the site is closed) + a polling fallback while the site is open. */
(function () {
  var TK = 'shoplane_auth_token';
  function b64(u) { var p = '='.repeat((4 - u.length % 4) % 4), s = (u + p).replace(/-/g, '+').replace(/_/g, '/'), r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  window.slNotify = function (title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var o = { body: body, tag: tag || undefined, icon: 'img/img1.png', badge: 'img/favicon.svg', data: { url: 'my-orders.html' } };
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, o); }).catch(function () { try { new Notification(title, o); } catch (e) {} });
    else try { new Notification(title, o); } catch (e) {}
  };
  window.slPushSubscribe = async function () {
    try {
      if (!localStorage.getItem(TK) || !('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false;
      var k = await (await fetch('/api/push/key')).json(); if (!k.key) return false;
      var reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.key) });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem(TK) }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      return true;
    } catch (e) { return false; }
  };
  var MK = 'shoplane_status_map';
  async function poll() {
    try {
      var t = localStorage.getItem(TK); if (!t || !('Notification' in window) || Notification.permission !== 'granted') return;
      var r = await fetch('/api/orders', { headers: { Authorization: 'Bearer ' + t } }); if (!r.ok) return;
      var orders = (await r.json()).orders || [], old = JSON.parse(localStorage.getItem(MK) || 'null'), now = {};
      orders.forEach(function (o) {
        var v = o.status + '|' + o.paymentStatus; now[o.orderId] = v;
        if (old && old[o.orderId] && old[o.orderId] !== v) window.slNotify('BRANDON order update', 'Your order ' + o.orderId + ' is now: ' + o.status, o.orderId + '-' + o.status);
      });
      localStorage.setItem(MK, JSON.stringify(now));
    } catch (e) {}
  }
  window.addEventListener('load', function () { if (localStorage.getItem(TK) && 'Notification' in window && Notification.permission === 'granted') { window.slPushSubscribe(); poll(); setInterval(poll, 60000); } });
})();


/* Brand helpers (used by the home page and brands.html) */
window.slBrandList = function (products) {
  var m = {};
  (products || []).forEach(function (p) {
    var name = String(p.brand || '').trim(); if (!name) return;
    var k = name.toLowerCase(); if (!m[k]) m[k] = { key: k, name: name, count: 0 }; m[k].count++;
  });
  return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
};
/* Shop by brand page: ye brands + logos yahan se aate hain. Naya brand jodna ho to is list mein ek line add karein. */
window.slShopBrands = [
  { key: 'puma', name: 'Puma', logo: 'img/brands/puma.png', alias: ['puma'] },
  { key: 'h&m', name: 'H&M', logo: 'img/brands/hm.png', alias: ['h&m', 'h and m', 'hm'] },
  { key: 'us polo', name: 'U.S. Polo Assn.', logo: 'img/brands/uspolo.png', alias: ['us polo', 'u.s. polo', 'u.s. polo assn', 'u.s. polo assn.', 'us polo assn', 'uspolo'] },
  { key: 'china imported', name: 'China Imported', logo: 'img/brands/china-import.png', alias: ['china imported', 'china import', 'imported from china'] },
  { key: 'ck', name: 'Calvin Klein', logo: 'img/brands/ck.png', alias: ['ck', 'calvin klein'] }
];
window.slBrandMatch = function (b, p) { var n = String(p.brand || '').trim().toLowerCase(); return b.alias.indexOf(n) >= 0; };
window.slBrandTiles = function (box, products) {
  if (!box) return; box.innerHTML = '';
  window.slShopBrands.forEach(function (b) {
    var cnt = (products || []).filter(function (p) { return window.slBrandMatch(b, p); }).length;
    var a = document.createElement('a'); a.className = 'brandTile hasLogo'; a.href = 'brands.html?brand=' + encodeURIComponent(b.key);
    var l = document.createElement('span'); l.className = 'brandLogo brandLogoImg'; var im = document.createElement('img'); im.src = b.logo; im.alt = b.name + ' logo'; im.loading = 'lazy'; l.appendChild(im);
    var n = document.createElement('b'); n.textContent = b.name;
    a.append(l, n);
    if (cnt) { var c = document.createElement('small'); c.textContent = cnt + (cnt === 1 ? ' product' : ' products'); a.appendChild(c); }
    box.appendChild(a);
  });
};

/* Public config (Google client id + Analytics id come from the server .env) and Google Analytics 4 loader. Does nothing until GA_MEASUREMENT_ID is set. */
(function () {
  window.ShopLane = window.ShopLane || {};
  var cfg = fetch('/api/public-config').then(function (r) { return r.json(); }).catch(function () { return {}; });
  window.ShopLane.config = cfg;
  window.slTrack = function () { var a = arguments; cfg.then(function () { if (window.gtag) window.gtag.apply(null, a); }); };
  if (/admin\.html$/.test(location.pathname)) return;
  cfg.then(function (c) {
    if (!c || !c.gaId || window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(c.gaId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', c.gaId);
  });
})();
