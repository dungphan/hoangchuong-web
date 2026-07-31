#!/usr/bin/env python3
"""Render studio-style plastic-packaging product shots as SVG.

Packaging makers sell blank containers, so nothing carries a label.
Square canvas: the catalogue grid gives each card equal width and the CSS
lets images keep their natural ratio, so mixed ratios make rows ragged.
"""
import sys, os

W = 1200
CX = W / 2


def head(bg1, bg2):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/>
  </linearGradient>
  <radialGradient id="pool" cx="0.5" cy="0.62" r="0.5">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="18"/>
  </filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
</defs>
<rect width="{W}" height="{W}" fill="url(#bg)"/>
<rect width="{W}" height="{W}" fill="url(#pool)"/>'''


def body_grad(gid, c_edge, c_mid, c_light):
    """Cylindrical shading: dark edge -> light centre -> dark edge."""
    return f'''<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0.00" stop-color="{c_edge}"/>
    <stop offset="0.13" stop-color="{c_mid}"/>
    <stop offset="0.34" stop-color="{c_light}"/>
    <stop offset="0.55" stop-color="{c_mid}"/>
    <stop offset="0.82" stop-color="{c_edge}"/>
    <stop offset="1.00" stop-color="{c_edge}"/>
  </linearGradient>'''


def cap_grad(gid, c_edge, c_light):
    return f'''<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0.00" stop-color="{c_edge}"/>
    <stop offset="0.30" stop-color="{c_light}"/>
    <stop offset="0.62" stop-color="{c_edge}"/>
    <stop offset="1.00" stop-color="{c_edge}"/>
  </linearGradient>'''


def shadow(cy, rx, ry=30, op=0.20):
    return (f'<ellipse cx="{CX}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'fill="#0d1b2a" opacity="{op}" filter="url(#soft)"/>')


def highlight(x, y, w, h, r, op=0.55):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="#ffffff" opacity="{op}" filter="url(#glow)"/>')


def ribs(top, bottom, half, n, op=0.10):
    """Faint horizontal grip ribs — reads as moulded plastic."""
    out, step = [], (bottom - top) / (n + 1)
    for i in range(1, n + 1):
        y = top + step * i
        out.append(f'<rect x="{CX-half}" y="{y:.1f}" width="{half*2}" height="7" '
                   f'fill="#0d1b2a" opacity="{op}"/>')
    return "".join(out)


def neck_ring(y, half, h=17):
    return (f'<rect x="{CX-half}" y="{y}" width="{half*2}" height="{h}" rx="5" '
            f'fill="#000" opacity="0.13"/>')


def pet_bottle(p, sfx=""):
    """Tall slim PET bottle — tapered shoulder, ribbed waist."""
    cap_h, cap_hw = 74, 62
    top = 190
    neck_hw, neck_bot = 47, top + cap_h + 62
    sh_bot = neck_bot + 132
    half = 168
    base = 1000
    g = (body_grad("b"+sfx, p["edge"], p["mid"], p["light"]) +
         cap_grad("c"+sfx, p["cap_edge"], p["cap_light"]))
    silhouette = (
        f'M {CX-neck_hw} {top+cap_h-6} '
        f'L {CX-neck_hw} {neck_bot} '
        f'C {CX-neck_hw} {neck_bot+70}, {CX-half} {sh_bot-74}, {CX-half} {sh_bot} '
        f'L {CX-half} {base-46} '
        f'Q {CX-half} {base}, {CX-half+52} {base} '
        f'L {CX+half-52} {base} '
        f'Q {CX+half} {base}, {CX+half} {base-46} '
        f'L {CX+half} {sh_bot} '
        f'C {CX+half} {sh_bot-74}, {CX+neck_hw} {neck_bot+70}, {CX+neck_hw} {neck_bot} '
        f'L {CX+neck_hw} {top+cap_h-6} Z')
    return f'''<defs>{g}</defs>
{shadow(base + 26, half + 20)}
<path d="{silhouette}" fill="url(#b{sfx})" stroke="#22303c" stroke-opacity="0.16" stroke-width="2.5"/>
{ribs(sh_bot + 168, base - 132, half - 5, 4)}
{neck_ring(neck_bot - 30, neck_hw + 7)}
<rect x="{CX-cap_hw}" y="{top}" width="{cap_hw*2}" height="{cap_h}" rx="11" fill="url(#c{sfx})"/>
{ribs(top + 9, top + cap_h - 9, cap_hw - 3, 5, 0.16)}
{highlight(CX - half + 27, sh_bot + 22, 32, base - sh_bot - 128, 16, 0.60)}
{highlight(CX + half - 54, sh_bot + 46, 15, base - sh_bot - 190, 8, 0.30)}
{highlight(CX - neck_hw + 12, neck_bot - 96, 13, 66, 7, 0.42)}'''


def hdpe_bottle(p, sfx=""):
    """Stockier opaque HDPE bottle — rounded shoulder, wide body."""
    cap_h, cap_hw = 66, 74
    top = 236
    neck_hw, neck_bot = 56, top + cap_h + 42
    sh_bot = neck_bot + 108
    half = 186
    base = 986
    g = (body_grad("b"+sfx, p["edge"], p["mid"], p["light"]) +
         cap_grad("c"+sfx, p["cap_edge"], p["cap_light"]))
    silhouette = (
        f'M {CX-neck_hw} {top+cap_h-6} '
        f'L {CX-neck_hw} {neck_bot} '
        f'C {CX-neck_hw} {neck_bot+58}, {CX-half} {sh_bot-62}, {CX-half} {sh_bot} '
        f'L {CX-half} {base-40} '
        f'Q {CX-half} {base}, {CX-half+46} {base} '
        f'L {CX+half-46} {base} '
        f'Q {CX+half} {base}, {CX+half} {base-40} '
        f'L {CX+half} {sh_bot} '
        f'C {CX+half} {sh_bot-62}, {CX+neck_hw} {neck_bot+58}, {CX+neck_hw} {neck_bot} '
        f'L {CX+neck_hw} {top+cap_h-6} Z')
    return f'''<defs>{g}</defs>
{shadow(base + 26, half + 22)}
<path d="{silhouette}" fill="url(#b{sfx})" stroke="#22303c" stroke-opacity="0.16" stroke-width="2.5"/>
{neck_ring(neck_bot - 26, neck_hw + 8)}
<rect x="{CX-cap_hw}" y="{top}" width="{cap_hw*2}" height="{cap_h}" rx="10" fill="url(#c{sfx})"/>
{ribs(top + 8, top + cap_h - 8, cap_hw - 4, 5, 0.16)}
{highlight(CX - half + 30, sh_bot + 30, 36, base - sh_bot - 118, 18, 0.55)}
{highlight(CX + half - 58, sh_bot + 56, 16, base - sh_bot - 178, 8, 0.28)}'''


def jar(p, sfx=""):
    """Wide squat jar with a broad screw lid."""
    lid_h, lid_hw = 104, 250
    top = 330
    half = 236
    base = 940
    body_top = top + lid_h - 8
    g = (body_grad("b"+sfx, p["edge"], p["mid"], p["light"]) +
         cap_grad("c"+sfx, p["cap_edge"], p["cap_light"]))
    silhouette = (
        f'M {CX-half} {body_top} '
        f'L {CX-half-13} {body_top+118} '
        f'L {CX-half-13} {base-58} '
        f'Q {CX-half-13} {base}, {CX-half+42} {base} '
        f'L {CX+half-42} {base} '
        f'Q {CX+half+13} {base}, {CX+half+13} {base-58} '
        f'L {CX+half+13} {body_top+118} '
        f'L {CX+half} {body_top} Z')
    return f'''<defs>{g}</defs>
{shadow(base + 24, half + 34)}
<path d="{silhouette}" fill="url(#b{sfx})" stroke="#22303c" stroke-opacity="0.16" stroke-width="2.5"/>
<rect x="{CX-lid_hw}" y="{top}" width="{lid_hw*2}" height="{lid_h}" rx="14" fill="url(#c{sfx})"/>
{ribs(top + 11, top + lid_h - 11, lid_hw - 6, 7, 0.15)}
{highlight(CX - half + 22, body_top + 74, 42, base - body_top - 176, 21, 0.55)}
{highlight(CX + half - 56, body_top + 108, 17, base - body_top - 244, 9, 0.28)}'''


# Palettes. PET reads as tinted-clear, HDPE as opaque.
PET_CLEAR = dict(edge="#8fb8cd", mid="#c8dee9", light="#eef6fa",
                 cap_edge="#1f6f9c", cap_light="#4ea3ce")
PET_JAR = dict(edge="#9ab6c4", mid="#cfe2ea", light="#f2f8fb",
               cap_edge="#33607a", cap_light="#6b9cb5")

HDPE_TONES = [
    dict(edge="#b9bfc6", mid="#dfe4e9", light="#fbfcfd", cap_edge="#2f6f8f", cap_light="#5fa5c4"),
    dict(edge="#9aa8b4", mid="#c9d5de", light="#eef4f8", cap_edge="#25566e", cap_light="#4d8ba6"),
    dict(edge="#a8b6a0", mid="#d3ddca", light="#f2f7ec", cap_edge="#4a6b3a", cap_light="#7ea165"),
    dict(edge="#c0b0a0", mid="#e2d7cb", light="#faf5ef", cap_edge="#7a4f2c", cap_light="#ab7a4d"),
    dict(edge="#aeaebd", mid="#d6d6e2", light="#f4f4fa", cap_edge="#43407a", cap_light="#7370ad"),
    dict(edge="#c4b39a", mid="#e6dbc7", light="#fbf6ec", cap_edge="#8a6a24", cap_light="#bb9646"),
]

BG = ("#fcfdfe", "#dfe5eb")


def build(kind, palette):
    if kind == "pet":
        art = pet_bottle(palette)
    elif kind == "jar":
        art = jar(palette)
    else:
        art = hdpe_bottle(palette)
    return head(*BG) + "\n" + art + "\n</svg>\n"


def cap_detail(p, sfx=""):
    """Close-up of the screw lid — the 'Chi tiết nắp' gallery shot.

    Composed square and centred: qlmanage renders every SVG into a square
    canvas and crops anything wider, so the landscape framing is produced
    afterwards by a centre-crop to 1200x672, which then downsamples to
    exactly the 300x168 the anti-upscaling fixture pins.
    """
    w, h = 1200, 1200
    cx = w / 2
    lid_hw, lid_h, lid_top = 372, 300, 420
    g = (body_grad("b"+sfx, p["edge"], p["mid"], p["light"]) +
         cap_grad("c"+sfx, p["cap_edge"], p["cap_light"]))
    ribs_out, step = [], lid_h / 9
    for i in range(1, 9):
        y = lid_top + step * i
        ribs_out.append(f'<rect x="{cx-lid_hw+8}" y="{y:.1f}" width="{(lid_hw-8)*2}" '
                        f'height="9" fill="#0d1b2a" opacity="0.15"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{BG[0]}"/><stop offset="1" stop-color="{BG[1]}"/>
  </linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="16"/>
  </filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="8"/>
  </filter>
  {g}
</defs>
<rect width="{w}" height="{h}" fill="url(#bg)"/>
<ellipse cx="{cx}" cy="{lid_top+lid_h+186}" rx="{lid_hw+30}" ry="26" fill="#0d1b2a" opacity="0.20" filter="url(#soft)"/>
<rect x="{cx-lid_hw+22}" y="{lid_top+lid_h-8}" width="{(lid_hw-22)*2}" height="170" rx="14"
      fill="url(#b{sfx})" stroke="#22303c" stroke-opacity="0.16" stroke-width="2.5"/>
<rect x="{cx-lid_hw}" y="{lid_top}" width="{lid_hw*2}" height="{lid_h}" rx="20"
      fill="url(#c{sfx})" stroke="#22303c" stroke-opacity="0.16" stroke-width="2.5"/>
{"".join(ribs_out)}
<rect x="{cx-lid_hw+44}" y="{lid_top+26}" width="54" height="{lid_h-52}" rx="27"
      fill="#ffffff" opacity="0.30" filter="url(#glow)"/>
</svg>
'''


