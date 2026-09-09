// Hotspot pins: screen-space buttons anchored to normalized master coordinates.
import { toScreen, onLayout, getState, isRoomVisible } from './stage.js?v=2026-09-08c';

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
    b.setAttribute('aria-label', `${room.name}: ${room.tagline || ''}`);
    // The numeral is what the label becomes on a portrait phone, where the chips are dropped and
    // the names are carried by the numbered room list under the building (ui/hud.js). Same index
    // in both places, so a dot on the render and a row in the list name the same room.
    b.innerHTML = `<span class="dot" aria-hidden="true"><i>${i + 1}</i></span>` +
      `<span class="chip">${room.name}<span class="sub">${room.tagline || ''}</span></span>`;
    b.addEventListener('click', () => onSelect(room));
    b.addEventListener('pointerenter', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: room.id })));
    b.addEventListener('pointerleave', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: null })));
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
