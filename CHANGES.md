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

---

## Change 02 — Living screens

**Problem.** Change 01 fixed all four building-metaphor promises inside the panel, which left the
deepest interaction in the experience sitting in a sidebar attached to a static photograph. The
rooms themselves were inert JPEGs: you walk into Defense, and the wall display the analysts are
standing at is dead pixels. Two substrates built in Phase A — `js/screens.js` (perspective-maps a
DOM element onto four corner points of a painted surface) and `js/clock.js` (one timebase every
animated module reads) — had never been imported by anything.

**Change.** The painted displays inside each room render now run the product. A surface is four
corners in the render's own image pixels; the content is that station's real screenshots from the
manifest, slowly cross-faded; and a click on a display goes to that station, the same navigation
the pins and the tabs already use. The room's primary display follows whichever station tab is
open, so choosing a product changes what the wall is running — the room-level version of change
01's "stay in the saddle".

**Not readable, on purpose.** The biggest surface in the building is about 1240 image pixels wide
and most are a fifth of that, so at any real viewport a screenshot mounted there is texture, not
information. The screens say "this is running, and it is ours". The panel says what it is.

**Occlusion.** A photograph has no depth, so a screen paints over whatever stands in front of it —
the man pointing at the Defense wall, the heads along the AIRE board. A luminance key does not
separate them: these displays show dark maps, so the people are no darker than the content they
stand in front of. So the silhouettes are traced into `content/screens.json` in image pixels and
punched back out through an SVG mask. One detail worth knowing: CSS `mask-image` reads the image's
alpha, not its luminance, so black-on-white masks nothing — the holes have to be real
transparency, which is what an inner SVG `<mask>` produces.

**Files.**
- `content/screens.json` — surface geometry. Mine, not the owner's manifest, which is never
  touched. Per surface: `quad` (TL, TR, BR, BL in image pixels), `station`, optional `occluders`
  (traced polygons), `fade` (a bottom falloff shorthand) and `dim`.
- `js/livescreens.js` — the feature. Reads the geometry, mounts through `screens.js`, cycles on
  `clock.js`.
- `js/main.js` — three lines: init after the manifest loads, mount on room entry, clear on exit.
- `css/experience.css` — the `.screen-live` block, appended at the end so the reduced-motion
  override wins on source order.
- `tools/calibrate.html` — the quad harness, promoted out of scratch. Solves the same homography
  `screens.js` does and overlays a grid plus corner ticks, which is what makes a quad checkable by
  eye. Supersedes the unused `tools/quad-tool.html`.

**Switches.** `?screens=0` turns it off. `?screens=debug` mounts the calibration grid instead of
content, so a quad can be checked against the live site. No `screens.json` is a silent no-op.

**Cost.** Nothing per frame while the camera moves: drift is held for 1.7s after entering a room,
which is the only place in this experience where frame budget is tight. The stills are the same
files the panel already loads, so they are cache hits.

**Surfaces.** 18 mounted across five rooms, calibrated with `tools/calibrate.html`; every quad's
edges were fitted numerically from the render's own luminance profile rather than eyeballed.

| Room | Mounted | Notes |
|---|---|---|
| AIRE | the wall board as its four columns | The seams were measured (x 523.5, 851.5, 1120.0), so the columns tile with no gap. That is also the geometry the four-stage approver board will need. Three seated heads clip the bottom edge and are traced back in. |
| Defense | wall display + two desk monitors | The man pointing at the board and the ponytail clipping its right strip are traced back in. |
| Client Vision | all six holographic panels | These are holograms, not displays, so they mount as projected light (`glass`) rather than opaque plates — which also lets the sphere's limb and light streams pass through the corners they cross without a polygon each. Two glass mullions genuinely stand in front and are masked. |
| Offense | four desk monitors | No wall display exists in this render. The analyst's back covers half the centre monitor and is traced back in. |
| Executive Decisions | the table glass | The quad is the walnut bezel inset 5px onto the lit glass. The cup on the table and the gold ceiling ribbon crossing it are punched through. |

Recorded but not mounted, so the measurement is not lost: the whole-board AIRE quad, both AIRE
console monitors (45-65% hidden behind the operators sitting at them), and the Decisions right
wall display (cut into strips by two mullions and a head).

**Media, and an ask.** Most stations in the manifest have no media at all — `aire-workflow`, which
owns the largest display in the building, has none. A surface whose station is empty borrows from
its own room first and the rest of the building second, and every still carries its own station,
so clicking a display goes to whatever it is actually showing rather than to the station the
surface was nominally assigned. That keeps the building lit and keeps the navigation honest, but
the real fix is screenshots for those stations.

**A second pass re-measured every quad independently, and it was worth running.** Five surfaces
were wrong. All six Vision panels were off by 4-8 px in the same direction: they are curved
holograms whose edges bow away from a straight chord, and the first pass read each edge's height
at the arc's extremum instead of intersecting the two straight edge runs at the corner. The
Decisions quad was pixel-accurate on the wrong edge — it tracked the walnut tabletop cutout, and
a bronze frame about 32 px wide sits between that and the emissive glass, so content was starting
on the frame. Defense's right monitor had its bottom edge set at the bottom of the bright map,
excluding the dark taskbar strip that is still screen; the correction is applied but still
clipped at x 893, because the panel's real right side is behind the woman and content mounted out
to its true edge would paint over her. The AIRE board, its four columns, all four Offense
monitors and the Defense wall passed unchanged.

**The screens stay dark while the camera moves.** Painting eighteen screenshots inside a layer
that is being transformed costs real frames. Measured over five runs of 128 frames each: p95 went
from 16.9 ms without screens to 25.1 ms with them, repeatably, with a max of 33.5 ms. Ablation
ruled out every effect — the blend layer, the filters, the mask, `will-change` — and pinned it on
rasterising the images themselves: hiding them restored 16.9 ms exactly. So a surface mounts
`visibility: hidden` and fades up once the room has landed, which brings p95 back to 18.8 ms
against a 17.7 ms baseline and the max back to 25.0. It is also the better beat: you arrive, and
then the room wakes up.

**Verified.** All six rooms at 1440x900, 1280x720 and 390x844: 18 surfaces mount, none survive an
exit to the building, none leak across repeated room changes, no console errors. Clicking a
display navigates to the station it is showing. The primary display follows the open station tab
without re-mounting. Pins stay clickable. The inline viewer still dims the room and covers the
screens. Reduced motion mounts everything, reveals everything, and animates nothing.
