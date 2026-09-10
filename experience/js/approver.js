// The approver board.
//
// The AIRE bridge's wall board is four columns in the photograph — clipboard, check, gear,
// magnifier — and change 02 measured them as four quads that tile it exactly. Those four columns
// are the four stages the manifest already names in this station: proposed work, approval, action,
// verification. So the board becomes what it is painted as: a workflow, moving left to right.
//
// It stops at column two. The visitor approves, in the panel, and watches the board carry on.
// That is the point of the room — it is the one place in the building where you do something
// rather than look at something.
//
// Nothing here invents a customer. Every line of copy is the manifest's own; the station is
// `coming-soon`, so the board says so.
//
// Sits on the same two substrates as change 02: screens.js for the perspective mapping, clock.js
// for time that can be paused, scrubbed or stepped. Including the `is-arriving` gate, which is
// what keeps the room-entry frame budget where change 02 left it.

import { mountScreen, getScreenElement, unmountScreen, applySurfaceMask } from './screens.js?v=2026-09-10k';
import { panRoom } from './stage.js?v=2026-09-10k';
import clock from './clock.js?v=2026-09-10k';

const params = new URLSearchParams(location.search);
const OFF = params.get('screens') === '0';

// What travels the board. Deliberately generic: the manifest carries no finding data, and this
// station is coming-soon, so inventing an identifier would be inventing a customer.
const ITEM = 'Finding → playbook';

const SETTLE = 1.7;     // matches livescreens: nothing paints while the camera is still moving
const PROPOSE = 2.2;    // seconds column one runs before it hands over
const ACT = 2.6;        // column three
const VERIFY = 2.4;     // column four

let geometry = null;    // roomId -> spec, shared shape with livescreens
let onState = () => {};
let live = [];          // the four mounted columns, in order
let unsubscribe = null;
let mountedAt = 0;
let arrived = false;
let phase = 'idle';     // idle -> propose -> waiting -> act -> verify -> done
let phaseAt = 0;
let roomId = null;

export function initApprover(geo, handlers = {}) {
  geometry = geo || null;
  onState = handlers.onState || onState;
}

/* ---------------------------------------------------------------- *
 * The stages, read out of the manifest
 * ---------------------------------------------------------------- */

// Each capability is written "Stage: what happens there", which is exactly the split the board
// needs. A capability without a colon keeps its whole text as the description and takes its name
// from the station name's own arrow-separated list, so a reworded manifest degrades rather than
// breaks.
function stagesOf(station) {
  const fromName = String(station.name || '').split('→').map((s) => s.trim()).filter(Boolean);
  return (station.capabilities || []).slice(0, 4).map((c, i) => {
    const at = c.indexOf(':');
    return at > 0
      ? { name: c.slice(0, at).trim(), desc: c.slice(at + 1).trim() }
      : { name: fromName[i] || `Stage ${i + 1}`, desc: c.trim() };
  });
}

function card(stage, i, clip) {
  const el = document.createElement('div');
  el.className = 'ap';
  el.innerHTML =
    // Real product footage behind the stage, because four labels changing colour is not a thing
    // happening. Only the column the work is in ever plays; the rest hold a frame. preload="none"
    // so entering the room does not fetch four clips at once.
    (clip ? `<video class="ap-clip" src="${clip}" muted loop playsinline preload="none"></video>` +
            `<span class="ap-veil"></span>` : '') +
    `<span class="ap-num">${i + 1}</span>` +
    `<span class="ap-cap"><span class="ap-name">${stage.name}</span>` +
    `<span class="ap-desc">${stage.desc}</span>` +
    // The work item itself. Without something that visibly arrives, fills and hands on, the board
    // only ever reads as four labels changing colour — which is what it did, and it was not enough
    // to see that anything was happening.
    `<span class="ap-item"><i class="ap-dot"></i><em class="ap-what">${ITEM}</em>` +
      `<span class="ap-bar"><b></b></span></span></span>` +
    `<span class="ap-state" data-state=""></span>` +
    // On the LAST column, not the first: at most viewports the room fit crops the board's left
    // edge, so a tag on column one is a qualifier nobody sees. Column four is both the one most
    // likely in frame and the one making the strongest claim — "signed evidence bundle".
    (i === 3 ? `<span class="ap-illus">Illustrative</span>` : '');
  return el;
}

/* ---------------------------------------------------------------- *
 * Mounting
 * ---------------------------------------------------------------- */

export function showApprover(room, station) {
  if (roomId === room?.id) return;      // already standing here; a station change is not an arrival
  clearApprover();
  if (OFF || !geometry || !room) return;
  const spec = geometry[room.id];
  if (!spec) return;
  const cols = spec.surfaces.filter((s) => s.driver === 'approver');
  if (!cols.length) return;

  const stages = stagesOf(station || (room.stations || [])[0] || {});
  if (stages.length < cols.length) return;              // manifest reworded past recognition

  roomId = room.id;
  cols.forEach((surface, i) => {
    const id = mountScreen({
      layer: room.id,
      quad: surface.quad,
      content: card(stages[i], i, surface.clip || null),
      id: `ap-${surface.id}`,
      className: 'screen-live screen-board',
    });
    if (!id) return;
    const el = getScreenElement(id);
    // The operators sitting at the console rise above the board's bottom edge. Without this the
    // cards paint straight over their heads — which is exactly what shipped until a review caught
    // it, because the mattes existed and only livescreens was applying them.
    applySurfaceMask(el, surface);
    if (surface.dim != null) el.style.setProperty('--ls-dim', String(surface.dim));
    live.push({ id, el, stage: stages[i], i, focus: surface.focus || null });
  });
  if (!live.length) { roomId = null; return; }

  // The board is text, not photographs: there is nothing to decode and nothing to wait for, so it
  // is on screen the moment you arrive.
  arrived = true;
  phase = 'idle';
  mountedAt = clock.now();
  phaseAt = mountedAt;
  paint();
  if (!unsubscribe) unsubscribe = clock.subscribe(tick);
  clock.play();
  announce();
}

