// Six panels, one truth: the Client Vision arrival sequence.
//
// The chamber's render has a gold sphere with six holographic panels around it, and in the steady
// state the panels show product stills. On arrival this module makes the argument the room is
// built on — that the six panels are what the sphere is MADE OF — and then gets out of the way:
//
//   1. The six displays wake one at a time, one per Fabric pillar, each with a small plate carrying
//      the pillar's name (the manifest's own words; nothing here is invented).
//   2. As each wakes, a thread of light leaves it and converges on the sphere, in the render's own
//      palette: cool blue from the left-hand panels, warm gold from the right, so the threads read
//      as more of the streams the photograph already has. Each arrival brightens the sphere a touch.
//   3. When all six are in, the sphere takes the light, the plates fade, and the room is exactly
//      the steady state that livescreens.js runs — nothing of this module is left in the DOM.
//
// It runs once per ARRIVAL. A station change inside the room is not an arrival (same rule as
// livescreens), and it never loops. Reduced motion, ?screens=0 or ?panels=0 land straight on the
// steady state. Everything is data: a room whose screens.json spec carries `sequence` and whose
// surfaces carry `order` gets the sequence; no other room is touched.
//
// The light is drawn on a canvas covering the region the threads touch, mounted through screens.js
// so it inherits the stage's pan, zoom and crossfade. It is deliberately NOT a vector line: each
// thread is a bundle of a few dozen faint, unequal fibres — different widths, brightness, spacing
// and length, a few of them outliers outside the bundle — stroked on two canvases: a half-
// resolution one for the cores and a quarter-resolution one for the glow, which the browser's own
// bilinear upscale turns into a soft, grain-free halo for free. No single fibre is bright enough
// to be picked out at 1x; the stream is their sum. Nothing has a hard end: every fibre fades in
// out of its panel and fades out again inside the sphere, at its own depth, so the bundle frays
// into the sphere the way the photograph's own streams do. The strands are accumulated additively
// on the canvas ('lighter'), so where they cross they brighten, as light does. And nothing is ever
// rasterised on the panel's own side of the edge the light leaves through: each thread is clipped
// to its panel plus the space beyond that edge, so light can only ever be seen leaving the panel.
//
// Timing is entirely the shared clock's, never setTimeout, so the film export (which steps the
// clock) and reduced motion both behave.

import { mountScreen, getScreenElement, unmountScreen, applySurfaceMask, quadSize } from './screens.js?v=2026-09-10u';
import { getScreenGeometry } from './livescreens.js?v=2026-09-10u';
import clock from './clock.js?v=2026-09-10u';
import { FILM } from './director.js?v=2026-09-10u';

const params = new URLSearchParams(location.search);
const OFF = params.get('panels') === '0' || params.get('screens') === '0';

/* ---------------------------------------------------------------- *
 * The timeline, in seconds after the route change
 * ---------------------------------------------------------------- */

const FIRST = 1.0;      // first panel wakes: the camera has landed (stage.js --dur is 900 ms)
const STEP_MIN = 0.26;  // between panels — uneven on purpose, so no two threads share a phase
const STEP_MAX = 0.40;
const LEAD = 0.1;       // a thread leaves its panel this long after the plate wakes
const DRAW = 0.8;       // a thread's travel time to the sphere
const HOLD = 0.1;       // after the last arrival, before the sphere takes the light
const DISSOLVE = 0.6;   // the threads are drawn into the sphere
const PLATE_LAG = 0.2;  // the plate rises this long after the still starts to fade up (700 ms),
                        // so the name never sits over the render's bright baked-in imagery
const PLATE_IN = 0.45;
const PLATE_OUT = 0.55;
const BLOOM_OUT = 0.6;  // the extra light on the sphere eases back to the photograph
const WAKE = 0.9;       // how long a display holds its brighter "just lit" state
const SETTLE_BACK = 0.9; // and how long it takes to ease back (experience.css: is-settling)
const BUDGET = 4.5;     // the brief: fully settled, module gone, by here

const STRANDS = 28;     // fibres in the bundle: many and faint, so none is countable at 1x
const OUTER = 4;        // faint outliers either side of it, so the band has no constant-width edge
const STAGGER = 0.18;   // the last fibre leaves this long after the first, so the head is a streak
const INSET = 12;       // no fibre starts closer than this to a panel's edge (image px)
const NOISE_PERIOD = 90; // the brightness along a fibre varies no faster than this (image px)

