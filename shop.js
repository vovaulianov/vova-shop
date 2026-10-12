/* shop.js — builds the grid from items.json, thirty at a time as you scroll (so it stays quick with thousands),
   and opens an item over it (#id in the address, so a link to an item works). Things stand on a shelf, each as big
   as its `size` says (1 = a small toy), so their sizes read against each other. In the 3D version (3d/index.html
   loads view3d.js first) each thing in the grid is its solid, which spins round when the pointer is on it, and
   an item's page is the solid alone, turned by dragging. */
(function () {
  var root = document.body.dataset.root || '';
  var three = document.body.classList.contains('three');
  var layout = document.body.dataset.layout || 'shelf';            /* shelf (photos), chaos (home) or one (kept aside) */
  var grid = document.querySelector('.grid'), more = document.querySelector('.more');
  var items = [], shown = 0, pay = '';
  var PAGE = 30;

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function src(p, size) { return root + p[size]; }
  function count(path, title, event) {                       /* goatcounter: a thing opened, «купити» pressed */
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path, title: title, event: !!event });
  }
  /* The 3D code (three.js, big) comes after the page: the grid doesn't wait for it, only spinning things do. */
  var waiting3d = [];
  function when3d(f) { if (window.view3d) f(window.view3d); else waiting3d.push(f); }
  window.addEventListener('view3d', function () { waiting3d.splice(0).forEach(function (f) { f(window.view3d); }); });
  /* A baked still: the thing fills the box and stands on its bottom edge (the same sums as view3d's place2). */
  function placeStill(img, st, pic) {
    var k = Math.min(pic.clientWidth / st.ow, pic.clientHeight / st.oh);
    img.style.position = 'absolute'; img.style.transform = 'none';
    img.style.width = st.cw * k + 'px'; img.style.height = st.ch * k + 'px';
    img.style.left = (pic.clientWidth - st.ow * k) / 2 - (st.ox0 - st.x0) * k + 'px';
    img.style.top = pic.clientHeight - (st.oy0 - st.y0 + st.oh) * k + 'px';
  }
  function shown_(item) {                                       /* on a phone sizes are eased (a painting 7 → 3.9,
                                                                   a record 3.15 → 2.2): small things aren't specks */
    var s = item.size || 1;
    if (innerWidth >= 600) return s;
    return s < 2.6 ? 0.25 + 0.08 * s : Math.min(0.88, 0.3 + 0.1 * s);   /* phone: its long side as a share of the width;
                                                                         small things small enough to go in pairs */
  }
  /* A price sticker, like the green ones from a price gun on old American shelves. */
  function tag(item, parent, tilt) {
    var t = el('span', 'tag' + (item.sold ? ' sold' : ''), parent);
    t.textContent = item.sold ? 'продано' : item.currency === '$' ? '$' + item.price : item.price + ' ' + (item.currency || 'грн');
    if (tilt) t.style.setProperty('--tilt', tilt.toFixed(1) + 'deg');   /* only the paper tilts: turned text renders blurry */
    return t;
  }

  function cell(item) {
    var c = el('div', 'cell' + (item.sold ? ' sold' : ''), grid);
    c.dataset.id = item.id;
    var p0 = item.photos[0], long = Math.max(p0.w, p0.h);
    c.style.setProperty('--s', shown_(item));                   /* the box: its size, the photo's proportions */
    c.style.setProperty('--fw', (p0.w / long).toFixed(3));
    c.style.setProperty('--fh', (p0.h / long).toFixed(3));
    c.style.setProperty('--pb', (0.0536 * long / p0.h).toFixed(4));   /* the air under the cut-out, so it stands on the line */
    var pic = el('div', 'pic', c), img = el('img', null, pic);
    img.src = three && item.still ? src(item.still, 'src') : src(item.photos[0], 's'); img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async';
    img.width = item.photos[0].w; img.height = item.photos[0].h;
    var label = el('div', 'label', c);
    label.textContent = item.title;
    tag(item, label, (rand(item.id + 'tag')() - 0.5) * 6);         /* the price sticker, under the name */
    c.addEventListener('click', function () { location.hash = item.id; });
    if (three && item.still) {                                    /* the finished picture from the start */
      c.classList.add('solid-still'); c._still = item.still;
      var put = function () { placeStill(img, item.still, pic); };
      put(); if (window.ResizeObserver) new ResizeObserver(put).observe(pic);
    }
    if (three) when3d(function (v) { if (!item.still) v.still(c, item); v.hover(c, item); });
  }
  function page() {
    if (layout === 'chaos' && !shown) {                         /* real proportions: the biggest thing fits the screen */
      var big = items.reduce(function (m, i) { return Math.max(m, shown_(i)); }, 1);
      var cs = getComputedStyle(grid), room = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      grid.style.setProperty('--u', (innerWidth < 600 ? room : Math.max(26, Math.min(room * 0.8 / big, innerHeight * 0.78 / big, 130))) + 'px');
    }
    items.slice(shown, shown + PAGE).forEach(cell);
    shown = Math.min(items.length, shown + PAGE);
    if (layout === 'chaos') scatter();
  }

  /* Chaos: things dropped on the floor. Each lands where its id sends it (the same place every visit), turned a
     little, not on top of another; the floor grows as more come. */
  var placed = [];
  function rand(seed) { var x = 0; for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) | 0;
    return function () { x = (x * 1103515245 + 12345) | 0; return ((x >>> 8) & 0xffff) / 0xffff; }; }
  var scatteredAt = 0;
  addEventListener('resize', function () {                     /* a different width: thrown again, from the start */
    if (layout !== 'chaos' || Math.abs(grid.clientWidth - scatteredAt) < 40) return;
    clearTimeout(scatter.t);
    scatter.t = setTimeout(function () {
      placed = []; shown = shown;
      var big = items.reduce(function (m, i) { return Math.max(m, shown_(i)); }, 1);
      var cs = getComputedStyle(grid), room = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      grid.style.setProperty('--u', (innerWidth < 600 ? room : Math.max(26, Math.min(room * 0.8 / big, innerHeight * 0.78 / big, 130))) + 'px');
      [].forEach.call(grid.children, function (c) { delete c.dataset.placed; });
      scatter();
    }, 150);
  });
  /* Dropped one after another, like things tipped out onto a floor: each one tries many spots across the width,
     falls as far up as it can without touching anything (a gap all round, and room under it for its name and
     price sticker), and the highest few spots win, with a little luck, so the page has a loose rhythm rather than
     rows. Turned a little, counting the corners the turn sticks out. */
  /* On a phone: one thing to a row, big, set to the left, the right or the middle in turn, a little off; two
     small things share a row, one a little higher than the other. */
  var phoneY = 0, phoneK = 0;
  function flow(cells, W, pl, pt, under) {
    var gap = 28, i = 0;
    function size(c) { var w0 = c.offsetWidth, h0 = c.querySelector('.pic').offsetHeight; return { w0: w0, h0: h0 }; }
    function put(c, x, y, turn) {
      c.dataset.placed = 1; c.style.left = pl + x + 'px'; c.style.top = pt + y + 'px';
      c.querySelector('.pic').style.transform = 'rotate(' + turn.toFixed(1) + 'deg)';
    }
    if (!placed.length) { phoneY = 8; phoneK = 0; }
    while (i < cells.length) {
      var a = cells[i], r = rand(a.dataset.id), A = size(a), b = cells[i + 1], B = b ? size(b) : null;
      if (B && A.w0 + B.w0 + gap * 1.2 <= W) {             // a pair
        var free = W - A.w0 - B.w0, xa = free * (0.05 + r() * 0.2), xb = W - B.w0 - free * (0.05 + r() * 0.2);
        var lift = (r() - 0.5) * 0.5, ya = phoneY + Math.max(0, lift) * A.h0, yb = phoneY + Math.max(0, -lift) * B.h0;
        put(a, xa, ya, (r() - 0.5) * 8); put(b, xb, yb, (r() - 0.5) * 8);
        phoneY = Math.max(ya + A.h0, yb + B.h0) + under + gap; placed.push({}, {}); i += 2;
      } else {                                            // alone: left, right, middle in turn
        var spare = Math.max(0, W - A.w0), at = [0.12, 0.88, 0.5][phoneK++ % 3];
        put(a, Math.min(spare, Math.max(0, spare * (at + (r() - 0.5) * 0.16))), phoneY, (r() - 0.5) * 7);
        phoneY += A.h0 + under + gap; placed.push({}); i += 1;
      }
    }
    grid.style.height = pt + phoneY + 80 + 'px';
  }
  function scatter() {
    var W = scatteredAt = grid.clientWidth, cells = [].slice.call(grid.children).filter(function (c) { return !c.dataset.placed; });
    var cs = getComputedStyle(grid), pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop);
    W -= pl + pr;                                           /* the floor is inside the padding (the title's column) */
    var edge = Math.max(16, W * 0.04), gap = Math.max(22, W * 0.03), under = 58;
    var last = null;
    if (W < 600) return flow(cells, W, pl, pt, under);
    cells.forEach(function (c) {
      var r = rand(c.dataset.id), turn = (r() - 0.5) * 14, rad = Math.abs(turn) * Math.PI / 180;
      var w0 = c.offsetWidth, h0 = c.querySelector('.pic').offsetHeight;
      var w = w0 * Math.cos(rad) + h0 * Math.sin(rad), h = h0 * Math.cos(rad) + w0 * Math.sin(rad);
      var best = null;
      for (var t = 0; t < 48; t++) {
        var x = edge + (t + r()) / 48 * Math.max(1, W - w - 2 * edge);
        var y = 0;
        placed.forEach(function (p) { if (x < p.x + p.w + gap && p.x < x + w + gap) y = Math.max(y, p.y + p.h + under + gap); });
        var lift = r() * h * 0.35;                           /* not every one falls all the way: rhythm */
        var score = y + lift + (last && Math.abs(x - last.x) < w * 0.4 ? h * 0.5 : 0);
        if (!best || score < best.score) best = { x: x, y: y, w: w, h: h, score: score };
      }
      best.y += r() * gap;
      placed.push(best); last = best;
      c.dataset.placed = 1;
      c.style.left = pl + best.x + (w - w0) / 2 + 'px'; c.style.top = pt + best.y + (h - h0) / 2 + 'px';
      c.querySelector('.pic').style.transform = 'rotate(' + turn.toFixed(1) + 'deg)';   /* the thing turned, its name not */
    });
    grid.style.height = pt + placed.reduce(function (m, p) { return Math.max(m, p.y + p.h + under); }, 0) + 120 + 'px';
  }


  new IntersectionObserver(function (e) { if (e[0].isIntersecting && shown < items.length) page(); }, { rootMargin: '800px' }).observe(more);

  /* ---------- an item ---------- */
  var view = document.querySelector('.item');
  function open(item) {
    view.innerHTML = '';
    var stage = el('div', 'stage', view), info = el('div', 'info', view);
    var close = el('button', 'close', view); close.textContent = 'назад';
    close.addEventListener('click', function () { location.hash = ''; });
    el('h2', null, info).textContent = item.title;
    tag(item, el('div', 'price', info), -4);
    if (item.text) el('p', null, info).textContent = item.text;
    var link = item.pay || (pay ? pay + (pay.indexOf('?') < 0 ? '?' : '&') +                 /* the jar takes hryvnias only */
      ((item.currency || 'грн') === 'грн' ? 'a=' + item.price + '&' : '') + 't=' + encodeURIComponent(item.title) : '');
    if (!item.sold && link) { var a = el('a', null, info); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.className = 'buy'; a.textContent = 'купити';
      a.addEventListener('click', function () { count('купити/' + item.id, 'купити: ' + item.title, true); }); }
    count('річ/' + item.id, item.title);

    var big = el('img', 'photo', stage), solid = null, thumbs = el('div', 'thumbs', stage);
    function pick(k) {                                  /* k = -1: the 3D thing; otherwise a photo */
      big.style.display = k < 0 ? 'none' : '';
      if (solid) solid.style.display = k < 0 ? '' : 'none';
      if (k >= 0) { big.src = src(item.photos[k], 'l'); big.alt = item.title; }
      [].forEach.call(thumbs.children, function (t) { t.classList.toggle('on', +t.dataset.k === k); });
    }
    function thumb(k, path, label) {
      var t = el(path ? 'img' : 'span', null, thumbs); t.dataset.k = k;
      if (path) { t.src = path; t.alt = ''; } else t.textContent = label;
      t.addEventListener('click', function () { pick(k); });
    }
    if (three) solid = el('div', 'solid-box', stage);                    /* the solid alone, no photos */
    else if (item.photos.length > 1) item.photos.forEach(function (p, k) { thumb(k, src(p, 's')); });
    view.classList.add('on');                                     /* shown first: the solid measures the stage */
    document.documentElement.style.overflow = 'hidden';
    if (solid) { pick(-1); when3d(function (v) { if (solid.isConnected) v.stage(solid, item); }); } else pick(0);
  }
  function route() {
    var id = decodeURIComponent(location.hash.slice(1)), item = items.filter(function (i) { return i.id === id; })[0];
    if (item) open(item);
    else { view.classList.remove('on'); view.innerHTML = ''; document.documentElement.style.overflow = ''; }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && view.classList.contains('on')) location.hash = ''; });

  Promise.all([fetch(root + 'items.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
               fetch(root + 'shop.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return {}; })])
    .then(function (r) {
      items = r[0]; pay = (r[1] && r[1].pay) || '';
      if (layout === 'chaos') {                                /* a rhythm: a big thing, a small one, a middle one, */
        var big = [], mid = [], small = [];                    /* a small one, a middle one — and again */
        items.slice().sort(function (a, b) { return (b.size || 1) - (a.size || 1); }).forEach(function (i) {
          ((i.size || 1) >= 5 ? big : (i.size || 1) >= 3 ? mid : small).push(i); });
        var books = mid.filter(function (i) { return i.kind === 'book'; }), others = mid.filter(function (i) { return i.kind !== 'book'; });
        mid = []; while (books.length || others.length) { if (others.length) mid.push(others.shift()); if (books.length) mid.push(books.shift()); }
        var mixed = [], pattern = [big, small, mid, small, mid];
        for (var k = 0; big.length + mid.length + small.length; k++) { var from = pattern[k % 5]; if (from.length) mixed.push(from.shift()); }
        items = mixed;
      }
      var n = items.filter(function (i) { return !i.sold; }).length, d = n % 10, h = n % 100;
      document.querySelector('.top p').textContent = n + (d === 1 && h !== 11 ? ' річ' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? ' речі' : ' речей');
      page(); route();

    });
})();
