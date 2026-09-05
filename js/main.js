// Boot: manifest → stage → overlays → HUD/panel → intro → router.
import { loadMaster, goBuilding, goRoom, setCurrentRoom, getState } from './stage.js';
import { buildPins, showPins, hidePins } from './hotspots.js';
import { buildStreams, revealStreams } from './streams.js';
import { onRoute, go, parse } from './router.js';
import { initHud, updateHud } from './ui/hud.js';
import { initPanel, showRoom } from './ui/panel.js';
import { runIntro } from './ui/intro.js';
import { isLightboxOpen, closeLightbox } from './ui/lightbox.js';

const boot = document.getElementById('boot');
const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);

async function main() {
  const manifest = await (await fetch('content/experience.json', { cache: 'no-cache' })).json();
  const rooms = manifest.rooms;
  const findRoom = (id) => rooms.find((r) => r.id === id);
  const findStation = (id) => { for (const r of rooms) { const s = r.stations.find((x) => x.id === id); if (s) return { room: r, station: s }; } return null; };

  stage.style.opacity = '0'; stage.style.transition = 'opacity 700ms var(--ease)';
  const st = await loadMaster(manifest.scene.master);
  buildStreams(manifest.streams, st.W, st.H);
  buildPins(rooms, (room) => go({ view: 'room', id: room.id }));
  initHud(rooms, {
    onRoom: (room) => go({ view: 'room', id: room.id }),
    onExit: () => go({ view: 'building' }),
    onFilm: async () => { await runIntro(); },
  });
  initPanel({ onSelectStation: (s) => go({ view: 'station', id: s.id }) });

  // Prev / next room controls
  const prevBtn = document.getElementById('room-prev'), nextBtn = document.getElementById('room-next');
  let current = null;
  const neighbor = (d) => rooms[(rooms.indexOf(current) + d + rooms.length) % rooms.length];
  prevBtn.addEventListener('click', () => current && go({ view: 'room', id: neighbor(-1).id }));
  nextBtn.addEventListener('click', () => current && go({ view: 'room', id: neighbor(1).id }));

  // Keyboard: Esc closes lightbox, then exits room.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isLightboxOpen()) { closeLightbox(); return; }
    if (getState().inRoom) go({ view: 'building' });
  });

  // First reveal (with or without film)
  const first = parse();
  const skipIntro = params.get('skipintro') === '1' || first.view !== 'building' || sessionStorage.getItem('aivric-intro') === '1';
  boot.classList.add('out');
  if (!skipIntro) { await runIntro(); }
  sessionStorage.setItem('aivric-intro', '1');
  stage.style.opacity = '1';

  let revealed = false;
  const revealBuilding = () => {
    if (revealed) return; revealed = true;
    setTimeout(revealStreams, 300);
    setTimeout(() => showPins(true), 1100);
  };

  onRoute((route) => {
    if (route.view === 'building') {
      current = null; setCurrentRoom(null);
      goBuilding(true);
      updateHud({ view: 'building' });
      revealBuilding();
      return;
    }
    let room, stationId;
    if (route.view === 'room') { room = findRoom(route.id); }
    else { const hit = findStation(route.id); if (hit) { room = hit.room; stationId = hit.station.id; } }
    if (!room) { go({ view: 'building' }); return; }
    if (!revealed) { revealed = true; showPins(false); } // deep link: no choreography
    const zoomRoom = { ...room, hotspot: { ...(room.zoomTo || room.hotspot), zoom: room.zoom } };
    current = room; setCurrentRoom(zoomRoom);
    goRoom(zoomRoom, true);
    const station = showRoom(room, stationId);
    updateHud({ view: route.view, room, station });
    prevBtn.textContent = '← ' + neighbor(-1).name; nextBtn.textContent = neighbor(1).name + ' →';
  });
}

main().catch((err) => {
  console.error(err);
  boot.textContent = 'Could not load the experience. Check the console.';
});
