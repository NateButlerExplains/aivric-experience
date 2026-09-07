# Inside AiVRIC — explorable operations floor

A self-contained, static web experience: a cinematic render of the AiVRIC / 3HUE operations floor that visitors
can walk through. Click a room (Defense, Client Vision, Offense, AIRE, Executive Decisions, Fabric) to fly into a
close-up render, then browse that room's solutions with real screenshots and video.

- No build step, no framework, no vendored libraries. Plain HTML, CSS, and ES modules.
- Works from any static host (GitHub Pages, Vercel, S3). Relative paths only.
- All copy, media, hotspots, and streams live in one manifest: `content/experience.json`.

## Folder layout

```
experience/
  index.html                 shell (stage, HUD, panel, lightbox, intro)
  css/experience.css         styles and brand tokens
  js/main.js                 boot + routing glue
  js/stage.js                master render pan/zoom, room crossfade, parallax
  js/hotspots.js             pins anchored to normalized master coordinates
  js/streams.js              animated SVG information streams
  js/router.js               hash routes  #/  #/room/<id>  #/station/<id>
  js/ui/hud.js               top bar, room buttons, breadcrumb, mobile room strip
  js/ui/panel.js             station tabs, copy, media gallery, CTAs
  js/ui/lightbox.js          fullscreen image / video viewer
  js/ui/intro.js             opening film overlay
  content/experience.json    THE manifest
  media/scene/master.jpg     master wide shot (2560×1440)
  media/scene/rooms/*.jpg    per-room close-ups (2048×1152): defense, offense, vision, aire, decisions, fabric
  media/<station-id>/        screenshots and clips per station
  media/film/                intro film + poster
  tools/hotspot-tool.html    click-to-get-coordinates helper (dev only)
  tools/fetch-seed-media.sh  one-time pull of academy screenshots (dev only)
  tools/render-prompts/      prompts used to generate the scene renders
```

## Embed into aivric.com

1. Copy this folder into the website repo as `experience/` (next to its `index.html`) **without the
   git history**. `aivric-experience/.git` is a real repository of about 26 MB; `cp -r` followed by
   `git add` records a gitlink (a submodule pointer) instead of files, and the deployed `experience/`
   directory ends up empty. Run this from the directory that holds both checkouts:
   ```bash
   rsync -a --exclude .git --exclude .gitignore aivric-experience/ AiVRIC-Website/experience/
   cd AiVRIC-Website && git add experience && git status
   ```
   `git status` must list individual files (`experience/index.html`, `experience/js/main.js`, …). If it
   shows one entry reading `new file: experience` with no trailing slash, a `.git` came along: delete
   `AiVRIC-Website/experience/`, `git rm --cached experience`, and run the `rsync` again.
2. Add a nav link. In the header mega-menu of each page (or just `index.html`), add:
   ```html
   <a href="experience/">Explore the floor</a>
   ```
3. Optional CTA under the "Platform in Action" section of `index.html` (around the `ve-` video block):
   ```html
   <a href="experience/" class="ve-btn"><i class="fas fa-door-open"></i>&nbsp;Walk the operations floor</a>
   ```
4. Deep links work anywhere in marketing or sales emails, for example
   `https://aivric.com/experience/#/station/rogueagent` opens straight into the Offense room with RogueAgent selected.
5. `?skipintro=1` skips the opening film. The film is also skipped automatically after the first visit in a session.

GitHub Pages serves `.js` modules with the right MIME type. No server configuration is required.
A copy of the site favicon ships in the folder so the page is self-contained.

### Where to commit

**Commit `experience/` to `gh-pages`.** In `AiVRIC/AiVRIC-Website`, `gh-pages` is both the repository
default branch and the GitHub Pages source (Pages settings: branch `gh-pages`, path `/`, custom domain
`aivric.com`). The host repo's own `CLAUDE.md` says `main` is production — it is wrong. `main` is a
stale stub, last committed in October 2025 and several hundred commits behind `gh-pages`; pushing
there deploys nothing.

```bash
cd AiVRIC-Website && git checkout gh-pages
git add experience && git commit -m "Add the operations floor experience" && git push origin gh-pages
```

- Expect `https://aivric.com/experience/` to be live a minute or two after the push, once the Pages
  build finishes. Check it with `gh api repos/AiVRIC/AiVRIC-Website/pages/builds/latest --jq .status`.
