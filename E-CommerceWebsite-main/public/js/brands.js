/* Shop by brand: brands.html (all brands) and brands.html?brand=name (that brand's products) */
(function () {
  var root = document.getElementById('catalogRoot');
  var want = (new URLSearchParams(location.search).get('brand') || '').trim().toLowerCase();
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  fetch('/api/products').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (products) {
    var cur = window.slShopBrands.filter(function (b) { return b.key === want; })[0];
    root.innerHTML = '';
    if (!cur) {
      var h = el('div', 'catHead'); h.append(el('h1', '', 'Shop by brand'), el('p', '', want ? 'Brand "' + want + '" not found. Choose from our brands:' : 'Choose a brand to see all its products'));
      var tiles = el('div', 'brandTiles'); tiles.style.padding = '0'; root.append(h, tiles); window.slBrandTiles(tiles, products); return;
    }
    var items = products.filter(function (p) { return window.slBrandMatch(cur, p); });
    var head = el('div', 'catHead'); head.append(el('h1', '', cur.name), el('p', '', items.length + (items.length === 1 ? ' product' : ' products')));
    var crumb = el('p', 'brandCrumb'); var back = el('a', '', '← All brands'); back.href = 'brands.html'; crumb.appendChild(back);
    var bar = el('div', 'brandBar');
    var q = el('input'); q.type = 'search'; q.placeholder = 'Search in ' + cur.name; q.setAttribute('aria-label', 'Search in brand');
    var sort = el('select'); sort.setAttribute('aria-label', 'Sort');
    [['default', 'Sort: Default'], ['low', 'Price: Low to high'], ['high', 'Price: High to low'], ['name', 'Name: A-Z']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; sort.appendChild(op); });
    bar.append(q, sort);
    var grid = el('div', 'catGrid'); root.append(head, crumb, bar, grid);
    document.title = cur.name + ' | BRANDON';
    function draw() {
      var t = q.value.toLowerCase().trim(), list = items.filter(function (p) { return !t || String(p.name || '').toLowerCase().indexOf(t) >= 0; });
      if (sort.value === 'low') list.sort(function (a, b) { return a.price - b.price; });
      if (sort.value === 'high') list.sort(function (a, b) { return b.price - a.price; });
      if (sort.value === 'name') list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      grid.innerHTML = '';
      if (!list.length) grid.appendChild(el('p', 'catLoading', 'No products found.'));
      list.forEach(function (p) { grid.appendChild(window.ShopLaneCatalog.card(p)); });
    }
    q.oninput = draw; sort.onchange = draw; draw();
  }).catch(function () { root.innerHTML = '<p class="catLoading">Products load nahi ho paaye. Internet check karke page refresh karein.</p>'; });
})();
