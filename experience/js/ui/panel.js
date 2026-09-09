// Station panel: tabs for the room's stations, body with copy, CTAs, media gallery, capabilities.
import { openViewer, isViewerOpen, viewerIndex } from './viewer.js?v=2026-09-09c';
// Shared with the pins, so the panel's badge and the building's plate can never say different
// words about the same station.
import { STATUS_LABEL, esc } from '../roomfacts.js?v=2026-09-09c';

const tabsEl = document.getElementById('tabs');
const bodyEl = document.getElementById('panel-body');

// Maintainer affordance. The dashed "add media" card is an instruction to whoever fills the
// manifest, not something a prospect should ever read, so it only appears on ?edit URLs.
const EDIT = new URLSearchParams(location.search).has('edit');
// Two rows of tiles keeps the CTAs above the fold on a 1280x720 laptop; anything past that
// collapses into a single "+N more" tile that opens the lightbox at the first hidden item.
const MAX_TILES = 4;
let onSelectStation = () => {};
// The station's media in the order the panel displays it; what the viewer steps through.
let viewOrder = [];


export function initPanel(handlers) {
  onSelectStation = handlers.onSelectStation || onSelectStation;
  // Arrow keys walk the strip, as a tablist should. Tab still reaches every station on its own,
  // so this adds a way in rather than replacing one.
  tabsEl.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const tabs = [...tabsEl.querySelectorAll('.tab')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[next].focus();
    ensureTabVisible(tabs[next]);
  });
}

// Keep a tab on screen. The strip wraps instead of scrolling at every width we support, so this
// is normally a no-op — but it is what guarantees the open station is visible on a cold deep
// link, whatever the strip does at a width we have not measured.
function ensureTabVisible(tab) {
  if (!tab || tabsEl.hidden) return;
  const t = tab.getBoundingClientRect(), s = tabsEl.getBoundingClientRect();
  if (t.left < s.left) tabsEl.scrollLeft -= s.left - t.left + 12;
  else if (t.right > s.right) tabsEl.scrollLeft += t.right - s.right + 12;
  if (t.top < s.top) tabsEl.scrollTop -= s.top - t.top + 8;
  else if (t.bottom > s.bottom) tabsEl.scrollTop += t.bottom - s.bottom + 8;
}

export function showRoom(room, stationId) {
  const station = room.stations.find((s) => s.id === stationId) || room.stations[0];
  // tabs
  tabsEl.innerHTML = '';
  let activeTab = null;
  for (const s of room.stations) {
    const b = document.createElement('button');
    const active = s.id === station.id;
    b.className = 'tab' + (active ? ' active' : '');
    b.type = 'button'; b.role = 'tab';
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.textContent = s.name;
    b.addEventListener('click', () => onSelectStation(s));
    tabsEl.appendChild(b);
    if (active) activeTab = b;
  }
  tabsEl.hidden = room.stations.length < 2;
  renderStation(room, station);
  bodyEl.scrollTop = 0;
  ensureTabVisible(activeTab);
  return station;
}

const PLAY = '<span class="play" aria-hidden="true"><span><svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span></span>';

// The visible face of one media item: poster or first frame for video, the image otherwise.
function face(m, alt = '') {
  if (m.type === 'video') {
    return m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(alt)}" loading="lazy">`
      : `<video src="${esc(m.src)}#t=0.5" muted preload="metadata" playsinline></video>`;
  }
  return `<img src="${esc(m.src)}" alt="${esc(alt)}" loading="lazy">`;
}

