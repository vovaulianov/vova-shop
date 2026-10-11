/* shop.js — builds the grid from items.json, thirty at a time as you scroll (so it stays quick with thousands),
   and opens an item over it (#id in the address, so a link to an item works). In the 3D version (3d/index.html
   loads view3d.js first) the thing under the pointer becomes a solid that turns after it, and an item's page
   shows the solid, turned by dragging, before its photos. */
(function () {
  var root = document.body.dataset.root || '';
  var three = document.body.classList.contains('three');
  var grid = document.querySelector('.grid'), more = document.querySelector('.more');
  var items = [], shown = 0, pay = '';
  var PAGE = 30;

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн'; }
  function src(p, size) { return root + p[size]; }

  function cell(item) {
    var c = el('div', 'cell' + (item.sold ? ' sold' : ''), grid);
    var pic = el('div', 'pic', c), img = el('img', null, pic);
    img.src = src(item.photos[0], 's'); img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async';
    img.width = item.photos[0].w; img.height = item.photos[0].h;
    var label = el('div', 'label', c);
    label.textContent = item.title;
    el('span', null, label).textContent = item.sold ? 'продано' : money(item.price);
    c.addEventListener('click', function () { location.hash = item.id; });
    if (three && window.view3d) window.view3d.hover(c, item);
  }
  function page() {
    items.slice(shown, shown + PAGE).forEach(cell);
    shown = Math.min(items.length, shown + PAGE);
  }
  new IntersectionObserver(function (e) { if (e[0].isIntersecting && shown < items.length) page(); }, { rootMargin: '800px' }).observe(more);

  /* ---------- an item ---------- */
  var view = document.querySelector('.item');
  function open(item) {
    view.innerHTML = '';
    var stage = el('div', 'stage', view), info = el('div', 'info', view);
    var close = el('button', 'close', view); close.textContent = 'закрити';
    close.addEventListener('click', function () { location.hash = ''; });
    el('h2', null, info).textContent = item.title;
    el('div', 'price', info).textContent = item.sold ? 'продано' : money(item.price);
    if (item.text) el('p', null, info).textContent = item.text;
    var link = item.pay || (pay ? pay + (pay.indexOf('?') < 0 ? '?' : '&') + 'a=' + item.price + '&t=' + encodeURIComponent(item.title) : '');
    if (!item.sold && link) { var a = el('a', null, info); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'купити →'; }

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
    if (three && window.view3d) {
      solid = el('div', 'solid-box', stage);
      thumb(-1, null, '3D');
      item.photos.forEach(function (p, k) { thumb(k, src(p, 's')); });
    } else if (item.photos.length > 1) item.photos.forEach(function (p, k) { thumb(k, src(p, 's')); });
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
      var n = items.filter(function (i) { return !i.sold; }).length, d = n % 10, h = n % 100;
      document.querySelector('.top p').textContent = n + (d === 1 && h !== 11 ? ' річ' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? ' речі' : ' речей');
      page(); route();
    });
})();
