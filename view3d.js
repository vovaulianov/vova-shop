/* view3d.js — the 3D version: each thing as a solid you can turn, built in the browser from its cut-out photo.

   The outline of the front photo (made by tools/cutting.py) is pushed out into a body: a flat thing (a case,
   a console) a few millimetres thick with crisp edges; anything else (a toy) fuller, with soft rounded edges.
   The front photo is printed on the front, the back photo (if there is one) on the back, fitted to the same
   outline and mirrored; the sides take the colour of the thing's edge. Studio light, soft reflections and a
   no shadow (the user asked). In the grid each thing is a still of its solid; one WebGL canvas, shared, moves into the
   cell under the pointer and spins the thing round. On a thing's page it turns by dragging, and slowly by itself. */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const root = document.body.dataset.root || '';
const loader = new THREE.TextureLoader();
const models = new Map();

function texture(path) {
  return new Promise((ok, fail) => loader.load(root + path, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; ok(t);
  }, undefined, fail));
}

/* The outline as a smooth curve: points spaced evenly round it, then each averaged with its neighbours, so
   corners come out softly rounded (by about 1 % of the way round) instead of as joined straight pieces. */
function smooth(pts, n = 480, sigma = 4) {
  const P = pts.map(p => [p[0], p[1]]), L = [0];
  for (let i = 1; i <= P.length; i++) { const a = P[i - 1], b = P[i % P.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = L[P.length], even = [];
  for (let k = 0, j = 0; k < n; k++) {
    const d = total * k / n; while (L[j + 1] < d) j++;
    const a = P[j], b = P[(j + 1) % P.length], t = (d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    even.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  const w = []; for (let k = -3 * sigma; k <= 3 * sigma; k++) w.push(Math.exp(-k * k / (2 * sigma * sigma)));
  const W = w.reduce((x, y) => x + y);
  return even.map((_, i) => {
    let x = 0, y = 0;
    w.forEach((wk, k) => { const q = even[(i + k - 3 * sigma + n) % n]; x += q[0] * wk; y += q[1] * wk; });
    return [x / W, y / W];
  });
}

function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function edgeColour(img, outline) {                      // the average colour just inside the outline
  const c = document.createElement('canvas'), w = c.width = 128, h = c.height = Math.round(128 * img.height / img.width);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, cx = 0.5, cy = 0.5;
  let r = 0, gr = 0, b = 0, n = 0;
  outline.forEach(([x, y]) => {
    const px = Math.round((x + (cx - x) * 0.04) * (w - 1)), py = Math.round((y + (cy - y) * 0.04) * (h - 1)), i = (py * w + px) * 4;
    if (d[i + 3] > 200) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
  });
  return n ? new THREE.Color(`rgb(${Math.round(r / n * 0.85)},${Math.round(gr / n * 0.85)},${Math.round(b / n * 0.85)})`) : new THREE.Color(0xdddddd);
}

/* Anything that isn't flat (a toy, a figure): blown up like a cushion instead. A grid over the photo; each point
   inside the outline rises by the square root of its distance from the edge, so the middle is full and the edges
   meet at nothing; the back goes the other way. The photo's own transparency trims the grid to the exact outline,
   so the edge is as clean as the cut-out. */
function relief(front, back, ft, bt, depthScale = 0.8, lathe = false) {
  const aspect = front.h / front.w, fb = bbox(front.outline);
  const img = ft.image, R = 480;
  const W = Math.round(R * (fb.x1 - fb.x0) / Math.max(fb.x1 - fb.x0, (fb.y1 - fb.y0) * aspect));
  const H = Math.round(R * (fb.y1 - fb.y0) * aspect / Math.max(fb.x1 - fb.x0, (fb.y1 - fb.y0) * aspect));
  const c = document.createElement('canvas'); c.width = W + 1; c.height = H + 1;
  const g = c.getContext('2d');
  g.drawImage(img, fb.x0 * img.width, fb.y0 * img.height, (fb.x1 - fb.x0) * img.width, (fb.y1 - fb.y0) * img.height, 0, 0, W + 1, H + 1);
  const a = g.getImageData(0, 0, W + 1, H + 1).data;
  const n = (W + 1) * (H + 1), inside = new Uint8Array(n), d = new Float32Array(n);
  for (let i = 0; i < n; i++) inside[i] = a[i * 4 + 3] > 100 ? 1 : 0;
  const at = (x, y) => y * (W + 1) + x;
  /* Round, as if every part were a tube: d is the distance to the edge, a the distance to the middle line of the
     part (where d peaks). A tube of radius R = d + a has, at that point, depth √(R² − a²) = √(d (d + 2a)): a
     kettle's body comes out a cylinder, its handle and a jezve's a round bar, where they join they blend. */
  function chamfer(f) {                                  // distances inside the shape, from where f is 0
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      const i = at(x, y); if (!inside[i] || f[i] === 0) continue;
      let v = f[i];
      if (x > 0) v = Math.min(v, f[at(x - 1, y)] + 1);
      if (y > 0) { v = Math.min(v, f[at(x, y - 1)] + 1); if (x > 0) v = Math.min(v, f[at(x - 1, y - 1)] + 1.414); if (x < W) v = Math.min(v, f[at(x + 1, y - 1)] + 1.414); }
      f[i] = v;
    }
    for (let y = H; y >= 0; y--) for (let x = W; x >= 0; x--) {
      const i = at(x, y); if (!inside[i] || f[i] === 0) continue;
      let v = f[i];
      if (x < W) v = Math.min(v, f[at(x + 1, y)] + 1);
      if (y < H) { v = Math.min(v, f[at(x, y + 1)] + 1); if (x < W) v = Math.min(v, f[at(x + 1, y + 1)] + 1.414); if (x > 0) v = Math.min(v, f[at(x - 1, y + 1)] + 1.414); }
      f[i] = v;
    }
  }
  const de = new Float32Array(n);
  for (let i = 0; i < n; i++) de[i] = inside[i] ? 1e9 : 0;
  chamfer(de);
  for (let pass = 0; pass < 3; pass++) {                 // a smoother distance: a cleaner middle line
    const e = de.slice();
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      const i = at(x, y); if (!inside[i]) continue;
      e[i] = (de[i] * 4 + de[at(x - 1, y)] + de[at(x + 1, y)] + de[at(x, y - 1)] + de[at(x, y + 1)]) / 8;
    }
    de.set(e);
  }
  const am = new Float32Array(n);
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const i = at(x, y);
    if (!inside[i]) { am[i] = 0; continue; }
    let ridge = de[i] > 2;
    for (let dy = -1; dy <= 1 && ridge; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx > W || yy > H) continue;
      if (de[at(xx, yy)] > de[i] + 1e-4) { ridge = false; break; }
    }
    am[i] = ridge ? 0 : 1e9;
  }
  chamfer(am);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) { d[i] = 0; continue; }
    const dd = Math.max(0, de[i] - 1), aa = Math.min(am[i], 4 * dd + 8);
    d[i] = Math.sqrt(dd * (dd + 2 * aa));
  }
  let latheC = 0, latheR = null;
  const body = new Uint8Array(n);
  if (lathe) {
    /* Turned on a lathe (a kettle, a jezve): an upright axis through the middle of the body; across it each row
       is a circle as wide as the body is there (smoothed down the rows: no ribs). What sticks out past the body
       (a handle) is a round bar, as thick as it is tall or wide there. */
    const col = new Float32Array(W + 1);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) col[x] += inside[at(x, y)];
    const top = Math.max(...col); let sx_ = 0, sn = 0;
    for (let x = 0; x <= W; x++) if (col[x] > top * 0.8) { sx_ += x; sn++; }
    const c = sx_ / sn, ci = Math.round(c);
    const R = new Float32Array(H + 1);
    for (let y = 0; y <= H; y++) {
      if (!inside[at(ci, y)]) continue;
      let l = ci, r = ci; while (l > 0 && inside[at(l - 1, y)]) l--; while (r < W && inside[at(r + 1, y)]) r++;
      R[y] = Math.min(c - l, r - c) + 0.5;
    }
    for (let pass = 0; pass < 40; pass++) { const e = R.slice(); for (let y = 1; y < H; y++) if (R[y] && R[y - 1] && R[y + 1]) e[y] = (R[y - 1] + 2 * R[y] + R[y + 1]) / 4; R.set(e); }
    latheC = c; latheR = R;
    const runV = (x, y) => { let t = y, b = y; while (t > 0 && inside[at(x, t - 1)]) t--; while (b < H && inside[at(x, b + 1)]) b++; return [t, b]; };
    const runH = (x, y) => { let l = x, r = x; while (l > 0 && inside[at(l - 1, y)]) l--; while (r < W && inside[at(r + 1, y)]) r++; return [l, r]; };
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      const i = at(x, y); if (!inside[i]) { d[i] = 0; continue; }
      const off = Math.abs(x - c);
      if (R[y] && off <= R[y] + 1.5) { d[i] = 0; body[i] = 1; continue; }   /* the body: its own turned mesh below */
      const [l, r] = runH(x, y), [t, b] = runV(x, y);
      const rr = r - l < b - t ? [(r - l + 1) / 2, x - (l + r) / 2] : [(b - t + 1) / 2, y - (t + b) / 2];
      d[i] = Math.sqrt(Math.max(0, rr[0] * rr[0] - rr[1] * rr[1]));
    }
  }
  for (let pass = 0; pass < 8; pass++) {                 // smoothed, so the joins blend
    const e = d.slice();
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      const i = at(x, y); if (!inside[i] || de[i] < 2) continue;
      e[i] = (d[i] * 4 + d[at(x - 1, y)] + d[at(x + 1, y)] + d[at(x, y - 1)] + d[at(x, y + 1)]) / 8;
    }
    d.set(e);
  }
  const sx = (fb.x1 - fb.x0) / W, sy = (fb.y1 - fb.y0) * aspect / H, depth = depthScale * sx;
  const bb = back ? bbox(back.outline) : null;
  function sheet(side) {
    const pos = [], uv = [], uv1 = [], idx = [];
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      const i = at(x, y), u = fb.x0 + (x / W) * (fb.x1 - fb.x0), v = 1 - (fb.y0 + (y / H) * (fb.y1 - fb.y0));
      const h = inside[i] ? depth * d[i] : 0;   /* the edge itself at 0, where front and back meet */
      pos.push(fb.x0 + x * sx, (1 - fb.y0) * aspect - y * sy, side * h);
      uv1.push(u, v);
      if (side > 0 || !bb) uv.push(u, v);
      else uv.push(bb.x0 + (1 - x / W) * (bb.x1 - bb.x0), 1 - (bb.y0 + (y / H) * (bb.y1 - bb.y0)));
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = at(x, y), q = at(x + 1, y), r = at(x, y + 1), t = at(x + 1, y + 1);
      if (!(inside[p] || inside[q] || inside[r] || inside[t])) continue;
      if (lathe && body[p] && body[q] && body[r] && body[t]) continue;
      if (side > 0) idx.push(p, r, q, q, r, t); else idx.push(p, q, r, q, t, r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  const shape = new THREE.CanvasTexture((() => {             // the outline as white-on-black, for the back's edge
    const m = document.createElement('canvas'); m.width = img.width; m.height = img.height;
    const mg = m.getContext('2d');
    const r = Math.max(2, Math.round(img.width / 260));   // a few pixels wider than the front: the seam closes
    for (let k = 0; k < 16; k++) mg.drawImage(img, Math.round(r * Math.cos(k * Math.PI / 8)), Math.round(r * Math.sin(k * Math.PI / 8)));
    mg.globalCompositeOperation = 'source-in'; mg.fillStyle = '#fff'; mg.fillRect(0, 0, m.width, m.height);
    mg.globalCompositeOperation = 'destination-over'; mg.fillStyle = '#000'; mg.fillRect(0, 0, m.width, m.height);
    return m;
  })());
  shape.channel = 1;
  const frontMat = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, roughness: 0.45, side: THREE.FrontSide });
  let backTex = ft;
  if (bt) {                                              // the back photo made solid: where its outline and the
    const bi = bt.image, o = document.createElement('canvas');   // front's differ, its own colour fills in
    o.width = bi.width; o.height = bi.height;
    const og = o.getContext('2d');
    og.fillStyle = '#' + edgeColour(bi, back.outline).getHexString(); og.fillRect(0, 0, o.width, o.height);
    og.filter = 'blur(24px)'; for (let k = 0; k < 6; k++) og.drawImage(bi, 0, 0);
    og.filter = 'none'; og.drawImage(bi, 0, 0);
    backTex = new THREE.CanvasTexture(o); backTex.colorSpace = THREE.SRGBColorSpace; backTex.anisotropy = 8;
  }
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, alphaMap: shape, alphaTest: 0.5, roughness: 0.45 });
  const group = new THREE.Group();
  if (lathe) {                                           // the body, turned: rings round the axis, front photo on the
    const N = 48, rows = [];                             // front half, back photo (mirrored) on the back half
    for (let y = 0; y <= H; y++) if (latheR[y] > 0.5) rows.push(y);
    const half = (from, to, tex, mirror) => {
      const pos = [], uv = [], idx = [];
      rows.forEach(y => {
        const R = latheR[y], v = 1 - (fb.y0 + (y / H) * (fb.y1 - fb.y0));
        for (let k = 0; k <= N; k++) {
          const th = from + (to - from) * k / N, xs = latheC + R * Math.sin(th);
          pos.push(fb.x0 + xs * sx, (1 - fb.y0) * aspect - y * sy, R * sx * Math.cos(th) * depthScale);
          const s_ = xs / W;
          uv.push(mirror && bb ? bb.x0 + (1 - s_) * (bb.x1 - bb.x0) : fb.x0 + s_ * (fb.x1 - fb.x0),
                  mirror && bb ? 1 - (bb.y0 + (y / H) * (bb.y1 - bb.y0)) : v);
        }
      });
      for (let r = 0; r < rows.length - 1; r++) {
        if (rows[r + 1] - rows[r] > 2) continue;
        for (let k = 0; k < N; k++) {
          const a = r * (N + 1) + k, b = a + 1, c2 = a + N + 1, d2 = c2 + 1;
          idx.push(a, c2, b, b, c2, d2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, side: THREE.DoubleSide }));
    };
    group.add(half(-Math.PI / 2, Math.PI / 2, ft, false), half(Math.PI / 2, Math.PI * 1.5, bt ? backTex : ft, true));
    const capColour = edgeColour(img, front.outline);
    [rows[0], rows[rows.length - 1]].forEach(y => {         // flat top and bottom
      const cap = new THREE.Mesh(new THREE.CircleGeometry(latheR[y] * sx, N), new THREE.MeshStandardMaterial({ color: capColour, roughness: 0.6, side: THREE.DoubleSide }));
      cap.rotation.x = -Math.PI / 2; cap.scale.z = 1; cap.scale.y = depthScale;
      cap.position.set(fb.x0 + latheC * sx, (1 - fb.y0) * aspect - y * sy, 0);
      group.add(cap);
    });
  }
  [[sheet(1), frontMat, ft], [sheet(-1), backMat, null]].forEach(([geo, mat, depthMap]) => {
    const m = new THREE.Mesh(geo, mat);
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: depthMap ? null : shape, map: depthMap, alphaTest: 0.5 });
    group.add(m);
  });
  return group;
}

