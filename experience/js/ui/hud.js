// HUD: room buttons, breadcrumb, exit controls.
import { factsLabel } from '../roomfacts.js?v=2026-09-10q';
const navEl = document.getElementById('nav');
const crumbsEl = document.getElementById('crumbs');
const roomsEl = document.getElementById('mobile-rooms');
const COLOR = { blue: 'var(--blue)', coral: 'var(--coral)', gold: 'var(--gold)' };
let rooms = [], handlers = {};

export function initHud(roomList, h) {
  rooms = roomList; handlers = h;
  navEl.innerHTML = '';
  for (const r of rooms) {
    const b = document.createElement('button');
    b.className = 'btn room-btn'; b.type = 'button'; b.dataset.room = r.id;
    b.style.setProperty('--dot', COLOR[r.streamColor] || 'var(--text-muted)');
    b.textContent = r.name;
    b.addEventListener('click', () => handlers.onRoom(r));
    navEl.appendChild(b);
  }
  buildRoomList();
  const exit = document.createElement('button');
  exit.className = 'btn outline'; exit.id = 'btn-exit'; exit.type = 'button'; exit.hidden = true;
  exit.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg>Exit room';
  exit.addEventListener('click', () => handlers.onExit());
  navEl.appendChild(exit);

  const film = document.createElement('button');
  film.className = 'btn icon'; film.id = 'btn-film'; film.type = 'button'; film.title = 'Replay the film'; film.setAttribute('aria-label', 'Replay the film');
  film.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';
  film.addEventListener('click', () => handlers.onFilm());
  navEl.appendChild(film);
}

// The six rooms, under the building on a portrait phone and along the bottom edge on a landscape
// one. One markup for both: the numbered list is the portrait layout (the numerals match the
// numbered pins on the render, which is where the room names went when the chips came off), and
// css collapses the numeral to a colour dot and drops the tagline for the scrolling strip.
const CHEVRON = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

function buildRoomList() {
  if (!roomsEl) return;
  roomsEl.innerHTML = '';
  rooms.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'room-item'; b.type = 'button'; b.dataset.room = r.id;
    b.style.setProperty('--dot', COLOR[r.streamColor] || 'var(--text-muted)');
    b.innerHTML = `<i class="idx" aria-hidden="true">${i + 1}</i>` +
      `<span class="rname">${r.name}</span>` +
      `<span class="rtag">${r.tagline || ''}</span>` + CHEVRON;
    // The row shows a name and a tagline; the label carries the room's contents. On a portrait
    // phone, where the chips and their plates do not exist, this is the only channel that has them.
    b.setAttribute('aria-label', factsLabel(r));
    b.addEventListener('click', () => handlers.onRoom(r));
    roomsEl.appendChild(b);
  });
  edgeFades();
}

// Only the landscape strip scrolls, and only while there is something left to scroll to. The
// fade used to be painted unconditionally, which left the last room permanently half dissolved
// at the end of the strip with nothing behind it — the mask has to follow the scroll position,
// not the possibility of one.
function edgeFades() {
  if (!roomsEl) return;
  const max = roomsEl.scrollWidth - roomsEl.clientWidth;
  roomsEl.classList.toggle('fade-start', max > 2 && roomsEl.scrollLeft > 2);
  roomsEl.classList.toggle('fade-end', max > 2 && roomsEl.scrollLeft < max - 2);
}

if (roomsEl) {
  roomsEl.addEventListener('scroll', edgeFades, { passive: true });
  // A rotation swaps the strip for the portrait list and back, and either one can start or stop
  // overflowing when the address bar collapses or Jost replaces the fallback metrics.
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(edgeFades, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(edgeFades).catch(() => {});
}

export function updateHud({ view, room, station }) {
  const inRoom = view !== 'building';
  navEl.querySelectorAll('.room-btn').forEach((b) => b.classList.toggle('active', !!room && b.dataset.room === room.id));
  if (roomsEl) {
    // Six rows that have faded out are still six tab stops, and on a portrait phone they sit
    // behind an open room sheet: take the whole list out of the tab order while a room is open.
    roomsEl.inert = inRoom;
    roomsEl.querySelectorAll('.room-item').forEach((b) => {
      const on = !!room && b.dataset.room === room.id;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  document.getElementById('btn-exit').hidden = !inRoom;
  if (!inRoom) { crumbsEl.innerHTML = ''; document.title = 'Inside AiVRIC — explore the operations floor'; return; }
  const parts = [`<a href="#/">Building</a>`, `<span class="sep">›</span>`, station && room.stations.length > 1 ? `<a href="#/room/${room.id}">${room.name}</a>` : `<b>${room.name}</b>`];
  if (station && room.stations.length > 1) parts.push(`<span class="sep">›</span>`, `<b>${station.name}</b>`);
  crumbsEl.innerHTML = parts.join('');
  crumbsEl.querySelectorAll('a').forEach((a) => { a.style.textDecoration = 'none'; });
  document.title = `${station ? station.name + ' · ' : ''}${room.name} — Inside AiVRIC`;
}
