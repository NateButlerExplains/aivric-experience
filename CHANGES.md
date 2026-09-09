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

---

## Change 03 — The door plate

**Problem.** Change 02 lit eighteen displays inside the rooms, which made the building view the
deadest part of the experience. A pin gave a room name and, on hover, a tagline. It could not
answer the only question a visitor actually has at that moment: *if I go in there, what do I get?*
Defense has three stations and thirty-two screenshots; AIRE has one station and none. That
asymmetry is real, and it was completely invisible.

**What was rejected, and why it matters.** The plan going in said to preview the room's own render
behind a soft mask. That is wrong, and looking at the building is what shows it: **the master is a
cutaway.** You can already see into Defense, the sphere chamber, Offense, the boardroom and the
AIRE bridge. Pasting a photograph of a room over the photograph of that room is either invisible or
reads as a rendering bug. A four-way design panel with three independent judges also killed a
lighting approach — dropping the house lights everywhere except the hovered room — on the evidence
of its own prototype renders: the gold sphere is emissive and survives any matte, so the lit region
read as a lens vignette rather than as a room.

**Change.** The chip grows downward on hover and keyboard focus into a door plate: one line per
station, in the chip's own material. No new surface, no second border, no blur of its own, no
animation of its own. The product name on one side, and on the other a status word — but only where
the answer is something you can have today. While a plate is open the other five pins step back to
0.4, matching what `streams.js` already does to the paths on the same event.

**The status policy is one object.** `js/roomfacts.js` exports `BUILDING_STATUS`, which maps
roadmap and coming-soon to `''`. The panel states every status in colour, next to the copy that
explains it; the building says nothing rather than stacking "Coming soon" three deep across the
room on the gold sphere. A bare product name claims nothing. Flipping a `''` to the label changes
the plates and the spoken labels together and touches nothing else.

**Nothing looks abandoned, and that is not luck.** The rooms with the fewest stations have the
longest station names, so at a fixed 248px measure the rendered line counts come out 3, 3, 3, 2, 2,
2 — AIRE's single station wraps to two lines and carries comparable plate mass to Defense's three.
No copy was invented to pad anything.

**Two bugs found by building it.**

Offense is the only left-placed pin, so its button is anchored by its *right* edge — the transform
subtracts the button's own width. A chip that grows wider therefore grows leftward, dragging the
room name 200px out from under the pointer that opened it, which drops the hover and starts a
flicker loop. Fixed by mirroring that side: the plate right-aligns against the pinned edge, status
word on the outside. It reads as a sign hanging off the hinge, which is what a sign on the other
side of a door does.

`transition-duration` on `.pin` never reached `.pin .sub`, so a reduced-motion visitor has been
getting the animated tagline reveal this whole time. Fixed in the same rule that covers the plate.

**Also.** Keyboard focus now dispatches `room:hover`, so the streams respond to the keyboard — they
never did before. The six pulse rings get a negative per-pin animation delay; in lockstep they read
as a bank of identical UI markers rather than as lights in a building. `streams.js` hands its paths
back to the stylesheet instead of pinning `transition: none` for the life of the page, so sweeping
the pointer across the floor blends instead of strobing.

**Files.** `js/roomfacts.js` (new — one vocabulary imported by both the pins and the panel, so the
two can never drift), `js/hotspots.js`, `js/ui/panel.js`, `js/ui/hud.js`, `js/streams.js`,
`css/experience.css`. No new DOM in `index.html`, no new fetch, no new asset, no new network
request, and `content/experience.json` is not touched.

**Degradation.** Touch and coarse pointers get no plate at all — the hover rule sits behind
`(hover: hover) and (pointer: fine)` and `:focus-visible` does not match a tap, so one tap enters
the room exactly as before, with no flash. Under 768px the plate is `display: none`. On a portrait
phone the chips are already dropped, so nothing changes visually; the contents reach a portrait
visitor through the room-list label instead. Without `:has()` the other pins simply do not recede.
A room with no stations renders no plate, so no orphan hairline can paint.

