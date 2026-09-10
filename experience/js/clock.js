// Clock: one timebase for every animated part of the experience.
//
// A single requestAnimationFrame loop drives every subscriber with *clock*
// time, not wall time, so the whole floor can be played, paused, scrubbed,
// slowed, run backwards, or stepped one frame at a time by a story engine, an
// attract loop, or a deterministic visual test.
//
//   import clock, { createClock } from './clock.js?v=2026-09-10t';
//   const off = clock.subscribe((t, dt) => { dot.style.setProperty('--t', t); });
//
// API — createClock(options) returns a clock; `clock` is the shared instance.
//   subscribe(fn)  fn(t, dt) once per frame, both in seconds. Returns an
//                  unsubscribe function. A subscriber that throws is caught,
//                  reported through options.onError, and keeps its slot: one
//                  bad consumer can never take down the loop.
//   play()         Start or resume. Resuming never jumps time forward.
//   pause()        Stop the loop; now() holds its value.
//   seek(t)        Jump to t seconds and emit one tick with dt === 0, so a
//                  paused consumer repaints at the new time.
//   setRate(r)     Playback rate: 1 normal, 0.25 slow, 0 frozen (ticks still
//                  fire, with dt 0), negative scrubs backwards.
//   step(dt)       Advance exactly dt seconds (default 1/60) and emit one
//                  tick. Ignores rate and the frame clamp, works while paused,
//                  and does not start the loop — this is the deterministic
//                  entry point for tests and headless renderers.
//   now()          Current clock time in seconds.
//   destroy()      Pause, drop subscribers, remove listeners.
//   .time .rate .running   Read-only mirrors of the state above.
//   .reducedMotion  True while the OS asks for reduced motion. Live, read
//                   only, and deliberately inert: consumers decide what it
//                   means for them; clock semantics never change.
//
// Options: { time, rate, maxFrameDt = 0.1, onError }. maxFrameDt clamps one
// wall-clock frame (tab stall, GC pause) so a long gap cannot teleport an
// animation; step() is never clamped. The clock also pauses itself on
// document visibilitychange -> hidden and resumes on visible, unless it was
// already paused by hand.
//
// Zero coupling: imports nothing, owns no DOM, and falls back to setTimeout
// where there is no requestAnimationFrame (headless / Node).

// Resolved per call, not captured, so a test can install its own frame source.
const schedule = (fn) => (typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(fn) : setTimeout(() => fn(Date.now()), 16));
const unschedule = (id) => (typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame(id) : clearTimeout(id));
const num = (v, fallback) => (Number.isFinite(+v) ? +v : fallback);

export function createClock(options = {}) {
  const maxFrameDt = num(options.maxFrameDt, 0.1);
  const onError = typeof options.onError === 'function'
    ? options.onError : (err) => console.error('[clock] subscriber threw', err);

  const subs = new Set();
  let list = null;                 // iteration snapshot, rebuilt when subs change
  let t = num(options.time, 0);
  let rate = num(options.rate, 1);
  let running = false, raf = 0, last = 0, fresh = true, autoPaused = false;

  function emit(dt) {
    if (!list) list = [...subs];
    for (const fn of list) { try { fn(t, dt); } catch (err) { onError(err, fn); } }
  }

  function frame(ts) {
    raf = 0;
    if (!running) return;
    // `fresh` swallows the gap across play/seek/visibility, so resuming costs no time.
    // Max() survives a backwards timestamp; min() keeps a tab stall from teleporting anything.
    const wall = fresh ? 0 : Math.min(Math.max((ts - last) / 1000, 0), maxFrameDt);
    last = ts; fresh = false;
    const dt = wall * rate;
    t += dt;
    emit(dt);                      // a subscriber may pause() or seek() in here
    if (running && !raf) raf = schedule(frame);
  }

  function play() {
    autoPaused = false;
    if (running) return api;
    running = true; fresh = true;
    if (!raf) raf = schedule(frame);
    return api;
  }

  function pause() {
    running = false; fresh = true; autoPaused = false;
    if (raf) { unschedule(raf); raf = 0; }
    return api;
  }

  const doc = typeof document !== 'undefined' ? document : null;
  function onVisibility() {
    if (doc.hidden) { if (running) { pause(); autoPaused = true; } }
    else if (autoPaused) { play(); }
  }
  if (doc) doc.addEventListener('visibilitychange', onVisibility);

  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(mq && mq.matches);
  const onMq = (e) => { reduced = !!e.matches; };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

  const api = {
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn); list = null;
      return () => { subs.delete(fn); list = null; };
    },
    play,
    pause,
    seek(time) { t = num(time, t); fresh = true; emit(0); return api; },
    // No `fresh` reset here on purpose: a rate eased every frame must not stall the
    // clock. The pending part-frame is billed at the new rate — one frame of slop.
    setRate(r) { rate = num(r, rate); return api; },
    step(dt) { const d = num(dt, 1 / 60); t += d; emit(d); return api; },
    now() { return t; },
    destroy() {
      pause(); subs.clear(); list = null;
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
    },
    get time() { return t; },
    get rate() { return rate; },
    get running() { return running; },
    get reducedMotion() { return reduced; },
  };
  return api;
}

export const clock = createClock();
export default clock;
