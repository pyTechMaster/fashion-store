/* Admin: products, stock, payment settings. Uses K (admin key) and get() from admin.html. */
const PE = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JH = { 'Content-Type': 'application/json' };
let PROD = { products: [], sections: [], types: [] }, PF = { preview: '', photos: [] }, PQ = '';

async function uploadImage(file, kind) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw Error('Image is bigger than 5 MB.');
  const r = await fetch('/api/admin/upload' + (kind ? '?kind=' + kind : ''), { method: 'POST', headers: { 'x-admin-key': K, 'Content-Type': file.type || 'image/jpeg' }, body: file });
  const d = await r.json(); if (!r.ok) throw Error(d.message || 'Upload failed'); return d.path;
}

async function loadProducts() {
  try { PROD = await get('/api/admin/products'); renderProducts(); renderProdForm(); } catch (e) { alert(e.message); }
}
function renderProducts() {
  const q = PQ.toLowerCase();
  const rows = PROD.products.filter(p => !q || (p.name + ' ' + p.brand + ' ' + p.id).toLowerCase().includes(q));
  document.getElementById('prodList').innerHTML = '<input id="prodSearch" placeholder="Search product, brand or ID" value="' + PE(PQ) + '" oninput="PQ=this.value;renderProducts();var e=document.getElementById(\'prodSearch\');e.focus();e.setSelectionRange(e.value.length,e.value.length)" style="width:100%;max-width:340px">' +
    '<div style="overflow-x:auto"><table class=table><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th></th></tr>' +
    (rows.length ? rows.map(p => `<tr><td><img src="${PE(p.preview || 'img/placeholder.svg')}" alt="" width="48" height="48" style="object-fit:cover;border-radius:8px;background:#ecebfb"></td>
    <td><b>${PE(p.name)}</b><br><small>#${PE(p.id)} · ${PE(p.brand)} · ${PE(p.section)}/${PE(p.type)}${p.sizes && p.sizes.length ? ' · ' + PE(p.sizes.join(',')) : ''}</small></td>
    <td>₹${PE(p.price)}${p.mrp > p.price ? '<br><small><s>₹' + PE(p.mrp) + '</s></small>' : ''}${p.sale ? '<br><small>Sale</small>' : ''}</td>
    <td style="white-space:nowrap"><input type=number min=0 id="st_${PE(p.id)}" value="${PE(p.stock)}" style="width:80px"${p.stock <= 3 ? ' title="Low stock"' : ''}><button onclick="saveStock('${PE(p.id)}')">Save</button>${p.stock <= 0 ? '<br><small style="color:#B3261E">Out of stock</small>' : p.stock <= 3 ? '<br><small style="color:#9A5B00">Low stock</small>' : ''}</td>
    <td style="white-space:nowrap"><button onclick="editProduct('${PE(p.id)}')">Edit</button><button onclick="delProduct('${PE(p.id)}')" style="background:#B3261E">Delete</button></td></tr>`).join('') : '<tr><td colspan=5>No products found.</td></tr>') + '</table></div>';
}
function renderProdForm(p) {
  const isEdit = !!(p && p.id); p = p || {};
  const opt = (list, cur) => list.map(x => `<option${x === cur ? ' selected' : ''}>${PE(x)}</option>`).join('');
  document.getElementById('prodForm').innerHTML = `<h3>${isEdit ? 'Edit product #' + PE(p.id) : 'Add new product'}</h3>
  <input type=hidden id=pId value="${PE(p.id || '')}">
  <div class=cpForm>
   <input id=pName placeholder="Product name" value="${PE(p.name || '')}" style="grid-column:1/-1">
   <input id=pBrand placeholder="Brand" value="${PE(p.brand || 'BRANDON')}">
   <select id=pSection>${opt(PROD.sections, p.section)}</select>
   <select id=pType>${opt(PROD.types, p.type)}</select>
   <input id=pPrice type=number min=1 placeholder="Selling price ₹" value="${PE(p.price || '')}">
   <input id=pMrp type=number min=1 placeholder="MRP (original) ₹" value="${PE(p.mrp || '')}">
   <input id=pStock type=number min=0 placeholder="Stock (quantity)" value="${PE(p.stock === undefined ? '' : p.stock)}">
   <input id=pSizes placeholder="Sizes, comma separated (S,M,L or 28,30,32)" value="${PE((p.sizes || []).join(', '))}" style="grid-column:1/-1">
   <input id=pDesc placeholder="Short description" value="${PE(p.description || '')}" style="grid-column:1/-1">
   <label style="display:flex;align-items:center;gap:8px"><input type=checkbox id=pSale${p.sale ? ' checked' : ''}> Show "Sale" tag</label>
  </div>
  <div style="margin:10px 0"><b>Main photo</b> <small>(JPG/PNG/WEBP, max 5 MB)</small><br>
   <img id=pPrevImg src="${PE(PF.preview || 'img/placeholder.svg')}" alt="" width=90 height=90 style="object-fit:cover;border-radius:10px;background:#ecebfb;vertical-align:middle">
   <input type=file id=pFile accept="image/jpeg,image/png,image/webp" onchange="pickMain(this)"> ${PF.preview ? '<button type=button onclick="PF.preview=\'\';renderProdForm(curForm())" style="background:#6a6890">Remove</button>' : ''}</div>
  <div style="margin:10px 0"><b>Extra photos</b><br><div id=pExtra style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">${PF.photos.map((x, i) => `<span><img src="${PE(x)}" width=64 height=64 alt="" style="object-fit:cover;border-radius:8px"><br><button type=button onclick="PF.photos.splice(${i},1);renderProdForm(curForm())" style="padding:2px 8px;margin:2px;font-size:.75rem;background:#6a6890">✕</button></span>`).join('')}</div>
   <input type=file id=pFiles accept="image/jpeg,image/png,image/webp" multiple onchange="pickExtra(this)"></div>
  <button onclick="saveProduct()">${isEdit ? 'Save changes' : 'Add product'}</button>${isEdit ? '<button type=button onclick="PF={preview:\'\',photos:[]};renderProdForm()" style="background:#6a6890">Cancel</button>' : ''}`;
}
function curForm() { // keep typed values while photos change
  const v = id => (document.getElementById(id) || {}).value;
  return { id: v('pId'), name: v('pName'), brand: v('pBrand'), section: v('pSection'), type: v('pType'), price: v('pPrice'), mrp: v('pMrp'), stock: v('pStock'), sizes: (v('pSizes') || '').split(',').map(x => x.trim()).filter(Boolean), description: v('pDesc'), sale: !!(document.getElementById('pSale') || {}).checked };
}
async function pickMain(inp) { try { const f = inp.files[0]; if (!f) return; const f0 = curForm(); PF.preview = await uploadImage(f); renderProdForm(f0); } catch (e) { alert(e.message); } }
async function pickExtra(inp) { try { const f0 = curForm(); for (const f of inp.files) { if (PF.photos.length >= 8) break; PF.photos.push(await uploadImage(f)); } renderProdForm(f0); } catch (e) { alert(e.message); } }
function editProduct(id) { const p = PROD.products.find(x => String(x.id) === String(id)); if (!p) return; PF = { preview: p.preview || '', photos: (p.photos || []).slice() }; renderProdForm(p); document.getElementById('prodForm').scrollIntoView({ behavior: 'smooth' }); }
async function saveProduct() {
  const b = curForm(); b.preview = PF.preview; b.photos = PF.photos;
  try { await get('/api/admin/products', { method: 'POST', headers: JH, body: JSON.stringify(b) }); PF = { preview: '', photos: [] }; await loadProducts(); alert('Product saved. It is live on the website now.'); } catch (e) { alert(e.message); }
}
async function delProduct(id) { if (!confirm('Delete this product permanently? (Old orders keep their details.)')) return; try { await get('/api/admin/products/' + encodeURIComponent(id), { method: 'DELETE' }); loadProducts(); } catch (e) { alert(e.message); } }
async function saveStock(id) { try { const v = document.getElementById('st_' + id).value; await get('/api/admin/stock/' + encodeURIComponent(id), { method: 'PATCH', headers: JH, body: JSON.stringify({ stock: v }) }); const p = PROD.products.find(x => String(x.id) === String(id)); if (p) p.stock = Number(v); renderProducts(); } catch (e) { alert(e.message); } }

