// Screens: mount live HTML onto the painted displays inside a scene render.
//
// The renders contain wall panels and desk monitors that are just pixels. A "screen"
// here is a normal DOM element that has been perspective-mapped onto four corner points
// of one of those painted surfaces, so it reads as content running on that display.
//
// Registration is free. Every screen is appended INSIDE the same transformed layer as the
// render it belongs to (#master for the master, #room for a room render), and its quad is
// expressed in IMAGE PIXELS of that render. The layer's own coordinate system is already
// image pixels (stage.js draws the <img> at natural size at 0,0 and puts translate+scale on
// the layer), so the stage's pan, zoom, crossfade, parallax and resize math carry the screen
// along with the photograph — no per-frame work, no layout listeners, no rAF.
//
// One thing the mapping cannot know: the photograph has no depth. A screen paints OVER
// everything in the render inside its quad, so a surface with something in front of it — the
// three people standing at the Defense wall display, a chair back across a desk monitor — will
// have that occluder painted over. Either pick a surface with a clear line of sight, or mask
// the screen with a CSS mask-image cut to the occluder's silhouette.
//
// Nothing happens on import. A screen exists only when a caller asks for one.
//
//   import { mountScreen } from './screens.js?v=2026-09-09u';
//   const id = mountScreen({
//     layer: 'defense',                                 // 'master' | a room id | an element
//     quad: [[112,36],[1107,137],[1100,500],[112,514]], // TL, TR, BR, BL in image pixels —
//     content: '<div class="dash">…</div>',             // this one is the Defense wall display
//   });
//
// A room's render is found from its id (media/scene/rooms/<id>.jpg, and "aire.jpg" for
// "aire-bridge"); pass `render: 'media/scene/rooms/x.jpg'` if a future room breaks that.
//
// Capture quads with tools/quad-tool.html.

/* ------------------------------------------------------------------ *
 * 1. The math: a projective (homographic) map, rect -> quadrilateral
 * ------------------------------------------------------------------ *
 *
 * A perspective view of a flat rectangle is a projective transform. In homogeneous
 * coordinates it is a 3x3 matrix H applied to the source point (u, v, 1):
 *
 *        | a b c |   | u |     | x' |                 x'        y'
 *   H =  | d e f | , | v |  =  | y' |  , and  x = ---- ,  y = ----
 *        | g h 1 |   | 1 |     | w' |                 w'        w'
 *
 * H has 9 entries but only 8 degrees of freedom (any non-zero multiple of H is the same
 * map), so we pin the bottom-right entry to 1 and solve for the remaining 8 unknowns
 *
 *   [a b c d e f g h]
 *
 * from four point correspondences (u_i, v_i) -> (x_i, y_i). Expanding
 *
 *   x = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y = (d·u + e·v + f) / (g·u + h·v + 1)
 *
 * and clearing the denominator gives two linear equations per correspondence:
 *
 *   a·u + b·v + c              − g·u·x − h·v·x = x
 *               d·u + e·v + f  − g·u·y − h·v·y = y
 *
 * Four corners -> 8 equations -> one 8x8 linear system, solved below by Gaussian
 * elimination with partial pivoting. No library, no iteration, exact for a valid quad.
 *
 * Getting it onto the element: CSS matrix3d(m1..m16) is COLUMN-MAJOR and multiplies a
 * column vector [x y z 1]ᵀ on the right, then divides by the resulting w. So the 4x4
 *
 *   | a b 0 c |          maps (u, v, 0, 1) to (a·u + b·v + c, d·u + e·v + f, 0, g·u + h·v + 1)
 *   | d e 0 f |          which after the perspective divide is exactly the homography above.
 *   | 0 0 1 0 |
 *   | g h 0 1 |
 *
 * Written out in column-major order that is
 *
 *   matrix3d(a, d, 0, g,   b, e, 0, h,   0, 0, 1, 0,   c, f, 0, 1)
 *
 * The two entries in the fourth ROW (g and h, positions 4 and 8) are what make this a real
 * perspective map rather than an affine one — they are the per-pixel w that foreshortens the
 * far edge. With transform-origin at 0 0 the element's own untransformed box, (0,0)-(w,h),
 * is the source rectangle, so the four solved corners land exactly on the quad.
 */

