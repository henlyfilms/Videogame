"""Draw the Marion HQ app icon (build/icon.png, 1024x1024) — same blue orb as the web favicon.
Run: python3 scripts/make-icon.py   (needs Pillow)"""
from PIL import Image, ImageDraw, ImageFilter

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# macOS-style rounded square (824px body inside the 1024 canvas), soft vertical gradient.
pad, r = 100, 185
body = Image.new("RGBA", (S, S))
grad = ImageDraw.Draw(body)
top, bot = (246, 247, 251), (214, 222, 240)
for y in range(S):
    t = y / S
    grad.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bot)) + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([pad, pad, S - pad, S - pad], r, fill=255)
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([pad, pad + 14, S - pad, S - pad + 14], r, fill=(20, 30, 60, 90))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
img.paste(body, (0, 0), mask)

# Glow, orb, white core.
cx, cy, R = S // 2, S // 2 + 16, 250
glow = Image.new("RGBA", (S, S), (47, 111, 237, 0))
ImageDraw.Draw(glow).ellipse([cx - R - 60, cy - R - 60, cx + R + 60, cy + R + 60], fill=(47, 111, 237, 120))
img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(40)))
d = ImageDraw.Draw(img)
d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(47, 111, 237, 255))
hl = Image.new("RGBA", (S, S), (255, 255, 255, 0))
ImageDraw.Draw(hl).ellipse([cx - R + 50, cy - R + 30, cx + R - 120, cy - 40], fill=(255, 255, 255, 45))
img = Image.alpha_composite(img, hl.filter(ImageFilter.GaussianBlur(20)))
d = ImageDraw.Draw(img)
k = 112
d.ellipse([cx - k, cy - k, cx + k, cy + k], fill=(255, 255, 255, 255))

img.save("build/icon.png")
print("wrote build/icon.png")
