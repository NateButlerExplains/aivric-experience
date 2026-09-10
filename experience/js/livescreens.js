// Living screens: the painted displays inside a room render show the real product.
//
// Every room render is a photograph, and every display in it is dead pixels. This module gives
// each one the station's own screenshots, slowly cross-faded, and makes it a way into that
// station. Geometry comes from content/screens.json; the pictures come from the manifest the
// panel already uses, so nothing new is downloaded and nothing is invented.
//
// The screens are deliberately NOT readable. The biggest surface in the building is about 1240
// image pixels wide and most are a fifth of that, so at any real viewport a screenshot mounted
// there is texture, not information. That is the whole design: the room says "this is running,
// and it is ours", and the panel — where change 01 put it — says what it actually is.
//
// Three things this module is careful about:
//   - It is additive. No screens.json, or ?screens=0, and the experience behaves exactly as before.
//   - It owns no layout. screens.js parks each surface inside #room, so the stage's pan, zoom,
//     crossfade, parallax and resize carry them along with the photograph for free.
//   - A display is lit the moment its picture is ready to paint, not on a timer. An earlier
//     version held every screen hidden for 1.7s to protect the zoom's frame budget, and the cost
//     was that you arrived in a room full of dark screens that woke up afterwards. Now each screen
//     reveals on its own image's decode() — pre-warmed at boot, so in practice that has already
//     happened before you enter and the room is lit on arrival. The per-frame drift is still held
//     back until the camera stops, because that is a genuine per-frame cost; painting a decoded
//     image is not.

import { mountScreen, getScreenElement, unmountScreen, quadSize, applySurfaceMask } from './screens.js?v=2026-09-10t';
import clock from './clock.js?v=2026-09-10t';

const params = new URLSearchParams(location.search);
const MODE = params.get('screens');          // '0' off, 'debug' grid, anything else normal
const DEBUG = MODE === 'debug';

const CYCLE = 9;        // seconds a still holds before the cross-fade to the next one
const SETTLE = 1.7;     // seconds of stillness after entering a room, while the camera arrives
const DRIFT = 34;       // seconds for one full ken-burns cycle

let geometry = null;              // roomId -> { imageWidth, imageHeight, surfaces: [...] }
let mediaByStation = new Map();   // stationId -> [{ src, station, caption }]
let allStills = [];               // every still in the building, in manifest order
let onStation = () => {};
let live = [];                    // the surfaces mounted right now
let unsubscribe = null;
let mountedAt = 0;
let arrived = false;
let currentRoomId = null;

/* ---------------------------------------------------------------- *
 * Setup
 * ---------------------------------------------------------------- */

// A screen shows stills only. A video's poster is its still; a video without one is skipped,
// because pulling a multi-megabyte clip onto a 190-pixel surface buys nothing. Every still
// remembers which station it came from, because that is where clicking it goes.
function stillsOf(station) {
  const out = [];
  for (const m of station.media || []) {
    const src = m.type === 'video' ? m.poster : m.src;
    if (src) out.push({ src, station: station.id, caption: m.caption || '' });
  }
  return out;
}

/**
 * Load the surface geometry and index the manifest's media by station.
 * Resolves to false — harmlessly — when there is no geometry to load.
 */
export async function initLiveScreens(rooms) {
  if (MODE === '0') return false;
  mediaByStation = new Map();
  allStills = [];
  for (const r of rooms || []) {
    for (const s of r.stations || []) {
      const list = stillsOf(s);
      mediaByStation.set(s.id, list);
      allStills.push(...list);
    }
  }
  try {
    const res = await fetch('content/screens.json', { cache: 'no-cache' });
    if (!res.ok) return false;                         // not published yet: silently do nothing
    const data = await res.json();
    geometry = data && data.rooms ? data.rooms : null;
  } catch {
    geometry = null;                                   // malformed or offline: same silence
  }
  // Decode one still per station while the floor is idle. Entering a room then paints from cache
  // and the displays are lit on arrival rather than a beat later.
  if (geometry) {
    const warm = () => {
      const seen = new Set();
      for (const list of mediaByStation.values()) {
        const m = list[0];
        if (!m || seen.has(m.src)) continue;
        seen.add(m.src);
        const img = new Image();
        img.decoding = 'async';
        img.src = m.src;
        if (img.decode) img.decode().catch(() => {});
      }
    };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 1200);
  }
  return !!geometry;
}

export function initLiveScreenNav(handler) { onStation = handler || onStation; }

// The surface geometry, shared with any other feature that drives a display in these renders.
// One fetch, one file, one source of truth for where the screens are.
export function getScreenGeometry() { return geometry; }

/* ---------------------------------------------------------------- *
 * Mounting
 * ---------------------------------------------------------------- */

