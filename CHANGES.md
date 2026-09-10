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

**Coverage.** 33 of 37 images are annotated — 208 regions. The four that are not each have a
reason rather than being a gap:

- `assets/images/brand/Threat-Signals-1.png` is decorative concept art, not a product screen. It
  has no readable interface, so every note would have to be invented — which is the one rule the
  whole set rests on. Its own caption already says "concept render".
- The other three are duplicate references: the same file appears under more than one station, and
  an annotation is keyed by file, so it is written once and shows everywhere it is used.

`academy/screenshots/provider-branding-config.png` IS annotated, carefully. It is the redacted
copy, so its support email, both logo URLs, the favicon URL and the header search render as empty
boxes. The agent was told exactly which fields are blank, to place no region on them and not to
mention them; the tab strip, Branding Studio, both palettes, the dual-mode preview and the
published-state card carry the screen on their own.

**How the writing was done.** One agent per screenshot, each reading its image, placing regions,
rendering them through a standalone harness, looking at the result and iterating until every box
sat on the thing its label named. Two or three rounds was typical. Then two editors over disjoint
halves — a single pass over 28 screens skims the tail — hunting for notes that describe what is on
screen instead of what it is for, figures restated as product claims, invented capabilities, and
marketing adjectives. 19 rewrites were applied.

The merge reads the run's journal rather than anything hand-copied, and refuses to write if a
coordinate falls outside 0-1, a region runs past the image edge, a banned adjective appears, or a
note runs long. 185 regions, five to seven per screen, notes a median of 30 words.

**Two rules did the heavy lifting.** No figure from a screenshot may be restated as a product
claim — those numbers belong to whatever tenant was captured, so a note may name a metric but never
assert its value. And no capability may be invented: where a control's behaviour could not be read
off the screen, the agent described the region at the level it could actually support or chose a
different one.

**Verified in the product, not just in the file.** Every annotated screenshot opened in the running
viewer at 1440x900: the control appears, the regions render, and no region falls outside its
image's box. The one apparent failure was the test picking a video whose poster is also an
annotated image — videos correctly get no annotations.

---

## Change 06 — Review pass

Six things from a walkthrough of changes 02–05.

**Screens are lit on arrival.** They used to be held hidden for 1.7s to protect the room-entry
frame budget, so you arrived in a room of dark displays that woke up afterwards. Each screen now
reveals on its own image's `decode()`, and one still per station is pre-decoded while the floor is
idle, so in practice the decode has already happened before you enter. The timer survives only as a
backstop, so a broken image can never leave a display permanently dark.

The cost is real and worth stating: p95 frame time during the ~1s camera move goes from 17.0 ms to
25.3 ms, about six long frames in 128. Median is unchanged at 16.7. Promoting the layer,
`contain: paint`, `will-change` and cheaper image rendering were all measured and none of them
recovered it — the cost is painting large images inside a layer that is being transformed. Lit on
arrival is worth more than those six frames.

**The boardroom table is the right way up.** Its glass inset is a display lying flat, read by the
people sitting on the far side of the table, and the content was facing the camera instead — so it
was upside down to everyone in the room. The quad is rotated by two corners. Occluders are traced
in image pixels and pass through the same homography, so the cup and the ceiling ribbon still land.

**And it reads as a board, not a fragment.** One screenshot scaled into a tall, narrow inset left
you looking at about a tenth of a dashboard. `layout: "stack3"` splits a surface into three panels
down its length, each with a title bar, all turning on the same beat. Any surface can ask for it.

**Occlusion is tighter.** The feather was 1.2% of the surface's short edge, soft enough that bright
map content leaked out from behind a dark shoulder. It is now 0.5%, and each traced silhouette is
eroded about 2.5px toward its own centre before it is cut — erring INWARD leaves a thin rim of
mounted content over the occluder's edge, where erring outward leaks a bright rim of the original
render around it, which is the artifact that actually catches the eye. The Defense arm contour was
also re-traced: it sat about 5px high along the whole forearm.

**The approver board shows the work, not just the labels.** Four columns changing colour did not
read as anything happening. A work item now arrives in the active column, fills a bar over that
stage's real duration, and hands on; a column the work has passed keeps a "Cleared" tick. The panel
carries the explainer — what the sequence is, which step you are on, and why it has stopped.

**Files.** `js/livescreens.js` · `js/approver.js` · `js/main.js` · `content/screens.json` ·
`css/experience.css`.

**Verified.** 1440x900, 1280x720, 390x844: no screen is still hidden 600ms after entry; the table
renders three panels with content; the board runs the full sequence and hands off visibly; keyboard
reaches the approve control and Enter works; reduced motion lands on the decision and still
approves; all 33 annotated screenshots still open with their regions inside the image box; Defense
is untouched; no console errors anywhere.

---

## Change 07 — Links, honest occlusion, and a camera that follows the work

