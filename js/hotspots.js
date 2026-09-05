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

function place() {
  const st = getState();
  for (const { room, el } of pins) {
    const p = toScreen(room.hotspot.x, room.hotspot.y);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.visibility = st.inRoom ? 'hidden' : 'visible';
  }
}
onLayout(place);

export function showPins(stagger = true) {
  pins.forEach(({ el }, i) => setTimeout(() => el.classList.add('show'), stagger ? 120 * i : 0));
}
export function hidePins() { pins.forEach(({ el }) => el.classList.remove('show')); }
