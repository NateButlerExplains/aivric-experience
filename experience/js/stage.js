// Stage: master render in a cover-fit pan/zoom viewport, plus the room render layer.
// All math is in "image pixels" of the master; transforms are translate+scale only (GPU cheap).

const stage = document.getElementById('stage');
const parallaxEl = document.getElementById('parallax');
const masterEl = document.getElementById('master');
const overlaysEl = document.getElementById('overlays');
const masterImg = document.getElementById('master-img');
const roomEl = document.getElementById('room');
const roomImg = document.getElementById('room-img');
const pinsEl = document.getElementById('pins');
// The slot the portrait composition reserves for the building (css `#floor-band`). Empty on
// every other viewport, where `#floor` is display:contents and this has no box at all.
const bandEl = document.getElementById('floor-band');

const state = {
  W: 0, H: 0,            // master natural size
  s0: 0, ox0: 0, oy0: 0, // base transform (cover-fit; on a portrait phone, fitted to the band)
  sCover: 0,             // cover-fit scale, whatever the base is — room camera zooms off this
  s: 0, ox: 0, oy: 0,    // current master transform
  inRoom: false,
  portrait: false,
  panelW: 0,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  listeners: new Set(),
};

// The bottom sheet's top edge on a phone, as a fraction of the viewport height. Mirrors
// `#panel { top: 40vh }` in css/experience.css — change one and change the other.
const SHEET_TOP = 0.4;
// Portrait composition. A 16:9 building in a 9:19.5 phone leaves space whatever we do, so the
// band is deliberately sized rather than merely fitted: it may run WIDER than the screen, up to
// MAX_OVERSCAN, which buys height (a 1.24x overscan turns a 219 px strip into a 272 px one at
// 390 px wide) at the cost of the outermost slivers of floor — never of a wing. PIN_PAD is the
// clearance the outermost pin keeps from the screen edge; it is what actually caps the overscan
// on a narrow phone, so all six pins stay reachable no matter how the manifest moves them.
const MAX_OVERSCAN = 1.24;
const PIN_PAD = 26;
// How far the outermost hotspot sits from the master's centre, as a fraction of its width
// (setPinSpread). The pin that hits the screen edge first is the one that caps the overscan.
let pinSpread = 0.5;

export function onLayout(fn) { state.listeners.add(fn); }
function emit() { for (const fn of state.listeners) fn(state); }

function viewport() { return { vw: stage.clientWidth, vh: stage.clientHeight }; }

// Width of the panel when open — the room's point of interest is centered in the remaining space.
function panelWidth() {
  const { vw } = viewport();
  if (vw < 768) return 0;
  const css = getComputedStyle(document.documentElement).getPropertyValue('--panel-w').trim();
  let w = css.endsWith('vw') ? vw * parseFloat(css) / 100 : parseFloat(css) || vw * 0.38;
  return Math.min(640, Math.max(360, w));
}

function cssPx(name, fallback) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

// A phone held upright: the sheet, the composed building view and the dot-only pins all key off
// this. A phone in landscape is wide enough to behave like the desktop. The test is written to
// agree exactly with `@media (max-width: 767px) and (orientation: portrait)`, which is what
// styles the composition — `>=`, not `>`, because CSS calls a square viewport portrait.
function isPortraitPhone() {
  const { vw, vh } = viewport();
  return vw < 768 && vh >= vw;
}

// The band CSS has reserved for the building, in viewport pixels. Falls back to the clear space
// under the HUD if the element has no box yet (first paint before the stylesheet has laid out).
function bandRect() {
  const { vh } = viewport();
  if (bandEl) {
    const r = bandEl.getBoundingClientRect();
    if (r.height > 40) return { top: r.top, h: r.height };
  }
  const hudH = cssPx('--hud-h', 52);
  return { top: hudH, h: Math.max(120, (vh - hudH) * 0.42) };
}

// Called once with the manifest, before the master loads: how far the building may overscan is a
// question about where the outermost hotspots are, not a constant.
export function setPinSpread(rooms) {
  const hs = rooms.filter((r) => r.hotspot);
  if (!hs.length) return;
  pinSpread = Math.max(...hs.map((r) => Math.abs(r.hotspot.x - 0.5)));
}

