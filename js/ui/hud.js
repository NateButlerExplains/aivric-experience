// HUD: room buttons, breadcrumb, exit controls.
const navEl = document.getElementById('nav');
const crumbsEl = document.getElementById('crumbs');
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
  const strip = document.getElementById('mobile-rooms');
  if (strip) {
    strip.innerHTML = '';
    for (const r of rooms) {
      const b = document.createElement('button');
      b.className = 'btn'; b.type = 'button'; b.textContent = r.name;
      b.style.setProperty('--dot', COLOR[r.streamColor] || 'var(--text-muted)');
      b.addEventListener('click', () => handlers.onRoom(r));
      strip.appendChild(b);
    }
  }
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

export function updateHud({ view, room, station }) {
  const inRoom = view !== 'building';
  navEl.querySelectorAll('.room-btn').forEach((b) => b.classList.toggle('active', !!room && b.dataset.room === room.id));
  document.getElementById('btn-exit').hidden = !inRoom;
  if (!inRoom) { crumbsEl.innerHTML = ''; document.title = 'Inside AiVRIC — explore the operations floor'; return; }
  const parts = [`<a href="#/">Building</a>`, `<span class="sep">›</span>`, station && room.stations.length > 1 ? `<a href="#/room/${room.id}">${room.name}</a>` : `<b>${room.name}</b>`];
  if (station && room.stations.length > 1) parts.push(`<span class="sep">›</span>`, `<b>${station.name}</b>`);
  crumbsEl.innerHTML = parts.join('');
  crumbsEl.querySelectorAll('a').forEach((a) => { a.style.textDecoration = 'none'; });
  document.title = `${station ? station.name + ' · ' : ''}${room.name} — Inside AiVRIC`;
}
