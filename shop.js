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
    c.style.setProperty('--s', item.size || 1);                   /* the box: its size, the photo's proportions */
    c.style.setProperty('--fw', (p0.w / long).toFixed(3));
    c.style.setProperty('--fh', (p0.h / long).toFixed(3));
    c.style.setProperty('--pb', (0.0536 * long / p0.h).toFixed(4));   /* the air under the cut-out, so it stands on the line */
    var pic = el('div', 'pic', c), img = el('img', null, pic);
    img.src = src(item.photos[0], 's'); img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async';
    img.width = item.photos[0].w; img.height = item.photos[0].h;
    var label = el('div', 'label', c);
    label.textContent = item.title;
    tag(item, label, (rand(item.id + 'tag')() - 0.5) * 6);         /* the price sticker, under the name */
    c.addEventListener('click', function () { location.hash = item.id; });
    if (three && window.view3d) { window.view3d.still(c, item); window.view3d.hover(c, item); }
  }
  function page() {
    if (layout === 'chaos' && !shown) {                         /* real proportions: the biggest thing fits the screen */
      var big = items.reduce(function (m, i) { return Math.max(m, i.size || 1); }, 1);
      var cs = getComputedStyle(grid), room = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      grid.style.setProperty('--u', Math.max(26, Math.min(room * 0.8 / big, innerHeight * 0.78 / big, 130)) + 'px');
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
      var big = items.reduce(function (m, i) { return Math.max(m, i.size || 1); }, 1);
      var cs = getComputedStyle(grid), room = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      grid.style.setProperty('--u', Math.max(26, Math.min(room * 0.8 / big, innerHeight * 0.78 / big, 130)) + 'px');
      [].forEach.call(grid.children, function (c) { delete c.dataset.placed; });
      scatter();
    }, 150);
  });
  /* Dropped one after another, like things tipped out onto a floor: each one tries many spots across the width,
     falls as far up as it can without touching anything (a gap all round, and room under it for its name and
     price sticker), and the highest few spots win, with a little luck, so the page has a loose rhythm rather than
     rows. Turned a little, counting the corners the turn sticks out. */
  function scatter() {
    var W = scatteredAt = grid.clientWidth, cells = [].slice.call(grid.children).filter(function (c) { return !c.dataset.placed; });
    var cs = getComputedStyle(grid), pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop);
    W -= pl + pr;                                           /* the floor is inside the padding (the title's column) */
    var edge = Math.max(16, W * 0.04), gap = Math.max(22, W * 0.03), under = 58;
    var last = null;
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
    if (!item.sold && link) { var a = el('a', null, info); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.className = 'buy'; a.textContent = 'купити'; }

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
    if (three && window.view3d) solid = el('div', 'solid-box', stage);   /* the solid alone, no photos */
    else if (item.photos.length > 1) item.photos.forEach(function (p, k) { thumb(k, src(p, 's')); });
    view.classList.add('on');                                     /* shown first: the solid measures the stage */
    document.documentElement.style.overflow = 'hidden';
    if (solid) { window.view3d.stage(solid, item); pick(-1); } else pick(0);
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
      if (layout === 'chaos') {                                /* a rhythm: one big thing, then two small ones by it */
        var bySize = items.slice().sort(function (a, b) { return (b.size || 1) - (a.size || 1); }), mixed = [];
        while (bySize.length) { mixed.push(bySize.shift()); if (bySize.length) mixed.push(bySize.pop()); if (bySize.length > 2) mixed.push(bySize.pop()); }
        items = mixed;
      }
      var n = items.filter(function (i) { return !i.sold; }).length, d = n % 10, h = n % 100;
      document.querySelector('.top p').textContent = n + (d === 1 && h !== 11 ? ' річ' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? ' речі' : ' речей');
      page(); route();

    });
})();