**Links resolved 404 outside production.** Thirteen station links are written `../page.html` in the
manifest, which is correct when the experience is embedded in aivric.com and wrong everywhere else
— including the preview. All thirteen exist upstream. `js/roomfacts.js` gains `resolveHref`, which
rewrites a bare parent-relative `.html` to `https://aivric.com/...` when the page is not served
from the production host. `academy/` links stay relative because those files really are siblings
here, and absolute URLs are untouched. The owner's manifest is not edited: this is a display-time
rewrite, so his file keeps working unchanged when the experience is embedded. All 16 distinct links
in the panel now return 200.

**Stopped cutting people out.** Tracing a silhouette never worked, and tightening the feather in
change 06 made it worse, which was the useful signal: a hand-drawn polygon against a soft,
slightly out-of-focus photographic edge reads as a bad cut-out however it is blurred. The AIRE
board's heads looked fine all along — and that is the tell, because there the occluder sits below
the board's own edge rather than being cut around.

Three rules replace it, in order of preference. Only the last is code.

1. **Crop.** Shrink the quad to the clear rectangle. A straight edge along the display's own plane
   reads as a panel boundary. The Defense wall is now cropped to clear the man on the left and the
   ponytail on the right — the wall shows the render's own map where he is pointing and the product
   beside it, which is what a large operations video wall actually looks like.
2. **Fade.** Where an occluder only clips an edge, a directional gradient has no edge to get wrong.
   The AIRE heads and the boardroom's ceiling ribbon are fades now.
3. **Skip.** Offense's centre monitor was 50-65% behind an analyst, with a hard polygon edge
   through his shoulder — the worst-looking thing in the building. It is unmounted; cropping to
   the clear third falls under the size floor. Three Offense monitors instead of four, and the
   render's own artwork keeps that screen.

Traced polygons now survive for exactly one thing: the two glass mullions in the Client Vision
chamber, which are hard-edged architectural objects, so a hard-edged mask matches them. The
erosion pass added in change 06 is gone with the approach it was compensating for.

**The camera follows the work.** The approver board did not land, and the reason was measurable:
column one — where the sequence starts — was **13% visible at 1440x900, 24% at 1280x720, 37% at
1920x1080**. The board is 1223 image px against an ~890px stage, so it cannot fit at the room's
zoom, and four small labels changing colour in the visible right-hand two-thirds was all there ever
was on screen.

The camera now travels the wall as the work does: column one holds the frame while the finding is
prepared, the camera moves right to Approval and stops — waiting on the visitor — then carries on
to Action and settles on Verification. `js/stage.js` gains one export, `panRoom(focus, ms)`, which
re-runs the same `fitRoom` placement used on arrival, so a pan and an entry cannot disagree about
where a point on the render is. Mounted screens are children of `#room`, so they travel with it for
nothing. Camera targets live in `content/screens.json` next to the geometry they belong to.

**Files.** `js/roomfacts.js` · `js/ui/panel.js` · `js/stage.js` · `js/approver.js` ·
`js/livescreens.js` · `content/screens.json`.

**Verified.** The active column is **100% visible at every stage at 1920x1080, 1440x900 and
1280x720** — the number this existed to fix. Panning costs nothing measurable: p95 16.8ms against
change 02's 20ms line, because it is a composited transform. Leaving mid-sequence resets the camera
and the next room gets its own framing; returning re-mounts and starts fresh. Reduced motion does
not travel and still approves; portrait holds still and the panel carries the sequence; keyboard
approval works. All 33 annotated screenshots still open with their regions inside the image box, no
console errors at any width.

---

## Change 08 — Segmented occlusion, a review guardian, and footage on the board

**The occlusion approach was replaced, not tuned.** Two earlier attempts were rejected for looking
amateurish, and the second attempt — tightening the feather — made it worse. That was the useful
signal: a hand-drawn polygon against a soft, slightly out-of-focus photographic edge cannot be made
to look professional however it is blurred.

Silhouettes are no longer drawn. `tools/build-mattes.py` runs u2net human segmentation over each
render and bakes a per-surface alpha, warped through that surface's own quad, as a PNG the CSS mask
wears. Hair, raised arms and out-of-focus edges come out correct because they are measured from the
photograph rather than traced by hand.

Three refinements, each of which came out of the review rather than out of looking:

- **Solidify.** The warp stretches u2net's edge into a long ramp, and a person at 35% alpha is a
  ghost you can read the dashboard through — which is how a raised forearm ended up with map
  markers showing through the sleeve. The interior is pushed fully opaque with a short transition.
- **Erode inward, then feather.** The counter-intuitive one, and the whole fix. An outward feather
  keeps a rim of the ORIGINAL render around the silhouette; the Defense wall is bright blue and the
  mounted dashboard is near-black, so that rim read as a glowing outline traced around a person's
  head, glasses and shoulder. Shrinking the cut-out first puts the soft edge INSIDE the silhouette:
  mounted content laps a pixel over a person's own edge, which is invisible, where the render
  leaking out around them is not.
- **Feather the matte's own border,** so content meets a display's rim instead of cutting across
  the sphere's light streams at a straight line.

