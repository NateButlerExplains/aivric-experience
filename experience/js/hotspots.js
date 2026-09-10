// Hotspot pins: screen-space buttons anchored to normalized master coordinates.
//
// A pin's chip carries the room name at rest and, on hover or keyboard focus, grows downward into
// a door plate: one line per station, in the chip's own material. The building can already be
// SEEN into — the master render is a cutaway — so what a pin was failing to answer was never
// "what does this room look like", it was "if I go in there, what do I get". That is the plate.
import { toScreen, onLayout, getState, isRoomVisible } from './stage.js?v=2026-09-10k';
import { roomFacts, factsLabel, esc } from './roomfacts.js?v=2026-09-10k';

const pinsEl = document.getElementById('pins');
let pins = [];

export function buildPins(rooms, onSelect) {
  pinsEl.innerHTML = '';
  pins = rooms.filter(r => r.hotspot).map((room, i) => {
    const b = document.createElement('button');
    b.className = 'pin';
    b.type = 'button';
    b.dataset.room = room.id;
    b.dataset.place = room.hotspot.side || 'right';
    b.style.pointerEvents = 'auto';
    // The button's own label carries what the plate prints, so a screen reader gets the contents
    // on every viewport — including the portrait phone, where the chips do not exist at all.
    b.setAttribute('aria-label', factsLabel(room));
    // Six rings on one keyframe with no delay blink in lockstep and read as a bank of identical
    // UI markers rather than as lights in a building. Six pins x 0.4s is exactly one cycle.
    b.style.setProperty('--i', i);
    const rows = roomFacts(room).map((f) =>
      `<span class="st"><span class="nm">${esc(f.name)}</span>` +
      `<span class="meta${f.now ? ' now' : ''}">` +
      `${f.video ? '<i class="play" aria-hidden="true"></i>' : ''}${esc(f.label)}</span></span>`).join('');
    // The numeral is what the label becomes on a portrait phone, where the chips are dropped and
    // the names are carried by the numbered room list under the building (ui/hud.js). Same index
    // in both places, so a dot on the render and a row in the list name the same room.
    //
    // The room name moves into its own span because the chip is white-space: nowrap and the plate
    // rows have to wrap. Spans rather than a list: a <ul> inside a <span> is invalid nesting, and
    // the plate is aria-hidden anyway — the button's label already carries it.
    b.innerHTML = `<span class="dot" aria-hidden="true"><i>${i + 1}</i></span>` +
      `<span class="chip"><span class="name">${esc(room.name)}</span>` +
      `<span class="sub">${esc(room.tagline || '')}</span>` +
      (rows ? `<span class="plate" aria-hidden="true"><span class="plate-in">${rows}</span></span>` : '') +
      `</span>`;
    b.addEventListener('click', () => onSelect(room));
    b.addEventListener('pointerenter', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: room.id })));
    b.addEventListener('pointerleave', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: null })));
    // Focus does what hover does. Until now the keyboard got the chip expansion and no stream
    // response at all; focus/blur rather than focusin/focusout because the pin has no focusable
    // descendants.
    b.addEventListener('focus', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: room.id })));
    b.addEventListener('blur', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: null })));
    pinsEl.appendChild(b);
    return { room, el: b, side: room.hotspot.side || 'right' };
  });
  place();
  return pins;
}

// Positions only. Visibility belongs to showPins/hidePins: the layout event fires the moment a
// transform is applied, so letting it unhide pins would pop them back at their final coordinates
// while the building is still zooming out from a room.
//
// Which side a label sits on is the manifest's call (the side that points into the building
// rather than off the edge), and always was on every viewport that draws labels. The solver that
// used to search for a non-colliding side here is gone with the one case it served: it kept six
// portrait-phone chips inside the screen and out of each other's way, and the six chips it
// placed still blanketed the building they were labelling. Portrait draws numbered dots now and
// carries the names in the room list underneath, so there is nothing left to solve.
function place() {
  const dotOnly = getState().portrait;
  for (const pin of pins) {
    const { room, el } = pin;
    const p = toScreen(room.hotspot.x, room.hotspot.y);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    // "dot" centres the button — padding, thumb target and all — on the coordinate, which is
    // what a pin with no label wants; the named sides offset it by the dot's radius instead.
    el.dataset.place = dotOnly ? 'dot' : pin.side;
  }
}
onLayout(place);

// A reveal is only ever allowed over a building that is actually on show. `inRoom` alone is not
// that test: it is cleared at the start of an exit whose room render stays visible for another
// 900 ms, so the layer's own opacity is what decides.
function canShow() { return !getState().inRoom && !isRoomVisible(); }

// Bumped by every reveal and every hide, so the staggered timers of an older navigation cannot
// fire against a newer one.
let revealToken = 0;

export function showPins(stagger = true) {
  const token = ++revealToken;
  if (!canShow()) return;
  pins.forEach(({ el }, i) => setTimeout(() => {
    if (token !== revealToken || !canShow()) return;
    el.style.visibility = 'visible';
    el.classList.add('show');
  }, stagger ? 120 * i : 0));
}

// Immediate, not a fade: a pin lingering at 40% opacity over a room render is still a pin over a
// room render.
export function hidePins() {
  revealToken++;
  pins.forEach(({ el }) => { el.classList.remove('show'); el.style.visibility = 'hidden'; });
}
