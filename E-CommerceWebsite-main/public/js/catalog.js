/* BRANDON category pages: Fashion Gallery (Men) + Kids Fashion (Boys / Girls) */
(function () {
  var API = '/api/products';
  var TYPE_LABELS = { pant: 'Pants', shirt: 'Shirts', tshirt: 'T-Shirts', short: 'Shorts', dress: 'Dresses', other: 'More Styles' };

  /* Har page ke groups aur unke andar ke sections */
  var PAGES = {
    men: {
      title: 'Fashion Gallery',
      subtitle: "Men's collection",
      groups: [{ key: 'men', label: 'Men', types: ['pant', 'shirt', 'tshirt'] }]
    },
    kids: {
      title: 'Kids Fashion',
      subtitle: 'Boys & Girls collection',
      groups: [
        { key: 'boys', label: 'Boys', types: ['pant', 'tshirt', 'shirt', 'short'] },
        { key: 'girls', label: 'Girls', types: ['pant', 'tshirt', 'shirt', 'short', 'dress'] }
      ]
    }
  };

  /* ---- Classification: product name se section + type nikalta hai ---- */
  function detectSection(name) {
    var n = name.toLowerCase();
    if (/\b(boy|boys)\b/.test(n)) return 'boys';
    if (/\b(girl|girls)\b/.test(n)) return 'girls';
    if (/\b(kid|kids|child|children|toddler|baby|junior)\b/.test(n)) return 'kids';
    if (/\b(women|womens|woman|ladies|lady|female)\b/.test(n)) return 'women';
    if (/\b(men|mens|man|male)\b/.test(n)) return 'men';
    return '';
  }
  function detectType(name) {
    var n = name.toLowerCase();
    if (/\bt[\s-]?shirt|\btees?\b|\bpolo\b/.test(n)) return 'tshirt';
    if (/\bshirts?\b/.test(n)) return 'shirt';
    if (/\bshorts?\b|\bbermuda\b/.test(n)) return 'short';
    if (/\bdress(es)?\b|\bfrocks?\b|\bgown\b/.test(n)) return 'dress';
    if (/\bpants?\b|\btrousers?\b|\bjeans\b|\bjoggers?\b|\bchinos?\b|\bcargos?\b|\bleggings?\b|\btrack\s?pants?\b/.test(n)) return 'pant';
    return 'other';
  }
  function classify(p, overrides) {
    if (p.section && p.type) return { section: p.section, type: p.type };
    var o = overrides && overrides[String(p.id)];
    if (o && o.section) return { section: o.section, type: o.type || detectType(p.name || '') };
    var section = detectSection(p.name || '');
    var type = detectType(p.name || '');
    if (section === 'kids' && type === 'dress') section = 'girls';
    return { section: section, type: type };
  }
  function belongs(cls, groupKey) {
    return cls.section === groupKey || (cls.section === 'kids' && (groupKey === 'boys' || groupKey === 'girls'));
  }

  /* ---- Wishlist / stock helpers (same localStorage keys as baaki site) ---- */
  var WISHLIST_KEY = 'shoplane_wishlist_v1', STOCK_KEY = 'shoplane_stock_v1';
  function jget(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function isWished(id) { return jget(WISHLIST_KEY, '[]').some(function (x) { return String(x) === String(id); }); }
  function updateBadge() { var b = document.getElementById('wishlistBadge'); if (b) b.textContent = jget(WISHLIST_KEY, '[]').length; }
  function toggleWish(id, btn) {
    var w = jget(WISHLIST_KEY, '[]'), s = String(id);
    if (w.map(String).indexOf(s) >= 0) { w = w.filter(function (x) { return String(x) !== s; }); btn.classList.remove('active'); btn.textContent = '♡'; }
    else { w.push(id); btn.classList.add('active'); btn.textContent = '♥'; }
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(w)); updateBadge();
  }
  function stockFor(id) {
    var s = jget(STOCK_KEY, '{}');
    if (s[id] === undefined) { s[id] = 10; localStorage.setItem(STOCK_KEY, JSON.stringify(s)); }
    return Number(s[id]);
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function money(n) { return 'Rs ' + Number(n).toLocaleString('en-IN'); }
  /* same cookie format as the product page, so the cart page keeps working */
  function addToCart(id) {
    var order = id + ' ', counter = 1;
    if (document.cookie.indexOf(',counter=') >= 0) {
      order = id + ' ' + document.cookie.split(',')[0].split('=')[1];
      counter = Number(document.cookie.split(',')[1].split('=')[1]) + 1;
    }
    document.cookie = 'orderId=' + order + ',counter=' + counter;
    var b = document.getElementById('badge'); if (b) b.textContent = counter;
  }

  function card(p) {
    var box = el('div', 'catCard');
    var price = Number(p.price) || 0, mrp = Number(p.mrp) || 0, hasOff = mrp > price;
    var link = el('a', 'catLink'); link.href = 'contentDetails.html?' + p.id;
    var img = el('img'); img.src = p.preview; img.alt = p.name || 'Product'; img.loading = 'lazy';
    var info = el('div', 'catInfo');
    var stock = p.stock !== undefined ? Number(p.stock) : stockFor(p.id);
    var row = el('div', 'priceRow'); row.appendChild(el('strong', 'nowPrice', money(price)));
    if (hasOff) { row.appendChild(el('s', 'mrp', money(mrp))); row.appendChild(el('span', 'offTag', Math.round((mrp - price) / mrp * 100) + '% off')); }
    info.append(el('h3', '', p.name), el('h4', '', p.brand), row);
    if (hasOff) info.appendChild(el('p', 'saveLine', 'You save ' + money(mrp - price)));
    info.appendChild(el('p', 'stockStatus ' + (stock <= 0 ? 'out' : stock <= 3 ? 'low' : ''), stock <= 0 ? 'Out of stock' : stock <= 3 ? 'Only ' + stock + ' left' : 'In stock'));
    link.append(img, info); box.appendChild(link);
    if (p.sale) box.appendChild(el('span', 'saleTag', 'Sale'));
    var w = el('button', 'wishlistBtn' + (isWished(p.id) ? ' active' : ''), isWished(p.id) ? '♥' : '♡');
    w.type = 'button'; w.title = 'Add to wishlist'; w.setAttribute('aria-label', 'Add to wishlist');
    w.onclick = function (e) { e.preventDefault(); e.stopPropagation(); toggleWish(p.id, w); };
    box.appendChild(w);
    var chosen = '', hasSizes = p.sizes && p.sizes.length;
    if (hasSizes) {
      var sizes = el('div', 'cardSizes');
      p.sizes.forEach(function (s) {
        var c = el('button', 'sizeChip', s); c.type = 'button'; c.setAttribute('aria-label', 'Size ' + s);
        c.onclick = function () { chosen = s; Array.prototype.forEach.call(sizes.children, function (x) { x.classList.toggle('active', x === c); }); };
        sizes.appendChild(c);
      });
      box.appendChild(sizes);
    }
    var add = el('button', 'addCartBtn', stock <= 0 ? 'Out of stock' : 'Add to cart'); add.type = 'button'; add.disabled = stock <= 0;
    function flash(t) { add.textContent = t; clearTimeout(add._t); add._t = setTimeout(function () { add.textContent = 'Add to cart'; }, 1400); }
    add.onclick = function () {
      if (!window.ShopLane.requireLogin()) return;
      if (hasSizes && !chosen) { flash('Select a size'); return; }
      addToCart(p.id + (chosen ? '_' + chosen : '')); flash('Added to cart');
    };
    box.appendChild(add);
    return box;
  }

  /* ---- Page render ---- */
  function init(pageKey) {
    var page = PAGES[pageKey];
    var root = document.getElementById('catalogRoot');
    var params = new URLSearchParams(location.search);
    var state = { group: params.get('group') || 'all', type: params.get('type') || 'all', q: (params.get('q') || '').trim().toLowerCase() };
    var products = [], overrides = {};

    function validGroup(k) { return page.groups.some(function (g) { return g.key === k; }); }
    if (!validGroup(state.group)) state.group = 'all';

    function pill(label, active, onclick) {
      var b = el('button', 'pill' + (active ? ' active' : ''), label); b.type = 'button'; b.onclick = onclick; return b;
    }
    function setState(g, t) {
      state.group = g; state.type = t;
      var q = []; if (g !== 'all') q.push('group=' + g); if (t !== 'all') q.push('type=' + t); if (state.q) q.push('q=' + encodeURIComponent(state.q));
      try { history.replaceState(null, '', location.pathname + (q.length ? '?' + q.join('&') : '')); } catch (e) {}
      render();
    }

    function render() {
      root.innerHTML = '';
      var head = el('div', 'catHead');
      head.append(el('h1', '', page.title), el('p', '', page.subtitle));
      root.appendChild(head);

      /* filter pills */
      var bar = el('div', 'catBar');
      if (page.groups.length > 1) {
        var gRow = el('div', 'pillRow');
        gRow.appendChild(pill('All', state.group === 'all', function () { setState('all', state.type); }));
        page.groups.forEach(function (g) { gRow.appendChild(pill(g.label, state.group === g.key, function () { setState(g.key, state.type); })); });
        bar.appendChild(gRow);
      }
      var typeSet = {};
      page.groups.forEach(function (g) { g.types.forEach(function (t) { typeSet[t] = 1; }); });
      var tRow = el('div', 'pillRow');
      tRow.appendChild(pill('All types', state.type === 'all', function () { setState(state.group, 'all'); }));
      Object.keys(TYPE_LABELS).filter(function (t) { return typeSet[t]; }).forEach(function (t) {
        tRow.appendChild(pill(TYPE_LABELS[t], state.type === t, function () { setState(state.group, t); }));
      });
      bar.appendChild(tRow);
      root.appendChild(bar);

      if (state.q) { var note = el('p', 'filterMeta', 'Showing results for "' + state.q + '"  '); var clr = el('a', '', 'Clear search'); clr.href = location.pathname; note.appendChild(clr); root.appendChild(note); }
      var shown = 0;
      page.groups.forEach(function (g) {
        if (state.group !== 'all' && state.group !== g.key) return;
        var wrap = el('section', 'catGroup'); wrap.id = g.key;
        if (page.groups.length > 1) wrap.appendChild(el('h2', 'groupTitle', g.label));
        var types = g.types.slice(); if (state.type === 'all') types.push('other');
        types.forEach(function (t) {
          if (state.type !== 'all' && state.type !== t) return;
          if (state.type !== 'all' && g.types.indexOf(t) < 0) return;
          var items = products.filter(function (p) { return p._cls.type === t && belongs(p._cls, g.key) && (!state.q || (String(p.name || '') + ' ' + String(p.brand || '') + ' ' + t).toLowerCase().indexOf(state.q) >= 0); });
          if (t === 'other' && !items.length) return;
          var sec = el('div', 'catSection'); sec.id = g.key + '-' + t;
          sec.appendChild(el('h3', 'sectionTitle', TYPE_LABELS[t] + ' (' + items.length + ')'));
          if (items.length) { var grid = el('div', 'catGrid'); items.forEach(function (p) { grid.appendChild(card(p)); }); sec.appendChild(grid); shown += items.length; }
          else sec.appendChild(el('p', 'emptyNote', 'Is section me abhi koi product nahi hai. Jaldi hi naye products aayenge.'));
          wrap.appendChild(sec);
        });
        root.appendChild(wrap);
      });
      updateBadge();
    }

    root.innerHTML = '<p class="catLoading">Loading products...</p>';
    Promise.all([
      fetch(API).then(function (r) { if (!r.ok) throw new Error('api'); return r.json(); }),
      fetch('data/categories.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (res) {
      overrides = (res[1] && res[1].overrides) || {};
      products = res[0].map(function (p) { p._cls = classify(p, overrides); return p; });
      render();
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    }).catch(function () {
      root.innerHTML = '<p class="catLoading">Products load nahi ho paaye. Internet check karke page refresh karein.</p>';
    });
  }

  window.ShopLaneCatalog = { init: init, classify: classify, PAGES: PAGES, card: card };
})();
