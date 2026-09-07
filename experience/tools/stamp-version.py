#!/usr/bin/env python3
"""Stamp a cache-busting version onto the CSS link and the whole ES module graph.

Why this exists: index.html loads js/main.js, which imports js/ui/panel.js, which imports
js/ui/viewer.js. Putting ?v= on the entry point alone does nothing for the rest — the browser
keeps serving cached copies of every imported module, so a fix appears not to have shipped.
GitHub Pages behind Cloudflare gives us no useful cache headers to lean on, so the version has
to be in the URL of every file that can change.

Run this before publishing, then commit the result:

    python3 tools/stamp-version.py            # stamps today's date plus a counter
    python3 tools/stamp-version.py 2026-09-07b

It is idempotent: an existing ?v= is replaced, never doubled.
"""
import datetime
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()

# A relative specifier in an import/export ... from '...' — the only ones we control.
IMPORT = re.compile(r"""(\bfrom\s+['"])(\.[^'"?]+\.js)(\?v=[^'"]*)?(['"])""")
ENTRY = re.compile(r"""(<(?:script|link)[^>]*?(?:src|href)=")((?:js|css)/[^"?]+)(\?v=[^"]*)?(")""")

changed = []

for path in sorted(ROOT.glob("js/**/*.js")):
    text = original = path.read_text()
    text = IMPORT.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={VERSION}{m.group(4)}", text)
    if text != original:
        path.write_text(text)
        changed.append(path.relative_to(ROOT))

index = ROOT / "index.html"
text = original = index.read_text()
text = ENTRY.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={VERSION}{m.group(4)}", text)
if text != original:
    index.write_text(text)
    changed.append(index.relative_to(ROOT))

print(f"stamped v={VERSION} across {len(changed)} files")
for c in changed:
    print(f"  {c}")
if not changed:
    print("  (already at this version)")