/* What each kind of thing is made of. depth: thickness as a share of its long side (from real sizes: a record
   sleeve 0.5 cm on 31, a canvas on its stretcher 2.5 cm on 70, a hardback 3 cm on 30, a toaster 13 cm on 30).
   sides: wrap — the picture carries on round the edge (a canvas wrapped round its stretcher, a sleeve's card, a
   case's plastic); book — cream page edges on three sides between the boards, the spine in the cover's colour. */
const KINDS = {                                         // corner: rounding of a rectangular thing's corners
  book:     { depth: 0.1,   bevel: 0.004, sides: 'book', corner: 0.012 },
  painting: { depth: 0.036, bevel: 0.002, sides: 'wrap', corner: 0.002, weave: true },
  vinyl:    { depth: 0.012, bevel: 0.0015, sides: 'wrap', corner: 0.006 },
  case:     { depth: 0.08,  bevel: 0.01,  sides: 'wrap', corner: 0.04 },
  device:   { depth: 0.06,  bevel: 0.02,  sides: 'wrap' },
  box:      { depth: 0.45,  bevel: 0.05,  sides: 'wrap', corner: 0.05 },
};

function roundRect(x0, y0, x1, y1, r) {                  // a rectangle with corners rounded by r
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function weaveTexture() {                                // canvas weave, felt more than seen, for paintings
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), d = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const v = 128 + 40 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + (Math.random() - 0.5) * 30, i = (y * 128 + x) * 4;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60);
  return t;
}