// The gallery, split into labelled sections.
//
// A station like CloudSignals carries nineteen screenshots. Ungrouped they read as a wall in
// capture order and a visitor cannot tell what parts of the product are on offer. Grouping them
// by area — and labelling each — turns the same images into a contents page for the product.
// `group` is optional free text in the manifest; anything without one lands in a leading
// unlabelled section, so an item added in a hurry still shows up.
//
// Returns '' when there is nothing to show, so the panel closes up instead of leaving a hole.
function galleryHtml(s, media) {
  if (!media.length && !EDIT) return '';

  // Group in first-appearance order so the manifest stays the source of truth for sequence —
  // except the walkthrough, which leads. It is the one item that orients somebody who has just
  // walked into the room, so it should not be something they have to go looking for.
  const order = [];
  const byGroup = new Map();
  media.forEach((m) => {
    const g = m.group || '';
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g).push(m);
  });
  const lead = order.findIndex((g) => /walkthrough/i.test(g));
  if (lead > 0) order.unshift(order.splice(lead, 1)[0]);

  // The viewer walks the order the visitor can SEE, not the order the manifest happens to be in.
  // Arrowing right from the last item of a section should land on the first of the next section,
  // not jump back up the panel. `viewOrder` is that flattened sequence, and every thumbnail's
  // data-i indexes into it.
  viewOrder = order.flatMap((g) => byGroup.get(g));
  const indexOf = new Map(viewOrder.map((m, i) => [m, i]));

  // The walkthrough is open on arrival; everything below it is folded away. Nineteen thumbnails
  // pushed the capabilities list off the bottom of the panel and nobody reached it. The folded
  // areas are named in a control that nudges, so the depth is advertised rather than hidden.
  const OPEN = 1;

  const sectionHtml = (g) => {
    const cells = byGroup.get(g).map((m) => {
      const i = indexOf.get(m);
      const label = m.caption || (m.type === 'video' ? 'Play video' : 'Open image');
      const cap = m.caption ? `<span class="cap">${esc(m.caption)}</span>` : '';
      return `<button class="thumb" type="button" data-i="${i}" aria-label="${esc(label)}">` +
             `${face(m, m.caption || '')}${m.type === 'video' ? PLAY : ''}${cap}</button>`;
    }).join('');
    const head = g ? `<h4 class="mgroup">${esc(g)}<span>${byGroup.get(g).length}</span></h4>` : '';
    return `${head}<div class="gallery">${cells}</div>`;
  };

  const shown = order.slice(0, OPEN).map(sectionHtml).join('');
  const restNames = order.slice(OPEN);
  // The fold does not hide the next area, it PEEKS it: a clipped strip of the real section —
  // its heading and the top of its actual thumbnails — fading out at the cut, drifting up and
  // back on a slow cycle so a little more of it shows on each rise. Naming what is behind a fold
  // asks the visitor to take your word for it; showing a slice of it does the persuading itself.
  const rest = restNames.length
    ? `<div class="more-areas is-folded" id="more-areas">` +
        `<div class="more-inner">${restNames.map(sectionHtml).join('')}</div>` +
        `<button class="peek-hit" id="peek-hit" type="button" tabindex="-1" aria-hidden="true"></button>` +
      `</div>` +
      `<button class="reveal-areas" id="reveal-areas" type="button" aria-expanded="false" aria-controls="more-areas">` +
        `<span class="reveal-cue">` +
          `<span class="reveal-open">View all areas</span>` +
          `<span class="reveal-shut">Show fewer areas</span>` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>` +
        `</span>` +
      `</button>`
    : '';

  const editCell = EDIT
    ? `<div class="gallery"><div class="empty"><span><b>+</b>Add screenshot or video<br><small>media/${esc(s.id)}/ · see README</small></span></div></div>`
    : '';

  return `<div class="media-sections">${shown}${rest}${editCell}</div>`;
}

// Fold the extra areas open or shut. The control stays put either way — opening something you
// cannot then close is a one-way door, and this panel is meant to be somewhere you can move
// around in freely. `expandAreas()` with no argument forces open, which is what the viewer needs
// when it lands on a thumbnail inside a folded area: the panel must never mark an active
// thumbnail the visitor cannot see.
export function expandAreas(toggle = false) {
  const more = document.getElementById('more-areas');
  const btn = document.getElementById('reveal-areas');
  if (!more) return;
  const folded = more.classList.contains('is-folded');
  const open = toggle ? folded : true;
  if (open === !folded) return;
  more.classList.toggle('is-folded', !open);
  // While folded only a sliver of each tile is on screen; letting those half-tiles take clicks
  // or tab stops would open the viewer on something the visitor cannot actually see. The flag
  // goes on the CONTENT, not the container — the click surface that opens the fold is a sibling
  // inside that container, and inert on the container would disable it too.
  const inner = more.querySelector('.more-inner');
  if (inner) inner.inert = !open;
  if (btn) {
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-open', open);
  }
}

// Mark which thumbnail is currently showing in the left-hand stage, so the panel always answers
// "where am I" without the visitor having to remember.
export function setActiveMedia(i) {
  if (i >= 0) {
    const t = bodyEl.querySelector(`.thumb[data-i="${i}"]`);
    if (t && t.closest('#more-areas')) expandAreas();
  }
  bodyEl.querySelectorAll('.thumb').forEach((b) => {
    const on = Number(b.dataset.i) === i;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
}

function renderStation(room, s) {
  const media = s.media || [];
  const links = s.links || [];
  const ctas = links.map((l) =>
    `<a class="btn ${l.primary ? 'primary' : 'outline'}" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}
      ${l.primary ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>'}
    </a>`).join('');

  // Order: pitch, the ask, the evidence, then the capabilities list that closes it out.
  // Capabilities stays reachable because the media above it is folded to one area by default,
  // not because it was moved up the panel.
  bodyEl.innerHTML = `
    ${room.stations.length < 2 ? `<p class="room-intro">${esc(room.name)} · ${esc(room.tagline)}</p>` : ''}
    <div class="meta"><span class="badge ${esc(s.status)}">${esc(STATUS_LABEL[s.status] || s.status)}</span><span>${esc(s.suite || '')}</span></div>
    <h2>${esc(s.headline)}</h2>
    <p class="summary">${esc(s.summary)}</p>
    ${links.length ? `<div class="ctas">${ctas}</div>` : ''}
    <div id="station-extra"></div>
    ${galleryHtml(s, media)}
    ${s.capabilities?.length ? `<h3>Capabilities</h3><ul class="caps">${s.capabilities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;

  const reveal = bodyEl.querySelector('#reveal-areas');
  if (reveal) reveal.addEventListener('click', () => expandAreas(true));
  // The peeking strip is itself the invitation, so clicking it opens the fold.
  const peek = bodyEl.querySelector('#peek-hit');
  if (peek) peek.addEventListener('click', () => expandAreas(true));
  const foldedInner = bodyEl.querySelector('#more-areas .more-inner');
  if (foldedInner) foldedInner.inert = true;

  bodyEl.querySelectorAll('.thumb').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    // Clicking the thumbnail you are already viewing puts the room back: no hunting for an X.
    if (isViewerOpen() && viewerIndex() === i) { document.dispatchEvent(new CustomEvent('viewer:close')); return; }
    openViewer(viewOrder, i);
  }));
}