/* ---- Payment settings ---- */
async function loadPay() {
  try {
    const c = await get('/api/admin/payment-settings');
    document.getElementById('payBox').innerHTML = `<div class=cpForm>
      <label style="display:flex;align-items:center;gap:8px"><input type=checkbox id=payCod${c.cod ? ' checked' : ''}> Cash on Delivery</label>
      <label style="display:flex;align-items:center;gap:8px"><input type=checkbox id=payUpi${c.upiEnabled ? ' checked' : ''}> UPI / QR payment</label>
      <input id=payId placeholder="UPI ID e.g. name@oksbi" value="${PE(c.upiId)}">
      <input id=payName placeholder="Name shown to customer" value="${PE(c.payeeName)}"></div>
      <div style="margin:10px 0"><b>UPI QR image</b><br><img id=payQrImg src="${PE(c.qrImage)}?t=${Date.now()}" alt="QR" width=110 height=110 style="object-fit:contain;background:#fff;border:1px solid #dedbf1;border-radius:8px;vertical-align:middle" onerror="this.style.display='none'">
      <input type=file id=payQr accept="image/jpeg,image/png,image/webp"></div>
      <p class=muted>Card/NetBanking (Razorpay): ${c.razorpay ? '<b>ON</b> (keys found in .env)' : 'off - add RAZORPAY keys in .env'}</p>
      <button onclick="savePay('${PE(c.qrImage)}')">Save payment settings</button>`;
  } catch (e) { alert(e.message); }
}
async function savePay(qr) {
  try {
    const f = document.getElementById('payQr').files[0]; if (f) qr = await uploadImage(f, 'qr');
    await get('/api/admin/payment-settings', { method: 'POST', headers: JH, body: JSON.stringify({ cod: document.getElementById('payCod').checked, upiEnabled: document.getElementById('payUpi').checked, upiId: document.getElementById('payId').value, payeeName: document.getElementById('payName').value, qrImage: qr }) });
    alert('Payment settings saved.'); loadPay();
  } catch (e) { alert(e.message); }
}

