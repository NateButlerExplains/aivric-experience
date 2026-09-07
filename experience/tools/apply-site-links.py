#!/usr/bin/env python3
"""Wire the Inside AiVRIC experience into the AiVRIC-Website pages. Idempotent; run from the repo root."""
import glob, os, re, sys

ROOT = os.getcwd()
CSS_VER_OLD = 'assets/css/style.css?v=20250115'
CSS_VER_NEW = 'assets/css/style.css?v=20260906'

TOPBAR_ANCHOR = '<li><a href="trust.html"><span class="top-bar-icon accent-cyan"><i class="fas fa-shield-alt"></i></span>Trust Center</a></li>'
TOPBAR_NEW = '<li><a href="experience/?skipintro=1"><span class="top-bar-icon accent-cyan"><i class="fas fa-door-open"></i></span>Inside AiVRIC</a></li>'

MEGA_ANCHOR = '<a class="mega-card" data-mega-category="vision" href="aivric-vision-professional.html"><strong>Vision AI Optics&trade;</strong><span>OpenAI-driven AI risk analysis and reporting.</span></a>'
MEGA_NEW = '<a class="mega-card mega-card-experience" href="experience/?skipintro=1"><strong><i class="fas fa-door-open"></i>&nbsp;Inside AiVRIC</strong><span>Walk the operations floor and see Defense, Offense, and Vision converge at the executive table.</span></a>'

FOOTER_ANCHOR = '<li><a href="trust.html">Trust Center</a></li>'
FOOTER_NEW = '<li><a href="experience/?skipintro=1">Inside AiVRIC</a></li>'

# Home page only
HOME_FILM_ANCHOR = '<a href="request-demo.html" class="ve-btn ghost">Schedule a live walkthrough</a>'
HOME_FILM_NEW = '<a href="experience/" class="ve-btn ghost"><i class="fas fa-door-open"></i>&nbsp;Walk the operations floor</a>'
HOME_VISION_ANCHOR = '<a href="aivric-vision-professional.html" class="hp-btn-vision">Explore AiVRIC Vision Platform &rarr;</a>'
HOME_VISION_NEW = '<a href="experience/?skipintro=1" class="hp-btn-ghost"><i class="fas fa-door-open"></i>&nbsp;Step inside the operations floor</a>'

# Suite pages: link after the portal-hero paragraph
SUITE_ROOMS = {
    'defense-suite.html': ('defense', 'Walk the Defense wing on the operations floor'),
    'offense-suite.html': ('offense', 'Walk the Offense wing on the operations floor'),
    'vision-suite.html': ('vision', 'Step into the Client Vision chamber'),
}
AIRE_ANCHOR_FILE = 'air-remediation.html'
PORTAL_FILE = 'solutions-portal.html'

CSS_BLOCK = """
/* ── Inside AiVRIC experience links (added 2026-09) ── */
header.main-header .main-menu .navigation > li.dropdown .megamenu .mega-card.mega-card-experience {
  background: linear-gradient(135deg, rgba(255,214,58,.10), rgba(167,139,250,.12));
  border-color: rgba(255,214,58,.28);
}
header.main-header .main-menu .navigation > li.dropdown .megamenu .mega-card.mega-card-experience:hover {
  border-color: rgba(255,214,58,.6);
  background: linear-gradient(135deg, rgba(255,214,58,.16), rgba(167,139,250,.18));
}
header.main-header .main-menu .navigation > li.dropdown .megamenu .mega-card.mega-card-experience strong { color: #ffd63a; }
header.main-header .main-menu .navigation > li.dropdown .megamenu .mega-card.mega-card-experience span { color: #cbd5e1; }
.portal-hero .portal-floor-link, .sp-hero .sp-floor-link {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; padding: 10px 18px; border-radius: 999px;
  border: 1px solid rgba(255,214,58,.35); color: #ffd63a; font-weight: 600; font-size: 14px; text-decoration: none;
  transition: background .2s ease, border-color .2s ease, transform .2s ease;
}
.sp-hero .sp-floor-link { margin-top: 22px; }
.sp-hero .sp-floor-link:hover { background: rgba(255,214,58,.1); border-color: #ffd63a; transform: translateY(-1px); color: #ffd63a; }
.portal-hero .portal-floor-link { background: #0b1220; border-color: #0b1220; color: #ffd63a; margin: 14px 0 12px; }
.portal-hero .portal-floor-link:hover { background: #1e293b; border-color: #1e293b; color: #ffd63a; transform: translateY(-1px); }
"""


