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
//   - It stays dark while the camera moves. Painting eighteen screenshots inside a layer that is
//     being transformed costs real frames — measured, the zoom's p95 frame time goes from 16.9 ms
//     to 25.1 ms with them visible and back to 16.9 ms with them hidden. So the displays come up
//     after the room has landed, which is also the better beat: you arrive, and then the room
//     wakes up.

import { mountScreen, getScreenElement, unmountScreen, solveProjective, quadSize } from './screens.js?v=2026-09-08c';
import clock from './clock.js?v=2026-09-08c';

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
  return !!geometry;
}

export function initLiveScreenNav(handler) { onStation = handler || onStation; }

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

function buildContent(stills) {
  // Two stacked images, cross-faded by swapping which one is on top. Cheaper and steadier than
  // replacing the <img>, which would flash whenever a still had not been decoded yet.
  const wrap = document.createElement('div');
  wrap.className = 'ls-wrap';
  for (let i = 0; i < 2; i++) {
    const img = document.createElement('img');
    img.className = 'ls-frame' + (i === 0 ? ' is-on' : '');
    img.decoding = 'async';
    img.alt = '';
    if (i === 0) img.src = stills[0].src;
    wrap.appendChild(img);
  }
  return wrap;
}

/* ---------------------------------------------------------------- *
 * Occlusion
 *
 * The render is a photograph, so it has no depth: a screen paints over the man standing at the
 * Defense wall and over the heads along the AIRE board. A luma key cannot separate them — these
 * displays show dark maps, so the people are no darker than the content they stand in front of.
 * So the silhouettes are traced by hand into screens.json, in the render's own image pixels, and
 * punched back out here.
 *
 * The mask is one SVG data-URI: a white plate, minus each occluder polygon, blurred at the edge,
 * optionally with a fade band folded into the same image. One mask layer, so no mask-composite —
 * which is the part with uneven browser support.
 * ---------------------------------------------------------------- */

// Image pixels -> the screen's own (0,0)-(w,h) rectangle. This is exactly the inverse of the map
// screens.js applies, solved the same way, so a traced point lands where it was traced.
function toLocal(quad, w, h) {
  const m = solveProjective(quad, [[0, 0], [w, 0], [w, h], [0, h]]);
  if (!m) return null;
  const [a, b, c, d, e, f, g, hh] = m;
  return ([x, y]) => {
    const wp = g * x + hh * y + 1;
    return [(a * x + b * y + c) / wp, (d * x + e * y + f) / wp];
  };
}

function buildMask(surface, w, h) {
  const polys = surface.occluders || [];
  if (!polys.length && !surface.fade) return null;
  const map = toLocal(surface.quad, w, h);
  if (!map && polys.length) return null;

  const blur = Math.max(1.5, Math.min(w, h) * 0.012);
  const shapes = polys.map((pts) => {
    const p = pts.map(map).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return `<polygon points="${p}" fill="#000"/>`;
  }).join('');

  // `fade` is a plain top-down falloff for a row of heads clipping a board's lower edge — the one
  // occlusion shape common enough to be worth a shorthand instead of a traced polygon.
  const fade = surface.fade
    ? `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="${(1 - surface.fade).toFixed(3)}" stop-color="#fff"/>` +
        `<stop offset="1" stop-color="#000"/></linearGradient>`
    : '';

  // CSS mask-image reads the image's ALPHA, not its luminance, so black-on-white would mask
  // nothing. The holes have to be real transparency — which is what the inner SVG <mask> (which
  // *does* work on luminance) produces when the plate is rasterised through it.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs>${fade}` +
        `<filter id="b" x="-15%" y="-15%" width="130%" height="130%">` +
          `<feGaussianBlur stdDeviation="${blur.toFixed(1)}"/></filter>` +
        `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">` +
          `<rect width="${w}" height="${h}" fill="${surface.fade ? 'url(#f)' : '#fff'}"/>` +
          `<g filter="url(#b)">${shapes}</g>` +
        `</mask>` +
      `</defs>` +
      `<rect width="${w}" height="${h}" fill="#fff" mask="url(#m)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

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
  spec.surfaces.filter((x) => x.mount !== false).forEach((surface, i) => {
    const list = stillsFor(surface, room, selected, taken);
    if (!DEBUG && !list) return;                        // nothing real to show: leave it dark
    const stationId = list[0].station;

    const clickable = !DEBUG && !!stationId;
    const screenId = mountScreen({
      layer: room.id,
      quad: surface.quad,
      content: DEBUG ? debugContent(surface) : buildContent(list),
      id: `ls-${surface.id}`,
      className: 'screen-live is-arriving' + (DEBUG ? ' is-debug' : '')
        + (clickable ? ' is-live-link' : '') + (surface.glass ? ' is-glass' : ''),
      interactive: clickable,
    });
    if (!screenId) return;                              // screens.js rejected the quad and said why

    const el = getScreenElement(screenId);
    // The mask is sized to the screen's own rectangle, which screens.js derives from the quad.
    const { width: mw, height: mh } = quadSize(surface.quad) || { width: 0, height: 0 };
    const mask = DEBUG ? null : buildMask(surface, mw, mh);
    if (mask) {
      el.style.maskImage = mask; el.style.webkitMaskImage = mask;
      el.style.maskSize = '100% 100%'; el.style.webkitMaskSize = '100% 100%';
    }
    if (surface.dim != null) el.style.setProperty('--ls-dim', String(surface.dim));

    if (clickable) {
      el.dataset.station = stationId;
      // Read at click time, not at mount: the display may have cross-faded to another product.
      el.addEventListener('click', () => onStation(el.dataset.station));
    }

    live.push({
      screenId, el, stationId, stills: list || [], primary: !!surface.primary,
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
  if (!s.stills.length || (s.stills.length < 2 && s.frame >= 0)) return;
  s.frame = (s.frame + 1) % s.stills.length;
  const [a, b] = s.el.querySelectorAll('.ls-frame');
  const incoming = a.classList.contains('is-on') ? b : a;
  const outgoing = incoming === a ? b : a;
  const next = s.stills[s.frame];
  incoming.src = next.src;
  incoming.classList.add('is-on');
  outgoing.classList.remove('is-on');
  if (next.station) { s.stationId = next.station; s.el.dataset.station = next.station; }
}

function tick(t) {
  const since = t - mountedAt;
  // The displays wake up once the camera has arrived. This is above the reduced-motion return on
  // purpose: reduced motion still gets lit, clickable screens — it just gets them without a fade.
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
