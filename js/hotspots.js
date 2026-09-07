// Hotspot pins: screen-space buttons anchored to normalized master coordinates.
import { toScreen, onLayout, getState } from './stage.js';

const pinsEl = document.getElementById('pins');
let pins = [];

export function buildPins(rooms, onSelect) {
  pinsEl.innerHTML = '';
  pins = rooms.filter(r => r.hotspot).map((room) => {
    const b = document.createElement('button');
    b.className = 'pin';
    b.type = 'button';
    b.dataset.room = room.id;
    b.dataset.side = room.hotspot.side || 'right';
    b.style.pointerEvents = 'auto';
    b.setAttribute('aria-label', `${room.name}: ${room.tagline || ''}`);
    b.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="chip">${room.name}<span class="sub">${room.tagline || ''}</span></span>`;
    b.addEventListener('click', () => onSelect(room));
    b.addEventListener('pointerenter', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: room.id })));
    b.addEventListener('pointerleave', () => document.dispatchEvent(new CustomEvent('room:hover', { detail: null })));
    pinsEl.appendChild(b);
    return { room, el: b };
  });
  place();
  return pins;
}

// Positions only. Visibility belongs to showPins/hidePins: the layout event fires the moment a
// transform is applied, so letting it unhide pins would pop them back at their final coordinates
// while the building is still zooming out from a room.
function place() {
  for (const { room, el } of pins) {
    const p = toScreen(room.hotspot.x, room.hotspot.y);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  }
}
onLayout(place);

export function showPins(stagger = true) {
  if (getState().inRoom) return; // never over a room render
  pins.forEach(({ el }, i) => setTimeout(() => {
    if (getState().inRoom) return;
    el.style.visibility = 'visible';
    el.classList.add('show');
  }, stagger ? 120 * i : 0));
}

// Immediate, not a fade: a pin lingering at 40% opacity over a room render is still a pin over a
// room render.
export function hidePins() {
  pins.forEach(({ el }) => { el.classList.remove('show'); el.style.visibility = 'hidden'; });
}