- **Never name a file or folder inside `experience/` starting with `_` or `.`.** The site uses the
  classic (Jekyll) Pages build with no `.nojekyll` at the site root, and Jekyll drops underscore- and
  dot-prefixed paths from the output. A `media/_clips/` or `media/.cache/` folder would work perfectly
  on a local static server and 404 in production. The `.nojekyll` shipped in this folder only counts at
  the root of a site, so it does not protect `experience/` on the host.

## Add or change content

Everything is in `content/experience.json`.

### Add a screenshot or video to a station

1. Drop the file into `media/<station-id>/` (create the folder if needed). Keep images ≤ 1600 px wide and videos ≤ 5 MB, H.264 MP4 or WebM.
2. Add an entry to that station's `media` array:
   ```json
   { "type": "image", "src": "media/rogueagent/exposure-map.png", "caption": "External exposure map" }
   { "type": "video", "src": "media/rogueagent/demo.mp4", "poster": "media/rogueagent/demo-poster.jpg", "caption": "Recon pipeline demo" }
   ```
   The first item is shown largest in the panel. Empty `media` arrays render a styled "Add screenshot or video" slot.

### Station fields

| Field | Meaning |
|---|---|
| `id` | URL slug, used in `#/station/<id>` deep links |
| `name` | tab label |
| `status` | `live` · `beta` · `alpha` · `roadmap` · `coming-soon` · `service` · `platform` (drives the badge) |
| `suite` | small muted line next to the badge |
| `headline`, `summary` | panel copy |
| `capabilities` | bullet list |
| `media` | gallery items (see above) |
| `links` | CTAs; `"primary": true` makes a filled button |

### Add a room

1. Add an object to `rooms` with `id`, `name`, `tagline`, `streamColor` (`blue` · `coral` · `gold`), `hotspot`, `zoomTo`, `zoom`, `render`, `focus`, `stations`.
2. `hotspot` is where the pin sits on the master image, normalized 0–1. `zoomTo` is where the camera centers when entering (defaults to the hotspot). `zoom` is the magnification (2–3 works well).
3. `render` is the close-up image shown after the zoom. Set it to `null` to simply zoom into the master (that is what Fabric does). `focus` is the point in the render (0–1) that should land at the visible center.
4. Open `tools/hotspot-tool.html` in a browser (served, not from `file://`) and click on the master to read coordinates. Shift-click to trace a stream path, then "Finish path" to get a `d` string for the `streams` array.

### Streams

`streams` are SVG paths in master-image pixels (2560×1440). `color` picks the palette, `room` links the stream to a room so it brightens on hover, `delay` offsets the dash animation so parallel streams don't move in lockstep.

## Scene renders

The seven scene images come from the **Inside AiVRIC photographic image library** (produced 2026-09-07). That
package holds the native renders, 8K/4K PNG masters, per-image checksums, a cast and continuity reference sheet,
and the prompt history. `media/scene/` carries its web copies at the exact sizes this app loads:
`master.jpg` 2560×1440 and each room 2048×1152.

Renders must contain **no text or UI**; the interface is real HTML drawn on top. To swap in a new set, copy the
library's `web/master.jpg` and `web/rooms/*.jpg` over `media/scene/`, then re-check `hotspot`, `zoomTo`, and the
`streams` paths with `tools/hotspot-tool.html` — those coordinates are tied to the master's composition, so a new
master moves every pin. `tools/render-prompts/` keeps the earlier gpt-image-2 prompts for reference.

## Behaviour notes

- Transitions use only `transform` and `opacity` (GPU-composited). Parallax follows the pointer on desktop only.
- `prefers-reduced-motion` disables parallax, stream animation, and long transitions.
- Under 768 px the panel becomes a bottom sheet and a scrollable room strip replaces the HUD room buttons.
- Esc closes the lightbox first, then exits the room. Browser back/forward works because routes are hash-based.
- Media is lazy-loaded per station. The master render (≈1.0 MB) is the only up-front load: the `<video>`
  in `index.html` carries `preload="none"` and no `poster`, and `js/ui/intro.js` sets both immediately
  before it plays, so the 2.9 MB film costs nothing on a deep link, a `?skipintro=1` load, or a
  same-session revisit.
- When the film reaches its end it eases over ~1.5 s into a finished state — the last frame recedes and
  the headline and "Enter the building" button take the frame. "Play with sound" sits next to
  "Skip film" on the first frame; nothing ever autoplays with sound.

## Credits

Scene renders: Inside AiVRIC photographic image library, direction by 3HUE. Product screenshots: AiVRIC CloudSignals+RiskOps.
Fonts: Jost and Inter via Google Fonts (same as aivric.com).