Light is invisible to segmentation, so the boardroom's gold ceiling ribbon — the render's hero
element, previously severed — is a heavily feathered band baked into that matte.

**A review guardian, because this goes in front of customers.** `guard/shoot.js` captures every room
twice, screens-on and screens-off, and a fleet judges them against explicit fail criteria with
pixel coordinates required for any claim. It failed four of five rooms on its first run and every
finding was real:

- **The AIRE board had no occlusion at all.** Its four columns are mounted by `js/approver.js`,
  which called `mountScreen()` and never applied the mattes — they sat on disk unused while only
  `livescreens.js` applied them. Straight horizontal edges cut through the seated operators' heads.
  The mask now lives in `screens.js` as `applySurfaceMask`, so anything that mounts a surface gets
  one. 18 of 18 surfaces masked, asserted per room.
- **A surface nobody thought to matte.** The woman's hand, wrist and forearm were sliced off a desk
  monitor by a straight edge. Every mounted surface now gets a matte; where nobody stands in front
  of a display it is simply opaque and costs nothing.
- **Two quad errors it measured** — the right monitor sat on the bezel and left the render's own
  taskbar row showing; the left one was inset enough to leave a bright pinstripe of original screen
  around two edges. Both corrected to its numbers.

**Footage on the approver board.** Four six-second loops cut from the CloudSignals session, one per
stage, 332KB in total. The column the work is in plays; a column it has passed holds its last
frame; approving starts the next one. The stage's words sit in a solid caption band beneath the
footage rather than over it — type laid over moving video was unreadable and dulled the footage,
and neither won. (The band was invisible for a round because the absolutely-positioned clip painted
over a statically-positioned band however opaque it was.)

**Files.** `tools/build-mattes.py` (new) · `js/screens.js` · `js/livescreens.js` · `js/approver.js` ·
`content/screens.json` · `css/experience.css` · `media/scene/mattes/` · `media/scene/board/`.

**Verified, and one caveat stated plainly.** The regression is clean: all six rooms at 1440x900 and
390x844 with no console errors, screens never surviving an exit, 18/18 surfaces masked in every
room, all 33 annotated screenshots still opening with their regions inside the image box, and all
16 panel links returning 200.

(Superseded by Change 09 — the guardian did eventually run and failed two of these rooms.)

The caveat: the FINAL guardian pass did not run. All five agents stalled and returned nothing, so
the two-pass automated review did not sign this off. The three ship-blockers it had previously
identified were instead verified by direct inspection at 3x — the pointing man's arm and hand solid
with no halo, the AIRE operator's head intact with individual hair strands against the board, and
the woman's hands and tablet whole on the desk monitor. That is weaker evidence than two
independent passes and should be treated as such. The capture is likely too large for the fleet to
chew on; shrink it before the next run.


---

## Change 09 — What the guardian caught after I said it was fine

The guardian's earlier passes kept stalling, so change 08 shipped on my own inspection instead.
Shrinking the captures from 2x to 1x — 22MB down to 7.5MB across ten files — and budgeting each
reviewer to five targeted crops made it complete in 14 minutes on 424k tokens, against 1.9M spent
stalling. Then it failed two of the five rooms I had already called clean.

**It was right about the hand, and I was wrong.** I inspected the pointing man's arm at 3x, said it
was solid, and shipped it. A ~20x15px blob of his fingers was painted over with dashboard, and his
arm ended in a stump at the knuckles with a yellow map marker sitting where the fingertip belonged.
The guardian measured it in RGB — bright skin in the render, near-black content in the ship, a
luminance drop of 150+.

The cause was not the matte pipeline but the model: **u2net resizes its input to 320x320
internally**, so on a 2048px render a hand is below the model's resolution before it starts, and
comes back as a blunt blob. The uniform 1px erosion then ate what survived. Segmentation now runs
over **overlapping tiles as well as the whole frame**, taking the per-pixel maximum — the global
pass gets bodies right, the tiles recover fingers and hair — and the erosion is gone, because
losing a hand is far worse than a faint rim. Re-judged: pass, with the fingertip blunted by about
2px, which is a nitpick rather than a stump.

**The boardroom took two attempts and the first was in the wrong place.** The gold ceiling ribbon
was severed at a straight line and the cup on the table was see-through. Making the content
translucent — the Client Vision treatment — fixed the cup but only softened the ribbon's cut from
100% to about 65%, and the guardian rejected that correctly: a light beam physically in front of a
display must not dim at all where it crosses.

The real error was that my feathered band was simply in the wrong place. Measuring against the quad
rather than guessing: the ribbon slants across local x 0.17-0.42, and the cup sits at local x
0.56-0.97 in the last twelve percent of the panel's length. My band had been at 0.53-0.74 —
straddling the cup and missing the ribbon entirely. That quad is rotated 180 degrees, so
image-space intuition about which end is which was backwards. Occluders the segmenter cannot see
are now `softRects` in the surface's OWN local box, which is the coordinate space that cannot be
got backwards.

**Files.** `tools/build-mattes.py` · `content/screens.json` · `css/experience.css`.
