/* shop.js — builds the grid from items.json, thirty at a time as you scroll (so it stays quick with thousands),
   and opens an item over it (#id in the address, so a link to an item works). With <body class="three"> things
   lean towards the pointer, and on an item's page one with a photo of its back turns over when dragged. */
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
    if (three) {
      c.addEventListener('pointermove', function (e) {
        var r = pic.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        img.style.transform = 'rotateY(' + (x * 28) + 'deg) rotateX(' + (-y * 22) + 'deg) scale(1.04)';
      });
      c.addEventListener('pointerleave', function () { img.style.transform = ''; });
    }
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

    var showing = 0, holder, big;
    if (three && item.back != null) {
      holder = el('div', 'turn', stage);
      big = el('img', 'front', holder);
      var backImg = el('img', 'back', holder); backImg.src = src(item.photos[item.back], 'l'); backImg.alt = '';
      el('div', 'hint', stage).textContent = 'потягни, щоб перевернути';
      turnable(stage, holder);
    } else {
      big = el('img', null, stage);
    }
    function pick(k) {
      showing = k; big.src = src(item.photos[k], 'l'); big.alt = item.title;
      if (holder) fit(holder, item.photos[k]);
      [].forEach.call(thumbs.children, function (t, i) { t.classList.toggle('on', i === k); });
    }
    var thumbs = el('div', 'thumbs', stage);
    if (item.photos.length > 1) item.photos.forEach(function (p, k) {
      if (holder && k === item.back) { el('span', null, thumbs); return; }
      var t = el('img', null, thumbs); t.src = src(p, 's'); t.alt = '';
      t.addEventListener('click', function () { pick(k); });
    });
    view.classList.add('on');                                     /* shown first: the turning thing measures the stage */
    document.documentElement.style.overflow = 'hidden';
    pick(0);
    if (holder) window.onresize = function () { fit(holder, item.photos[showing]); };
  }
  function fit(holder, p) {                                       /* the turning thing's size: 78 % of the stage */
    var s = holder.parentNode.getBoundingClientRect(), k = Math.min(s.width * 0.78 / p.w, s.height * 0.78 / p.h);
    holder.style.width = p.w * k + 'px'; holder.style.height = p.h * k + 'px';
    [].forEach.call(holder.children, function (i) { i.style.width = '100%'; i.style.height = '100%'; i.style.objectFit = 'contain'; });
  }
  function turnable(stage, holder) {
    var angle = 0, from = null, start = 0;
    function set(a, ease) { holder.style.transition = ease ? 'transform .5s cubic-bezier(.2,.8,.2,1)' : 'none'; holder.style.transform = 'rotateY(' + a + 'deg)'; }
    [].forEach.call(holder.querySelectorAll('img'), function (i) { i.draggable = false; });   /* else the browser drags the picture */
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.thumbs')) return;
      e.preventDefault(); from = e.clientX; start = angle; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
    });
    stage.addEventListener('pointermove', function (e) { if (from === null) return; angle = start + (e.clientX - from) * 0.6; set(angle); });
    function up() { if (from === null) return; from = null; stage.style.cursor = ''; angle = Math.round(angle / 180) * 180; set(angle, true); }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    set(-18); setTimeout(function () { set(0, true); }, 400);   /* a small turn on opening: it can be turned */
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