def place(fragment, cx_target, scale, base_y, base_of_shape):
    """Position a shape drawn around CX with its base sitting on base_y."""
    tx = cx_target - CX * scale
    ty = base_y - base_of_shape * scale
    return (f'<g transform="translate({tx:.1f},{ty:.1f}) scale({scale})">'
            f'{fragment}</g>')


def hero():
    """Homepage banner: a lineup of three containers.

    Composed square like everything else, then centre-cropped to 16:9 —
    so the lineup is kept inside the middle band that survives the crop.
    """
    s, base_y = 0.62, 870
    return (head(*BG) + "\n"
            + place(jar(PET_JAR, "j"), 320, s, base_y, 940)
            + place(pet_bottle(PET_CLEAR, "p"), 600, s, base_y, 1000)
            + place(hdpe_bottle(HDPE_TONES[0], "h"), 880, s, base_y, 986)
            + "\n</svg>\n")


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    jobs = [("chai-pet-500ml", "pet", PET_CLEAR), ("demo-project", "jar", PET_JAR)]
    for i in range(1, 12):
        jobs.append((f"san-pham-{i:02d}", "hdpe", HDPE_TONES[(i - 1) % len(HDPE_TONES)]))
    for name, kind, pal in jobs:
        with open(os.path.join(out, name + ".svg"), "w") as f:
            f.write(build(kind, pal))
    # demo-project gallery: front view is the same jar framed tighter than the
    # cover, so the two gallery shots differ from each other and from the card.
    front = build("jar", PET_JAR).replace(
        f'viewBox="0 0 {W} {W}"', 'viewBox="170 230 860 860"')
    with open(os.path.join(out, "demo-shot-01.svg"), "w") as f:
        f.write(front)
    with open(os.path.join(out, "demo-shot-02.svg"), "w") as f:
        f.write(cap_detail(PET_JAR))
    with open(os.path.join(out, "hero.svg"), "w") as f:
        f.write(hero())
    print(f"wrote {len(jobs) + 2} svg")
