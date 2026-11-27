"""Draw the Marion HQ app icon -> desktop/build/icon.png (1024x1024).

A glowing violet marionberry (the brand's namesake and Moose's bot shape) sits
in the middle of the HQ floorplan as seen in the game's Dark theme. The other
bots glow as small dots in their rooms, in their roster colors.

Run from desktop/:  python3 scripts/make-icon.py   (needs Pillow)
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

OUT = 1024
SS = 4                      # supersample for smooth edges
S = OUT * SS


def px(v):
    return int(round(v * SS))


def rgba(hex_, a=255):
    h = hex_.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def layer():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def glow(img, draw_fn, color, blur):
    """Composite a blurred, colored shape (the alpha is blurred, the color stays pure)."""
    mask = Image.new("L", (S, S), 0)
    draw_fn(ImageDraw.Draw(mask))
    mask = mask.filter(ImageFilter.GaussianBlur(px(blur)))
    solid = Image.new("RGBA", (S, S), color[:3] + (0,))
    solid.putalpha(mask.point(lambda v: int(v * color[3] / 255)))
    return Image.alpha_composite(img, solid)


# --- macOS icon body: 824px rounded square on a 1024 canvas, with a soft drop shadow ---
PAD, RAD = 100, 186
img = layer()
img = glow(img, lambda d: d.rounded_rectangle([px(PAD), px(PAD + 16), px(OUT - PAD), px(OUT - PAD + 16)], px(RAD), fill=255), rgba("#000000", 110), 22)

body = layer()
bd = ImageDraw.Draw(body)
top, bot = rgba("#141a28"), rgba("#07090d")          # Dark theme: surface -> void
for y in range(S):
    t = y / S
    bd.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bot)))
body_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(body_mask).rounded_rectangle([px(PAD), px(PAD), px(OUT - PAD), px(OUT - PAD)], px(RAD), fill=255)

# --- HQ floorplan: 3x3 wings joined by glowing tubes (like the in-game map) ---
plan = layer()
L, T, R, B = 168, 168, 856, 856
gap = 34
cw = (R - L - 2 * gap) / 3
rooms = []
for row in range(3):
    for col in range(3):
        x0 = L + col * (cw + gap)
        y0 = T + row * (cw + gap)
        rooms.append((x0, y0, x0 + cw, y0 + cw))

pd = ImageDraw.Draw(plan)
for (x0, y0, x1, y1) in rooms:
    pd.rounded_rectangle([px(x0), px(y0), px(x1), px(y1)], px(16), fill=rgba("#131925"), outline=rgba("#2d3850"), width=px(5))
    # faint floor grid
    step = cw / 5
    for i in range(1, 5):
        pd.line([px(x0 + i * step), px(y0 + 8), px(x0 + i * step), px(y1 - 8)], fill=rgba("#1a2231"), width=px(2))
        pd.line([px(x0 + 8), px(y0 + i * step), px(x1 - 8), px(y0 + i * step)], fill=rgba("#1a2231"), width=px(2))

# Tubes between rooms (accent blue, glowing).
tubes = []
for row in range(3):
    for col in range(2):
        x0, y0, x1, y1 = rooms[row * 3 + col]
        cy = (y0 + y1) / 2
        tubes.append((x1, cy, x1 + gap, cy))
for row in range(2):
    for col in range(3):
        x0, y0, x1, y1 = rooms[row * 3 + col]
        cx = (x0 + x1) / 2
        tubes.append((cx, y1, cx, y1 + gap))


def draw_tubes(d, w):
    for (a, b, c, e) in tubes:
        d.line([px(a - 6 if a != c else a), px(b - 6 if b != e else b), px(c + 6 if a != c else c), px(e + 6 if b != e else e)], fill=255, width=px(w))


plan = glow(plan, lambda d: draw_tubes(d, 16), rgba("#6ea1ff", 150), 8)
plan = glow(plan, lambda d: draw_tubes(d, 6), rgba("#9cc0ff", 255), 0.6)

# Bots in their wings (roster colors), skipping the center room where the berry sits.
BOTS = [
    (0, "#ffffff", "#dbe7ff"),  # Daniel
    (1, "#ef4444", "#f87171"),  # Kanye
    (2, "#2f6fed", "#6ea1ff"),  # Quill
    (3, "#06b6d4", "#22d3ee"),  # Sift
    (5, "#d946ef", "#e879f9"),  # Greek
    (6, "#f97316", "#fb923c"),  # Bot Builder
    (7, "#0a0a0f", "#6ea1ff"),  # Barry (dark body, bright rim)
    (8, "#84cc16", "#a3e635"),  # a fresh Foundry bot
]
random.seed(7)
for idx, col, glw in BOTS:
    x0, y0, x1, y1 = rooms[idx]
    cx = x0 + cw * random.uniform(0.32, 0.68)
    cy = y0 + cw * random.uniform(0.32, 0.68)
    r = 17
    plan = glow(plan, lambda d, cx=cx, cy=cy: d.ellipse([px(cx - r * 2.4), px(cy - r * 2.4), px(cx + r * 2.4), px(cy + r * 2.4)], fill=255), rgba(glw, 170), 12)
    bd2 = ImageDraw.Draw(plan)
    bd2.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=rgba(col), outline=rgba(glw), width=px(4))

body = Image.alpha_composite(body, plan)

# Dim the floorplan a touch toward the center so the berry pops.
vign = layer()
vign = glow(vign, lambda d: d.ellipse([px(250), px(240), px(774), px(784)], fill=255), rgba("#07090d", 200), 60)
body = Image.alpha_composite(body, vign)

# --- The marionberry ---
CX, CY = 512, 540
BR = 205                                          # berry radius (horizontal)
berry_glow = lambda d: d.ellipse([px(CX - BR * 1.15), px(CY - BR * 1.2), px(CX + BR * 1.15), px(CY + BR * 1.3)], fill=255)
body = glow(body, berry_glow, rgba("#a78bfa", 190), 70)
body = glow(body, berry_glow, rgba("#8b5cf6", 120), 30)

# Drupelets: hex-packed inside a slightly tall, bottom-tapered berry outline.
dr = 46
drupes = []
rows = range(-4, 5)
for j in rows:
    y = CY + j * dr * 1.62
    off = (dr if j % 2 else 0)
    for i in range(-5, 6):
        x = CX + i * dr * 1.86 + off * 0.93
        # berry silhouette: ellipse, narrower toward the bottom
        ny = (y - CY) / (BR * 1.1)
        half_w = BR * math.sqrt(max(0.0, 1 - ny * ny)) * (1 - 0.18 * max(0.0, ny))
        if abs(x - CX) <= half_w - dr * 0.35 and abs(ny) <= 0.93:
            drupes.append((x, y))
drupes.sort(key=lambda p: p[1])   # paint top rows first so lower ones overlap

berry = layer()
for (x, y) in drupes:
    r = dr * 1.04
    shade = 1 - 0.25 * ((y - CY) / BR + 1) / 2     # darker toward the bottom
    d = ImageDraw.Draw(berry)
    d.ellipse([px(x - r), px(y - r), px(x + r), px(y + r)], fill=rgba("#3b1680"))
    base = tuple(int(c * shade) for c in rgba("#7c4ddc")[:3]) + (255,)
    d.ellipse([px(x - r * 0.9), px(y - r * 0.92), px(x + r * 0.86), px(y + r * 0.8)], fill=base)
    d.ellipse([px(x - r * 0.72), px(y - r * 0.8), px(x + r * 0.5), px(y + r * 0.35)], fill=rgba("#9b74f4"))
    d.ellipse([px(x - r * 0.5), px(y - r * 0.62), px(x + r * 0.1), px(y - r * 0.05)], fill=rgba("#c4b5fd"))
    d.ellipse([px(x - r * 0.4), px(y - r * 0.55), px(x - r * 0.08), px(y - r * 0.25)], fill=rgba("#ffffff", 235))
berry = berry.filter(ImageFilter.GaussianBlur(px(0.8)))
body = Image.alpha_composite(body, berry)

# Leafy calyx + stem on top (the green from the in-game sprite).
top_y = min(y for _, y in drupes) - dr * 0.7
leaves = layer()
ld = ImageDraw.Draw(leaves)


def leaf(angle, length, width):
    pts = []
    for k in range(0, 41):
        t = k / 40
        w = math.sin(math.pi * t) * width * (1 - 0.3 * t)
        pts.append((t * length, -w))
    for k in range(40, -1, -1):
        t = k / 40
        w = math.sin(math.pi * t) * width * (1 - 0.3 * t)
        pts.append((t * length, w))
    ca, sa = math.cos(angle), math.sin(angle)
    return [(px(CX + x * ca - y * sa), px(top_y + 6 + x * sa + y * ca)) for x, y in pts]


for ang, ln, wd in [(-2.75, 150, 40), (-0.4, 150, 40), (-1.95, 120, 34), (-1.2, 120, 34)]:
    ld.polygon(leaf(ang, ln, wd), fill=rgba("#16a34a"))
for ang, ln, wd in [(-2.75, 140, 22), (-0.4, 140, 22), (-1.95, 110, 18), (-1.2, 110, 18)]:
    ld.polygon(leaf(ang, ln, wd), fill=rgba("#4ade80"))
# Short curved stem with rounded ends.
def stem_pts(w):
    pts = []
    for k in range(0, 31):
        t = k / 30
        pts.append((CX + 6 + 34 * t * t, top_y - 8 - 78 * t))
    return pts
for color, w in [("#15803d", 22), ("#22c55e", 12)]:
    pts = stem_pts(w)
    for (x, y) in pts:
        ld.ellipse([px(x - w / 2), px(y - w / 2), px(x + w / 2), px(y + w / 2)], fill=rgba(color))
body = glow(body, lambda d: d.ellipse([px(CX - 120), px(top_y - 130), px(CX + 140), px(top_y + 40)], fill=255), rgba("#4ade80", 50), 30)
body = Image.alpha_composite(body, leaves.filter(ImageFilter.GaussianBlur(px(0.6))))

# Glassy top sheen + hairline edge, like a macOS app tile.
sheen = layer()
sheen = glow(sheen, lambda d: d.rounded_rectangle([px(PAD), px(PAD), px(OUT - PAD), px(PAD + 300)], px(RAD), fill=255), rgba("#ffffff", 16), 30)
body = Image.alpha_composite(body, sheen)

img.paste(body, (0, 0), body_mask)
edge = layer()
ImageDraw.Draw(edge).rounded_rectangle([px(PAD), px(PAD), px(OUT - PAD), px(OUT - PAD)], px(RAD), outline=rgba("#ffffff", 28), width=px(3))
img = Image.alpha_composite(img, edge)

img = img.resize((OUT, OUT), Image.LANCZOS)
img.save("build/icon.png")
print("wrote build/icon.png")