// Deterministic "randomness": every visitor sees the same fibres, and the film export is repeatable.
const jitter = (k) => { const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/* ---------------------------------------------------------------- *
 * Setup
 * ---------------------------------------------------------------- */

let stations = new Map();   // stationId -> station, for the pillar names
let currentRoomId = null;
let run = null;             // the sequence in flight, or null

/** Index the manifest's stations so a room spec can name the one its pillars come from. */
export function initPanels(rooms) {
  stations = new Map();
  for (const r of rooms || []) for (const s of r.stations || []) stations.set(s.id, s);
}

// "GenAI Chat: cited, role-aware answers…" -> "GenAI Chat". The manifest writes every capability
// as "Name: what it does", which is exactly the split the plates need.
function pillarNames(stationId) {
  const st = stations.get(stationId);
  if (!st) return [];
  return (st.capabilities || []).map((c) => String(c).split(':')[0].trim()).filter(Boolean);
}

/* ---------------------------------------------------------------- *
 * Geometry — where a thread starts, bends and lands
 * ---------------------------------------------------------------- */

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const easeIn = (u) => u * u * u;
const smooth = (u) => u * u * (3 - 2 * u);

function bezier(p0, p1, p2, u) {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
}

// Convex-quad helpers, in image pixels. The quads are wound TL,TR,BR,BL; `inside` is measured
// from the quad's own centre so the winding never matters.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const quadCentre = (q) => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];

// Signed distance from p to each edge's line, positive inside. Linear in p, which is what lets
// clampInto solve the pull-in directly instead of searching for it.
function edgeDistances(q, c, p) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const e = sub(b, a), l = Math.hypot(e[0], e[1]) || 1;
    const sgn = cross(e, sub(c, a)) < 0 ? -1 : 1;
    out.push(sgn * cross(e, sub(p, a)) / l);
  }
  return out;
}

// The nearest point to p that is at least `inset` inside the quad, found by sliding p toward the
// centre: each edge's distance is linear along that segment, so the pull each edge needs is one
// division, and the largest of them satisfies all four.
function clampInto(p, q, c, inset) {
  const dp = edgeDistances(q, c, p), dc = edgeDistances(q, c, c);
  let k = 0;
  for (let i = 0; i < 4; i++) if (dp[i] < inset) k = Math.max(k, (inset - dp[i]) / Math.max(1e-6, dc[i] - dp[i]));
  k = clamp01(k);
  return [lerp(p[0], c[0], k), lerp(p[1], c[1], k)];
}

// How far a ray from `o` in direction `v` runs before it leaves the quad — the panel's extent
// behind the edge the light leaves through. Ignores hits within a pixel of the origin (that is
// the facing edge itself).
function rayExit(q, o, v) {
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const e = sub(b, a);
    const den = cross(v, e);
    if (Math.abs(den) < 1e-9) continue;
    const ao = sub(a, o);
    const t = cross(ao, e) / den, u = cross(ao, v) / den;
    if (t > 1 && u >= -0.001 && u <= 1.001) best = Math.min(best, t);
  }
  return best;
}

// Which edge the light leaves through: the one that faces the sphere, chosen by the dominant
// component of the panel-to-sphere direction. Returned as the quad index the edge starts at
// (edge i runs q[i] -> q[i+1]): 2 = bottom, 0 = top, 1 = right, 3 = left.
function facingEdge(q, sphere) {
  const c = quadCentre(q);
  const dx = sphere.x - c[0], dy = sphere.y - c[1];
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? 2 : 0;
  return dx > 0 ? 1 : 3;
}

// The region a thread may be drawn in: its panel, plus everything beyond the facing edge's line.
// One simple polygon — the quad's three other edges, then a bulge out past the facing edge — so
// there is no seam to anti-alias and no winding to get wrong. Anything a fibre might do on the
// panel's own side of that line, outside the panel, is exactly the "light sprouting from beside
// the hologram" that reads as a stroke pasted on the photograph, and the clip makes it impossible.
function threadClip(q, i, outN) {
  const j = (i + 1) % 4;
  const a = q[i], b = q[j];
  const e = unit(sub(b, a));
  const L = 4000, back = 2;                                // `back`: the bulge starts 2 px inside the quad
  const ox = outN[0], oy = outN[1];
  return [
    q[j], q[(j + 1) % 4], q[(j + 2) % 4], q[i],
    [a[0] - e[0] * L - ox * back, a[1] - e[1] * L - oy * back],
    [a[0] - e[0] * L + ox * L, a[1] - e[1] * L + oy * L],
    [b[0] + e[0] * L + ox * L, b[1] + e[1] * L + oy * L],
    [b[0] + e[0] * L - ox * back, b[1] + e[1] * L - oy * back],
  ];
}

