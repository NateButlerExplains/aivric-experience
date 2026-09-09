# Inside AiVRIC — merge preview

A preview of the **owner's live `experience/`** (from `AiVRIC/AiVRIC-Website@gh-pages`) with the
Phase A code fixes applied on top. It mirrors the real site's folder layout so every relative path
behaves exactly as it does on aivric.com.

**View it:** https://natebutlerexplains.github.io/aivric-experience/experience/

## What comes from where

| From the owner (unchanged) | From this branch (the fixes) |
|---|---|
| `experience/content/experience.json` — all 13 stations, 40 media items | `experience/js/**`, `experience/css/**`, `experience/index.html` |
| `experience/media/**` — every product screenshot and clip | plus `js/clock.js`, `js/screens.js`, `tools/quad-tool.html` |
| Scene renders and all hotspot/zoom/stream geometry | |
| The site favicon path in `index.html` | |

The owner's content and geometry are untouched, so he can keep adding stations and screenshots
without conflict. Only the code changed.

## Sibling folders

`academy/` and `assets/` exist here only so the manifest's seven `../` references resolve in a
standalone preview. Some of those media files are redacted copies — see SECURITY.md.

## The standalone earlier version

The pre-merge standalone experience (with the photographic scene render library and re-derived
geometry) is preserved in git history. Recover it with `git checkout 0cfba5b`.
