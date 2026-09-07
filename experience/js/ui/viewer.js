// Inline media viewer.
//
// A station's screenshots and clips play in the LEFT-HAND STAGE, in the space the room render
// occupies, rather than in a fullscreen overlay. The station panel on the right is never covered,
// so the visitor keeps their navigation and their sense of place: they are still in the room,
// looking at something in it, not in a modal they have to dismiss to get back.
//
// Leaving is therefore cheap and obvious: Escape, the "Back to the room" chip, or clicking the
// thumbnail you are already on.

const stage = document.getElementById('stage');
const layer = document.getElementById('viewer');
const mediaEl = document.getElementById('viewer-media');
const capEl = document.getElementById('viewer-cap');
const backBtn = document.getElementById('viewer-back');
const prevBtn = document.getElementById('viewer-prev');
const nextBtn = document.getElementById('viewer-next');

let items = [], idx = -1, onChange = () => {};

export function initViewer(handlers = {}) { onChange = handlers.onChange || onChange; }

export function isViewerOpen() { return idx >= 0; }
export function viewerIndex() { return idx; }

function render() {
  const m = items[idx];
  if (!m) return;
  mediaEl.innerHTML = '';
  if (m.type === 'video') {
    const v = document.createElement('video');
    v.src = m.src; v.controls = true; v.autoplay = true; v.playsInline = true;
    if (m.poster) v.poster = m.poster;
    mediaEl.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = m.src; img.alt = m.caption || '';
    img.decoding = 'async';
    mediaEl.appendChild(img);
  }
  const where = m.group ? `${m.group} · ` : '';
  capEl.textContent = `${where}${m.caption || ''}`.trim();
  const many = items.length > 1;
  prevBtn.hidden = !many; nextBtn.hidden = !many;
  prevBtn.setAttribute('aria-label', `Previous of ${items.length}`);
  nextBtn.setAttribute('aria-label', `Next of ${items.length}`);
  onChange(idx);
}

export function openViewer(list, start = 0) {
  items = list || [];
  if (!items.length) return;
  idx = Math.min(Math.max(0, start), items.length - 1);
  render();
  stage.classList.add('viewing');
  document.body.classList.add('viewing');
  layer.hidden = false;
  // Focus the back control so Escape and Tab both behave, without stealing the page's scroll.
  backBtn.focus({ preventScroll: true });
}

export function closeViewer() {
  if (idx < 0) return;
  idx = -1;
  stage.classList.remove('viewing');
  document.body.classList.remove('viewing');
  layer.hidden = true;
  mediaEl.innerHTML = '';       // stops any playing video
  capEl.textContent = '';
  onChange(-1);
}

// Walking the station's media without leaving the viewer: the point of the whole change.
export function stepViewer(d) {
  if (idx < 0 || items.length < 2) return;
  idx = (idx + d + items.length) % items.length;
  render();
}

backBtn.addEventListener('click', closeViewer);
prevBtn.addEventListener('click', () => stepViewer(-1));
nextBtn.addEventListener('click', () => stepViewer(1));

// Clicking the dimmed room around the media also returns, the same way clicking away from a
// thing you opened usually does.
layer.addEventListener('click', (e) => {
  if (e.target.closest('#viewer-media, #viewer-bar')) return;
  closeViewer();
});

document.addEventListener('keydown', (e) => {
  if (!isViewerOpen()) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepViewer(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); stepViewer(1); }
});
