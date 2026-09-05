// Hash router: #/  |  #/room/<roomId>  |  #/station/<stationId>
// Deep links open straight into a room with the station selected; browser back works.

export function parse(hash = location.hash) {
  const h = (hash || '#/').replace(/^#/, '');
  const m = h.match(/^\/(room|station)\/([\w-]+)/);
  if (!m) return { view: 'building' };
  return { view: m[1], id: m[2] };
}

export function go(route) {
  const target = route.view === 'building' ? '#/' : `#/${route.view}/${route.id}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function onRoute(fn) {
  window.addEventListener('hashchange', () => fn(parse()));
  fn(parse());
}
