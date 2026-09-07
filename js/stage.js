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

const state = {
  W: 0, H: 0,            // master natural size
  s0: 0, ox0: 0, oy0: 0, // cover-fit base transform
  s: 0, ox: 0, oy: 0,    // current master transform
  inRoom: false,
  panelW: 0,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  listeners: new Set(),
};

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

// The part of the viewport the visitor can actually see while a room is open: the HUD bar sits
// on top, and the panel takes either the right edge (desktop) or everything below 40vh (phone,
// where it is a bottom sheet). Everything a room wants seen has to land inside this rectangle.
function visibleRect() {
  const { vw, vh } = viewport();
  const hudH = cssPx('--hud-h', 56);
  const panelW = vw < 768 ? 0 : panelWidth();
  const bottom = vw < 768 ? vh * 0.4 : vh;
  const r = { x: 0, y: hudH, w: vw - panelW, h: Math.max(120, bottom - hudH) };
  r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2;
  return r;
}

// How far past a plain cover-fit a room render may be pushed to bring its focus point into the
// visible band. The phone band is short (about a third of the screen), so honouring the focus
// exactly would crop the room down to one desk; the cap trades a little accuracy for context.
const MAX_ROOM_ZOOM = 1.6;

// Place a room render so its focus point sits at the middle of the visible band while the image
// still covers the whole viewport — the panel is translucent, so an uncovered strip behind it
// would read as a seam. Cover-fit alone pins the image to the viewport edges and throws the
// focus value away, which is what used to hide every room's subject under the panel or sheet.
function fitRoom(Wr, Hr, view, band, focus) {
  const fx = Math.min(0.98, Math.max(0.02, (focus && focus.x) != null ? focus.x : 0.5));
  const fy = Math.min(0.98, Math.max(0.02, (focus && focus.y) != null ? focus.y : 0.5));
  const cover = Math.max(view.vw / Wr, view.vh / Hr);
  // Smallest scale at which the focus point can sit at the band centre without uncovering an edge.
  const need = Math.max(
    band.cx / (fx * Wr), (view.vw - band.cx) / ((1 - fx) * Wr),
    band.cy / (fy * Hr), (view.vh - band.cy) / ((1 - fy) * Hr)
  );
  const s = Math.min(Math.max(cover, need), cover * MAX_ROOM_ZOOM);
  let ox = band.cx - fx * Wr * s, oy = band.cy - fy * Hr * s;
  ox = Math.min(0, Math.max(view.vw - Wr * s, ox));
  oy = Math.min(0, Math.max(view.vh - Hr * s, oy));
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

function computeBase() {
  const { vw, vh } = viewport();
  const s0 = Math.max(vw / state.W, vh / state.H);
  state.s0 = s0;
  state.ox0 = (vw - state.W * s0) / 2;
  state.oy0 = (vh - state.H * s0) / 2;
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

export async function goRoom(room, animate = true) {
  state.inRoom = true;
  state.panelW = panelWidth();
  const view = viewport();
  const band = visibleRect();
  const z = room.hotspot.zoom || 2.6;
  const s1 = state.s0 * z;
  stage.classList.add('in-room');
  document.body.classList.add('in-room');
  applyMaster(s1, band.cx - room.hotspot.x * state.W * s1, band.cy - room.hotspot.y * state.H * s1, animate);

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
  const fit = fitRoom(Wr, Hr, view, band, f);
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
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (!state.W) return;
    computeBase();
    if (state.inRoom && state.currentRoom) goRoom(state.currentRoom, false); else goBuilding(false);
  }, 60);
});
export function setCurrentRoom(room) { state.currentRoom = room; }
