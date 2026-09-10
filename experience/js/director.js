// The director.
//
// Left alone on the building view, the floor plays itself: a keyframed camera timeline through the
// six rooms, using the same router and the same pan everything else uses. Any input — a real
// pointer move, a key, a wheel, a touch — hands control straight back and returns the visitor to
// the building, which is where they were when the floor started playing.
//
// The same timeline, driven off the shared clock rather than wall time, is what the marketing film
// is exported from. `?film=1` freezes the clock to wall time, runs the timeline once from the first
// frame on demand, and exposes a stepping hook for a headless capture — so the film IS the site.
// One source, no separate production. tools/build-film.js is the other half.
//
// It never starts while the visitor is doing anything: not in a room, not with a screenshot open,
// not mid-walk, not during the intro. Idle on the building view is the only door in.

import { go, parse } from './router.js?v=2026-09-10t';
import { panRoom } from './stage.js?v=2026-09-10t';
import clock from './clock.js?v=2026-09-10t';

const params = new URLSearchParams(location.search);
export const FILM = params.get('film') === '1';

// Seconds of nothing before the floor starts to play itself. `?idle=N` is for verifying that it
// does, without sitting through forty seconds each time.
const IDLE = Math.max(3, Number(params.get('idle')) || 40);
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// A phone is read, not watched: forty seconds of stillness there means a thumb resting on the
// sheet, and a camera that starts moving under it is a nuisance. Attract loops belong on screens
// with a pointer that can rest.
const TOUCH_ONLY = () => matchMedia('(hover: none)').matches;

// The timeline. Holds are in clock seconds and include the camera's own travel into the room.
// A `pan` is a normalised focus point on the room render that the camera drifts to once it has
// landed, so a beat inside a room is a slow move rather than a still. The AIRE bridge is left to
// its own sequence, which travels the wall by itself and parks on Approval — that is the shot.
const BEATS = [
  { route: { view: 'building' },                hold: 5.0 },
  { route: { view: 'room', id: 'defense' },     hold: 7.0, pan: { x: 0.42, y: 0.46 }, at: 2.4 },
  { route: { view: 'room', id: 'vision' },      hold: 6.5, pan: { x: 0.56, y: 0.44 }, at: 2.4 },
  { route: { view: 'room', id: 'offense' },     hold: 6.0, pan: { x: 0.58, y: 0.48 }, at: 2.4 },
  { route: { view: 'room', id: 'fabric' },      hold: 6.0, pan: { x: 0.50, y: 0.42 }, at: 2.4 },
  { route: { view: 'room', id: 'aire-bridge' }, hold: 9.0 },
  { route: { view: 'room', id: 'decisions' },   hold: 6.5, pan: { x: 0.46, y: 0.58 }, at: 2.4 },
  { route: { view: 'building' },                hold: 4.0 },
];

let playing = false;
let beat = -1, beatAt = 0, panned = false;
let lastInput = 0;
let gate = () => true;      // main.js says whether the floor is free to be played
let runs = 0;

export function isDirecting() { return playing; }

/**
 * @param {object} handlers
 * @param {() => boolean} handlers.free       true when nothing else owns the screen: no viewer, no
 *                                             lightbox, no walk, no intro.
 * @param {() => Promise} [handlers.prepare]  warms every room render; the film export calls it so
 *                                             the first frame of each room is never a network wait.
 */
export function initDirector(handlers = {}) {
  gate = handlers.free || gate;
  lastInput = clock.now();

  // Every kind of input counts. Registered in the capture phase, so a click that starts something
  // (a pin, a tab) still does its own job after the director has let go — the building navigation
  // lands first and the click's own lands second, which is the right order.
  //
  // A pointer move has to be a MOVE. Chrome re-dispatches a synthetic mousemove whenever layout
  // changes under a stationary cursor, which during a camera move is every frame; without the
  // coordinate check the loop would cancel itself the moment it started.
  let px = null, py = null;
  const touched = (e) => {
    if (e.type === 'pointermove') {
      if (e.clientX === px && e.clientY === py) return;
      const first = px === null;
      px = e.clientX; py = e.clientY;
      if (first) return;
    }
    lastInput = clock.now();
    if (playing) stop(true);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(ev, touched, { capture: true, passive: true });
  }

  clock.subscribe(tick);

  if (FILM) {
    // The export owns time. Rate zero means the clock's own frame loop still ticks every consumer
    // but never advances; step() ignores rate, so only the harness moves anything.
    clock.setRate(0);
    window.__director = {
      prepare: () => (handlers.prepare ? handlers.prepare() : Promise.resolve()),
      start: () => start(),
      // Back to a known nothing: not playing, no run counted, clock at zero. The harness settles the
      // camera on the building before calling it, so every pass begins from the same first frame.
      reset: () => { playing = false; runs = 0; beat = -1; document.body.classList.remove('directing'); clock.seek(0); },
      step: (dt) => clock.step(dt),
      time: () => clock.now(),
      done: () => runs >= 1 && !playing,
      beat: () => beat,
      beats: BEATS.length,
      length: BEATS.reduce((s, b) => s + b.hold, 0),
    };
  }
  clock.play();
}

function start() {
  if (playing) return;
  if (!FILM && (REDUCED() || TOUCH_ONLY())) return;   // a self-moving camera is exactly what reduced motion asks not to see
  playing = true;
  beat = -1;
  document.body.classList.add('directing');
  next();
}

function stop(byVisitor) {
  if (!playing) return;
  playing = false;
  runs++;
  document.body.classList.remove('directing');
  if (byVisitor) go({ view: 'building' });
}

function next() {
  beat++;
  if (beat >= BEATS.length) {
    if (FILM) { stop(false); return; }   // the export wants exactly one pass
    beat = 0;                            // the attract loop just keeps going
  }
  beatAt = clock.now();
  panned = false;
  go(BEATS[beat].route);
}

function tick(t) {
  if (!playing) {
    // Only the building view can start it, only when it is genuinely free, and only after real
    // idle — time spent in a room or the viewer does not count towards it.
    if (FILM) return;
    if (parse().view !== 'building' || !gate()) { lastInput = t; return; }
    if (t - lastInput >= IDLE) start();
    return;
  }
  const b = BEATS[beat];
  const held = t - beatAt;
  if (b.pan && !panned && held >= b.at) {
    panned = true;
    // The drift lasts the rest of the beat, minus a beat's worth of stillness before the cut.
    panRoom(b.pan, Math.max(800, (b.hold - b.at - 0.6) * 1000));
  }
  if (held >= b.hold) next();
}

export default { initDirector, isDirecting, FILM };
