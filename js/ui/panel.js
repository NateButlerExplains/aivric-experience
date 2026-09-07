// Station panel: tabs for the room's stations, body with copy, CTAs, media gallery, capabilities.
import { openLightbox } from './lightbox.js';

const tabsEl = document.getElementById('tabs');
const bodyEl = document.getElementById('panel-body');
const STATUS_LABEL = { live: 'Live', beta: 'Beta', alpha: 'Alpha', roadmap: 'Roadmap', 'coming-soon': 'Coming soon', service: '3HUE Advisory', platform: 'Platform' };
// Maintainer affordance. The dashed "add media" card is an instruction to whoever fills the
// manifest, not something a prospect should ever read, so it only appears on ?edit URLs.
const EDIT = new URLSearchParams(location.search).has('edit');
// Two rows of tiles keeps the CTAs above the fold on a 1280x720 laptop; anything past that
// collapses into a single "+N more" tile that opens the lightbox at the first hidden item.
const MAX_TILES = 4;
let onSelectStation = () => {};
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// Returns the gallery markup, or '' when there is nothing to show (no media, no edit flag) so
// the panel closes up instead of leaving a hole where the grid used to be.
function galleryHtml(s, media) {
  // Each cell is a function of an extra class, so the last one can be widened after the fact.
  const cells = [];
  const overflowing = media.length > MAX_TILES;
  const shown = overflowing ? media.slice(0, MAX_TILES - 1) : media;

  shown.forEach((m, i) => {
    const label = m.caption || (m.type === 'video' ? 'Play video' : 'Open image');
    const cap = m.caption ? `<span class="cap">${esc(m.caption)}</span>` : '';
    cells.push((x) => `<button class="thumb${x}" type="button" data-i="${i}" aria-label="${esc(label)}">${face(m, m.caption || '')}${m.type === 'video' ? PLAY : ''}${cap}</button>`);
  });

  if (overflowing) {
    const rest = media.length - shown.length;
    const next = media[shown.length];
    cells.push((x) => `<button class="thumb more${x}" type="button" data-i="${shown.length}" aria-label="Show ${rest} more item${rest === 1 ? '' : 's'}">${face(next)}<span class="count"><b>+${rest}</b>more</span></button>`);
  }

  if (EDIT) {
    cells.push((x) => `<div class="empty${x}"><span><b>+</b>Add screenshot or video<br><small>media/${esc(s.id)}/ · see README</small></span></div>`);
  }

  if (!cells.length) return '';
  // Odd count: the last tile spans the grid rather than sitting next to a filler card.
  const last = cells.length - 1;
  return `<div class="gallery">${cells.map((f, i) => f(i === last && cells.length % 2 === 1 ? ' wide' : '')).join('')}</div>`;
}

function renderStation(room, s) {
  const media = s.media || [];
  const links = s.links || [];
  const ctas = links.map((l) =>
    `<a class="btn ${l.primary ? 'primary' : 'outline'}" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}
      ${l.primary ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>'}
    </a>`).join('');

  // Order: pitch, then the ask, then the evidence. The CTA row sits above the gallery so the
  // one button that matters is on screen without scrolling at 1280x720 and up.
  bodyEl.innerHTML = `
    ${room.stations.length < 2 ? `<p class="room-intro">${esc(room.name)} · ${esc(room.tagline)}</p>` : ''}
    <div class="meta"><span class="badge ${esc(s.status)}">${esc(STATUS_LABEL[s.status] || s.status)}</span><span>${esc(s.suite || '')}</span></div>
    <h2>${esc(s.headline)}</h2>
    <p class="summary">${esc(s.summary)}</p>
    ${links.length ? `<div class="ctas">${ctas}</div>` : ''}
    ${galleryHtml(s, media)}
    ${s.capabilities?.length ? `<h3>Capabilities</h3><ul class="caps">${s.capabilities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;

  bodyEl.querySelectorAll('.thumb').forEach((b) => b.addEventListener('click', () => openLightbox(media, Number(b.dataset.i))));
}