/* ---- Backup & restore ---- */
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function loadBackups() {
  try {
    const d = await get('/api/admin/backups');
    document.getElementById('backupBox').innerHTML = `
      <p>Data folder: <code>${PE(d.dataDir)}</code>${d.customDataDir ? '' : '<br><small class=muted>Hosting par DATA_DIR ko persistent disk par set karo (.env), warna restart par data ud sakta hai.</small>'}</p>
      <p>Automatic backup: har 6 ghante mein (sirf jab data badla ho), latest 40 copies server par rakhi jaati hain.<br>
      Daily e-mail backup: ${d.emailTo ? '<b>ON</b> → ' + PE(d.emailTo) + (d.lastEmail ? ' (last: ' + PE(new Date(d.lastEmail).toLocaleString()) + ')' : '') : '<b>OFF</b> <small class=muted>(.env mein SMTP_USER / SMTP_PASS bharo)</small>'}</p>
      <button onclick="downloadBackup()">⬇ Download full backup</button>
      <button onclick="backupNow()">Backup now</button>
      ${d.emailTo ? '<button onclick="emailBackup()">E-mail backup now</button>' : ''}
      <div style="margin:12px 0"><b>Restore from file</b> <small class=muted>(replaces current data with the backup; a safety copy is made first)</small><br>
        <input type=file id=restoreFile accept=".json,application/json"><button onclick="restoreFromFile()" style="background:#B3261E">Restore</button></div>
      <h3>Server copies</h3><div style="overflow-x:auto"><table class=table><tr><th>Date (UTC)</th><th>Files</th><th>Size</th><th></th></tr>` +
      (d.backups.length ? d.backups.slice(0, 15).map(b => `<tr><td>${PE(b.name)}</td><td>${PE(b.files)}</td><td>${fmtSize(b.size)}</td><td><button onclick="restoreSnapshot('${PE(b.name)}')" style="background:#B3261E">Restore</button></td></tr>`).join('') : '<tr><td colspan=4>No backups yet.</td></tr>') + '</table></div>';
  } catch (e) { alert(e.message); }
}
async function downloadBackup() {
  try {
    const r = await fetch('/api/admin/backup/download', { headers: { 'x-admin-key': K } });
    if (!r.ok) throw Error((await r.json().catch(() => ({}))).message || 'Download failed');
    const u = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = u; a.download = 'shoplane-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (e) { alert(e.message); }
}
async function backupNow() { try { await get('/api/admin/backups', { method: 'POST' }); loadBackups(); } catch (e) { alert(e.message); } }
async function emailBackup() { try { const d = await get('/api/admin/backups/email', { method: 'POST' }); alert(d.ok ? 'Backup e-mailed to ' + d.to : 'E-mail could not be sent. Check SMTP settings in .env.'); loadBackups(); } catch (e) { alert(e.message); } }
async function restoreFromFile() {
  const f = document.getElementById('restoreFile').files[0]; if (!f) return alert('Choose a backup file first.');
  if (!confirm('Restore will REPLACE all current orders, customers, products, stock and settings with this backup. Continue?')) return;
  try {
    const r = await fetch('/api/admin/backup/restore', { method: 'POST', headers: { 'x-admin-key': K, 'Content-Type': 'application/octet-stream' }, body: f });
    const d = await r.json(); if (!r.ok) throw Error(d.message || 'Restore failed');
    alert('Restored ' + d.files + ' data files and ' + d.images + ' photos.'); loadAdmin();
  } catch (e) { alert(e.message); }
}
async function restoreSnapshot(name) {
  if (!confirm('Restore the copy "' + name + '"? Current data is replaced (a safety copy is made first).')) return;
  try { const d = await get('/api/admin/backups/' + encodeURIComponent(name) + '/restore', { method: 'POST' }); alert('Restored ' + d.files + ' data files.'); loadAdmin(); } catch (e) { alert(e.message); }
}
