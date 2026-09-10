// Boot: manifest → stage → overlays → HUD/panel → intro → router.
import { loadMaster, goBuilding, goRoom, setCurrentRoom, getState, warmRoom, whenRoomHidden, setPinSpread, settleIn } from './stage.js?v=2026-09-10g';
import { buildPins, showPins, hidePins } from './hotspots.js?v=2026-09-10g';
import { buildStreams, revealStreams } from './streams.js?v=2026-09-10g';
import { onRoute, go, parse } from './router.js?v=2026-09-10g';
import { initHud, updateHud } from './ui/hud.js?v=2026-09-10g';
import { initPanel, showRoom, setActiveMedia } from './ui/panel.js?v=2026-09-10g';
import { runIntro } from './ui/intro.js?v=2026-09-10g';
import { isLightboxOpen, closeLightbox } from './ui/lightbox.js?v=2026-09-10g';
import { initViewer, isViewerOpen, closeViewer } from './ui/viewer.js?v=2026-09-10g';
import { initLiveScreens, initLiveScreenNav, showRoomScreens, clearScreens, getScreenGeometry } from './livescreens.js?v=2026-09-10g';
import { initApprover, showApprover, clearApprover, approve, replay } from './approver.js?v=2026-09-10g';

const boot = document.getElementById('boot');
const stage = document.getElementById('stage');
const masterEl = document.getElementById('master');
const params = new URLSearchParams(location.search);

// Run fn once the master layer has finished travelling. A transition that never starts (same
// transform, or prefers-reduced-motion) fires no transitionend, so a timer backs the listener up.
function afterMasterSettles(fn, fallback = 1200) {
  const onEnd = (e) => { if (e.target === masterEl && e.propertyName === 'transform') run(); };
  const timer = setTimeout(run, fallback);
  const cleanup = () => { masterEl.removeEventListener('transitionend', onEnd); clearTimeout(timer); };
  function run() { cleanup(); fn(); }
  masterEl.addEventListener('transitionend', onEnd);
  return cleanup;
}

// Bringing the pins back is a two-part wait, and both parts matter.
//
// The camera has to have arrived, or the pins pop in at their final coordinates over a building
// that is still zooming out. And the room layer has to be GONE, not merely left: goBuilding
// clears `inRoom` at the start of an exit that then spends 900 ms fading the render out, and an
// exit at ~890 ms delivers the *enter* transition's own transitionend the instant it begins — so
// waiting on the master alone used to fade six pins up over a room render that was still on
// screen. The whole thing is cancellable, and every route change cancels it, so no timer or
// listener from an earlier navigation can fire against a newer state.
let cancelReveal = null;
function cancelPendingReveal() { if (cancelReveal) { cancelReveal(); cancelReveal = null; } }

function schedulePinReveal(stagger, { delay = 0, settle = true } = {}) {
  cancelPendingReveal();
  let dead = false;
  let stopSettle = null, stopWait = null;
  const reveal = () => { stopWait = whenRoomHidden(() => { if (!dead) showPins(stagger); }); };
  const timer = setTimeout(() => {
    if (dead) return;
    // The very first reveal follows the opening choreography, not a camera move: the building is
    // already where it belongs, so there is no transition to wait for.
    if (!settle) { reveal(); return; }
    stopSettle = afterMasterSettles(() => { if (!dead) reveal(); });
  }, delay);
  cancelReveal = () => {
    dead = true;
    clearTimeout(timer);
    if (stopSettle) stopSettle();
    if (stopWait) stopWait();
  };
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 500));