// Solve A·x = b for an n x n system by Gaussian elimination with partial pivoting.
// Returns null if the matrix is singular (a degenerate quad), never throws.
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]); // augmented
  // Scale reference for the singularity test, so the tolerance is relative, not absolute.
  let scale = 0;
  for (const row of M) for (const v of row) { if (!Number.isFinite(v)) return null; scale = Math.max(scale, Math.abs(v)); }
  if (scale === 0) return null;
  const eps = scale * 1e-12;

  for (let col = 0; col < n; col++) {
    // partial pivot: largest magnitude in this column at or below the diagonal
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < eps) return null; // singular
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
    const p = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  // back substitution
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}

// Solve the 8 unknowns for src[4] -> dst[4]; both are [[x,y], …] in the same units.
export function solveProjective(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  return solveLinear(A, b); // [a,b,c,d,e,f,g,h] or null
}

// CSS rejects some exponent forms; emit plain decimals.
function num(v) {
  if (!Number.isFinite(v)) return '0';
  let s = v.toFixed(12);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/**
 * Build the CSS matrix3d that maps the rectangle (0,0)-(w,h) onto `quad`.
 * @param {number[][]} quad four [x, y] corners, clockwise from the top-left of the surface
 * @param {number} w  source rectangle width  (the element's untransformed width)
 * @param {number} h  source rectangle height
 * @returns {string|null} a matrix3d(...) value, or null if the quad cannot be mapped
 */
export function quadToMatrix3d(quad, w, h) {
  if (!(w > 0) || !(h > 0)) return null;
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const m = solveProjective(src, quad);
  if (!m) return null;
  const [a, b, c, d, e, f, g, hh] = m;

  // Sanity 1: every source corner must stay in front of the projection plane (w' > 0).
  // A negative w' means the quad folds through the camera and the browser renders garbage.
  for (const [u, v] of src) if (!(g * u + hh * v + 1 > 1e-9)) return null;

  // Sanity 2: round-trip the four corners through the solved matrix. This catches a
  // near-singular solve that Gaussian elimination let through with a huge condition number.
  const diag = Math.hypot(quad[2][0] - quad[0][0], quad[2][1] - quad[0][1]) || 1;
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const wp = g * u + hh * v + 1;
    const dx = (a * u + b * v + c) / wp - quad[i][0];
    const dy = (d * u + e * v + f) / wp - quad[i][1];
    if (Math.hypot(dx, dy) > diag * 1e-6 + 0.01) return null;
  }
  return `matrix3d(${num(a)},${num(d)},0,${num(g)},${num(b)},${num(e)},0,${num(hh)},0,0,1,0,${num(c)},${num(f)},0,1)`;
}

/* ------------------------------------------------------------------ *
 * 2. Quad validation — malformed input warns once and mounts nothing
 * ------------------------------------------------------------------ */

const warned = new Set();
function warnOnce(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[screens]', ...args);
}

// Accepts [[x,y] x4] or [{x,y} x4]; returns a clean [[x,y] x4] or null.
function normalizeQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return null;
  const out = [];
  for (const p of quad) {
    let x, y;
    if (Array.isArray(p) && p.length >= 2) { x = +p[0]; y = +p[1]; }
    else if (p && typeof p === 'object') { x = +p.x; y = +p.y; }
    else return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return out;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// A quad is usable when it is simple (not a bow-tie) and has real area, i.e. the four
// turns all go the same way. Corners must be given in order around the surface.
function quadProblem(q) {
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  if (pos && neg) return 'the corners cross over themselves — give them in order around the surface (top-left, top-right, bottom-right, bottom-left).';
  const area = Math.abs(
    q[0][0] * q[1][1] - q[1][0] * q[0][1] +
    q[1][0] * q[2][1] - q[2][0] * q[1][1] +
    q[2][0] * q[3][1] - q[3][0] * q[2][1] +
    q[3][0] * q[0][1] - q[0][0] * q[3][1]
  ) / 2;
  if (!(area > 1)) return 'the quad is degenerate (no area) — are two corners the same point, or all four in a line?';
  return null;
}

// Average edge lengths, in image pixels: the natural pixel size for the source rectangle,
// so content is authored and rasterised at roughly the size it appears in the render.
export function quadSize(quad) {
  const q = normalizeQuad(quad);
  if (!q) return null;
  const d = (a, b) => Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]);
  return {
    width: Math.max(1, Math.round((d(0, 1) + d(3, 2)) / 2)),
    height: Math.max(1, Math.round((d(0, 3) + d(1, 2)) / 2)),
  };
}