def insert_after(s, anchor, new, indent_like=True):
    """Insert `new` on its own line after the unique `anchor`. Returns (s, changed)."""
    if new in s:
        return s, False
    if s.count(anchor) != 1:
        return s, None  # anchor missing or ambiguous
    i = s.index(anchor)
    line_start = s.rfind('\n', 0, i) + 1
    indent = s[line_start:i] if indent_like and s[line_start:i].strip() == '' else ''
    return s.replace(anchor, anchor + '\n' + indent + new), True


def process(path):
    with open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    orig = s
    log = []
    name = os.path.basename(path)

    # earlier draft label → final label
    s = s.replace(TOPBAR_NEW.replace('Inside AiVRIC', 'Explore the floor'), TOPBAR_NEW)

    for label, anchor, new in (('topbar', TOPBAR_ANCHOR, TOPBAR_NEW), ('mega', MEGA_ANCHOR, MEGA_NEW), ('footer', FOOTER_ANCHOR, FOOTER_NEW)):
        s, ch = insert_after(s, anchor, new)
        log.append(f'{label}:{ "added" if ch else ("skip" if ch is False else "no-anchor") }')

    if name == 'index.html':
        s, ch = insert_after(s, HOME_FILM_ANCHOR, HOME_FILM_NEW); log.append(f'film-cta:{ch}')
        s, ch = insert_after(s, HOME_VISION_ANCHOR, HOME_VISION_NEW); log.append(f'vision-cta:{ch}')
        s = s.replace('.hp-arch-cta{text-align:center}', '.hp-arch-cta{text-align:center;display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap}')

    if name in SUITE_ROOMS:
        room, label = SUITE_ROOMS[name]
        new = f'<a class="portal-floor-link" href="experience/#/room/{room}"><i class="fas fa-door-open"></i>{label} &rarr;</a>'
        m = re.search(r'(<div class="portal-hero">\s*<h2>[^<]*</h2>\s*<p>[^<]*</p>)', s)
        if new not in s and m:
            s = s[:m.end()] + '\n                    ' + new + s[m.end():]
            log.append('suite-link:added')
        else:
            log.append('suite-link:' + ('skip' if new in s else 'no-anchor'))

    if name == PORTAL_FILE:
        new = '<a class="sp-floor-link" href="experience/?skipintro=1"><i class="fas fa-door-open"></i>Walk the operations floor and see the three suites converge &rarr;</a>'
        m = re.search(r'<div class="sp-suite-pills">.*?\n(\s*)</div>', s, re.S)
        if new not in s and m:
            s = s[:m.end()] + '\n' + m.group(1) + new + s[m.end():]
            log.append('portal-link:added')
        else:
            log.append('portal-link:' + ('skip' if new in s else 'no-anchor'))

    if name == AIRE_ANCHOR_FILE:
        new = '<a href="experience/#/room/aire-bridge" class="ve-btn ghost"><i class="fas fa-door-open"></i>&nbsp;See AIRE on the operations floor</a>'
        m = re.search(r'<div class="ve-cta-row">(.*?)</div>', s, re.S)
        if new not in s and m:
            inner = m.group(1)
            s = s[:m.start(1)] + inner.rstrip() + '\n      ' + new + '\n    ' + s[m.end(1):]
            log.append('aire-link:added')
        else:
            log.append('aire-link:' + ('skip' if new in s else 'no-anchor'))

    if CSS_VER_OLD in s:
        s = s.replace(CSS_VER_OLD, CSS_VER_NEW); log.append('css-bump')

    if s != orig:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(s)
        return True, log
    return False, log


def main():
    css = os.path.join(ROOT, 'assets', 'css', 'style.css')
    with open(css, encoding='utf-8', newline='') as f:
        c = f.read()
    if 'mega-card-experience' not in c:
        with open(css, 'a', encoding='utf-8', newline='') as f:
            f.write(('\n' if not c.endswith('\n') else '') + CSS_BLOCK)
        print('style.css: appended experience CSS')
    else:
        print('style.css: already has experience CSS')

    changed = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        did, log = process(path)
        changed += did
        if did or '-v' in sys.argv:
            print(f'{os.path.basename(path):45s} {" ".join(log)}')
    print(f'\n{changed} page(s) changed')


if __name__ == '__main__':
    main()
