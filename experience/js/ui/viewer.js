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
const explainBtn = document.getElementById('viewer-explain');

let items = [], idx = -1, onChange = () => {};

/* ---- Explain This Screen ----------------------------------------------------------------
 * A product screenshot at 2000px, shown at a third of that on a laptop, is a picture of a
 * dashboard rather than a dashboard anyone can read. Annotations name the regions that matter and
 * say what a reader should take from each, so the screenshot becomes a guided read instead of
 * evidence that a screen exists.
 *
 * Off by default. It is an aid, not a layer the visitor has to dismiss to see the product.
 * Region coordinates are normalized against the image's own pixels; the <img> is sized by
 * max-width/max-height with width and height auto, so its box IS the content box and a percentage
 * lands where it was authored with no letterbox maths.
 */
let notes = null;          // src -> { title, regions: [...] }
let explain = false;
let activeNote = -1;

export function initViewer(handlers = {}) {
  onChange = handlers.onChange || onChange;
  fetch('content/annotations.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { notes = d && d.media ? d.media : null; })
    .catch(() => { notes = null; });      // absent or malformed: the control never appears
}

function regionsFor(m) {
  if (!notes || !m || m.type === 'video') return null;
  const hit = notes[m.src];
  return hit && hit.regions && hit.regions.length ? hit : null;
}

export function isViewerOpen() { return idx >= 0; }
export function viewerIndex() { return idx; }

function render() {
  const m = items[idx];
  if (!m) return;
  const prev = mediaEl.querySelector('.shot');
  if (prev && prev._unfit) prev._unfit();
  mediaEl.innerHTML = '';
  if (m.type === 'video') {
    const v = document.createElement('video');
    v.src = m.src; v.controls = true; v.autoplay = true; v.playsInline = true;
    if (m.poster) v.poster = m.poster;
    mediaEl.appendChild(v);
  } else {
    // The shot wraps the image so the region markers can be positioned in percentages against it.
    const shot = document.createElement('div');
    shot.className = 'shot';
    const img = document.createElement('img');
    img.src = m.src; img.alt = m.caption || '';
    img.decoding = 'async';
    shot.appendChild(img);
    const ann = regionsFor(m);
    if (ann) {
      shot.appendChild(buildNotes(ann));
      // The overlay tracks the image's rendered box rather than the wrapper's, so a region lands
      // where it was authored whatever the viewport does to the image.
      //
      // Observed, not hooked to load: a cached image reports complete === true before it has been
      // laid out, so measuring then gives a zero box and every pip stacks in one corner. The
      // observer fires on first layout and on every resize after it, which is exactly the set of
      // moments the overlay needs to move.
      const ro = new ResizeObserver(() => fitNotes(shot, img));
      ro.observe(img);
      shot._unfit = () => ro.disconnect();
    }
    mediaEl.appendChild(shot);
  }
  const where = m.group ? `${m.group} · ` : '';
  capEl.textContent = `${where}${m.caption || ''}`.trim();
  const ann = regionsFor(m);
  explainBtn.hidden = !ann;
  activeNote = -1;
  applyExplain();
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

function fitNotes(shot, img) {
  const n = shot.querySelector('.notes');
  if (!n) return;
  n.style.left = img.offsetLeft + 'px';
  n.style.top = img.offsetTop + 'px';
  n.style.width = img.offsetWidth + 'px';
  n.style.height = img.offsetHeight + 'px';
  placeTip();
}

function buildNotes(ann) {
  const wrap = document.createElement('div');
  wrap.className = 'notes';
  ann.regions.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'note';
    b.type = 'button';
    b.style.left = `${r.x * 100}%`; b.style.top = `${r.y * 100}%`;
    b.style.width = `${r.w * 100}%`; b.style.height = `${r.h * 100}%`;
    b.dataset.i = i;
    b.setAttribute('aria-label', `${r.label}. ${r.note}`);
    b.innerHTML = `<i class="pip">${i + 1}</i><span class="tip"><b>${r.label}</b>${r.note}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      activeNote = activeNote === i ? -1 : i;
      applyExplain();
    });
    wrap.appendChild(b);
  });
  return wrap;
}

function applyExplain() {
  const shot = mediaEl.querySelector('.shot');
  if (shot) shot.classList.toggle('explaining', explain);
  explainBtn.setAttribute('aria-pressed', explain ? 'true' : 'false');
  explainBtn.textContent = explain ? 'Hide notes' : 'Explain this screen';
  mediaEl.querySelectorAll('.note').forEach((n, i) => n.classList.toggle('is-open', i === activeNote));
  placeTip();
}

// Keep the open note inside the viewer. Measured rather than derived from the region's authored
// coordinates: whether a note has room below or to the right depends on the viewport, and the
// same region flips one way on a laptop and the other on a wide screen.
function placeTip() {
  const open = mediaEl.querySelector('.note.is-open');
  if (!open) return;
  open.classList.remove('tip-up', 'tip-left');
  const tip = open.querySelector('.tip');
  if (!tip) return;
  const bounds = layer.getBoundingClientRect();
  let r = tip.getBoundingClientRect();
  if (r.bottom > bounds.bottom - 8) { open.classList.add('tip-up'); r = tip.getBoundingClientRect(); }
  if (r.right > bounds.right - 8) open.classList.add('tip-left');
}

export function toggleExplain(on) {
  explain = on === undefined ? !explain : !!on;
  if (!explain) activeNote = -1;
  applyExplain();
}

explainBtn.addEventListener('click', () => toggleExplain());
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
  // Escape closes an open note before it closes the viewer; main.js owns the outer layer.
  if (e.key === 'e' && !explainBtn.hidden) { e.preventDefault(); toggleExplain(); }
});
