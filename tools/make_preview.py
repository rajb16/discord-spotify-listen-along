"""Generates spicetify/preview.png (Marketplace card image) - headphones on a green->blue gradient."""
from PIL import Image, ImageDraw
S = 1024
grad = Image.new("RGB", (S, S)); px = grad.load()
c1, c2 = (30, 185, 110), (15, 90, 190)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.2), fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0)); img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img); w = (255, 255, 255, 255)
d.arc((212, 200, 812, 800), 180, 360, fill=w, width=70)           # headband
d.line((212, 500, 212, 590), fill=w, width=70); d.line((812, 500, 812, 590), fill=w, width=70)
d.rounded_rectangle((152, 560, 292, 800), radius=50, fill=w)       # ear cups
d.rounded_rectangle((732, 560, 872, 800), radius=50, fill=w)
# sync arcs between the cups
d.arc((392, 560, 632, 800), 200, 340, fill=(255, 255, 255, 210), width=40)
d.arc((392, 520, 632, 760), 20, 160, fill=(255, 255, 255, 210), width=40)
img.resize((256, 256), Image.LANCZOS).save("spicetify/preview.png", optimize=True)
print("ok")
