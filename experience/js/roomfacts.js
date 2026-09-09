// One vocabulary for a station's state, imported by the panel AND the pins so the two can never
// drift. STATUS_LABEL is the canonical wording; BUILDING_STATUS is what the BUILDING is allowed
// to print.

export const STATUS_LABEL = {
  live: 'Live', beta: 'Beta', alpha: 'Alpha', roadmap: 'Roadmap',
  'coming-soon': 'Coming soon', service: '3HUE Advisory', platform: 'Platform',
};

// The panel states every status, in colour, next to the copy that explains it. The building
// prints a word only where the answer is something you can have today, and says nothing
// otherwise: a bare product name claims nothing, where "Coming soon" stacked three deep across
// the room on the gold sphere claims plenty.
//
// THIS OBJECT IS THE WHOLE POLICY. Replacing a '' with STATUS_LABEL[k] changes the plates and the
// spoken labels together and touches nothing else.
export const BUILDING_STATUS = {
  live: STATUS_LABEL.live,
  beta: STATUS_LABEL.beta,
  alpha: STATUS_LABEL.alpha,
  service: STATUS_LABEL.service,
  platform: STATUS_LABEL.platform,
  roadmap: '',
  'coming-soon': '',
};

export const esc = (s = '') => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function roomFacts(room) {
  return (room.stations || []).map((s) => ({
    name: s.name,
    label: BUILDING_STATUS[s.status] || '',   // an unknown status is silent, never raw key on the render
    now: s.status === 'live',
    video: (s.media || []).some((m) => m.type === 'video'),
  }));
}

// The same facts as one sentence, for the pin's label and the room list's. What is announced
// matches what is printed, exactly: one policy, two channels.
export function factsLabel(room) {
  const f = roomFacts(room);
  const say = (n) => String(n).replace(/→/g, ' to ');   // AIRE's station name is a flow diagram
  return `${room.name}. ${room.tagline || ''}. ${f.length} station${f.length === 1 ? '' : 's'}: `
    + f.map((x) => (x.label ? `${say(x.name)}, ${x.label}` : say(x.name))).join('; ') + '.';
}

/* ---------------------------------------------------------------- *
 * Links
 * ---------------------------------------------------------------- */

// The manifest writes a product page as `../cspm-cloudsignals.html` — correct when the experience
// is served from inside aivric.com, and a 404 everywhere else, including the preview the owner
// actually looks at. All of those pages exist upstream, so resolve them there when we are not in
// production rather than editing the owner's file.
//
// Only bare parent-relative .html pages are rewritten. `../academy/...` is left alone because
// those files really are siblings here, and absolute URLs are never touched.
const SITE = 'https://aivric.com/';
const PRODUCTION = /(^|\.)aivric\.com$/i;

export function resolveHref(href) {
  const h = String(href || '');
  if (PRODUCTION.test(location.hostname)) return h;
  const m = /^\.\.\/([^/]+\.html(?:[?#].*)?)$/.exec(h);
  return m ? SITE + m[1] : h;
}