// The part of the viewport the visitor can actually see while a room is open: the HUD bar sits
// on top, and the panel takes either the right edge (desktop) or everything below 40vh (phone,
// where it is a bottom sheet). Everything a room wants seen has to land inside this rectangle.
function visibleRect() {
  const { vw, vh } = viewport();
  const hudH = cssPx('--hud-h', 56);
  const panelW = vw < 768 ? 0 : panelWidth();
  const bottom = vw < 768 ? vh * SHEET_TOP : vh;
  const r = { x: 0, y: hudH, w: vw - panelW, h: Math.max(120, bottom - hudH) };
  r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2;
  return r;
}

// The rectangle a room render has to fill. On the desktop that is the whole viewport, because the
// panel is translucent and an uncovered strip behind it would read as a seam. On a phone the HUD
// and the sheet are opaque bars, so only the band between them is on show: demanding the full
// viewport there forced a 1.13x zoom that cropped every room to its middle sixth. The extra bleed
// covers the ground behind the sheet's rounded top corners.
function roomCoverRect() {
  const { vw, vh } = viewport();
  if (!isPortraitPhone()) return { x: 0, y: 0, w: vw, h: vh };
  const b = visibleRect();
  return { x: 0, y: b.y, w: vw, h: Math.min(vh - b.y, b.h + 18) };
}

// How far past a plain cover-fit a room render may be pushed to bring its focus point into the
// visible band. The phone band is short (about a third of the screen), so honouring the focus
// exactly would crop the room down to one desk; the cap trades a little accuracy for context.
const MAX_ROOM_ZOOM = 1.6;

// Place a room render so its focus point sits at the middle of the visible band while the image
// still fills `cover` (see roomCoverRect). Cover-fit alone pins the image to the viewport edges
// and throws the focus value away, which is what used to hide every room's subject under the
// panel or sheet.
function fitRoom(Wr, Hr, cover, band, focus) {
  const fx = Math.min(0.98, Math.max(0.02, (focus && focus.x) != null ? focus.x : 0.5));
  const fy = Math.min(0.98, Math.max(0.02, (focus && focus.y) != null ? focus.y : 0.5));
  const base = Math.max(cover.w / Wr, cover.h / Hr);
  // Smallest scale at which the focus point can sit at the band centre without uncovering an edge.
  const need = Math.max(
    (band.cx - cover.x) / (fx * Wr), (cover.x + cover.w - band.cx) / ((1 - fx) * Wr),
    (band.cy - cover.y) / (fy * Hr), (cover.y + cover.h - band.cy) / ((1 - fy) * Hr)
  );
  const s = Math.min(Math.max(base, need), base * MAX_ROOM_ZOOM);
  let ox = band.cx - fx * Wr * s, oy = band.cy - fy * Hr * s;
  ox = Math.min(cover.x, Math.max(cover.x + cover.w - Wr * s, ox));
  oy = Math.min(cover.y, Math.max(cover.y + cover.h - Hr * s, oy));
  return { s, ox, oy };
}

function applyMaster(s, ox, oy, animate) {
  state.s = s; state.ox = ox; state.oy = oy;
  const t = `translate3d(${ox}px, ${oy}px, 0) scale(${s})`;
  const dur = animate && !state.reduced ? 'var(--dur)' : '0ms';
  masterEl.style.transition = `transform ${dur} var(--ease)`;
  overlaysEl.style.transition = `transform ${dur} var(--ease), opacity 400ms var(--ease)`;
  masterEl.style.transform = t;
  overlaysEl.style.transform = t;
}

