// The narrated walk.
//
// The whole floor as a path you can take with a keyboard or a screen reader — a first-class way
// through the building, not a fallback for people who cannot use the pins. Each step moves the
// camera with the same router everything else uses, and says where you are through a polite live
// region, in the same words the pins already use for the same rooms.
//
// The pace is the visitor's. Nothing advances on a timer: a screen reader has to finish speaking,
// and a person reading a caption bar has to finish reading. Space, Enter or the right arrow moves
// on; the left arrow goes back; Escape leaves the walk wherever it is.

import { go } from './router.js?v=2026-09-11a';
import { factsLabel } from './roomfacts.js?v=2026-09-11a';

const bar = document.getElementById('walk');
const liveEl = document.getElementById('walk-live');
const textEl = document.getElementById('walk-text');
const stepEl = document.getElementById('walk-step');
const prevBtn = document.getElementById('walk-prev');
const nextBtn = document.getElementById('walk-next');
const endBtn = document.getElementById('walk-end');

let steps = [];
let at = -1;
let onEnd = () => {};

// One sentence of a station's own copy. The headline is written to stand alone; the summary is not,
// so only its first sentence follows it.
function firstSentence(s = '') {
  const m = String(s).match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function build(rooms) {
  const out = [];
  for (const room of rooms) {
    out.push({
      kind: 'room', room,
      say: factsLabel(room),
      route: { view: 'room', id: room.id },
    });
    for (const st of room.stations || []) {
      out.push({
        kind: 'station', room, station: st,
        say: `${st.name}. ${st.headline || ''} ${firstSentence(st.summary)}`.replace(/\s+/g, ' ').trim(),
        route: { view: 'station', id: st.id },
      });
    }
  }
  const stations = out.filter((s) => s.kind === 'station').length;
  out.push({
    kind: 'end',
    say: `That is the floor: ${rooms.length} rooms, ${stations} stations. Press Escape to leave the walk, or start again from the beginning.`,
    route: { view: 'building' },
  });
  return out;
}

export function initWalk(rooms, handlers = {}) {
  steps = build(rooms || []);
  onEnd = handlers.onEnd || onEnd;
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  endBtn.addEventListener('click', endWalk);
}

export function isWalking() { return at >= 0; }

function say(text) {
  // Clear, then set on the next frame: a live region only announces when its content CHANGES, and
  // two consecutive rooms that produced the same sentence would otherwise fall silent.
  liveEl.textContent = '';
  requestAnimationFrame(() => { liveEl.textContent = text; });
  textEl.textContent = text;
}

function show() {
  const s = steps[at];
  if (!s) return;
  const n = steps.length;
  stepEl.textContent = s.kind === 'end' ? 'End of the walk' : `${at + 1} of ${n - 1}`;
  prevBtn.disabled = at === 0;
  nextBtn.textContent = s.kind === 'end' ? 'Start again' : 'Next';
  bar.dataset.kind = s.kind;
  go(s.route);
  say(s.say);
}

export function startWalk() {
  if (!steps.length) return;
  at = 0;
  bar.hidden = false;
  document.body.classList.add('walking');
  show();
  // Focus lands on the bar so the keyboard is already in the right place, without stealing scroll.
  nextBtn.focus({ preventScroll: true });
}

function step(d) {
  if (at < 0) return;
  const s = steps[at];
  if (d > 0 && s.kind === 'end') { at = 0; show(); return; }   // "Start again"
  at = Math.min(Math.max(0, at + d), steps.length - 1);
  show();
}

export function endWalk() {
  if (at < 0) return;
  at = -1;
  bar.hidden = true;
  document.body.classList.remove('walking');
  liveEl.textContent = 'Walk ended.';
  onEnd();
}

document.addEventListener('keydown', (e) => {
  if (at < 0) return;
  // While a screenshot is open in the viewer the arrows belong to it, and Escape closes it first.
  if (document.body.classList.contains('viewing')) return;
  // Typing into something is not walking.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
    // Enter and Space on a button are that button's own activation; leave them to it.
    if ((e.key === ' ' || e.key === 'Enter') && t && t.tagName === 'BUTTON') return;
    e.preventDefault(); step(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault(); step(-1);
  } else if (e.key === 'Escape') {
    e.preventDefault(); endWalk();
  }
});

export default { initWalk, startWalk, endWalk, isWalking };
