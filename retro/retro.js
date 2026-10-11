/* retro.js — fills the 1999 page from the same items.json: categories down the left, hot picks, a list of lots,
   and a lot's page (#id) under the list with a Buy It Now button to the monobank jar. */
(function () {
  var NAMES = ['Антикваріат', 'Книжки, фільми, музика', 'Монети й марки', 'Колекціонування', 'Компʼютери', 'Ляльки, ляльк. будиночки',
               'Ігри та приставки', 'Прикраси', 'Фото та електроніка', 'Кераміка й скло', 'Спорт', 'Іграшки, тягучки', 'Усе інше'];
  function el(tag, parent, cls) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function price(i) { return i.sold ? 'ПРОДАНО' : i.currency === '$' ? '$' + i.price + '.00' : i.price + '.00 грн'; }

  var cats = document.getElementById('cats');
  NAMES.forEach(function (n, k) {
    var a = el('a', cats); a.href = '#'; a.textContent = n;
    if (k === 6 || k === 11) { var s = el('span', a, 'new'); s.textContent = ' NEW!'; }
    el('small', cats).textContent = '(' + (Math.round(Math.abs(Math.sin(k + 1)) * 200000) + 1000) + ')';
  });
  var hits = 0; try { hits = (+localStorage.getItem('retro-hits') || 4021) + 1; localStorage.setItem('retro-hits', hits); } catch (e) { hits = 4022; }
  document.getElementById('hits').textContent = String(hits).padStart(6, '0');

  var pay = '', items = [];
  function lot(i) {
    var row = el('div', document.getElementById('list'), 'lot');
    var ph = el('span', row, 'ph'), img = el('img', ph); img.src = '../' + i.photos[0].s; img.alt = '';
    var t = el('span', row, 't'), a = el('a', t); a.href = '#' + i.id; a.textContent = i.title + (i.sold ? '' : ' !!! L@@K !!!');
    el('br', t); el('span', t, 'camera').textContent = '[фото] ' + (i.photos.length) + ' шт.';
    el('span', row, 'p').textContent = price(i);
  }
  function show() {
    var box = document.getElementById('item'), id = decodeURIComponent(location.hash.slice(1));
    var i = items.filter(function (x) { return x.id === id; })[0];
    box.innerHTML = '';
    if (!i) return;
    el('h2', box).textContent = i.title;
    var pics = el('div', box, 'pics');
    i.photos.slice(0, 4).forEach(function (p) { var im = el('img', pics); im.src = '../' + p.s; im.alt = ''; });
    var tb = el('table', box);
    [['Поточна ціна', price(i)], ['Стан', i.sold ? 'лот закрито' : 'Купи зараз!'], ['Місце', 'Україна'], ['Продавець', 'вова (★★★★★)'],
     ['Опис', i.text || '—']].forEach(function (r) {
      var tr = el('tr', tb); el('td', tr, 'k').textContent = r[0]; var v = el('td', tr); v.textContent = r[1]; if (r[0] === 'Поточна ціна') v.className = 'price';
    });
    var link = i.pay || (pay ? pay + '?' + ((i.currency || 'грн') === 'грн' ? 'a=' + i.price + '&' : '') + 't=' + encodeURIComponent(i.title) : '');
    if (!i.sold && link) { var b = el('a', box, 'bin'); b.href = link; b.target = '_blank'; b.rel = 'noopener'; b.textContent = 'Купити зараз!'; }
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.addEventListener('hashchange', show);
  Promise.all([fetch('../items.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
               fetch('../shop.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return {}; })])
    .then(function (r) {
      items = r[0]; pay = (r[1] && r[1].pay) || '';
      var hot = document.getElementById('hot');
      items.slice(0, 5).forEach(function (i) { var a = el('a', el('li', hot)); a.href = '#' + i.id; a.textContent = i.title; });
      items.forEach(lot);
      show();
    });
})();