// Building view. Landscape covers the viewport. Portrait is COMPOSED instead: cover-fitting a
// 16:9 master into a phone shows only the middle quarter of the floor and puts the Defense and
// Offense pins several hundred pixels off screen, but a plain contain-fit is the other failure —
// a 219 px strip adrift in an 844 px screen. So the master is fitted to the band the layout
// reserves for it (#floor-band), allowed to run wider than the screen for height, and stopped
// at whichever comes first: the band's height, the overscan cap, or the outermost pin reaching
// PIN_PAD of the screen edge.
function computeBase() {
  const { vw, vh } = viewport();
  state.sCover = Math.max(vw / state.W, vh / state.H);
  state.portrait = isPortraitPhone();
  document.body.classList.toggle('floor-portrait', state.portrait);
  // See loadMaster: the box exists only to give the portrait edge-fade mask something to paint
  // into. Off portrait it is cleared, so the layer downsamples exactly as it did before.
  masterEl.style.width = state.portrait ? state.W + 'px' : '';
  masterEl.style.height = state.portrait ? state.H + 'px' : '';
  if (!state.portrait) {
    state.s0 = state.sCover;
    state.ox0 = (vw - state.W * state.s0) / 2;
    state.oy0 = (vh - state.H * state.s0) / 2;
    return;
  }
  const band = bandRect();
  // Widest the master may go before the outermost pin loses its clearance. Measured from the
  // centre, because the master is centred: the pin furthest off centre is the one that reaches
  // the edge first (0.295 of the width, as the manifest stands).
  const sPin = Math.max(0, vw / 2 - PIN_PAD) / (pinSpread * state.W);
  const s0 = Math.min(band.h / state.H, (vw / state.W) * MAX_OVERSCAN, sPin);
  state.s0 = s0;
  state.ox0 = (vw - state.W * s0) / 2;
  state.oy0 = band.top + (band.h - state.H * s0) / 2;
}

export async function loadMaster(src, fallback) {
  await new Promise((res, rej) => {
    masterImg.onload = res; masterImg.onerror = () => {
      if (fallback && masterImg.src.indexOf(fallback) === -1) { masterImg.src = fallback; } else rej(new Error('master failed'));
    };
    masterImg.src = src;
  });
  state.W = masterImg.naturalWidth; state.H = masterImg.naturalHeight;
  masterImg.width = state.W; masterImg.height = state.H;
  // The overlay layer needs the image's own box so the stream SVG shares its coordinate space.
  // #master does NOT get one except in portrait: giving the layer an explicit box changes how
  // Chromium downsamples the 2560x1440 render at some scales, measurably softening it on a
  // landscape phone. It is only needed so the portrait edge fade (css `body.floor-portrait
  // #master`, a mask) has something to paint into, so it is applied there and nowhere else.
  overlaysEl.style.width = state.W + 'px'; overlaysEl.style.height = state.H + 'px';
  computeBase();
  applyMaster(state.s0, state.ox0, state.oy0, false);
  emit();
  return state;
}

// Convert a normalized master point to screen coordinates under the current transform.
export function toScreen(nx, ny) {
  return { x: state.ox + nx * state.W * state.s, y: state.oy + ny * state.H * state.s };
}
export function getState() { return state; }

// ---- Room renders ----
// One fetch + decode per render, shared by the warm-up pass in main.js and by goRoom, so a room
// that was warmed while the visitor read the building view opens without a load wait.
const roomCache = new Map(); // src -> Promise<HTMLImageElement|null>
export function warmRoom(src) {
  if (!src) return Promise.resolve(null);
  let p = roomCache.get(src);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const d = img.decode ? img.decode() : null;
        if (d && d.then) d.then(() => res(img), () => res(img)); else res(img);
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    roomCache.set(src, p);
  }
  return p;
}

// ---- Is the room layer actually on screen? ----
// Not "are we in a room" — leaving a room clears that flag at the START of an exit that then
// takes a further 900 ms to fade the render out. Anything that must never be drawn over a room
// render (the pins) has to ask the layer itself, whose computed opacity tracks the transition.
// Strictly greater than zero, not "close enough": an eased fade spends its last frames at a few
// ten-thousandths of an alpha, and a threshold there would let the first pins start their own
// 500 ms fade against a room layer that is still technically painting.
export function isRoomVisible() {
  return parseFloat(getComputedStyle(roomEl).opacity) > 0;
}

// Call fn once the room layer is genuinely invisible, and never after a newer navigation: goRoom
// bumps the token, so a wait left over from an exit the visitor interrupted dies silently instead
// of firing against the state that replaced it. Returns its own canceller.
let hideToken = 0;
export function whenRoomHidden(fn) {
  const token = ++hideToken;
  let raf = 0;
  const step = () => {
    if (token !== hideToken) return;
    if (!isRoomVisible()) { fn(); return; }
    raf = requestAnimationFrame(step);
  };
  step();
  return () => { if (token === hideToken) hideToken++; cancelAnimationFrame(raf); };
}

