(async function () {
  const t = localStorage.getItem('shoplane_auth_token');
  if (!t) { location.replace('auth.html?mode=signin&returnTo=my-orders.html'); return; }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const id = new URLSearchParams(location.search).get('orderId');
  try {
    const r = await fetch('/api/orders', { headers: { Authorization: 'Bearer ' + t } });
    const d = await r.json();
    const o = (d.orders || []).find(x => x.orderId === id) || (d.orders || [])[0];
    const box = document.getElementById('orderContainer');
    if (!o) { box.insertAdjacentHTML('beforeend', '<p style="text-align:center">Order not found. <a href="my-orders.html">View My Orders</a></p>'); return; }
    if (window.slTrack && !sessionStorage.getItem('sl_tracked_' + o.orderId)) { sessionStorage.setItem('sl_tracked_' + o.orderId, '1'); slTrack('event', 'purchase', { transaction_id: o.orderId, value: Number(o.amount) || 0, currency: 'INR' }); }
    const note = o.paymentMethod === 'UPI' && o.paymentStatus === 'Pending Verification'
      ? 'We have received your UPI payment details. Your order will be confirmed as soon as we verify the payment.'
      : o.paymentMethod === 'COD' ? 'Please keep the exact amount ready to pay in cash on delivery.' : '';
    const a = o.address;
    const h1 = document.querySelector('#aboutCheck h1'), p = document.querySelector('#aboutCheck p');
    if (p) p.textContent = note || 'Thank you for shopping with BRANDON.';
    box.insertAdjacentHTML('beforeend', `<div class="orderActions"><p><strong>Order ID:</strong> ${esc(o.orderId)}</p><p><strong>Payment:</strong> ${esc(o.paymentMethod === 'COD' ? 'Cash on Delivery' : o.paymentMethod === 'UPI' ? 'UPI (online)' : o.paymentMethod || '')} · ${esc(o.paymentStatus)}</p><p><strong>Status:</strong> ${esc(o.status)}</p><p><strong>Total:</strong> Rs ${esc(o.amount)}</p>${a ? `<p><strong>Deliver to:</strong> ${esc(a.name)}, ${esc(a.address)}, ${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}</p>` : ''}<div class="btnRow"><a class="btnWa" id="waOrderBtn" target="_blank" rel="noopener"><svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 0 0 16 29c7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.7c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1 1.1-3.9-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.100 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.300.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.3z"/></svg> Send order on WhatsApp</a><button class="btnInv" id="invBtn" type="button"><i class="fas fa-file-pdf" aria-hidden="true"></i> Download invoice (PDF)</button></div><p><a href="my-orders.html">Track / View My Orders</a></p></div>`);
    const lines = (o.items || []).map(i => '- ' + i.name + ' x' + i.quantity).join('\n');
    document.getElementById('waOrderBtn').href = window.waLink(window.SHOPLANE_WA_NUMBER, 'Hi BRANDON! I just placed an order.\n\nOrder ID: ' + o.orderId + '\n' + lines + '\nTotal: Rs ' + o.amount + '\nPayment: ' + (o.paymentMethod === 'COD' ? 'Cash on Delivery' : o.paymentMethod || '') + ' (' + o.paymentStatus + ')' + (a ? '\nDeliver to: ' + a.name + ', ' + a.phone + ', ' + a.address + ', ' + a.city + ', ' + a.state + ' - ' + a.pincode : ''));
    document.getElementById('invBtn').onclick = () => window.downloadInvoice(o.orderId);
  } catch {}
})();
