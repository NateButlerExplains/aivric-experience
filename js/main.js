// Boot: manifest → stage → overlays → HUD/panel → intro → router.
import { loadMaster, goBuilding, goRoom, setCurrentRoom, getState, warmRoom } from './stage.js';
import { buildPins, showPins, hidePins } from './hotspots.js';
import { buildStreams, revealStreams } from './streams.js';
import { onRoute, go, parse } from './router.js';
import { initHud, updateHud } from './ui/hud.js';
import { initPanel, showRoom } from './ui/panel.js';
import { runIntro } from './ui/intro.js';
import { isLightboxOpen, closeLightbox } from './ui/lightbox.js';

const boot = document.getElementById('boot');
const stage = document.getElementById('stage');
const masterEl = document.getElementById('master');
const params = new URLSearchParams(location.search);

// Run fn once the master layer has finished travelling. A transition that never starts (same
// transform, or prefers-reduced-motion) fires no transitionend, so a timer backs the listener up.
let cancelSettle = null;
function afterMasterSettles(fn, fallback = 1200) {
  if (cancelSettle) cancelSettle();
  const onEnd = (e) => { if (e.target === masterEl && e.propertyName === 'transform') run(); };
  const timer = setTimeout(run, fallback);
  const cleanup = () => { masterEl.removeEventListener('transitionend', onEnd); clearTimeout(timer); cancelSettle = null; };
  function run() { cleanup(); fn(); }
  masterEl.addEventListener('transitionend', onEnd);
  cancelSettle = cleanup;
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 500));

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

  // Every room render is 500-800 KB, so the first entry into a cold room stalls on the network.
  // Fetch and decode them one at a time once the floor is on screen: sequential so the six
  // requests never contend with each other or with anything the first paint still needs.
  let warming = false;
  async function warmRooms() {
    if (warming) return;
    warming = true;
    for (const r of rooms) { if (r.render) await warmRoom(r.render); }
  }

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
  let lastKey = null;

  onRoute((route) => {
    // The router re-fires on an unchanged hash (clicking the open station's own tab, or a pin for
    // the room you are already in). Handling it would restart the camera for nothing.
    const key = route.view === 'building' ? '#/' : `#/${route.view}/${route.id}`;
    if (key === lastKey) return;
    lastKey = key;

    if (route.view === 'building') {
      const leavingRoom = getState().inRoom;
      current = null; setCurrentRoom(null);
      goBuilding(true);
      updateHud({ view: 'building' });
      if (!revealed) {
        revealed = true;
        setTimeout(revealStreams, 300);
        setTimeout(() => { showPins(true); idle(warmRooms); }, 1100);
      } else if (leavingRoom) {
        // Pins come back only once the building has actually settled: showing them earlier puts
        // them at their final coordinates over a scene that is still zooming out.
        afterMasterSettles(() => showPins(false));
      }
      return;
    }

    let room, stationId;
    if (route.view === 'room') { room = findRoom(route.id); }
    else { const hit = findStation(route.id); if (hit) { room = hit.room; stationId = hit.station.id; } }
    if (!room) { go({ view: 'building' }); return; }
    if (!revealed) { revealed = true; idle(warmRooms); } // deep link: no choreography, pins stay hidden

    // Unconditional, including the deep-link path that never showed them: an unshown pin is still
    // a transparent click target sitting over the room render.
    hidePins();

    // Switching stations inside the room you are already standing in is a panel change, not a
    // journey: leave the camera and the room render exactly where they are.
    const sameRoom = current === room && getState().inRoom;
    current = room;
    if (!sameRoom) {
      const zoomRoom = { ...room, hotspot: { ...(room.zoomTo || room.hotspot), zoom: room.zoom } };
      setCurrentRoom(zoomRoom);
      goRoom(zoomRoom, true);
      prevBtn.textContent = '← ' + neighbor(-1).name; nextBtn.textContent = neighbor(1).name + ' →';
    }
    const keepFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('#tabs');
    const station = showRoom(room, stationId);
    if (keepFocus) { const tab = document.querySelector('#tabs .tab.active'); if (tab) tab.focus(); }
    updateHud({ view: route.view, room, station });
  });
}

main().catch((err) => {
  console.error(err);
  boot.textContent = 'Could not load the experience. Check the console.';
});