// Most stations in the manifest have no media yet — including aire-workflow, which owns the
// largest display in the building. A surface whose station is empty borrows from its own room
// first and from the rest of the building second, so no display sits dead while real product
// screenshots exist a room away. What it borrows is not a fiction: each still carries its own
// station, and clicking the display goes to whatever it is currently showing, not to the station
// the surface was nominally assigned. The real fix is media for those stations; this is what the
// building looks like until there is some.
function stillsFor(surface, room, selectedStationId, taken) {
  const own = mediaByStation.get((surface.primary && selectedStationId) || surface.station);
  if (own && own.length) { for (const m of own) taken.add(m.src); return own; }

  const roomFirst = [];
  for (const st of room.stations || []) roomFirst.push(...(mediaByStation.get(st.id) || []));
  // Room stills first, then the rest of the building; de-duplicated, since allStills contains
  // this room's too and a surface must not cross-fade an image to itself.
  const seen = new Set();
  const pool = [...roomFirst, ...allStills].filter((m) => !seen.has(m.src) && seen.add(m.src));
  // Prefer stills no other surface in this room has claimed, so two displays are not twins.
  const fresh = pool.filter((m) => !taken.has(m.src));
  const picked = (fresh.length ? fresh : pool).slice(0, 4);
  for (const m of picked) taken.add(m.src);
  return picked.length ? picked : null;
}

// One cell: two images cross-faded by swapping which is on top. Cheaper and steadier than
// replacing the <img>, which would flash whenever a still had not been decoded yet.
function buildCell(first) {
  const wrap = document.createElement('div');
  wrap.className = 'ls-wrap';
  for (let i = 0; i < 2; i++) {
    const img = document.createElement('img');
    img.className = 'ls-frame' + (i === 0 ? ' is-on' : '');
    img.decoding = 'async';
    img.alt = '';
    if (i === 0 && first) img.src = first.src;
    wrap.appendChild(img);
  }
  return wrap;
}

// A tall, narrow surface — the boardroom table's glass inset is the one we have — gets a single
// screenshot scaled until you are looking at a tenth of it. Three shorter panels stacked down the
// same space read as a dashboard instead, and each one is at a size you can actually take in.
function buildContent(stills, surface) {
  const cells = surface && surface.layout === 'stack3' ? 3 : 1;
  if (cells === 1) return buildCell(stills[0]);
  const stack = document.createElement('div');
  stack.className = 'ls-stack';
  for (let i = 0; i < cells; i++) {
    const panel = document.createElement('div');
    panel.className = 'ls-panel';
    panel.innerHTML = '<span class="ls-chrome"><i></i><i></i><i></i></span>';
    panel.appendChild(buildCell(stills[i % stills.length]));
    stack.appendChild(panel);
  }
  return stack;
}

/* ---------------------------------------------------------------- *
 * Occlusion
 *
 * The render is a photograph, so it has no depth: a screen paints over whatever stands in front of
 * it. Three ways to deal with that, in order of preference, and only the last one is code:
 *
 *   1. CROP. Shrink the quad to the clear rectangle. A straight edge along the display's own
 *      plane reads as a panel boundary. This is what the Defense wall does.
 *   2. FADE. Where an occluder only clips an edge — heads along the AIRE board's bottom, the
 *      ceiling ribbon over the boardroom glass — a directional gradient has no edge to get wrong.
 *   3. SKIP. If the clear area is under the size floor, do not mount it. Offense's centre monitor.
 *
 * Tracing a silhouette is the LAST resort and is now used for exactly one thing: the two glass
 * mullions in the Client Vision chamber, which are hard-edged architectural objects, so a
 * hard-edged mask matches them. Tracing a person never worked: a hand-drawn polygon against a soft,
 * slightly out-of-focus photographic edge reads as a bad cut-out no matter how it is feathered,
 * and tightening the feather made it worse rather than better.
 *
 * The mask is one SVG data-URI: a white plate, minus each occluder polygon, blurred at the edge,
 * optionally with a fade band folded into the same image. One mask layer, so no mask-composite —
 * which is the part with uneven browser support.
 * ---------------------------------------------------------------- */

function debugContent(surface) {
  const d = document.createElement('div');
  d.className = 'ls-debug';
  d.innerHTML = `<span>${surface.id}</span>`;
  return d;
}

