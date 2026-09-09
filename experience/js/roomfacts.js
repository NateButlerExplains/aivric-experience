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