**Verified.** Resting building unchanged to the pixel — all six chip rects identical to shipped.
The room name does not move on open, in either axis, at 1440x900 and 740x360 (measured as a glyph
box relative to the pin's own dot, so the pointer parallax cancels). No plate leaves the viewport
at 1440x900 or 1280x720. Keyboard focus opens the plate and drives the streams. A tap navigates on
the first touch with the plate never displayed. Reduced motion has the plate at full height inside
120ms with every row present and the ring not pulsing. Portrait is unchanged with no horizontal
overflow, and its room-list label reads "Defense. Visibility, protection, and oversight. 3
stations: CloudSignals+RiskOps™, Live; AI Signals™, Beta; AIRE Agentic Mesh™." Change 02's
eighteen surfaces still mount across all five rooms, no console errors anywhere.

**Cost: none, measured as a same-session A/B.** Pointer sweep across the floor with a plate held
open versus closed: median 8.3 ms and p95 9.4 ms, identical. Room entry with screens off versus on:
p95 25.0 versus 25.1. Pins are `visibility: hidden` from the first instant of a route change, so
nothing here paints during the camera move at all. Note for anyone comparing against change 02's
numbers: absolute frame times move with machine load between sessions, so only same-session
comparisons carry information.

---

## Change 04 — The approver board

**Problem.** The AIRE bridge was the last inert room. Change 02 lit its wall board with borrowed
product screenshots, because `aire-workflow` has no media of its own — honest, but it made the
building's best surface a placeholder. And nothing anywhere in the experience asks the visitor to
*do* anything; you look at six rooms and leave.

**Change.** The bridge's four-column board becomes the workflow it is painted as. The columns run
proposed work → approval → action → verification, and the board **stops at column two** until the
visitor approves, in the panel. Then it executes, verifies, and settles. It does not loop on its
own — an animation running unattended behind a panel is motion nobody asked for.

**No invented data.** Every word comes from the manifest. The four stage names and their
descriptions are `aire-workflow`'s own capability lines, split on the colon they already contain;
the fallback for a reworded manifest takes stage names from the station's own arrow-separated
title. `aire-workflow` is `coming-soon`, so the board and the panel both say the sequence is
illustrative. The demo tenant is still not needed — this was Tier 2's highest-scored idea and it
turned out not to be blocked at all.

**A surface can now be claimed.** `content/screens.json` gains `"driver": "approver"` on the four
AIRE columns; `livescreens.js` skips any surface that declares a driver. Data, not a code branch —
the next feature that wants a display asks for it the same way. Both features read the same
geometry through `getScreenGeometry()`, so there is one file describing where the screens are.

**Where the parts sit.** The board carries state; the panel carries the control and the words. The
columns are ~250 CSS px, which is texture, not a readable control, and change 01 established that
the readable thing belongs in the panel while the thing you watch stays on the left. The panel
renders an empty `#station-extra` slot and knows nothing about the approver; the feature fills it.

**Colour.** Gold is the AIRE stream's colour and is already spent on this room, so the board is
monochrome and stage state is carried by brightness. The waiting column is the brightest thing on
the wall.

**Files.** `js/approver.js` (new) · `js/livescreens.js` (skip claimed surfaces, export the
geometry) · `js/main.js` (init, wire the control, clear on exit) · `js/ui/panel.js` (the slot) ·
`content/screens.json` (four `driver` keys) · `css/experience.css`.

**One bug worth recording.** `replay()` set `arrived = true` to avoid re-running the arrival gate —
but that gate is also what REMOVES `is-arriving`. Setting the flag without revealing left the whole
board at `visibility: hidden` for the life of the room. Every state transition fired correctly and
the sequence ran perfectly, invisibly, and the state assertions all passed. Only a screenshot
caught it.

**Verified.** 1440x900, 1280x720, 390x844: four columns mount, driven by the approver and not also
by livescreens (4 screens in the room, all `ap-`, no duplicate ids); the full sequence runs;
approve and replay work; Defense is untouched (3 `ls-` screens, 0 `ap-`, empty slot). Keyboard
reaches the control by Tab and Enter approves. Reduced motion skips the travel, lands on the
decision, and still approves. Frame pacing on room entry is unchanged: p95 16.8 ms with the board
and 16.8 ms without, against change 02's 20 ms line — the `is-arriving` gate is what holds it.

---

## Change 05 — Explain this screen

**Problem.** The experience has 37 product screenshots, and after change 01 grouped them and change
02 put them on the walls, a prospect still cannot read one. A CSPM dashboard captured at 2000px and
shown at 850 on a laptop is a picture of a dashboard, not a dashboard — evidence that a screen
exists rather than an explanation of what it does.

**Change.** A screenshot in the viewer can carry named regions. "Explain this screen" outlines
them, numbers them, and opens a note on the one you click: what the region is, and what a reader
should take from it. Off by default, because it is an aid rather than a layer to be dismissed, and
the control only appears on media that actually has annotations.

**Coordinates are normalized against the image's own pixels**, so one set of numbers is right at
every viewport. The overlay is positioned from the image's measured box through a `ResizeObserver`
rather than from CSS alone — a cached image reports `complete === true` before it has been laid
out, so measuring on `load` gives a zero box and stacks every marker in one corner.

**Note placement is measured, not derived.** Whether a region has room for its note below or to the
right depends on the viewport, not on the authored coordinates — the same region flips one way on
a laptop and the other on a wide screen. An earlier version guessed from the region's `top` value
with a CSS attribute-substring selector, which is exactly the kind of rule that works until it
does not.

**A pre-existing bug fell out of this.** `#viewer` is a grid with `grid-template-rows` but no
declared columns, so its implicit column was `auto` — max-content — and a 2000px screenshot sized
it to 1041px inside an 893px viewer. Every screenshot has been running out under the station panel
since the viewer shipped, with the overflow hidden behind the panel's own background. Declaring
`grid-template-columns: minmax(0, 1fr)` fixes it; images now sit fully inside the stage at every
width.

**Files.** `content/annotations.json` (new — keyed by media src) · `js/ui/viewer.js` · `index.html`
(one control in the viewer bar) · `css/experience.css`.

**Verified.** 1440x900, 1280x720, 390x844: the control appears only on annotated images and never
on video or on an unannotated screenshot; all seven regions on the first annotated screenshot land
on the elements they name; no note spills outside the viewer at any width; the overlay tracks the
image's box exactly (0px drift on all four edges); images now fit inside the stage at every width;
no console errors; the room walk and the living screens are unaffected.

**Coverage.** One of 37 images is annotated. The mechanism is done; the writing is not.
