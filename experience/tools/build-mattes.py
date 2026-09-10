#!/usr/bin/env python3
"""Bake a per-surface occlusion matte from the room renders.

A screen mounted on a painted display paints over whatever stands in front of it, because the
render is a photograph and has no depth. Hand-tracing those silhouettes as polygons never worked:
a hard-edged polygon against a soft, slightly out-of-focus photographic edge reads as a bad
cut-out however it is feathered.

So the silhouettes are not drawn, they are segmented. u2net_human_seg gives a real alpha matte per
render — hair, raised arms, soft edges and all — and this script warps that matte through each
surface's own quad so it lands in the screen's local pixel space, then writes it as the alpha
channel of a PNG. livescreens.js wears it as a CSS mask.

    python3 tools/build-mattes.py                # all surfaces that ask for one
    python3 tools/build-mattes.py defense-wall   # just one

Needs a venv with rembg + onnxruntime + pillow; the model downloads once (~176MB).
"""
import json
import pathlib
import sys

from PIL import Image, ImageFilter
from rembg import new_session, remove

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEOMETRY = ROOT / 'content' / 'screens.json'
OUT = ROOT / 'media' / 'scene' / 'mattes'
RENDER = {'aire-bridge': 'aire'}          # the one room whose id and filename differ


def solve(src, dst):
    """8 projective coefficients mapping src -> dst, by Gaussian elimination."""
    A, b = [], []
    for (u, v), (x, y) in zip(src, dst):
        A.append([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.append(x)
        A.append([0, 0, 0, u, v, 1, -u * y, -v * y]); b.append(y)
    n = 8
    M = [row + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r == c:
                continue
            f = M[r][c] / M[c][c]
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def quad_size(quad):
    d = lambda a, b: ((quad[b][0] - quad[a][0]) ** 2 + (quad[b][1] - quad[a][1]) ** 2) ** 0.5
    return max(1, round((d(0, 1) + d(3, 2)) / 2)), max(1, round((d(0, 3) + d(1, 2)) / 2))


def main(only=None):
    geo = json.loads(GEOMETRY.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    session = new_session('u2net_human_seg')
    made = 0

    for room_id, spec in geo['rooms'].items():
        wants = [s for s in spec['surfaces']
                 if s.get('mount', True) and s.get('matte') and (not only or s['id'] == only)]
        if not wants:
            continue
        stem = RENDER.get(room_id, room_id)
        render = ROOT / 'media' / 'scene' / 'rooms' / f'{stem}.jpg'
        if not render.exists():
            print(f'  !! {room_id}: no render at {render}')
            continue

        print(f'{room_id}: segmenting {render.name}')
        people = remove(Image.open(render).convert('RGB'), session=session, only_mask=True)

        for s in wants:
            w, h = quad_size(s['quad'])
            # PIL's PERSPECTIVE transform maps OUTPUT pixels back to INPUT, which is exactly the
            # rect -> quad direction: the surface's own (0,0)-(w,h) box onto the render.
            coeffs = solve([(0, 0), (w, 0), (w, h), (0, h)], [tuple(p) for p in s['quad']])
            warped = people.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)

            # SOLIDIFY. The warp softens u2net's edges into a long ramp, and a person sitting at 35%
            # alpha is a ghost you can read the dashboard through — which is exactly how a raised
            # forearm ended up semi-transparent with map markers showing through the sleeve. Push
            # the interior to fully opaque and keep only a short transition.
            warped = warped.point(lambda v: 0 if v < 60 else (255 if v > 120 else (v - 60) * 255 // 60))

            # ERODE, then feather INWARD. This is the counter-intuitive part and it is the whole
            # fix. An outward feather keeps a rim of the ORIGINAL render around the silhouette; here
            # the render's wall is bright blue and the mounted dashboard is near-black, so that rim
            # reads as a glowing outline traced around a person's head. Shrinking the cut-out first
            # means the soft edge falls INSIDE the silhouette instead: the mounted content laps a
            # pixel or two over the person's own edge, which is invisible, rather than the render
            # leaking out around them, which is not.
            warped = warped.filter(ImageFilter.MinFilter(3))
            warped = warped.filter(ImageFilter.GaussianBlur(0.8))
            alpha = warped.point(lambda v: 255 - v)          # person -> transparent

            # Feather the matte's own border. Without this the mounted content ends in a hard line
            # exactly on the quad edge, which is what made the Client Vision panels clip the
            # sphere's light streams mid-streak. A few pixels of ramp lets content meet the
            # render's own rim instead of cutting across it.
            inset = max(2, round(min(w, h) * 0.035))
            border = Image.new('L', (w, h), 0)
            border.paste(255, (inset, inset, w - inset, h - inset))
            border = border.filter(ImageFilter.GaussianBlur(inset * 0.7))
            alpha = Image.composite(alpha, Image.new('L', (w, h), 0), border) if False else \
                    Image.eval(Image.merge('L', [alpha]), lambda v: v)
            alpha = Image.frombytes('L', (w, h), bytes(
                min(a, b) for a, b in zip(alpha.tobytes(), border.tobytes())))

            # A light beam or other soft foreground the segmenter cannot see: a vertical band,
            # heavily feathered, given in fractions of the surface's own width.
            for band in s.get('softBands', []):
                x0, x1 = round(band[0] * w), round(band[1] * w)
                cut = Image.new('L', (w, h), 255)
                cut.paste(0, (x0, 0, x1, h))
                cut = cut.filter(ImageFilter.GaussianBlur(max(3, (x1 - x0) * 0.55)))
                alpha = Image.frombytes('L', (w, h), bytes(
                    min(a, c) for a, c in zip(alpha.tobytes(), cut.tobytes())))
            plate = Image.new('RGBA', (w, h), (255, 255, 255, 255))
            plate.putalpha(alpha)
            dest = OUT / f'{s["id"]}.png'
            plate.save(dest, optimize=True)
            covered = 100 * sum(warped.point(lambda v: 255 if v > 128 else 0)
                                .convert('L').getdata()) / (255 * w * h)
            print(f'  {s["id"]:28} {w}x{h}  {covered:.1f}% occluded  -> {dest.name}')
            made += 1

    print(f'\n{made} matte(s) written to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