// ---- Building view <-> room view ----
let roomToken = 0;
export function goBuilding(animate = true) {
  state.inRoom = false;
  roomToken++; // any room render still loading is now stale — it must not paint over the building
  stage.classList.remove('in-room');
  document.body.classList.remove('in-room');
  applyMaster(state.s0, state.ox0, state.oy0, animate);
  roomEl.style.transition = animate && !state.reduced ? 'opacity var(--dur) var(--ease), transform var(--dur) var(--ease)' : 'none';
  roomEl.style.opacity = '0';
  emit();
}

// Arrival. The film is full-bleed and the composed building view is not, so cutting straight to
// the composed transform reads as the picture shrinking. Instead the master lands a little large,
// over its own frame, and eases back into it while the lockup and the room list fade up: the
// scale change becomes the last beat of the film rather than a collapse. Portrait only — every
// other viewport goes from full-bleed film to full-bleed building with nothing to ease.
export function settleIn(from = 1.16) {
  if (!state.portrait || state.inRoom || state.reduced || !state.W) return;
  const cx = state.ox0 + state.W * state.s0 / 2;
  const cy = state.oy0 + state.H * state.s0 / 2;
  const s1 = state.s0 * from;
  applyMaster(s1, cx - state.W * s1 / 2, cy - state.H * s1 / 2, false);
  // Flush it. The router runs in this same task and applies the composed transform immediately
  // after; without a forced reflow the browser only ever computes the end state and there is no
  // transition at all — the picture just appears at its final size, which is the collapse this
  // is here to avoid. Whichever of the two lands the target first, the ease is the same.
  void masterEl.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (state.inRoom) return;
    applyMaster(state.s0, state.ox0, state.oy0, true);
  }));
}

export async function goRoom(room, animate = true) {
  state.inRoom = true;
  hideToken++; // a pending reveal from the exit we just interrupted must not fire
  state.panelW = panelWidth();
  const cover = roomCoverRect();
  const band = visibleRect();
  const z = room.hotspot.zoom || 2.6;
  // Off the cover scale, not off the base: the portrait building view is fitted to a band, but
  // the camera move into a room should frame the room the same way it always has.
  const s1 = state.sCover * z;
  stage.classList.add('in-room');
  document.body.classList.add('in-room');
  let mx = band.cx - room.hotspot.x * state.W * s1;
  let my = band.cy - room.hotspot.y * state.H * s1;
  if (state.portrait) {
    // Keep the travelling master over the band; without this a wing room slides a sliver of bare
    // ground into view for the second before the room render fades up on top of it.
    mx = Math.min(cover.x, Math.max(cover.x + cover.w - state.W * s1, mx));
    my = Math.min(cover.y, Math.max(cover.y + cover.h - state.H * s1, my));
  }
  applyMaster(s1, mx, my, animate);

  // Room render (optional). Every await below is followed by a staleness check: the visitor can
  // leave, or jump to another room, long before a 600 KB render finishes loading.
  const token = ++roomToken;
  const stale = () => token !== roomToken || !state.inRoom;
  if (!room.render) { roomEl.style.opacity = '0'; emit(); return; }

  const decoded = await warmRoom(room.render);
  if (stale()) return;
  if (!decoded) { roomEl.style.opacity = '0'; emit(); return; }

  if (roomImg.getAttribute('src') !== room.render) {
    roomImg.setAttribute('src', room.render); // decoded already: this paints straight from cache
    if (!roomImg.complete) {
      await new Promise((res) => {
        const done = () => { roomImg.removeEventListener('load', done); roomImg.removeEventListener('error', done); res(); };
        roomImg.addEventListener('load', done); roomImg.addEventListener('error', done);
      });
      if (stale()) return;
    }
  }

  const Wr = decoded.naturalWidth || roomImg.naturalWidth;
  const Hr = decoded.naturalHeight || roomImg.naturalHeight;
  const f = room.focus || { x: 0.5, y: 0.5 };
  const fit = fitRoom(Wr, Hr, cover, band, f);
  roomImg.width = Wr; roomImg.height = Hr;
  roomEl.style.transition = 'none';
  roomEl.style.transform = `translate3d(${fit.ox}px, ${fit.oy}px, 0) scale(${fit.s})`;
  // settle-in on the image itself: start slightly larger around the focus point, ease to 1
  roomImg.style.transition = 'none';
  roomImg.style.transformOrigin = `${f.x * 100}% ${f.y * 100}%`;
  roomImg.style.transform = 'scale(1.06)';
  void roomEl.offsetWidth;
  roomEl.style.transition = animate && !state.reduced ? 'opacity var(--dur) var(--ease)' : 'none';
  roomImg.style.transition = animate && !state.reduced ? 'transform 1600ms var(--ease)' : 'none';
  roomImg.style.transform = 'scale(1)';
  roomEl.style.opacity = '1';
  emit();
}