async function main() {
  const manifest = await (await fetch('content/experience.json', { cache: 'no-cache' })).json();
  const rooms = manifest.rooms;
  const findRoom = (id) => rooms.find((r) => r.id === id);
  const findStation = (id) => { for (const r of rooms) { const s = r.stations.find((x) => x.id === id); if (s) return { room: r, station: s }; } return null; };

  stage.style.opacity = '0'; stage.style.transition = 'opacity 700ms var(--ease)';
  setPinSpread(rooms); // before the first fit: the portrait overscan is capped by it
  const st = await loadMaster(manifest.scene.master);
  buildStreams(manifest.streams, st.W, st.H);
  buildPins(rooms, (room) => go({ view: 'room', id: room.id }));
  initHud(rooms, {
    onRoom: (room) => go({ view: 'room', id: room.id }),
    onExit: () => go({ view: 'building' }),
    onFilm: async () => { await runIntro(); },
  });
  initPanel({ onSelectStation: (s) => go({ view: 'station', id: s.id }) });
  // The painted displays inside each room render show that station's own screenshots, and a
  // click on one goes there — the same navigation the pins and the tabs already use.
  initLiveScreenNav((id) => go({ view: 'station', id }));
  await initLiveScreens(rooms);

  // The AIRE bridge's four columns are the approver board's, not the living screens'. The panel
  // carries the control and the words; the board carries the state. Same split as change 01 —
  // the readable thing is in the panel, the thing you watch is on the left.
  const extra = () => document.getElementById('station-extra');
  initApprover(getScreenGeometry(), {
    onState: (st) => {
      const host = extra();
      if (!host || !host.dataset.approver) return;
      // The board shows state; this says what the state MEANS and what happens next, because four
      // columns changing colour does not explain itself.
      const step = st.step > 0 && st.step <= st.steps ? `Step ${st.step} of ${st.steps} · ` : '';
      host.innerHTML =
        `<p class="ap-intro">Watch one piece of work cross the wall. It stops at Approval, because that gate is a person — you.</p>` +
        `<p class="ap-line">${st.done
            ? 'Done. The change was executed inside policy, re-scanned, and filed as signed evidence.'
            : st.waiting
              ? `${step}Agents have prepared the change and dry-run it. Nothing executes until it is authorised.`
              : st.stage ? `${step}${st.stage.desc.charAt(0).toUpperCase()}${st.stage.desc.slice(1)}.` : 'Ready when you are.'}</p>` +
        `<button class="btn ${st.waiting ? 'primary' : 'outline'}" type="button" id="ap-go"${st.waiting || st.done ? '' : ' disabled'}>` +
        `${st.done ? 'Run it again' : st.waiting ? 'Approve this change' : 'Waiting…'}</button>` +
        `<p class="ap-note">Illustrative sequence. AIRE Agentic Mesh is coming soon.</p>`;
      const btn = host.querySelector('#ap-go');
      if (btn) btn.addEventListener('click', () => { if (!approve()) replay(); });
    },
  });

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

  // The panel's active thumbnail follows whatever the left-hand stage is showing.
  initViewer({ onChange: setActiveMedia });
  document.addEventListener('viewer:close', closeViewer);

  // Keyboard: Escape unwinds one layer at a time — media, then lightbox, then the room itself.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isViewerOpen()) { closeViewer(); return; }
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
  // The composition arrives with the building rather than after it: the lockup and the room list
  // fade up (css `body.floor-ready`) while the master eases back into its frame (settleIn).
  document.body.classList.add('floor-ready');
  settleIn();

  let revealed = false;
  let lastKey = null;

  onRoute((route) => {
    if (isViewerOpen()) closeViewer();   // never survive a navigation
    // The router re-fires on an unchanged hash (clicking the open station's own tab, or a pin for
    // the room you are already in). Handling it would restart the camera for nothing.
    const key = route.view === 'building' ? '#/' : `#/${route.view}/${route.id}`;
    if (key === lastKey) return;
    lastKey = key;
    cancelPendingReveal();

    if (route.view === 'building') {
      const leavingRoom = getState().inRoom;
      current = null; setCurrentRoom(null);
      clearScreens();
      clearApprover();
      goBuilding(true);
      updateHud({ view: 'building' });
      if (!revealed) {
        revealed = true;
        setTimeout(revealStreams, 300);
        setTimeout(() => idle(warmRooms), 1100);
        schedulePinReveal(true, { delay: 1100, settle: false });
      } else if (leavingRoom) {
        schedulePinReveal(false);
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
    showRoomScreens(room, station);
    // The slot is re-created by every panel render, so mark it and let the board refill it.
    const slot = document.getElementById('station-extra');
    const boardRoom = !!(station && (station.capabilities || []).length >= 4 && room.id === 'aire-bridge');
    if (slot && boardRoom) slot.dataset.approver = '1';
    showApprover(boardRoom ? room : null, station);
    if (keepFocus) { const tab = document.querySelector('#tabs .tab.active'); if (tab) tab.focus(); }
    updateHud({ view: route.view, room, station });
  });
}

main().catch((err) => {
  console.error(err);
  boot.textContent = 'Could not load the experience. Check the console.';
});