function pagesTexture(cover) {                           // boards at both faces, pages between, fine lines
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ebdc'; g.fillRect(0, 0, 64, 512);
  for (let y = 46; y < 466; y += 3) { g.fillStyle = 'rgba(120,105,80,' + (0.08 + Math.random() * 0.1) + ')'; g.fillRect(0, y, 64, 1); }
  g.fillStyle = '#' + cover.getHexString(); g.fillRect(0, 0, 64, 44); g.fillRect(0, 468, 64, 44);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

function stripColour(img, fb, side) {                    // the average colour of a thin strip along one side
  const c = document.createElement('canvas'), w = c.width = 64, h = c.height = Math.round(64 * img.height / img.width);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let r = 0, gg = 0, b = 0, n = 0;
  const x = Math.round((side === 'left' ? fb.x0 + 0.012 : fb.x1 - 0.012) * (w - 1));
  for (let y = Math.round(fb.y0 * h) + 2; y < fb.y1 * h - 2; y++) {
    const i = (y * w + x) * 4; if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  }
  return n ? new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`) : new THREE.Color(0x333333);
}

export async function model(item) {
  if (models.has(item.id)) return models.get(item.id);
  const job = (async () => {
    const front = item.photos[0], back = item.back != null ? item.photos[item.back] : null;
    const [ft, bt] = await Promise.all([texture(front.l), back ? texture(back.l) : null]);
    const kindName = item.kind || (front.flat ? 'case' : 'round');
    if (kindName === 'round' || kindName === 'lathe') return fit(relief(front, back, ft, bt, item.depth || 0.8, kindName === 'lathe'));
    const kind = KINDS[kindName] || KINDS.case;
    const aspect = front.h / front.w;                    // shape units: the photo is 1 wide, `aspect` tall
    const pts = smooth(front.outline.map(([x, y]) => [x, y * aspect])).map(([x, y]) => new THREE.Vector2(x, aspect - y));
    const fb = bbox(front.outline), long = Math.max(fb.x1 - fb.x0, (fb.y1 - fb.y0) * aspect);
    const shape = kind.corner != null && front.flat                /* straightened rectangles: clean sides, own corners */
      ? roundRect(fb.x0, aspect * (1 - fb.y1), fb.x1, aspect * (1 - fb.y0), kind.corner * long)
      : new THREE.Shape(pts);
    const depth = long * (item.depth || kind.depth), bevel = long * kind.bevel;
    const span = depth + 2 * bevel;
    const uv = {
      generateTopUV: (g, v, a, b, c) => [a, b, c].map(i => new THREE.Vector2(v[i * 3], v[i * 3 + 1] / aspect)),
      generateSideWallUV: kind.sides === 'book'
        ? (g, v, a, b, c, d) => [a, b, c, d].map(i => new THREE.Vector2((v[i * 3] + v[i * 3 + 1]) * 3, (v[i * 3 + 2] + bevel) / span))
        : (g, v, a, b, c, d) => [a, b, c, d].map(i => new THREE.Vector2(v[i * 3], v[i * 3 + 1] / aspect)),
    };
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
      bevelSegments: 6, curveSegments: 12, UVGenerator: uv,    /* the rounding goes inwards: the outline stays the photo's */
    });
    const idx = geo.index ? geo.index.array : null, pos = geo.attributes.position;
    const tri = idx ? i => [idx[i], idx[i + 1], idx[i + 2]] : i => [i, i + 1, i + 2];
    const caps = geo.groups[0], frontTris = [], backTris = [];
    for (let i = caps.start; i < caps.start + caps.count; i += 3) {
      const t = tri(i), z = (pos.getZ(t[0]) + pos.getZ(t[1]) + pos.getZ(t[2])) / 3;
      (z > depth / 2 ? frontTris : backTris).push(...t);
    }
    const sides = geo.groups[1], edgeTris = [], spineTris = [];
    const spineX = fb.x0 + (fb.x1 - fb.x0) * 0.03;
    for (let i = sides.start; i < sides.start + sides.count; i += 3) {
      const t = tri(i), x = (pos.getX(t[0]) + pos.getX(t[1]) + pos.getX(t[2])) / 3;
      (kind.sides === 'book' && x < spineX ? spineTris : edgeTris).push(...t);
    }
    geo.setIndex([...frontTris, ...backTris, ...edgeTris, ...spineTris]);
    geo.clearGroups();
    geo.addGroup(0, frontTris.length, 0);
    geo.addGroup(frontTris.length, backTris.length, 1);
    geo.addGroup(frontTris.length + backTris.length, edgeTris.length, 2);
    geo.addGroup(frontTris.length + backTris.length + edgeTris.length, spineTris.length, 3);
    if (bt) {                                             // the back photo on the back: mirrored, fitted to the outline
      const bb = bbox(back.outline), uvs = geo.attributes.uv;
      backTris.forEach(i => {
        const x = pos.getX(i), y = pos.getY(i) / aspect;
        const s = (x - fb.x0) / (fb.x1 - fb.x0), t = (y - (1 - fb.y1)) / (fb.y1 - fb.y0);
        uvs.setXY(i, bb.x0 + (1 - s) * (bb.x1 - bb.x0), (1 - bb.y1) + t * (bb.y1 - bb.y0));
      });
    }
    geo.computeVertexNormals();
    const rough = kindName === 'vinyl' || kindName === 'book' ? 0.7 : kindName === 'painting' ? 0.85 : 0.4;
    const faceMat = new THREE.MeshStandardMaterial({ map: ft, roughness: rough, ...(kind.weave ? { bumpMap: weaveTexture(), bumpScale: 0.6 } : {}) });
    const cover = stripColour(ft.image, fb, 'left');
    const mats = [
      faceMat,
      bt ? new THREE.MeshStandardMaterial({ map: bt, roughness: rough }) : new THREE.MeshStandardMaterial({ color: edgeColour(ft.image, front.outline), roughness: rough }),
      kind.sides === 'book' ? new THREE.MeshStandardMaterial({ map: pagesTexture(cover), roughness: 0.9 }) : faceMat,
      new THREE.MeshStandardMaterial({ color: cover, roughness: 0.6 }),
    ];
    const inner = new THREE.Group(); inner.add(new THREE.Mesh(geo, mats));
    return fit(inner);
  })();
  models.set(item.id, job);
  return job;
}

function fit(inner) {                                    // centred, and every thing fits the same box
  const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  inner.position.sub(c);
  const group = new THREE.Group(); group.add(inner);
  group.scale.setScalar(1 / Math.max(sz.x, sz.y));
  group.userData.height = sz.y / Math.max(sz.x, sz.y);
  return group;
}

/* Looks to choose from (?look=… shows one): how the studio is lit, and a finishing touch on the picture. */
export const LOOKS = {
  now:  { key: 1.3, hemi: 0.45, env: 0.55, filter: '' },
  soft: { key: 0.5, hemi: 1.15, env: 0.85, filter: 'contrast(.88) saturate(.88)' },   // the photos carry their own light: soft 3D shading on top   // no blur: on a turned still it smeared
  film: { key: 0.9, hemi: 0.75, env: 0.6, filter: 'contrast(.8) saturate(.7) sepia(.18) brightness(1.04) blur(.3px)' },
  airy: { key: 0.55, hemi: 1.05, env: 0.9, filter: 'contrast(.7) brightness(1.12) saturate(.75) blur(.2px)' },
};
const look = LOOKS[new URLSearchParams(location.search).get('look')] || LOOKS.soft;   // «б, мʼяко», the user's choice
if (look.filter) {
  const st = document.createElement('style');
  st.textContent = '.cell .pic img, .cell .pic canvas, .item .solid-box canvas { filter: ' + look.filter + '; }';
  document.head.appendChild(st);
}

function stageScene() {                                  // no shadow: the things stand on nothing but white
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, look.key);
  key.position.set(1.2, 2.2, 2.4);
  const fill = new THREE.DirectionalLight(0xffffff, look.key * 0.7);   // from behind: a turned thing's back isn't in the dark
  fill.position.set(-1.4, 1.8, -2.4);
  scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0xe8e4de, look.hemi));
  scene.environmentIntensity = look.env;
  scene.userData.ground = new THREE.Object3D();
  return scene;
}

function renderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio));
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;   /* keeps the colours of the thing true */
  r.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(r);
  r.userData = { env: pm.fromScene(new RoomEnvironment(), 0.04).texture };
  return r;
}

function place(scene, group) {
  scene.children.filter(o => o.userData.thing).forEach(o => scene.remove(o));
  group.userData.thing = true;
  group.position.y = group.userData.height / 2 + 0.02;   // standing on the ground, a hair above
  scene.add(group);
  scene.userData.ground.position.y = 0;
}

/* ---------- the grid: each thing is a still of its solid; on hover the solid itself spins round ---------- */
// Two of them: one draws the stills, one the thing that spins. Sharing one let a still being drawn move the
// camera (and take the thing) from under the spinning one, so it jumped in size.
const contexts = {};
function shared(kind = 'live') {
  if (contexts[kind]) return contexts[kind];
  const canvas = document.createElement('canvas');
  canvas.className = 'live';
  const r = renderer(canvas), scene = stageScene();
  scene.environment = r.userData.env;
  return contexts[kind] = { canvas, r, scene, cam: new THREE.PerspectiveCamera(22, 1, 0.1, 30), cell: null, ry: 0, loop: null, queue: Promise.resolve() };
}
const ROOM = 3.2;                                        // the render is 3.2× the box: the shadow fits at any turn
function frame(g, group, w, h, room = 1) {               // the camera so the thing fills w/room × h/room
  const fw = w / room, fh = h / room;
  const box = new THREE.Box3().setFromObject(group), sz = box.getSize(new THREE.Vector3());
  const across = Math.max(sz.x, sz.z) * 1.08, tall = group.userData.height * 1.12, half = Math.tan(THREE.MathUtils.degToRad(11));
  const dist = Math.max(tall / 2 / half, across / 2 / (half * fw / fh)) * room + Math.max(sz.x, sz.z) / 2;
  g.cam.aspect = w / h; g.cam.updateProjectionMatrix();
  g.cam.position.set(0, group.userData.height * 0.5 + dist * 0.09, dist);
  g.cam.lookAt(0, group.userData.height * 0.44, 0);
  g.r.setSize(w, h, false);
  g.canvas.style.width = w + 'px'; g.canvas.style.height = h + 'px';
}
export function still(cell, item) {                      // rendered once, when the cell comes near the screen
  const seen = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return;
    seen.disconnect();
    const g = shared('stills');
    g.queue = g.queue.then(async () => {
      const group = await model(item), pic = cell.querySelector('.pic'), img = pic.querySelector('img');
      const w = pic.clientWidth, h = pic.clientHeight;
      if (!w || !h) return;
      place(g.scene, group); group.rotation.set(0, 0, 0);
      g.r.setPixelRatio(2);                               // sharp, also on a phone's screen
      frame(g, group, w * ROOM, h * ROOM, ROOM);
      g.r.render(g.scene, g.cam);
      const cut = crop(g.canvas);                          // trimmed to the thing and its shadow: it stands on the shelf
      img.src = cut.url;
      cell._still = { W: g.canvas.width, H: g.canvas.height, ...cut };   // where the still sits in the full render
      place2(img, cell._still, pic);
      new ResizeObserver(() => place2(img, cell._still, pic)).observe(pic);
      g.r.setPixelRatio(Math.min(2, devicePixelRatio));
      cell.classList.add('solid-still');
    }).catch(() => {});
  }, { rootMargin: '600px' });
  seen.observe(cell);
}
function crop(canvas) {                                  // trimmed to thing + shadow; the thing's own box kept too
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d'); g.drawImage(canvas, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0, ox0 = c.width, oy0 = c.height, ox1 = 0, oy1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const a = d[(y * c.width + x) * 4 + 3];
    if (a > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (a > 200) { if (x < ox0) ox0 = x; if (x > ox1) ox1 = x; if (y < oy0) oy0 = y; if (y > oy1) oy1 = y; }
  }
  if (x1 <= x0) { x0 = y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
  if (ox1 <= ox0) { ox0 = x0; oy0 = y0; ox1 = x1; oy1 = y1; }
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { url: o.toDataURL('image/png'), x0, y0, cw: o.width, ch: o.height, ox0, oy0, ow: ox1 - ox0 + 1, oh: oy1 - oy0 + 1 };
}
/* Where a still (or the live canvas, which is the same render) goes: the thing itself fills the box and stands on
   its bottom edge; the shadow is free to spill out of it. */
function fitStill(st, pic) {
  const k = Math.min(pic.clientWidth / st.ow, pic.clientHeight / st.oh);
  return { k, left: (pic.clientWidth - st.ow * k) / 2 - (st.ox0 - st.x0) * k, top: pic.clientHeight - (st.oy0 - st.y0 + st.oh) * k };
}
export function place2(img, st, pic) {
  const f = fitStill(st, pic);
  Object.assign(img.style, { position: 'absolute', width: st.cw * f.k + 'px', height: st.ch * f.k + 'px', left: f.left + 'px', top: f.top + 'px', transform: 'none' });
}
export function hover(cell, item) {
  const g = shared();
  cell.addEventListener('pointerenter', async () => {
    g.cell = cell;
    const group = (await model(item)).clone();            // its own copy: the stills keep theirs
    await shared('stills').queue;                          // this cell's still first: the spin starts exactly on it
    if (g.cell !== cell || !cell._still) return;
    const pic = cell.querySelector('.pic'), st = cell._still;
    place(g.scene, group);
    frame(g, group, pic.clientWidth * ROOM, pic.clientHeight * ROOM, ROOM);   // the same camera as the still
    if (st) {                                             // and the same place and scale: no jump when it starts
      const f = fitStill(st, pic);
      Object.assign(g.canvas.style, { width: st.W * f.k + 'px', height: st.H * f.k + 'px',
        left: f.left - st.x0 * f.k + 'px', top: f.top - st.y0 * f.k + 'px' });
    }
    pic.appendChild(g.canvas);
    cell.classList.add('live-on');
    g.ry = 0;
    let last = performance.now();
    if (!g.loop) g.loop = requestAnimationFrame(function tick(now) {
      g.ry += (now - last) / 1000 * 1.6; last = now;      // about one turn in four seconds
      const thing = g.scene.children.find(o => o.userData.thing);
      if (thing) thing.rotation.y = g.ry;
      g.r.render(g.scene, g.cam);
      g.loop = g.cell ? requestAnimationFrame(tick) : null;
    });
  });
  cell.addEventListener('pointerleave', () => {
    if (g.cell !== cell) return;
    g.cell = null; cell.classList.remove('live-on');
    const thing = g.scene.children.find(o => o.userData.thing);
    if (thing) thing.rotation.y = 0;
    if (g.canvas.parentNode) g.canvas.parentNode.removeChild(g.canvas);
  });
}

/* ---------- a thing's page: its own canvas, dragged round ---------- */
export async function stage(box, item) {
  const canvas = document.createElement('canvas');
  canvas.className = 'solid';
  box.appendChild(canvas);
  const r = renderer(canvas), scene = stageScene();
  scene.environment = r.userData.env;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  const group = await model(item);
  const mine = group.clone();
  place(scene, mine);
  const controls = new OrbitControls(cam, canvas);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
  controls.minPolarAngle = Math.PI * 0.2; controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, mine.userData.height / 2, 0);
  cam.position.set(0, mine.userData.height / 2 + 0.4, 3.0);
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  function size() {
    const w = box.clientWidth, h = box.clientHeight;
    r.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  size();
  addEventListener('resize', size);
  let alive = true;
  (function tick() { if (!alive || !canvas.isConnected) { r.dispose(); return; } controls.update(); r.render(scene, cam); requestAnimationFrame(tick); })();
  return { stop() { alive = false; removeEventListener('resize', size); } };
}