// ---- Parallax (building view only, pointer devices only) ----
let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
function tick() {
  px += (tx - px) * 0.08; py += (ty - py) * 0.08;
  const active = !state.inRoom && !state.reduced;
  const dx = active ? px * 14 : 0, dy = active ? py * 10 : 0, sc = active ? 1.015 : 1;
  parallaxEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sc})`;
  pinsEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sc})`;
  if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001 || !active) raf = requestAnimationFrame(tick); else raf = 0;
}
if (matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (e) => {
    const { vw, vh } = viewport();
    tx = (e.clientX / vw - 0.5) * 2; ty = (e.clientY / vh - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
}
parallaxEl.style.transformOrigin = '50% 50%';
pinsEl.style.transformOrigin = '50% 50%';
pinsEl.style.position = 'fixed'; pinsEl.style.inset = '0'; pinsEl.style.zIndex = '20'; pinsEl.style.pointerEvents = 'none';

// ---- Resize ----
let resizeT = 0;
function scheduleRefit() {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (!state.W) return;
    computeBase();
    if (state.inRoom && state.currentRoom) goRoom(state.currentRoom, false); else goBuilding(false);
  }, 60);
}
window.addEventListener('resize', scheduleRefit);
// The stage's own box, not just the window's. Everything here is fitted to #stage, and its box can
// change with no window resize at all: a stylesheet that applies late (Safari runs module scripts
// before pending stylesheets — main.js waits for it, this is the backstop), a scrollbar coming or
// going, iOS collapsing its toolbar. Only a real change refits; the fit writes transforms, never
// the stage's size, so this cannot loop.
if (window.ResizeObserver) {
  let seen = '';
  new ResizeObserver(() => {
    const key = `${stage.clientWidth}x${stage.clientHeight}`;
    if (key === seen) return;
    const first = !seen;
    seen = key;
    if (!first) scheduleRefit();
  }).observe(stage);
}

// The portrait band is sized by CSS, so anything that changes the copy around it — Jost arriving
// and re-wrapping the thesis line, the address bar collapsing, a rotation — changes where the
// building belongs. Watching the band itself catches all of them; resize alone caught none of
// the first kind. Nothing in here writes back to the band's size, so this cannot loop.
if (window.ResizeObserver && bandEl) {
  let first = true;
  new ResizeObserver(() => {
    if (first) { first = false; return; }   // the observation that fires on observe()
    if (!state.W || !state.portrait) return;
    computeBase();
    if (!state.inRoom) { applyMaster(state.s0, state.ox0, state.oy0, false); emit(); }
  }).observe(bandEl);
}
// Move the camera inside the room the visitor is already standing in. Same placement maths as
// arrival — fitRoom by a normalized focus point — so a pan and an entry cannot disagree about
// where a point on the render belongs. Everything mounted on the render is a child of #room, so
// mounted screens travel with it and nothing needs to be repositioned.
//
// fitRoom clamps the render to keep it covering the stage, so a focus near an edge is honoured as
// far as the edge and no further. That is the correct behaviour: the camera stops at the wall.
export function panRoom(focus, ms = 1200) {
  if (!state.inRoom) return false;
  const Wr = roomImg.naturalWidth, Hr = roomImg.naturalHeight;
  if (!Wr || !Hr) return false;
  const fit = fitRoom(Wr, Hr, roomCoverRect(), visibleRect(), focus);
  roomEl.style.transition = state.reduced ? 'none'
    : `transform ${ms}ms var(--ease), opacity var(--dur) var(--ease)`;
  roomEl.style.transform = `translate3d(${fit.ox}px, ${fit.oy}px, 0) scale(${fit.s})`;
  return true;
}

export function setCurrentRoom(room) { state.currentRoom = room; }
