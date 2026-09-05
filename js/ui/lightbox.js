// Lightbox for station media (images and videos).
const box = document.getElementById('lightbox');
const mediaEl = document.getElementById('lb-media');
const capEl = document.getElementById('lb-cap');
let items = [], idx = 0, lastFocus = null;

function render() {
  const m = items[idx];
  mediaEl.innerHTML = '';
  if (m.type === 'video') {
    const v = document.createElement('video');
    v.src = m.src; v.controls = true; v.autoplay = true; v.playsInline = true;
    if (m.poster) v.poster = m.poster;
    mediaEl.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = m.src; img.alt = m.caption || '';
    mediaEl.appendChild(img);
  }
  capEl.textContent = m.caption ? `${m.caption}  ·  ${idx + 1} / ${items.length}` : `${idx + 1} / ${items.length}`;
  document.getElementById('lb-prev').hidden = items.length < 2;
  document.getElementById('lb-next').hidden = items.length < 2;
}

export function openLightbox(list, start = 0) {
  items = list; idx = start; lastFocus = document.activeElement;
  render();
  box.classList.add('open');
  document.getElementById('lb-close').focus();
}
export function closeLightbox() {
  box.classList.remove('open');
  mediaEl.innerHTML = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
export function isLightboxOpen() { return box.classList.contains('open'); }
function step(d) { idx = (idx + d + items.length) % items.length; render(); }

document.getElementById('lb-close').addEventListener('click', closeLightbox);
document.getElementById('lb-prev').addEventListener('click', () => step(-1));
document.getElementById('lb-next').addEventListener('click', () => step(1));
box.addEventListener('click', (e) => { if (e.target === box || e.target === mediaEl) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (!isLightboxOpen()) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