function arcLength(p0, p1, p2) {
  let l = 0, prev = p0;
  for (let i = 1; i <= 24; i++) { const p = bezier(p0, p1, p2, i / 24); l += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  return l;
}

// One thread per ordered surface. The thread leaves through the edge that faces the sphere, from
// a little way inside the panel — the gradient hides its true start, so it reads as light
// condensing out of the panel's own content rather than a line pinned to a corner — and it ends
// INSIDE the sphere, well past the limb, fading as it goes: the panels sit so close to the sphere
// that a thread stopping at the limb would be a few dozen pixels long.
//
// The walk-back is measured against the panel's real extent behind that edge (a ray from the
// edge back through the quad), never against its width: the upper pair leave through their
// bottom edges and only have ~80 px of panel above them, and a walk-back sized to the width put
// the origin above the panel's top edge. Every fibre's start is then clamped to at least INSET px
// inside the quad, outliers included.
//
// How a thread bends depends on where its panel sits, because the photograph already has light
// there and the thread has to agree with it. Six identical arcs at 60° made a pinwheel — a logo
// laid on the photo — so nothing here is the same twice:
//   - the mid pair enter almost radially: they ARE the render's horizontal streams, and land a
//     few pixels off the baked ones so a new stream is seen arriving;
//   - the upper pair hug the panel-to-limb line: a bow from up there swings out into the open
//     air above the sphere, where the render has no light at all, and the little bow they keep
//     is on the outward side of the edge line so it never leans back toward the panel;
//   - below the sphere the gold beam falls at sphere.x. A gold thread bows into it and joins the
//     falling stream; a blue one must bow the other way, toward its own panel — blue light in the
//     gold beam reads as the beam, not as light leaving its panel.
function buildThread(surface, sphere, index, wake) {
  const q = surface.quad;
  const c = quadCentre(q);
  const side = c[0] < sphere.x ? -1 : 1;                     // -1: left (blue), +1: right (gold)
  const ei = facingEdge(q, sphere);
  const edge = [q[ei], q[(ei + 1) % 4]];
  const em = [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
  const outN = unit(sub(em, c));                             // the edge's outward normal
  const d = unit([sphere.x - em[0], sphere.y - em[1]]);
  const [dx, dy] = d;
  const n = [-dy, dx];                                       // d rotated a quarter turn: the bow's side

  const above = ei === 2, below = ei === 0, mid = !above && !below;
  let bendK, swirlK, startIn, weightK = 1, pulseA = 0.22;
  if (above) {
    // Outward side of the edge line: n or -n, whichever leans away from the panel.
    bendK = 0.05 * (n[0] * outN[0] + n[1] * outN[1] < 0 ? -1 : 1); swirlK = 0.06; startIn = 0.24;
  } else if (below) {
    const bowsToBeam = n[0] * (sphere.x - em[0]) > 0;        // does the rotational bow lean into the beam column
    const gold = side > 0;
    bendK = gold ? (bowsToBeam ? 0.22 : -0.22) : (bowsToBeam ? -0.10 : 0.10);
    swirlK = 0.16; startIn = 0.24;
    // The blue one runs against the render's own blue streams AND the gold beam, and was the one
    // thread a viewer had to look for in the all-six frame: a little heavier, a stronger landing.
    if (!gold) { weightK = 1.2; pulseA = 0.28; }
  } else {
    // The mid pair run inside the render's own streams and are the easiest to miss: a little
    // heavier, a little off the baked line, and a stronger pulse where they land.
    bendK = 0.10 + 0.04 * (index & 1); swirlK = 0.07; startIn = 0.34; weightK = 1.2; pulseA = 0.30;
  }

  const exit = rayExit(q, em, [-dx, -dy]);
  const extent = Number.isFinite(exit) ? exit : quadSize(q).width;
  const walk = Math.min(startIn, 0.55) * extent;
  const start = [em[0] - dx * walk, em[1] - dy * walk];
  // Each thread runs a different depth into the sphere and lands a little off its radial line,
  // so the six ends never meet on the core or rest level like two eyes.
  const depth = 0.2 + 0.35 * jitter(index * 13 + 5);
  const swirl = sphere.r * swirlK;
  const endAt = (dp) => [sphere.x - dx * sphere.r * dp + n[0] * swirl, sphere.y - dy * sphere.r * dp + n[1] * swirl];
  const end = endAt(depth);
  const limb = [sphere.x - dx * sphere.r, sphere.y - dy * sphere.r];
  const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const bend = span * bendK;

  const strands = [];
  const pitch = 1 / (STRANDS - 1);
  for (let j = 0; j < STRANDS + OUTER; j++) {
    const seed = index * 97 + j * 7;
    const outer = j >= STRANDS;
    // The bundle: evenly pitched, then knocked about by a third of a pitch, so the fibres neither
    // align into a comb nor clump. The outliers sit outside the band either side, faint.
    let f;
    // The mid pair are the heaviest and the straightest, and at 3x their fibres could be seen
    // falling into a faint comb; a wider knock breaks the pitch up where it would show.
    if (!outer) f = j * pitch - 0.5 + (jitter(seed) - 0.5) * (mid ? 1.1 : 0.7) * pitch;
    else f = (j % 2 ? 1 : -1) * (0.65 + 0.85 * jitter(seed));    // 26..60 px out at the start
    const p0 = clampInto([start[0] + n[0] * f * 40, start[1] + n[1] * f * 40], q, c, INSET);
    // Its own arrival depth (±0.25 r around the thread's) and, for a few, a shorter travel that
    // stops short of the others: this is what frays the bundle into the sphere instead of
    // cutting it flat.
    const sd = clamp(depth + (jitter(seed + 5) - 0.5) * 0.5, 0.06, 0.75);
    const e = endAt(sd);
    const p2 = [e[0] + n[0] * f * 18, e[1] + n[1] * f * 18];
    const b = bend * (0.75 + 0.5 * jitter(seed + 1)) + f * (above ? 12 : 30);
    const p1 = [(p0[0] + p2[0]) / 2 + n[0] * b, (p0[1] + p2[1]) / 2 + n[1] * b];
    const short = !outer && jitter(seed + 4) < 0.27;
    // Brightness breaks up along the fibre — low-frequency, fixed per fibre — the way the render's
    // own streams are brighter in some stretches than others. The noise is laid out in absolute
    // pixels along the curve, one sample every NOISE_PERIOD px or so, so it is the same light
    // whether a fibre is a stub just leaving its panel or its full length: noise spread over the
    // DRAWN span compressed into a regular dash pattern while the span was short.
    const length = arcLength(p0, p1, p2);
    const period = NOISE_PERIOD * (1 + 0.6 * jitter(seed + 9));
    const noise = [];
    for (let k = 0, nk = Math.ceil(length / period) + 2; k < nk; k++) noise.push(0.55 + 0.45 * jitter(seed * 3 + k + 11));
    // A few fibres are wide and soft — 3..5 px — and carry less alpha: they are the haze between
    // the fine ones, which is what stops any single fine one being separable at 1x.
    const wide = !outer && j % 7 === 3;
    strands.push({
      p0, p1, p2, noise, period, length,
      delay: jitter(seed + 2) * STAGGER, phase: j * 1.7 + index,
      reach: short ? 0.7 + 0.15 * jitter(seed + 6) : 1,
      width: outer ? 0.6 + 0.6 * jitter(seed + 3) : wide ? 3 + 2 * jitter(seed + 3) : 0.6 + 1.6 * jitter(seed + 3),
      // Narrow spread on purpose: one fibre twice as bright as its neighbours is a countable line.
      weight: weightK * (outer ? 0.04 + 0.05 * jitter(seed + 8) : wide ? 0.06 + 0.06 * jitter(seed + 8) : 0.16 + 0.2 * jitter(seed + 8)),
      outer, wide, halo: !outer && (j & 1) === 0, head: !outer && !wide && j % 3 === 1,
    });
  }
  return { side, strands, limb, end, wake, index, mid, pulseA, clip: threadClip(q, ei, outN) };
}

/* ---------------------------------------------------------------- *
 * The light
 * ---------------------------------------------------------------- */

// The render's own colours, sampled from its streams: the blue that enters from the left, the
// gold the sphere itself is made of. Cores run whiter, as a hot filament does.
const PALETTE = {
  '-1': { glow: '80,160,255', core: '190,225,255' },
  '1':  { glow: '255,170,85', core: '255,225,165' },
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// The brightness noise at `dist` image px along the fibre: smooth between the fibre's samples.
function noiseAt(s, dist) {
  const i = dist / s.period, k = Math.floor(i);
  const a = s.noise[Math.min(k, s.noise.length - 1)], b = s.noise[Math.min(k + 1, s.noise.length - 1)];
  return lerp(a, b, smooth(i - k));
}

// The light along one fibre, as a gradient over the drawn span (u0..u1 of the curve): fading in
// out of the panel over the first fifth, the fibre's own brightness noise — read at the stop's
// absolute distance along the curve — through the middle, and a tip that is never a hard end:
// soft while it travels, and once it is well into the sphere (`taper` -> 1) fading to nothing over
// the last quarter, so the fibre dissolves into the core rather than stopping on it. A linear
// gradient along the chord is close enough on these gentle curves. Built at full alpha; each
// stroke scales it with globalAlpha, so one gradient serves every width.
function strandGradient(ctx, s, a, b, u0, u1, taper, rgb) {
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  const K = 8;
  for (let k = 0; k <= K; k++) {
    const q = k / K;
    let v = noiseAt(s, lerp(u0, u1, q) * s.length) * (q < 0.2 ? smooth(q / 0.2) : 1);
    const soft = 1 - 0.7 * clamp01((q - 0.85) / 0.15);
    const full = 1 - smooth(clamp01((q - 0.72) / 0.28));
    v *= lerp(soft, full, taper);
    g.addColorStop(q, `rgba(${rgb},${v.toFixed(3)})`);
  }
  return g;
}

function clipTo(ctx, poly) {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) { const p = poly[i]; if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
  ctx.closePath();
  ctx.clip();
}

// The drawn part of a fibre as a path, built once per frame and stroked at every width: the
// bezier walk was most of a frame's arithmetic when each pass rebuilt it.
function strandPath(s, u0, u1) {
  const path = new Path2D();
  const N = s.outer || s.wide ? 14 : 22;    // the faint, soft fibres do not need the fine polyline
  for (let i = 0; i <= N; i++) {
    const p = bezier(s.p0, s.p1, s.p2, lerp(u0, u1, i / N));
    if (i === 0) path.moveTo(p[0], p[1]); else path.lineTo(p[0], p[1]);
  }
  return path;
}

function strokePath(ctx, path, style, width, alpha) {
  if (alpha <= 0.002) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function softDisc(ctx, x, y, r, rgb, alpha) {
  if (alpha <= 0.002) return;
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
  g.addColorStop(0.45, `rgba(${rgb},${(alpha * 0.35).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// One frame of light at sequence time `s`. Draws nothing outside the window it is needed in.
function drawLight(R, s) {
  const { main, glow, threads, sphere, t, box, phone } = R;
  main.ctx.clearRect(box.x, box.y, box.w, box.h);
  glow.ctx.clearRect(box.x, box.y, box.w, box.h);
  main.ctx.globalCompositeOperation = 'lighter';
  glow.ctx.globalCompositeOperation = 'lighter';
  const dissolve = clamp01((s - t.dissolveAt) / t.dissolve);     // 0 while the threads hold
  const bloomOut = 1 - clamp01((s - t.dissolveAt) / t.bloomOut);

  let level = 0;                                                // how much of the sphere has arrived
  for (const th of threads) {
    const pal = PALETTE[th.side];
    const leave = th.wake + LEAD;
    // Nothing of this thread outside its panel or the space beyond the edge it leaves through.
    // The clip is per thread, not per stroke: one path on each canvas, then every fibre.
    glow.ctx.save(); clipTo(glow.ctx, th.clip);
    main.ctx.save(); clipTo(main.ctx, th.clip);
    // Every fibre: where its head is, how far along its own travel, how far it has been taken in.
    for (const st of th.strands) {
      const prog = easeOut(clamp01((s - leave - st.delay) / DRAW));
      if (prog <= 0) continue;
      const head = prog * st.reach;
      const taper = smooth(clamp01((prog - 0.6) / 0.2));                 // well inside: the tip lets go
      const tail = easeIn(dissolve);                                     // the sphere drawing the tail in
      const fade = 1 - dissolve * dissolve;
      const shimmer = 0.9 + 0.1 * Math.sin(s * 5.2 + st.phase);
      const a = st.weight * fade * shimmer;
      const u0 = tail * head;
      if (head - u0 < 0.005 || a <= 0.005) continue;
      const pa = bezier(st.p0, st.p1, st.p2, u0), pb = bezier(st.p0, st.p1, st.p2, head);
      const gg = strandGradient(glow.ctx, st, pa, pb, u0, head, taper, pal.glow);
      const gc = strandGradient(main.ctx, st, pa, pb, u0, head, taper, pal.core);
      const path = strandPath(st, u0, head);
      const w = st.width;
      // Three widths of the same light: a broad halo and a narrower one on the quarter-res canvas,
      // whose upscale smears each fibre across its neighbours, and the core on the half-res one.
      // The passes are budgeted as a SUM over the bundle: the fibres overlap almost completely on
      // the glow canvas, and a sum much past 1 there is a saturated bar with a hard edge, not a
      // stream. The broad halo is 30 px wide: every other fibre's, at twice the alpha, is the
      // same light for half the strokes.
      if (st.halo) strokePath(glow.ctx, path, gg, 24 + 8 * Math.min(w, 2), 0.1 * a);
      strokePath(glow.ctx, path, gg, 8 + 4 * w, 0.12 * a);
      strokePath(main.ctx, path, gc, w, (st.wide ? 0.14 : 0.5) * a);
      // A faint halo rides the head while it travels and is gone before it lands — on a third of
      // the fibres, which at 12 px radius is a continuous glow across the streak. No core dot: a
      // bright point on the wireframe read as a dab of paint. On the phone the band is a few
      // pixels tall and the fibres alone are the right amount of light.
      if (!phone && st.head && dissolve < 1) {
        const ha = 0.3 * a * (1 - clamp01((prog - 0.7) / 0.3));
        softDisc(glow.ctx, pb[0], pb[1], 12, pal.core, ha);
      }
    }
    glow.ctx.restore(); main.ctx.restore();
    // The arrival: a soft pulse where the bundle crosses the limb, and one sixth more sphere.
    const arrived = clamp01((s - leave - DRAW - STAGGER / 2) / 0.35);
    level += smooth(arrived) / threads.length;
    const pulse = clamp01((s - leave - DRAW - STAGGER / 2 + 0.1) / 0.75);
    if (pulse > 0 && pulse < 1) {
      const k = Math.sin(pulse * Math.PI) * (1 - pulse * 0.5);
      softDisc(glow.ctx, th.limb[0], th.limb[1], 70, pal.glow, th.pulseA * k);
    }
  }

  // The sphere brightening as it fills: a bloom the render's own gold, kept low — the photograph's
  // sphere is already the brightest thing in the room and must stay the thing, not the effect.
  const bloom = level * bloomOut;
  if (bloom > 0.002) {
    softDisc(glow.ctx, sphere.x, sphere.y, sphere.r * 1.3, '255,205,120', 0.17 * bloom);
    softDisc(glow.ctx, sphere.x, sphere.y, sphere.r * 0.45, '255,235,190', 0.14 * bloom);
  }

  // Composite: the quarter-resolution glow, upscaled through the browser's bilinear filter, is what
  // makes the edges soft; the half-resolution cores go over it.
  main.ctx.globalCompositeOperation = 'lighter';
  main.ctx.globalAlpha = 1;
  main.ctx.imageSmoothingEnabled = true;
  main.ctx.drawImage(glow.el, box.x, box.y, box.w, box.h);
}

// The smallest rectangle every strand, pulse and the bloom fit in, with room for the glow's width,
// clipped to the render. In image pixels; the canvases are sized from it.
function lightBounds(threads, sphere, W, H) {
  const pad = 48;
  let x0 = sphere.x - sphere.r * 1.3, y0 = sphere.y - sphere.r * 1.3;
  let x1 = sphere.x + sphere.r * 1.3, y1 = sphere.y + sphere.r * 1.3;
  for (const th of threads) for (const st of th.strands) for (const p of [st.p0, st.p1, st.p2]) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
  return { x: x0, y: y0, w: Math.max(2, x1 - x0), h: Math.max(2, y1 - y0) };
}

/* ---------------------------------------------------------------- *
 * Mounting and the run
 * ---------------------------------------------------------------- */

// The widest stretch of the panel, in the plate's own pixels, with no occluder in front of it: a
// glass mullion crossing a panel must not cross the pillar's name. Local x is taken linearly
// across the quad, which is exact enough for these near-rectangular panels. Null when the panel
// is clear.
function clearBand(surface, size) {
  const polys = surface.occluders || [];
  if (!polys.length) return null;
  const q = surface.quad;
  const x0 = Math.min(q[0][0], q[3][0]), x1 = Math.max(q[1][0], q[2][0]);
  const local = (ix) => (ix - x0) / Math.max(1, x1 - x0) * size.width;
  let free = [[0, size.width]];
  for (const poly of polys) {
    const xs = poly.map((p) => local(p[0]));
    const a = Math.min(...xs), b = Math.max(...xs);
    free = free.flatMap(([s, e]) => [[s, Math.min(e, a)], [Math.max(s, b), e]]).filter(([s, e]) => e - s > 8);
  }
  return free.sort((p, r) => (r[1] - r[0]) - (p[1] - p[0]))[0] || null;
}

// The name inside a full-size wrapper: the plate's own mask is the surface's matte (the people
// in front of the glass); the wrapper takes a second mask cut from the surface's occluders, so
// whatever of the plate — the scrim's tail — does reach a mullion is cut by it as the still is.
function plateContent(index, name) {
  const clip = document.createElement('div');
  clip.className = 'pl-clip';
  const d = document.createElement('div');
  d.className = 'pl';
  const n = document.createElement('span'); n.className = 'pl-n'; n.textContent = String(index + 1).padStart(2, '0');
  const t = document.createElement('span'); t.className = 'pl-t'; t.textContent = name;
  d.append(n, t);
  clip.append(d);
  return clip;
}

/**
 * Start the arrival sequence for this room, if its spec asks for one. Called on every route into a
 * room; a station change inside the same room is not an arrival and does nothing.
 */
export function showPanels(room) {
  if (room && currentRoomId === room.id) return;
  stopRun();
  currentRoomId = room ? room.id : null;
  if (OFF || !room || clock.reducedMotion) return;
  const geometry = getScreenGeometry();
  const spec = geometry && geometry[room.id];
  if (!spec || !spec.sequence || !spec.sequence.sphere || !Array.isArray(spec.surfaces)) return;
  const ordered = spec.surfaces.filter((x) => Number.isFinite(+x.order)).sort((a, b) => a.order - b.order);
  if (!ordered.length) return;
  const names = pillarNames(spec.sequence.pillars);
  const sphere = spec.sequence.sphere;
  const W = spec.imageWidth || 2048, H = spec.imageHeight || 1152;
  // On a portrait phone the room is a band a third of the screen tall: a plate would be three
  // pixels of type. The light still reads at that size; the words do not, so they stay off.
  const phone = matchMedia('(max-width: 767px) and (orientation: portrait)').matches;

  let wake = FIRST;
  const items = ordered.map((surface, i) => {
    if (i) wake += STEP_MIN + (STEP_MAX - STEP_MIN) * jitter(i * 31 + 7);
    const thread = buildThread(surface, sphere, i, wake);
    const live = getScreenElement(`ls-${surface.id}`);
    // Hold the display dark until its turn. livescreens lights it on decode, which for a warmed
    // image is immediately — this class is the one thing that makes "in sequence" possible.
    if (live) live.classList.add('is-held');
    let plateId = null, plate = null;
    const name = names[i];
    if (!phone && name) {
      plateId = mountScreen({
        layer: room.id, quad: surface.quad, id: `pl-${surface.id}`,
        className: 'screen-plate ' + (thread.side < 0 ? 'is-cool' : 'is-warm'),
        content: plateContent(i, name),
      });
      plate = plateId && getScreenElement(plateId);
      if (plate) {
        applySurfaceMask(plate, surface);
        const occluders = surface.occluders || [];
        if (occluders.length) applySurfaceMask(plate.querySelector('.pl-clip'), { quad: surface.quad, occluders });
        // Keep the words out from behind a mullion: set them in the widest clear band, wrapping.
        const band = clearBand(surface, quadSize(surface.quad));
        const pl = band && plate.querySelector('.pl');
        if (pl) {
          pl.classList.add('is-narrow');
          pl.style.left = `${Math.round(band[0])}px`;
          pl.style.maxWidth = `${Math.round(band[1] - band[0])}px`;
        }
      }
    }
    return { surface, thread, live, plateId, plate, plateAt: -1, woke: false, waking: false, settling: false };
  });

  // The light: one canvas pair over the region the threads and the bloom actually touch — a third
  // of the render, not all of it, because a canvas that changes every frame is re-uploaded and
  // re-composited every frame, and that cost is pixels. Plain alpha compositing, on purpose: a
  // `mix-blend-mode: screen` here was measured at +8 ms on the room-entry p95, and with light this
  // faint the difference between adding and covering is not visible. Mounted like any other screen,
  // so it follows the render's own settle and is hidden with it.
  const box = lightBounds(items.map((x) => x.thread), sphere, W, H);
  const main = makeCanvas(Math.round(box.w / 2), Math.round(box.h / 2));
  const glow = makeCanvas(Math.round(box.w / 4), Math.round(box.h / 4));
  main.className = 'pl-light';
  const mctx = main.getContext('2d'), gctx = glow.getContext('2d');
  mctx.scale(0.5, 0.5); gctx.scale(0.25, 0.25);
  mctx.translate(-box.x, -box.y); gctx.translate(-box.x, -box.y);   // draw in image pixels
  // Butt caps: the gradient owns both ends of a fibre, and a cap circle riding the tip is
  // exactly the blunt head that read as a brush stroke.
  for (const c of [mctx, gctx]) { c.lineCap = 'butt'; c.lineJoin = 'round'; }
  const lightId = mountScreen({
    layer: room.id, id: 'panels-light', className: 'screen-light', content: main,
    quad: [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]],
  });
  const lightEl = lightId && getScreenElement(lightId);
  if (lightEl) lightEl.classList.add('is-arriving');

  // The tail is pulled inside the budget: if the schedule ever runs long, the dissolve, the
  // plates' fade and the bloom all shorten to land at BUDGET, and the bloom reaches zero on the
  // very frame the module leaves — so at 4.5 s there is no residual light, only the photograph.
  const last = items[items.length - 1].thread;
  const dissolveAt = last.wake + LEAD + DRAW + STAGGER + HOLD;
  const endAt = Math.min(dissolveAt + Math.max(DISSOLVE, PLATE_OUT, BLOOM_OUT) + 0.05, BUDGET);
  const tailMax = Math.max(0.2, endAt - 0.05 - dissolveAt);
  run = {
    items, lightId, lightEl, t0: clock.now(), frame: 0,
    render: {
      main: { el: main, ctx: mctx }, glow: { el: glow, ctx: gctx },
      threads: items.map((x) => x.thread), sphere, box, phone,
      t: { dissolveAt, dissolve: Math.min(DISSOLVE, tailMax), plateOut: Math.min(PLATE_OUT, tailMax), bloomOut: tailMax },
    },
    endAt,
    unsubscribe: clock.subscribe(tick),
  };
  clock.play();
}

/** Stop and remove everything — on leaving the room, or on the sequence's own end. */
export function clearPanels() {
  stopRun();
  currentRoomId = null;
}

function stopRun() {
  if (!run) return;
  const r = run; run = null;
  r.unsubscribe();
  for (const it of r.items) {
    if (it.live) it.live.classList.remove('is-held', 'is-waking', 'is-settling');
    if (it.plateId) unmountScreen(it.plateId);
  }
  if (r.lightId) unmountScreen(r.lightId);
}

function tick(t, dt) {
  if (!run) return;
  const s = t - run.t0;
  const R = run.render;
  if (s >= run.endAt) { stopRun(); return; }          // steady state: the module is gone

  for (const it of run.items) {
    const th = it.thread;
    if (!it.woke && s >= th.wake) {
      it.woke = true; it.waking = true;
      // Its turn: the veil lifts and the still fades up (livescreens' own 700 ms), a little
      // brighter than it will rest. is-waking carries the wrap's transition; is-settling keeps it
      // for the ease back and is then dropped, so no transition is left on the wrap.
      if (it.live) { it.live.classList.remove('is-held'); it.live.classList.add('is-waking'); }
      if (it.plate) it.plate.classList.add('is-lit');
    }
    if (it.waking && s >= th.wake + WAKE) {
      it.waking = false; it.settling = true;
      if (it.live) it.live.classList.replace('is-waking', 'is-settling');
    }
    if (it.settling && s >= th.wake + WAKE + SETTLE_BACK) {
      it.settling = false;
      if (it.live) it.live.classList.remove('is-settling');
    }
    if (it.plate) {
      // Written only while it changes: a style write on six masked plates every frame is a
      // re-composite the frame budget notices, and the value is constant for most of the run.
      const up = easeOut(clamp01((s - th.wake - PLATE_LAG) / PLATE_IN));
      const down = 1 - easeIn(clamp01((s - R.t.dissolveAt) / R.t.plateOut));
      const v = +Math.min(up, down).toFixed(3);
      if (v !== it.plateAt) { it.plateAt = v; it.plate.style.setProperty('--pl', String(v)); }
    }
  }

  // The canvas is hidden — not merely blank — until the first thread is due, so nothing of it is
  // rasterised while the camera is still travelling. Once it is, the light is redrawn on alternate
  // frames on a fast display: every draw is a re-upload of the canvas inside the stage's transform,
  // and a soft streak travelling 0.8 s does not need 60 of them a second. A slow display gets
  // every frame, and so does the film export — gated on FILM itself, not on the step size, so a
  // 60 fps export is not quietly drawn at 30.
  if (run.lightEl) {
    const due = s >= FIRST + LEAD - 0.05;
    if (!due) return;
    const first = run.lightEl.classList.contains('is-arriving');
    if (first) run.lightEl.classList.remove('is-arriving');
    run.frame++;
    if (!first && !FILM && dt > 0 && dt < 0.02 && (run.frame & 1)) return;
    drawLight(R, s);
  }
}

export default { initPanels, showPanels, clearPanels };
