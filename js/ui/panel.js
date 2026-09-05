// Station panel: tabs for the room's stations, body with copy, media gallery, capabilities, CTAs.
import { openLightbox } from './lightbox.js';

const tabsEl = document.getElementById('tabs');
const bodyEl = document.getElementById('panel-body');
const STATUS_LABEL = { live: 'Live', beta: 'Beta', alpha: 'Alpha', roadmap: 'Roadmap', 'coming-soon': 'Coming soon', service: '3HUE Advisory', platform: 'Platform' };
let onSelectStation = () => {};
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initPanel(handlers) { onSelectStation = handlers.onSelectStation || onSelectStation; }

export function showRoom(room, stationId) {
  const station = room.stations.find((s) => s.id === stationId) || room.stations[0];
  // tabs
  tabsEl.innerHTML = '';
  for (const s of room.stations) {
    const b = document.createElement('button');
    b.className = 'tab' + (s.id === station.id ? ' active' : '');
    b.type = 'button'; b.role = 'tab';
    b.setAttribute('aria-selected', s.id === station.id ? 'true' : 'false');
    b.textContent = s.name;
    b.addEventListener('click', () => onSelectStation(s));
    tabsEl.appendChild(b);
  }
  tabsEl.hidden = room.stations.length < 2;
  renderStation(room, station);
  bodyEl.scrollTop = 0;
  return station;
}

function renderStation(room, s) {
  const media = s.media || [];
  const thumbs = media.map((m, i) => {
    const inner = m.type === 'video'
      ? `${m.poster ? `<img src="${esc(m.poster)}" alt="">` : `<video src="${esc(m.src)}#t=0.5" muted preload="metadata" playsinline></video>`}
         <span class="play" aria-hidden="true"><span><svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span></span>`
      : `<img src="${esc(m.src)}" alt="${esc(m.caption)}" loading="lazy">`;
    return `<button class="thumb" type="button" data-i="${i}" aria-label="${esc(m.caption || (m.type === 'video' ? 'Play video' : 'Open image'))}">${inner}${m.caption ? `<span class="cap">${esc(m.caption)}</span>` : ''}</button>`;
  });
  const slots = Math.max(0, (media.length === 0 ? 2 : (media.length % 2)) );
  for (let i = 0; i < slots; i++) thumbs.push(`<div class="empty"><span><b>+</b>Add screenshot or video<br><small>media/${esc(s.id)}/ · see README</small></span></div>`);

  const ctas = (s.links || []).map((l) =>
    `<a class="btn ${l.primary ? 'primary' : 'outline'}" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}
      ${l.primary ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>'}
    </a>`).join('');

  bodyEl.innerHTML = `
    ${room.stations.length < 2 ? `<p class="room-intro">${esc(room.name)} · ${esc(room.tagline)}</p>` : ''}
    <div class="meta"><span class="badge ${esc(s.status)}">${esc(STATUS_LABEL[s.status] || s.status)}</span><span>${esc(s.suite || '')}</span></div>
    <h2>${esc(s.headline)}</h2>
    <p class="summary">${esc(s.summary)}</p>
    <div class="gallery">${thumbs.join('')}</div>
    ${s.capabilities?.length ? `<h3>Capabilities</h3><ul class="caps">${s.capabilities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    <div class="ctas">${ctas}</div>`;

  bodyEl.querySelectorAll('.thumb').forEach((b) => b.addEventListener('click', () => openLightbox(media, Number(b.dataset.i))));
}