/* ------------------------------------------------------------------ *
 * 3. Layers — where a screen is parked so it inherits the stage
 * ------------------------------------------------------------------ */

const BASE_STYLE = 'position:absolute;left:0;top:0;pointer-events:none;';
let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'aivric-screens-style';
  s.textContent = [
    '.aivric-screen{position:absolute;left:0;top:0;transform-origin:0 0;backface-visibility:hidden;overflow:hidden;pointer-events:none;}',
    '.aivric-screen.is-interactive{pointer-events:auto;}',
    '.aivric-screen[hidden]{display:none !important;}',
  ].join('\n');
  document.head.appendChild(s);
}

// One container per layer key. 'master' parks in #master; every room render shares #room,
// because stage.js reuses a single <img> there and swaps its src.
const containers = new Map(); // key -> { el, host, kind, cleanup? }

function stemOf(src) {
  if (!src) return '';
  const file = String(src).split('?')[0].split('#')[0].split('/').pop() || '';
  return file.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

/* --- the room layer mirrors the render's own settle-in animation ---
 * stage.js gives #room-img a short transform of its own on entry (scale 1.06 -> 1 about the
 * focus point). That transform lives on the <img>, not on the layer, so a sibling would drift
 * across the wall for the length of the settle. Mirroring the <img>'s inline style onto the
 * screens container keeps the two locked together, driven by the same CSS transition — still
 * no per-frame work. The observer replays the style values in the order they were written
 * (value at step i is the old value recorded at step i+1) with a forced reflow between them,
 * so a transition that stage.js set up is reproduced rather than skipped to its end state.
 */
function mirrorRoomImage(img, target, getBaseStyle) {
  const apply = (styleText) => { target.setAttribute('style', getBaseStyle() + (styleText || '')); };
  apply(img.getAttribute('style'));
  const mo = new MutationObserver((records) => {
    const seq = records.slice(1).map((r) => r.oldValue);
    seq.push(img.getAttribute('style'));
    for (const s of seq) { apply(s); void target.offsetWidth; }
  });
  mo.observe(img, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  return mo;
}

function roomImageSize(img) {
  const w = img.naturalWidth || parseFloat(img.getAttribute('width')) || 0;
  const h = img.naturalHeight || parseFloat(img.getAttribute('height')) || 0;
  return { w, h };
}

function ensureContainer(kind, host) {
  const key = kind === 'custom' ? host : kind;
  const existing = containers.get(key);
  if (existing && existing.el.isConnected) return existing;

  injectStyle();
  const el = document.createElement('div');
  el.className = 'aivric-screens';
  el.dataset.layer = kind;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('style', BASE_STYLE);
  host.appendChild(el);
  const entry = { el, host, kind, observers: [] };

  if (kind === 'room') {
    const img = document.getElementById('room-img');
    if (img) {
      // transform-origin on the <img> is a percentage of its own box, so match the box.
      const base = () => entry.base || BASE_STYLE;
      const size = () => {
        const { w, h } = roomImageSize(img);
        entry.base = BASE_STYLE + (w && h ? `width:${w}px;height:${h}px;` : '');
        entry.el.setAttribute('style', entry.base + (img.getAttribute('style') || ''));
      };
      size();
      entry.observers.push(mirrorRoomImage(img, el, base));
      const onLoad = () => { size(); syncRoomVisibility(); };
      img.addEventListener('load', onLoad);
      const srcMo = new MutationObserver(() => { size(); syncRoomVisibility(); });
      srcMo.observe(img, { attributes: true, attributeFilter: ['src'] });
      entry.observers.push(srcMo);
      entry.cleanup = () => img.removeEventListener('load', onLoad);
    }
  }
  containers.set(key, entry);
  return entry;
}

function releaseContainer(key) {
  const entry = containers.get(key);
  if (!entry) return;
  if (entry.el.childElementCount) return; // still in use
  for (const mo of entry.observers) mo.disconnect();
  if (entry.cleanup) entry.cleanup();
  entry.el.remove();
  containers.delete(key);
}

// Resolve the caller's `layer` to a host element inside the stage.
function resolveLayer(layer) {
  if (layer instanceof Element) return { kind: 'custom', host: layer, key: layer };
  if (typeof layer !== 'string' || !layer) return null;
  if (layer === 'master') {
    const host = document.getElementById('master');
    return host ? { kind: 'master', host, key: 'master' } : null;
  }
  const host = document.getElementById('room');
  return host ? { kind: 'room', host, key: 'room', room: layer } : null;
}

/* ------------------------------------------------------------------ *
 * 4. Which room render is on screen right now
 * ------------------------------------------------------------------ */

let forcedRoom = null;

/** Override the active room render (usually unnecessary — it is detected from #room-img). */
export function setActiveRoom(roomId) {
  forcedRoom = roomId || null;
  syncRoomVisibility();
}

function currentRender() {
  const img = document.getElementById('room-img');
  return img ? img.getAttribute('src') || '' : '';
}

function screenIsOnActiveRender(screen) {
  if (screen.kind !== 'room') return true;
  if (forcedRoom) return forcedRoom === screen.room;
  const src = currentRender();
  if (!src) return false;
  if (screen.render) return src === screen.render || src.endsWith(screen.render) || screen.render.endsWith(src);
  // No explicit render given: infer from the filename. media/scene/rooms/<stem>.jpg matches
  // room "<stem>", and also a compound id built on it ("aire.jpg" serves room "aire-bridge"),
  // which is the one place the manifest's ids and its filenames disagree today.
  const stem = stemOf(src), room = String(screen.room).toLowerCase();
  return stem === room || (stem.length > 1 && room.startsWith(stem + '-'));
}

function applyVisibility(screen) {
  screen.el.hidden = !(screen.visible && screenIsOnActiveRender(screen));
}

function syncRoomVisibility() {
  for (const s of registry.values()) if (s.kind === 'room') applyVisibility(s);
}

/* ------------------------------------------------------------------ *
 * 5. Public API
 * ------------------------------------------------------------------ */

const registry = new Map(); // id -> screen record
let seq = 0;

function setContent(el, content) {
  stopMedia(el);
  el.textContent = '';
  if (content == null) return;
  if (content instanceof Node) el.appendChild(content);
  else el.innerHTML = String(content); // caller-authored markup (manifest / feature code)
}

function stopMedia(el) {
  for (const m of el.querySelectorAll('video, audio')) {
    try { m.pause(); m.removeAttribute('src'); m.load(); } catch { /* detached already */ }
  }
  for (const f of el.querySelectorAll('iframe')) f.removeAttribute('src');
}

/**
 * Mount a DOM element onto a painted display in a scene render.
 *
 * @param {object}   opts
 * @param {string|Element} opts.layer   'master', a room id (e.g. 'defense'), or an element
 *                                      to park in directly (used by tools/quad-tool.html)
 * @param {number[][]} opts.quad        four [x, y] corners in IMAGE PIXELS of that render,
 *                                      in order around the surface: TL, TR, BR, BL
 * @param {string|Node} [opts.content]  markup or an element to run on the display
 * @param {string} [opts.id]            stable id; auto-generated when omitted
 * @param {string} [opts.render]        exact render path, for rooms whose id and file differ
 *                                      (e.g. 'aire-bridge' -> media/scene/rooms/aire.jpg)
 * @param {number} [opts.baseWidth]     source rectangle size; defaults to the quad's own
 * @param {number} [opts.baseHeight]    average edge lengths in image pixels
 * @param {string} [opts.className]     extra classes on the screen element
 * @param {boolean} [opts.interactive]  allow pointer events (default false, so pins stay clickable)
 * @param {boolean} [opts.hidden]       mount hidden
 * @returns {string|null} the screen id, or null if nothing was mounted
 */
export function mountScreen(opts) {
  const o = opts || {};
  // `who` only names the call site for the log — it is never used as a registry key.
  const who = o.id || (typeof o.layer === 'string' ? o.layer : 'unnamed');
  const quad = normalizeQuad(o.quad);
  if (!quad) {
    warnOnce(`${who}:shape`, `screen "${who}" ignored: quad must be four [x, y] points in image pixels.`);
    return null;
  }
  const problem = quadProblem(quad);
  if (problem) {
    warnOnce(`${who}:${problem}`, `screen "${who}" ignored: ${problem}`);
    return null;
  }
  const target = resolveLayer(o.layer);
  if (!target) {
    warnOnce(`${who}:layer`, `screen "${who}" ignored: no layer for "${o.layer}" (expected 'master', a room id, or an element).`);
    return null;
  }

  const size = quadSize(quad);
  const w = Math.max(1, Math.round(+o.baseWidth || size.width));
  const h = Math.max(1, Math.round(+o.baseHeight || size.height));
  const matrix = quadToMatrix3d(quad, w, h);
  if (!matrix) {
    warnOnce(`${who}:solve`, `screen "${who}" ignored: that quad has no valid perspective mapping (corners nearly collinear, or folded).`);
    return null;
  }

  const id = o.id || `screen-${++seq}`;
  if (registry.has(id)) unmountScreen(id);

  const entry = ensureContainer(target.kind, target.host);
  const el = document.createElement('div');
  el.className = 'aivric-screen' + (o.className ? ' ' + o.className : '');
  el.dataset.screenId = id;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.transform = matrix;
  if (o.interactive) el.classList.add('is-interactive');
  setContent(el, o.content);
  entry.el.appendChild(el);

  const screen = {
    id, el, quad, matrix, width: w, height: h,
    kind: target.kind, room: target.room || null, render: o.render || null,
    containerKey: target.key, visible: !o.hidden,
  };
  registry.set(id, screen);
  applyVisibility(screen);
  return id;
}

/** Replace what a screen is showing. Returns false if the id is unknown. */
export function updateScreen(id, content) {
  const s = registry.get(id);
  if (!s) { warnOnce('update:' + id, `updateScreen("${id}"): no such screen.`); return false; }
  setContent(s.el, content);
  return true;
}

/** Move an existing screen to a new quad (same layer). Returns false if it cannot be mapped. */
export function retargetScreen(id, quad, baseWidth, baseHeight) {
  const s = registry.get(id);
  if (!s) return false;
  const q = normalizeQuad(quad);
  if (!q || quadProblem(q)) { warnOnce('retarget:' + id, `retargetScreen("${id}"): malformed quad, keeping the old one.`); return false; }
  const size = quadSize(q);
  const w = Math.max(1, Math.round(+baseWidth || size.width));
  const h = Math.max(1, Math.round(+baseHeight || size.height));
  const m = quadToMatrix3d(q, w, h);
  if (!m) { warnOnce('retarget:' + id + ':solve', `retargetScreen("${id}"): quad has no valid mapping, keeping the old one.`); return false; }
  s.quad = q; s.matrix = m; s.width = w; s.height = h;
  s.el.style.width = w + 'px'; s.el.style.height = h + 'px'; s.el.style.transform = m;
  return true;
}

export function showScreen(id) { return toggleScreen(id, true); }
export function hideScreen(id) { return toggleScreen(id, false); }

export function toggleScreen(id, on) {
  const s = registry.get(id);
  if (!s) return false;
  s.visible = on === undefined ? !s.visible : !!on;
  applyVisibility(s);
  return s.visible;
}

/** Remove a screen and everything it owns. Safe to call twice. */
export function unmountScreen(id) {
  const s = registry.get(id);
  if (!s) return false;
  stopMedia(s.el);
  s.el.remove();
  registry.delete(id);
  releaseContainer(s.containerKey);
  return true;
}

/** Remove every screen, or every screen on one layer. */
export function unmountAllScreens(layer) {
  let n = 0;
  for (const [id, s] of [...registry]) {
    if (layer && s.room !== layer && s.kind !== layer) continue;
    if (unmountScreen(id)) n++;
  }
  return n;
}

export function getScreenElement(id) { const s = registry.get(id); return s ? s.el : null; }
export function hasScreen(id) { return registry.has(id); }
export function listScreens() {
  return [...registry.values()].map((s) => ({
    id: s.id, layer: s.room || s.kind, visible: s.visible,
    onScreen: !s.el.hidden, quad: s.quad, width: s.width, height: s.height,
  }));
}

export default {
  mount: mountScreen,
  update: updateScreen,
  retarget: retargetScreen,
  show: showScreen,
  hide: hideScreen,
  toggle: toggleScreen,
  unmount: unmountScreen,
  unmountAll: unmountAllScreens,
  element: getScreenElement,
  has: hasScreen,
  list: listScreens,
  setActiveRoom,
  quadToMatrix3d,
  quadSize,
};
