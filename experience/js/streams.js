// Information streams: SVG paths traced over the master render, animated dash flow.
// Path coordinates are in master image pixels (see tools/hotspot-tool.html).

const svg = document.getElementById('streams');
let paths = [];

export function buildStreams(streams, W, H) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.innerHTML = '';
  paths = (streams || []).map((s) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', s.d);
    p.setAttribute('class', s.color || 'blue');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (s.room) p.dataset.room = s.room;
    if (s.delay) p.style.animationDelay = `-${s.delay}s`;
    svg.appendChild(p);
    return p;
  });
  document.addEventListener('room:hover', (e) => {
    const id = e.detail;
    for (const p of paths) {
      p.classList.toggle('dim', !!id && p.dataset.room !== id && p.dataset.room !== 'all');
      p.classList.toggle('hot', !!id && p.dataset.room === id);
    }
  });
  return paths;
}

// Reveal choreography: draw each path in from its source, gold last.
export function revealStreams() {
  const order = [...paths].sort((a, b) => (a.classList.contains('gold') ? 1 : 0) - (b.classList.contains('gold') ? 1 : 0));
  order.forEach((p, i) => {
    const len = p.getTotalLength();
    p.style.opacity = '0';
    p.style.transition = 'none';
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = `${len}`;
    p.style.animation = 'none';
    setTimeout(() => {
      p.style.transition = 'stroke-dashoffset 1400ms cubic-bezier(0.22,0.61,0.36,1), opacity 300ms';
      p.style.opacity = '';
      p.style.strokeDashoffset = '0';
      setTimeout(() => { // hand back to the flowing dash animation
        p.style.transition = '';
        p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.animation = '';
      }, 1500);
    }, 200 + i * 180);
  });
}
