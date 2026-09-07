# Changes

Each change is built and reviewed on localhost first, then pushed as its own branch and commit.
Numbered so a reviewer can follow them in order.

| # | Name | What it does | Status |
|---|---|---|---|
| 01 | Station media: grouped areas, a nudged reveal, and an inline viewer | Splits a station's media into labelled areas, opens two of them, previews the rest behind an animated control, moves Capabilities above the media, and plays a clicked thumbnail in the large left-hand stage instead of a fullscreen popup | in review |

## 01 — Station media: grouped sections and an inline viewer

**Problem.** The Defense room's CloudSignals station is a wall of 19 thumbnails in capture
order, with no indication of what parts of the product they cover. Clicking one opened a
fullscreen lightbox, which hid the station navigation and had to be dismissed with an X before
you could look at anything else.

**Change.**
1. Media items carry an optional `group` label. The panel renders one labelled section per
   group, in manifest order, so a visitor can see at a glance which areas of the product there
   are to explore.
2. Clicking a thumbnail now shows that image or video in the **left-hand stage**, at the size
   the room render used to occupy. The station panel on the right stays exactly where it is,
   with the active thumbnail marked, so you never lose your place or your navigation.
3. Escape, or the thumbnail you are already on, returns to the room view. Arrow keys walk the
   station's media without leaving the viewer.

4. **The walkthrough leads, and the fold peeks rather than hides.** The walkthrough area is open
   on arrival — it is what orients somebody who has just walked into the room. Everything below
   it is clipped to a strip that still shows the *real* next section: its heading and most of the
   first row of actual thumbnails, dissolving at the cut. The strip drifts up and settles on a
   3.4 second cycle, so a little more of it shows on each rise. Naming what is behind a fold asks
   the visitor to take your word for it; showing a slice of it does the persuading itself.
   Clicking anywhere in the peek opens it, and it holds still under `prefers-reduced-motion`.
   The `inert` flag that stops the half-visible tiles taking clicks goes on the peek's *content*,
   not on its container — the click surface that opens the fold is a sibling inside that
   container, and inert on the container silently disabled it.
5. **The control folds both ways.** "View all 5 areas" becomes "Show fewer areas" and the chevron
   flips. Opening something you cannot close is a one-way door. Arrowing into a folded area from
   the viewer opens it automatically, so the panel can always answer "where am I".
6. **Capabilities stays at the bottom.** It is reachable because the media above it is folded to
   one area by default, not because it was moved. On three of thirteen stations it still starts
   36-90px below the fold at 1280x720 — a short scroll, not a wall. At 1440x900 every station
   clears it.

**Look.** The reveal is plain type, not a bordered card: a box there competed with the thumbnails
above it and made the panel read as stacked chrome. Only the chevron moves.

**Manifest.** `group` is optional and free text. Items without one fall into an unlabelled first
section, so nothing breaks if it is omitted.

**Deploying.** `python3 tools/stamp-version.py` stamps a cache-busting version onto the CSS and
every module in the graph. Versioning only the entry point does nothing — the browser keeps
serving cached copies of everything it imports, and a fix appears not to have shipped. Run it
before publishing.

**Verified.** All 13 stations at 1440x900, 1280x720 and 390x844: collapse, expand, viewer open
and close, Escape chain, no console errors, no failed requests. Capabilities is reachable without
scrolling on every station at both desktop sizes.