/** Mount every surface defined for this room, bound to the station currently open. */
export function showRoomScreens(room, station) {
  // Changing station inside the room you are already standing in is not an arrival. Re-mounting
  // would blink every display for a panel change, so the primary just picks up the new station's
  // stills where it is — the same "stay in the saddle" rule the panel follows.
  if (room && currentRoomId === room.id && live.length) { rebindPrimary(station); return; }
  clearScreens();
  currentRoomId = room ? room.id : null;
  if (!geometry || !room) return;
  const spec = geometry[room.id];
  if (!spec || !Array.isArray(spec.surfaces)) return;

  const selected = station ? station.id : null;
  const taken = new Set();
  // A surface with a `driver` belongs to another feature — the AIRE columns are the approver
  // board's. Without this both features mount on the same four quads and fight over them.
  spec.surfaces.filter((x) => x.mount !== false && !x.driver).forEach((surface, i) => {
    const list = stillsFor(surface, room, selected, taken);
    if (!DEBUG && !list) return;                        // nothing real to show: leave it dark
    const stationId = list[0].station;

    const clickable = !DEBUG && !!stationId;
    const screenId = mountScreen({
      layer: room.id,
      quad: surface.quad,
      content: DEBUG ? debugContent(surface) : buildContent(list, surface),
      id: `ls-${surface.id}`,
      className: 'screen-live is-arriving' + (DEBUG ? ' is-debug' : '')
        + (clickable ? ' is-live-link' : '') + (surface.glass ? ' is-glass' : ''),
      interactive: clickable,
    });
    if (!screenId) return;                              // screens.js rejected the quad and said why

    const el = getScreenElement(screenId);
    if (!DEBUG) applySurfaceMask(el, surface);
    if (surface.dim != null) el.style.setProperty('--ls-dim', String(surface.dim));

    if (clickable) {
      el.dataset.station = stationId;
      // Read at click time, not at mount: the display may have cross-faded to another product.
      el.addEventListener('click', () => onStation(el.dataset.station));
    }

    // Reveal this screen as soon as its own picture can paint. decode() resolves immediately for
    // an already-warmed image, so the common path is lit-on-arrival with no timer involved.
    const first = el.querySelector('.ls-frame');
    const light = () => el.classList.remove('is-arriving');
    if (DEBUG || !first) light();
    else if (first.decode) first.decode().then(light, light);
    else if (first.complete) light();
    else first.addEventListener('load', light, { once: true });

    live.push({
      screenId, el, stationId, stills: list || [], primary: !!surface.primary,
      cells: surface.layout === 'stack3' ? 3 : 1,
      frame: 0,
      // Offset each surface around the cycle so the room does not blink all at once.
      next: CYCLE + (i * CYCLE) / Math.max(1, spec.surfaces.length),
      phase: (i * 0.37) % 1,
    });
  });

  if (!live.length) return;
  arrived = false;
  mountedAt = clock.now();
  if (!unsubscribe) unsubscribe = clock.subscribe(tick);
  clock.play();
}

function rebindPrimary(station) {
  const s = live.find((x) => x.primary);
  if (!s || !station) return;
  const list = mediaByStation.get(station.id);
  if (!list || !list.length || s.stationId === station.id) return;
  s.stationId = station.id;
  s.stills = list;
  s.frame = -1;                       // so advance() lands on 0, cross-fading rather than cutting
  s.el.dataset.station = station.id;
  advance(s);
  s.next = (clock.now() - mountedAt) + CYCLE;
}

export function clearScreens() {
  currentRoomId = null;
  if (!live.length) return;
  for (const s of live) unmountScreen(s.screenId);   // only ours: other screens keep their layer
  live = [];
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

/* ---------------------------------------------------------------- *
 * Motion
 * ---------------------------------------------------------------- */

function advance(s) {
  const n = s.stills.length;
  if (!n || (n < 2 && s.frame >= 0)) return;
  s.frame = (s.frame + 1) % n;
  // A stacked surface turns all of its panels on the same beat, so the whole board changes at once
  // rather than flickering panel by panel.
  const wraps = [...s.el.querySelectorAll('.ls-wrap')];
  let lead = null;
  wraps.forEach((wrap, cell) => {
    const next = s.stills[(s.frame * wraps.length + cell) % n];
    if (!next) return;
    if (cell === 0) lead = next;
    const [a, b] = wrap.querySelectorAll('.ls-frame');
    const incoming = a.classList.contains('is-on') ? b : a;
    const outgoing = incoming === a ? b : a;
    incoming.src = next.src;
    incoming.classList.add('is-on');
    outgoing.classList.remove('is-on');
  });
  if (lead && lead.station) { s.stationId = lead.station; s.el.dataset.station = lead.station; }
}

function tick(t) {
  const since = t - mountedAt;
  // A screen that somehow never decoded still gets lit, so a broken image can never leave a
  // display permanently dark.
  if (!arrived && since >= SETTLE) {
    arrived = true;
    for (const s of live) s.el.classList.remove('is-arriving');
  }
  // Reduced motion gets one still per surface and no drift — the screens are still there, still
  // lit and still clickable, which is the part that carries meaning.
  if (clock.reducedMotion) return;
  for (const s of live) {
    if (since >= s.next) { advance(s); s.next += CYCLE; }
    if (since < SETTLE) continue;
    const u = ((since - SETTLE) / DRIFT + s.phase) % 1;
    const k = Math.sin(u * Math.PI * 2);
    s.el.style.setProperty('--ls-drift', k.toFixed(4));
  }
}

export default { initLiveScreens, initLiveScreenNav, showRoomScreens, clearScreens };
