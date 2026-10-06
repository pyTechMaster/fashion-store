(function () {
  if (!window.ShopLane.requireLogin()) return;
  var $ = function (id) { return document.getElementById(id); };
  var token = localStorage.getItem('shoplane_auth_token');
  var user = JSON.parse(localStorage.getItem('shoplane_current_user') || 'null');
  var msg = $('checkoutMsg'), btn = $('payBtn');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return 'Rs ' + Number(n).toLocaleString('en-IN'); };
  var authHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  /* cart is kept in the same cookie format as the rest of the site */
  var cookie = document.cookie.split(',');
  var ids = ((cookie.find(function (x) { return x.trim().indexOf('orderId=') === 0; }) || 'orderId=').split('=')[1] || '').trim().split(' ').filter(Boolean);
  var counter = Number((cookie.find(function (x) { return x.trim().indexOf('counter=') === 0; }) || 'counter=0').split('=')[1]) || 0;
  if (!ids.length || !counter || ids[0] === '0') { msg.textContent = 'Your cart is empty.'; return; }

  var state = { total: 0, subtotal: 0, discount: 0, coupon: '', addresses: [], addressId: '', method: '', cfg: null };

  function sessionExpired() {
    localStorage.removeItem('shoplane_auth_token'); localStorage.removeItem('shoplane_current_user');
    window.ShopLane.requireLogin();
  }

  Promise.all([
    fetch('/api/products').then(function (r) { return r.json(); }),
    fetch('/api/payment-config').then(function (r) { return r.json(); }),
    fetch('/api/account', { headers: authHeaders }).then(function (r) { if (r.status === 401) { sessionExpired(); throw new Error('expired'); } return r.json(); })
  ]).then(function (res) {
    var products = res[0]; state.cfg = res[1]; state.addresses = (res[2].user && res[2].user.addresses) || [];
    renderSummary(products); renderAddresses(); renderMethods();
    $('coBody').hidden = false;
  }).catch(function (e) { if (e.message !== 'expired') msg.textContent = 'Unable to load checkout details. Please refresh.'; });

  function renderSummary(products) {
    var groups = {}, order = [];
    ids.forEach(function (t) { if (!groups[t]) { groups[t] = 0; order.push(t); } groups[t]++; });
    var html = '';
    order.forEach(function (t) {
      var parts = t.split('_'), p = products.find(function (x) { return String(x.id) === String(parts[0]); });
      if (!p) return;
      var line = Number(p.price) * groups[t]; state.subtotal += line;
      html += '<div class="coItem"><div>' + esc(p.name) + (parts[1] ? ' <small>(Size ' + esc(parts[1]) + ')</small>' : '') + '<br><small>Qty ' + groups[t] + ' × ' + money(p.price) + '</small></div><b>' + money(line) + '</b></div>';
    });
    $('coItems').innerHTML = html; updateTotals();
  }

  function updateTotals() {
    state.total = Math.max(0, state.subtotal - state.discount);
    $('coTotal').textContent = money(state.total);
    var has = state.discount > 0;
    $('coSubRow').hidden = !has; $('coDiscRow').hidden = !has;
    $('coSub').textContent = money(state.subtotal);
    $('coDisc').textContent = '- ' + money(state.discount);
    $('coDiscLabel').textContent = 'Coupon discount (' + state.coupon + ')';
  }
  function couponMsg(t, ok) { var m = $('couponMsg'); m.textContent = t || ''; m.className = 'couponMsg' + (t ? (ok ? ' ok' : ' err') : ''); }
  function setCoupon(code, discount) {
    state.coupon = code; state.discount = discount; updateTotals();
    var applied = !!code; $('couponInput').disabled = applied; $('couponApply').textContent = applied ? 'Remove' : 'Apply';
    if (!applied) $('couponInput').value = '';
    if (state.method) setMethod(state.method);
  }
  $('couponApply').onclick = function () {
    if (state.coupon) { setCoupon('', 0); couponMsg('Coupon removed.', true); return; }
    var code = $('couponInput').value.trim();
    if (!code) { couponMsg('Enter a coupon code.', false); return; }
    $('couponApply').disabled = true;
    post('/api/coupons/validate', { code: code, productIds: ids })
      .then(function (d) { setCoupon(d.code, d.discount); couponMsg(d.code + ' applied. You save ' + money(d.discount) + '!', true); })
      .catch(function (e) { couponMsg(e.message || 'Could not apply coupon.', false); })
      .then(function () { $('couponApply').disabled = false; });
  };
  $('couponInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('couponApply').click(); } });

  function renderAddresses() {
    var box = $('coAddresses');
    if (!state.addresses.length) { box.innerHTML = '<p>No saved address yet. Please add your delivery address.</p>'; $('addrForm').hidden = false; $('toggleAddr').hidden = true; state.addressId = ''; return; }
    if (!state.addresses.some(function (a) { return a.id === state.addressId; })) state.addressId = state.addresses[0].id;
    box.innerHTML = state.addresses.map(function (a) {
      return '<label class="opt"><input type="radio" name="addr" value="' + esc(a.id) + '"' + (a.id === state.addressId ? ' checked' : '') + '><i class="fas fa-map-marker-alt" aria-hidden="true"></i><div><b>' + esc(a.label) + ' · ' + esc(a.name) + '</b><span>' + esc(a.address) + ', ' + esc(a.city) + ', ' + esc(a.state) + ' - ' + esc(a.pincode) + '<br>Phone: ' + esc(a.phone) + '</span></div></label>';
    }).join('');
    box.querySelectorAll('input[name=addr]').forEach(function (r) { r.onchange = function () { state.addressId = r.value; }; });
  }
  $('toggleAddr').onclick = function () { $('addrForm').hidden = !$('addrForm').hidden; };
  $('addrForm').onsubmit = function (e) {
    e.preventDefault();
    fetch('/api/account/addresses', { method: 'POST', headers: authHeaders, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || 'Could not save address'); return d; }); })
      .then(function (d) { state.addresses = d.addresses; state.addressId = d.addresses[d.addresses.length - 1].id; e.target.reset(); $('addrForm').hidden = true; $('toggleAddr').hidden = false; renderAddresses(); msg.textContent = ''; })
      .catch(function (x) { msg.textContent = x.message; });
  };

  function renderMethods() {
    var c = state.cfg, list = [];
    var upiOn = !!(c.upi && c.upi.enabled);
    if (!c.cod || c.cod.enabled !== false) list.push({ id: 'cod', icon: 'fa-money-bill-wave', title: 'Cash on Delivery', sub: 'Pay in cash when your order arrives' });
    /* Online Payment is always listed so customers can see it; if the store has not set up UPI yet, it says so instead of silently disappearing */
    list.push({ id: 'upi', icon: 'fa-qrcode', title: 'Online Payment (UPI / QR)', sub: upiOn ? 'GPay, PhonePe, Paytm or any UPI app' : 'Currently unavailable' });
    if (c.razorpay) list.push({ id: 'razorpay', icon: 'fa-credit-card', title: 'Card / NetBanking', sub: 'Secure payment through Razorpay' });
    var box = $('coMethods');
    var firstOk = list.find(function (m) { return m.id !== 'upi' || upiOn; }) || list[0];
    box.innerHTML = list.map(function (m) { return '<label class="opt"><input type="radio" name="pm" value="' + m.id + '"' + (m.id === firstOk.id ? ' checked' : '') + '><i class="fas ' + m.icon + '" aria-hidden="true"></i><div><b>' + m.title + '</b><span>' + m.sub + '</span></div></label>'; }).join('');
    box.querySelectorAll('input[name=pm]').forEach(function (r) { r.onchange = function () { setMethod(r.value); }; });
    setMethod(firstOk.id);
  }

  function setMethod(m) {
    state.method = m; msg.textContent = '';
    var upiOn = !!(state.cfg.upi && state.cfg.upi.enabled);
    $('upiPanel').hidden = !(m === 'upi' && upiOn); $('codPanel').hidden = m !== 'cod'; $('onlineOffPanel').hidden = !(m === 'upi' && !upiOn);
    btn.disabled = m === 'upi' && !upiOn;
    btn.textContent = m === 'upi' ? 'I have paid · Place order' : m === 'cod' ? 'Place order (Cash on Delivery)' : 'Pay ' + money(state.total);
    if (m === 'upi' && upiOn) showUpi();
  }

  function showUpi() {
    var u = state.cfg.upi;
    $('upiAmount').textContent = money(state.total); $('upiIdText').textContent = u.upiId;
    var link = 'upi://pay?pa=' + encodeURIComponent(u.upiId) + '&pn=' + encodeURIComponent(u.payeeName) + '&am=' + state.total.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent('BRANDON order');
    $('upiOpen').href = link;
    var img = $('upiQrImg'); $('upiQrGen').innerHTML = ''; img.hidden = false;
    img.onerror = function () { /* no QR image uploaded: draw one from the UPI link instead */
      img.hidden = true;
      var draw = function () { $('upiQrGen').innerHTML = ''; new window.QRCode($('upiQrGen'), { text: link, width: 200, height: 200 }); };
      if (window.QRCode) return draw();
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = draw; document.head.appendChild(s);
    };
    img.src = u.qrImage + '?v=' + Date.now();
  }
  $('copyUpi').onclick = function () { var t = $('upiIdText').textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { $('copyUpi').textContent = 'Copied'; setTimeout(function () { $('copyUpi').innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copy'; }, 1500); }); };

  function finish(order) {
    var list = JSON.parse(localStorage.getItem('shoplane_orders_v1') || '[]'); list.push(order); localStorage.setItem('shoplane_orders_v1', JSON.stringify(list));
    document.cookie = 'orderId=0,counter=0';
    location.href = 'orderPlaced.html?orderId=' + encodeURIComponent(order.orderId);
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 401) { sessionExpired(); throw new Error('Please sign in again.'); }
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || 'Request failed'); return d; });
    });
  }

  btn.onclick = function () {
    msg.textContent = '';
    if (!state.addressId) { msg.textContent = 'Please select or add a delivery address.'; return; }
    btn.disabled = true;
    var fail = function (e) { msg.textContent = e.message || 'Could not place the order.'; btn.disabled = false; };
    if (state.method === 'cod') return post('/api/orders/place', { productIds: ids, method: 'cod', addressId: state.addressId, couponCode: state.coupon }).then(function (d) { finish(d.order); }).catch(fail);
    if (state.method === 'upi') {
      var utr = $('utr').value.trim();
      if (!/^[A-Za-z0-9]{10,25}$/.test(utr)) { msg.textContent = 'Please pay first, then enter the UPI transaction ID / UTR from your payment app.'; btn.disabled = false; return; }
      return post('/api/orders/place', { productIds: ids, method: 'upi', addressId: state.addressId, utr: utr, couponCode: state.coupon }).then(function (d) { finish(d.order); }).catch(fail);
    }
    post('/api/orders/create', { productIds: ids, email: user.email, addressId: state.addressId, couponCode: state.coupon }).then(function (data) {
      if (data.demo) return finish(data.order);
      new Razorpay({ key: data.key, amount: data.amount, currency: data.currency, name: 'BRANDON', description: 'Order payment', order_id: data.razorpayOrderId, prefill: { email: user.email },
        handler: function (response) { post('/api/orders/verify', Object.assign({}, response, { productIds: ids, email: user.email, addressId: state.addressId, couponCode: state.coupon })).then(function (out) { finish(out.order); }).catch(fail); },
        modal: { ondismiss: function () { btn.disabled = false; } } }).open();
    }).catch(fail);
  };
})();