export function clearApprover() {
  roomId = null;
  if (!live.length) return;
  for (const s of live) {
    const v = s.el.querySelector('.ap-clip');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* already detached */ } }
    unmountScreen(s.id);
  }
  live = [];
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  phase = 'idle';
}

/* ---------------------------------------------------------------- *
 * The sequence
 * ---------------------------------------------------------------- */

// Which columns are done, which one is working, and whether it is waiting on a person.
const REACHED = { idle: -1, propose: 0, waiting: 1, act: 2, verify: 3, done: 4 };

const DURATION = { propose: PROPOSE, act: ACT, verify: VERIFY };

function paint() {
  const at = REACHED[phase];
  for (const s of live) {
    const state = s.i < at ? 'done'
      : s.i === at ? (phase === 'waiting' ? 'waiting' : 'active')
      : 'idle';
    s.el.querySelector('.ap-state').dataset.state = state;
    s.el.dataset.state = state;
    s.el.classList.toggle('is-on', s.i <= at);
    s.el.classList.toggle('is-waiting', state === 'waiting');
    // The item sits in exactly one column: the one the work is in. A column it has left keeps a
    // tick, a column it has not reached shows nothing.
    s.el.classList.toggle('has-item', s.i === at && at >= 0 && at < live.length);
    if (s.i !== at) s.el.style.setProperty('--ap-progress', s.i < at ? '1' : '0');
    playClip(s, state);
  }
}

// One clip runs at a time: the stage the work is actually in. A column the work has passed holds
// its last frame rather than looping, so the wall does not become four competing animations.
function playClip(s, state) {
  const v = s.el.querySelector('.ap-clip');
  if (!v) return;
  const live = state === 'active' || state === 'waiting';
  if (live && !clock.reducedMotion) {
    if (!v.getAttribute('data-loaded')) { v.setAttribute('data-loaded', '1'); v.load(); }
    const go = v.play();
    if (go && go.catch) go.catch(() => {});      // autoplay refusal is not an error worth surfacing
  } else if (!v.paused) {
    v.pause();
  }
}

// Progress inside the working column, so a stage that takes two seconds looks like two seconds of
// work rather than a light that changes at some point.
function progress(t) {
  const at = REACHED[phase];
  const col = live.find((x) => x.i === at);
  if (!col) return;
  const d = DURATION[phase];
  if (!d) return;                       // waiting and done are not timed
  const k = Math.max(0, Math.min(1, (t - phaseAt) / d));
  col.el.style.setProperty('--ap-progress', k.toFixed(3));
}

function to(next, t) {
  phase = next;
  phaseAt = t;
  paint();
  look();
  announce();
}

// The camera travels the wall as the work does, so the stage being described is the one you are
// looking at. Without this the board is 1223 image px wide against an ~890 px stage and column
// one — where the sequence starts — is 13% visible at 1440x900.
//
// Held still under reduced motion, and on a portrait phone, where the stage is short enough that a
// pan is more disorienting than useful and the panel carries the sequence anyway.
function look() {
  if (clock.reducedMotion) return;
  if (matchMedia('(max-width: 767px) and (orientation: portrait)').matches) return;
  const col = live.find((x) => x.i === REACHED[phase]);
  const target = col ? col.focus : (live[live.length - 1] || {}).focus;
  if (target) panRoom(target, phase === 'done' ? 1500 : 1100);
}

function announce() {
  const s = live.find((x) => x.i === REACHED[phase]);
  onState({
    phase,
    // The panel needs to know whether the visitor is being asked for something, and what for.
    waiting: phase === 'waiting',
    done: phase === 'done',
    stage: s ? s.stage : null,
    step: REACHED[phase] + 1,
    steps: live.length,
    item: ITEM,
  });
}

/** The visitor's call. Returns false when nothing is waiting on them. */
export function approve() {
  if (phase !== 'waiting') return false;
  to('act', clock.now());
  return true;
}

/** Put the item back at the start. */
export function replay() {
  if (!live.length) return;
  // Deliberately does NOT touch `arrived`. An earlier version set it true here to avoid re-running
  // the arrival gate — but the gate is also what REMOVES is-arriving, so setting the flag without
  // revealing left the whole board at visibility:hidden for the life of the room. The sequence ran
  // perfectly, invisibly. If a person can press this, the board is already on screen.
  mountedAt = clock.now();
  to('idle', clock.now());
}

function tick(t) {
  if (!live.length) return;
  const since = t - mountedAt;

  // Reduced motion does not travel: the board goes straight to the decision, because the decision
  // is the content and the travel is only the telling of it.
  if (clock.reducedMotion) {
    if (phase === 'idle') to('waiting', t);
    return;
  }

  progress(t);
  const held = t - phaseAt;
  if (phase === 'idle' && since >= SETTLE + 0.5) to('propose', t);
  else if (phase === 'propose' && held >= PROPOSE) to('waiting', t);
  else if (phase === 'act' && held >= ACT) to('verify', t);
  else if (phase === 'verify' && held >= VERIFY) to('done', t);
  // 'waiting' and 'done' are terminal until a person acts. The board does not loop on its own:
  // an animation running unattended behind a panel is motion nobody asked for.
}

export default { initApprover, showApprover, clearApprover, approve, replay };
