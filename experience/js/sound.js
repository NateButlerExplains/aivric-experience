// Room tone, synthesised.
//
// Every wing gets its own atmosphere without a single audio file: a noise bed and two detuned
// oscillators through a filter, differing between rooms by PARAMETER rather than by asset. No
// bytes on the wire, no licence, no loop point to click, and a new room is a few numbers rather
// than a recording session.
//
// Muted by default, always. A browser will not start audio without a gesture anyway, and that
// suits the honest default: nothing is constructed until the visitor asks for sound, so a visitor
// who never presses the button pays nothing and hears nothing. The choice is remembered, because
// asking twice is worse than not asking.
//
// The building has one of these controls already — the film's Mute/Unmute in ui/intro.js — so this
// one borrows its wording and its aria-pressed pattern to read as the same idea, not a second one.

const KEY = 'aivric-sound';

// Per-wing character. `hz` is the drone's root, `cut` the filter's corner, `noise` how much room
// hiss sits under it, `q` how resonant — a tight high Q reads as a small hard room, a low one as a
// large soft one.
const TONE = {
  building:      { hz: 48,  cut: 320,  noise: 0.035, q: 0.7, gain: 0.5 },
  defense:       { hz: 44,  cut: 240,  noise: 0.05,  q: 0.6, gain: 0.7 },
  offense:       { hz: 62,  cut: 520,  noise: 0.04,  q: 1.6, gain: 0.62 },
  vision:        { hz: 96,  cut: 900,  noise: 0.02,  q: 2.4, gain: 0.5 },
  'aire-bridge': { hz: 55,  cut: 380,  noise: 0.055, q: 1.1, gain: 0.66 },
  decisions:     { hz: 40,  cut: 200,  noise: 0.025, q: 0.5, gain: 0.45 },
  fabric:        { hz: 72,  cut: 640,  noise: 0.03,  q: 1.8, gain: 0.52 },
};

const GLIDE = 1.2;          // seconds to move between rooms; a cut between tones is a jump scare
const MASTER = 0.16;        // the whole thing is background, and it stays background

let ctx = null, nodes = null, on = false, room = 'building', btn = null, off = null;

export function soundWanted() {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}

/* ---------------------------------------------------------------- *
 * The graph, built once, on demand
 * ---------------------------------------------------------------- */

// Two seconds of looping noise. Generated rather than fetched: a buffer of random samples is what
// a noise file would contain anyway, and this one costs nothing to ship.
function noiseBuffer(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // Brown-ish rather than white: integrating the noise tilts it towards the low end, which is
    // what a room sounds like. White noise reads as a broken speaker.
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0;                       // fade in from silence, never a click
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.connect(master);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const noiseGain = ctx.createGain();
  noise.connect(noiseGain).connect(filter);
  noise.start();

  // Two oscillators a few cents apart: the beating between them is what stops a synth drone
  // sounding like a test tone.
  const oscs = [0, 1].map((i) => {
    const o = ctx.createOscillator();
    o.type = i ? 'triangle' : 'sine';
    o.detune.value = i ? 7 : -7;
    const g = ctx.createGain();
    g.gain.value = i ? 0.35 : 0.55;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });

  nodes = { master, filter, noiseGain, oscs };
  apply(room, 0);
  return true;
}

// Move the graph to a room's tone. Ramps rather than sets: every parameter change is a glide, so
// walking between wings is a shift in the air rather than an edit.
function apply(id, glide = GLIDE) {
  if (!nodes || !ctx) return;
  const t = TONE[id] || TONE.building;
  const now = ctx.currentTime;
  const to = (param, v) => {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(v, now + glide);
  };
  to(nodes.filter.frequency, t.cut);
  to(nodes.filter.Q, t.q);
  to(nodes.noiseGain.gain, t.noise);
  for (const o of nodes.oscs) to(o.frequency, t.hz);
  to(nodes.master.gain, on ? MASTER * t.gain : 0);
}

/* ---------------------------------------------------------------- *
 * Public surface
 * ---------------------------------------------------------------- */

export function setRoom(id) {
  room = id || 'building';
  apply(room);
}

export function toggleSound(want) {
  on = want === undefined ? !on : !!want;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private window */ }

  if (on && !ctx && !build()) { on = false; return false; }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  apply(room, on ? 0.9 : 0.5);

  // Nothing keeps running behind a silent page: once faded out, the context is suspended so it
  // stops costing anything at all.
  if (!on && ctx) {
    clearTimeout(off);
    off = setTimeout(() => { if (!on && ctx && ctx.state === 'running') ctx.suspend(); }, 700);
  }
  paint();
  return on;
}

function paint() {
  if (!btn) return;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Mute the room' : 'Room sound';
  btn.setAttribute('aria-label', on ? 'Mute the room' : 'Turn on room sound');
  btn.classList.toggle('is-on', on);
}

export function initSound(button) {
  btn = button;
  if (!btn) return;
  btn.addEventListener('click', () => toggleSound());
  paint();

  // A visitor who turned sound on last time should not have to ask again — but no browser will
  // start audio without a gesture, so the preference cannot simply be replayed on load. It is
  // ARMED instead: the next interaction of any kind, anywhere, brings the room back. If they never
  // touch the page, nothing is ever constructed, which is the same as never having asked.
  if (soundWanted()) {
    const arm = () => { document.removeEventListener('pointerdown', arm); document.removeEventListener('keydown', arm); toggleSound(true); };
    document.addEventListener('pointerdown', arm, { once: true });
    document.addEventListener('keydown', arm, { once: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !on) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
}

export default { initSound, setRoom, toggleSound, soundWanted };
