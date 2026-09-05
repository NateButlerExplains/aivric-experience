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

// ---- Building view <-> room view ----
export function goBuilding(animate = true) {
  state.inRoom = false;
  stage.classList.remove('in-room');
  document.body.classList.remove('in-room');
  applyMaster(state.s0, state.ox0, state.oy0, animate);
  roomEl.style.transition = animate && !state.reduced ? 'opacity var(--dur) var(--ease), transform var(--dur) var(--ease)' : 'none';
  roomEl.style.opacity = '0';
  emit();
}

let roomToken = 0;
export async function goRoom(room, animate = true) {
  state.inRoom = true;
  state.panelW = panelWidth();
  const { vw, vh } = viewport();
  const mobile = vw < 768;
  // Desktop: panel covers the right side, so center in the remaining width.
  // Mobile: panel is a bottom sheet from 40vh down, so center in the visible top band (below the HUD).
  const hudH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 56;
  const cx = mobile ? vw / 2 : (vw - state.panelW) / 2;
  const cy = mobile ? hudH + (vh * 0.4 - hudH) / 2 : vh / 2;
  const z = room.hotspot.zoom || 2.6;
  const s1 = state.s0 * z;
  const ox1 = cx - room.hotspot.x * state.W * s1;
  const oy1 = cy - room.hotspot.y * state.H * s1;
  stage.classList.add('in-room');
  document.body.classList.add('in-room');
  applyMaster(s1, ox1, oy1, animate);

  // Room render (optional). Cover-fit so the focus point lands at the visible center.
  const token = ++roomToken;
  if (room.render) {
    const ok = await new Promise((res) => { roomImg.onload = () => res(true); roomImg.onerror = () => res(false); roomImg.src = room.render; });
    if (token !== roomToken) return;
    if (ok) {
      const Wr = roomImg.naturalWidth, Hr = roomImg.naturalHeight;
      const f = room.focus || { x: 0.5, y: 0.5 };
      const sR = Math.max(vw / Wr, vh / Hr);
      let oxR = cx - f.x * Wr * sR, oyR = cy - f.y * Hr * sR;
      oxR = Math.min(0, Math.max(vw - Wr * sR, oxR));
      oyR = Math.min(0, Math.max(vh - Hr * sR, oyR));
      roomImg.width = Wr; roomImg.height = Hr;
      roomEl.style.transition = 'none';
      roomEl.style.transform = `translate3d(${oxR}px, ${oyR}px, 0) scale(${sR})`;
      // settle-in on the image itself: start slightly larger around the focus point, ease to 1
      roomImg.style.transition = 'none';
      roomImg.style.transformOrigin = `${f.x * 100}% ${f.y * 100}%`;
      roomImg.style.transform = 'scale(1.06)';
      void roomEl.offsetWidth;
      roomEl.style.transition = animate && !state.reduced ? 'opacity var(--dur) var(--ease)' : 'none';
      roomImg.style.transition = animate && !state.reduced ? 'transform 1600ms var(--ease)' : 'none';
      roomImg.style.transform = 'scale(1)';
      roomEl.style.opacity = '1';
    } else {
      roomEl.style.opacity = '0';
    }
  } else {
    roomEl.style.opacity = '0';
  }
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
